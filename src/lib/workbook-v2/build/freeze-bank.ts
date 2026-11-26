// The freeze of a level: a draft becomes a snapshot that books are made from. A draft is a snapshot in which the level, a
// topic, a sheet, a side and a row may also hold `basis`, a note about where the content came from. The freeze copies the
// content only, runs every check of a level, and gives the snapshot with its capacity, or every problem and no snapshot.
import { plainCopy } from "../bank/plain";
import { validateSnapshot, type SnapshotRow, type SnapshotSheet } from "../bank/snapshot";
import { ANSWER_KINDS, type Side } from "../contract";
import type { Renderer } from "../renderer";
import { SHAPES } from "../shapes";
import { isRecord } from "../shapes/shape";
import { TEMPLATES } from "../layout/templates";
import { checkBank, type BankOptions, type BankReport } from "./check-bank";

/** The field of a note about a source. It never travels with the content. */
export const BASIS = "basis";
/** A full level: 20 topics of 10 sheets. */
export const FULL_LEVEL = { topics: 20, sheets: 10 };
/** A row can make this many attempts of its sheet before a question comes back: fewer is less than one full unseen repeat. */
export const UNSEEN_ATTEMPTS = 2;

export interface FreezeOptions extends BankOptions {
  /** A level that goes live must have all its topics and sheets. One topic can be frozen on its own to try it. */
  requireFullLevel?: boolean;
}

export interface RowCapacity {
  row: string;
  side: Side;
  /** The places that the row fills on its side. */
  items: number;
  /** The different questions that its limits allow. */
  possible: number;
  /** How many attempts of the sheet can each have questions of this row that no earlier attempt had. */
  attemptsWithoutRepeat: number;
  warnings: string[];
}
export interface SheetCapacity { sheet: string; attemptsWithoutRepeat: number; rows: RowCapacity[]; warnings: string[] }

export type FreezeResult =
  | { ok: true; snapshot: Record<string, unknown>; hash: string; capacity: SheetCapacity[]; checked: BankReport["checked"] }
  | { ok: false; problems: string[] };

const SIDES: readonly Side[] = ["front", "back"];

/** A copy of a record without its note. Anything else stays as it is, for the checks of the snapshot to name. */
const withoutBasis = (value: unknown): unknown => (isRecord(value) ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== BASIS)) : value);
const each = (value: unknown, change: (one: unknown) => unknown): unknown => (Array.isArray(value) ? value.map(change) : value);

/** The content of a draft: the same data with no note at the level, a topic, a sheet, a side or a row. */
export function contentOf(draft: Record<string, unknown>): Record<string, unknown> {
  const side = (raw: unknown) => {
    const one = withoutBasis(raw);
    return isRecord(one) ? { ...one, rows: each(one.rows, withoutBasis) } : one;
  };
  const sheet = (raw: unknown) => {
    const one = withoutBasis(raw);
    return isRecord(one) ? { ...one, ...("front" in one ? { front: side(one.front) } : {}), ...("back" in one ? { back: side(one.back) } : {}) } : one;
  };
  const root = withoutBasis(draft) as Record<string, unknown>;
  return { ...root, ...("topics" in root ? { topics: each(root.topics, withoutBasis) } : {}), ...("sheets" in root ? { sheets: each(root.sheets, sheet) } : {}) };
}

/** Each place of the content that still holds a note: one in a place where a draft may not have it. */
function notesIn(value: unknown, place: string): string[] {
  if (Array.isArray(value)) return value.flatMap((one, i) => notesIn(one, `${place}[${i}]`));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, one]) => (key === BASIS ? [place] : notesIn(one, place === "" ? key : `${place}.${key}`)));
}

/** The pages of the sheets of each topic follow one another, in the order of the topic. */
function pageProblems(content: Record<string, unknown>, sheets: ReadonlyMap<string, SnapshotSheet>): string[] {
  const topics = Array.isArray(content.topics) ? content.topics.filter(isRecord) : [];
  return topics.flatMap((topic) => {
    const ids = Array.isArray(topic.sheets) ? topic.sheets.filter((id): id is string => typeof id === "string") : [];
    return ids.slice(1).flatMap((id, i) => {
      const [before, now] = [sheets.get(ids[i]), sheets.get(id)];
      const wanted = before ? before.firstPage + 2 : null;
      return before && now && now.firstPage !== wanted ? [`Topic "${String(topic.id)}": the sheet "${id}" starts on page ${now.firstPage} and must start on page ${wanted}, after the sheet "${before.id}".`] : [];
    });
  });
}

function levelProblems(content: Record<string, unknown>): string[] {
  const topics = Array.isArray(content.topics) ? content.topics.filter(isRecord) : [];
  const problems = topics.length === FULL_LEVEL.topics ? [] : [`The level has ${topics.length} ${topics.length === 1 ? "topic" : "topics"} and a full level has ${FULL_LEVEL.topics}.`];
  for (const topic of topics) {
    const count = Array.isArray(topic.sheets) ? topic.sheets.length : 0;
    if (count !== FULL_LEVEL.sheets) problems.push(`Topic "${String(topic.id)}" has ${count} ${count === 1 ? "sheet" : "sheets"} and a topic of a full level has ${FULL_LEVEL.sheets}.`);
  }
  return problems;
}

/** Marking reads only the kinds of answer that it knows: a row of another kind could print a question that nobody can mark. */
function kindProblems(sheets: ReadonlyMap<string, SnapshotSheet>): string[] {
  return [...sheets.values()].flatMap((sheet) => SIDES.flatMap((side) => sheet[side].rows.flatMap(({ id, shape }) =>
    ((ANSWER_KINDS as readonly string[]).includes(shape.answerKind) ? [] : [`Sheet "${sheet.id}", ${side} side, row "${id}": the shape "${shape.id}" has the answer kind "${shape.answerKind}", which marking cannot read.`]))));
}

function rowCapacity(sheet: SnapshotSheet, side: Side, { id, shape, limits, items }: SnapshotRow): RowCapacity {
  const possible = shape.count(limits);
  const attempts = Math.floor(possible / items);
  const warnings = attempts < UNSEEN_ATTEMPTS ? [`Sheet "${sheet.id}", ${side} side, row "${id}": its limits allow ${possible} ${possible === 1 ? "question" : "questions"} for ${items} ${items === 1 ? "place" : "places"}, so the next attempt of the sheet repeats ${attempts === 0 ? "a question" : "questions"} of this row.`] : [];
  return { row: id, side, items, possible, attemptsWithoutRepeat: attempts, warnings };
}

/** How many attempts each sheet allows before a row repeats a question, with a warning for a row that allows less than two. */
export function capacityOf(sheets: ReadonlyMap<string, SnapshotSheet>): SheetCapacity[] {
  return [...sheets.values()].map((sheet) => {
    const rows = SIDES.flatMap((side) => sheet[side].rows.map((row) => rowCapacity(sheet, side, row)));
    return { sheet: sheet.id, attemptsWithoutRepeat: Math.min(...rows.map((r) => r.attemptsWithoutRepeat)), rows, warnings: rows.flatMap((r) => r.warnings) };
  });
}

/** The frozen snapshot of a draft, or every problem of it. It changes nothing, and the same draft gives the same result. */
export async function freezeBank(draft: unknown, renderer: Renderer, options: FreezeOptions = {}): Promise<FreezeResult> {
  const { requireFullLevel = false, shapes = SHAPES, templates = TEMPLATES } = options;
  if (!isRecord(draft)) return { ok: false, problems: ["The draft must be an object."] };
  const plain = plainCopy("The draft", draft);
  if (!plain.ok) return plain;
  const content = contentOf(plain.value as Record<string, unknown>);
  const left = notesIn(content, "");
  if (left.length > 0) return { ok: false, problems: left.map((place) => `The draft has a note "${BASIS}" at ${place}, where a draft may not have one: only the level, a topic, a sheet, a side and a row may.`) };
  const bank = validateSnapshot(content, shapes, templates);
  if (!bank.ok) return bank;
  const { sheets } = bank.snapshot;
  // The drawings take most of the time of a freeze, so they wait until the content is whole.
  const problems = [...kindProblems(sheets), ...pageProblems(content, sheets), ...(requireFullLevel ? levelProblems(content) : [])];
  if (problems.length > 0) return { ok: false, problems };
  const report = await checkBank(content, renderer, options);
  if (report.problems.length > 0) return { ok: false, problems: report.problems };
  return { ok: true, snapshot: content, hash: bank.hash, capacity: capacityOf(sheets), checked: report.checked };
}
