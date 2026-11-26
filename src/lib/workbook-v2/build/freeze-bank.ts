// The freeze of a level: a draft becomes a snapshot that books are made from. A draft is a snapshot in which the level, a
// topic, a sheet, a side and a row may also hold `basis`, a note about where the content came from. The freeze copies the
// content only, runs every check of a level, and gives the snapshot with its capacity, or every problem and no snapshot.
import { plainCopy } from "../bank/plain";
import { validateSnapshot, type SnapshotRow, type SnapshotSheet } from "../bank/snapshot";
import { ANSWER_KINDS, type Side } from "../contract";
import { canonicalJson, seedFrom } from "../hash";
import type { Renderer } from "../renderer";
import { SHAPES } from "../shapes";
import { isRecord, questionKey } from "../shapes/shape";
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

const own = (value: Record<string, unknown>, key: string): boolean => Object.hasOwn(value, key);

/** The content of a draft: the same data with no note at the level, a topic, a sheet, a side or a row. */
export function contentOf(draft: Record<string, unknown>): Record<string, unknown> {
  const side = (raw: unknown) => {
    const one = withoutBasis(raw);
    return isRecord(one) ? { ...one, ...(own(one, "rows") ? { rows: each(one.rows, withoutBasis) } : {}) } : one;
  };
  const sheet = (raw: unknown) => {
    const one = withoutBasis(raw);
    return isRecord(one) ? { ...one, ...(own(one, "front") ? { front: side(one.front) } : {}), ...(own(one, "back") ? { back: side(one.back) } : {}) } : one;
  };
  const root = withoutBasis(draft) as Record<string, unknown>;
  return { ...root, ...(own(root, "topics") ? { topics: each(root.topics, withoutBasis) } : {}), ...(own(root, "sheets") ? { sheets: each(root.sheets, sheet) } : {}) };
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

interface SharedLimit { rows: { id: string; attempts: number }[]; items: number; possible: number; attempts: number }
interface RowEntry { side: Side; row: SnapshotRow; capacity: RowCapacity; limitKey: string }

/** Exact question keys of a row: from its list, or by drawing all of a small space of a shape with no list. */
function rowKeys(sheetId: string, { side, row, capacity }: RowEntry, cap: number): Set<string> | null {
  const { shape, limits } = row;
  if (shape.list) return new Set(shape.list(limits).map((q) => questionKey(shape, q)));
  if (capacity.possible > cap) return null;
  const keys = new Set<string>();
  const tries = Math.min(4000, Math.max(64, capacity.possible * 25));
  for (let i = 0; i < tries && keys.size < capacity.possible; i++) {
    keys.add(questionKey(shape, shape.generate(limits, seedFrom("capacity", sheetId, side, row.id, i)).question));
  }
  return keys.size === capacity.possible ? keys : null;
}

/** Tightest subset of rows sharing a pool: smallest ratio of distinct questions to places (ties: fewest rows). */
function pickTighter(best: SharedLimit | null, candidate: SharedLimit): SharedLimit {
  if (!best) return candidate;
  const left = candidate.possible * best.items;
  const right = best.possible * candidate.items;
  if (left !== right) return left < right ? candidate : best;
  return candidate.rows.length < best.rows.length ? candidate : best;
}

/** Tightest shared-question limit across rows of one shape on a sheet, or null when no two rows share a tighter bound. */
function sharedCapacity(sheet: SnapshotSheet, entries: readonly RowEntry[]): SharedLimit | null {
  if (entries.length < 2) return null;
  let best: SharedLimit | null = null;
  const limitOf = (rows: readonly RowEntry[], possible: number): SharedLimit => {
    const items = rows.reduce((sum, e) => sum + e.row.items, 0);
    return { rows: rows.map((e) => ({ id: e.row.id, attempts: e.capacity.attemptsWithoutRepeat })), items, possible, attempts: Math.floor(possible / items) };
  };
  // Identical limits always draw from one pool, whatever the size of the space.
  const byLimits = new Map<string, RowEntry[]>();
  for (const entry of entries) {
    const group = byLimits.get(entry.limitKey) ?? [];
    group.push(entry);
    byLimits.set(entry.limitKey, group);
  }
  for (const group of byLimits.values()) if (group.length >= 2) best = pickTighter(best, limitOf(group, group[0].capacity.possible));
  if (byLimits.size < 2) return best;
  const totalItems = entries.reduce((sum, e) => sum + e.row.items, 0);
  const floor = Math.min(...entries.map((e) => e.capacity.attemptsWithoutRepeat), best ? best.attempts : Infinity);
  const cap = Math.min(200, Math.max(UNSEEN_ATTEMPTS, floor + 1) * totalItems);
  const groups = [...byLimits.values()].map((group) => ({ group, keys: rowKeys(sheet.id, group[0], cap) })).filter((g): g is { group: RowEntry[]; keys: Set<string> } => g.keys !== null);
  const subsetLimit = (picked: typeof groups): SharedLimit | null => {
    const rows = picked.flatMap((g) => g.group);
    if (rows.length < 2) return null;
    const union = new Set<string>();
    for (const g of picked) for (const key of g.keys) union.add(key);
    return limitOf(rows, union.size);
  };
  if (groups.length <= 12) {
    for (let mask = 1; mask < 1 << groups.length; mask++) {
      const picked = groups.filter((_, i) => (mask & (1 << i)) !== 0);
      if (picked.length >= 2) {
        const candidate = subsetLimit(picked);
        if (candidate) best = pickTighter(best, candidate);
      }
    }
  } else {
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const candidate = subsetLimit([groups[i], groups[j]]);
      if (candidate) best = pickTighter(best, candidate);
    }
    const all = subsetLimit(groups);
    if (all) best = pickTighter(best, all);
  }
  return best;
}

/** How many attempts each sheet allows before a row or shared group repeats a question, with warnings under two. */
export function capacityOf(sheets: ReadonlyMap<string, SnapshotSheet>): SheetCapacity[] {
  return [...sheets.values()].map((sheet) => {
    const entries: RowEntry[] = SIDES.flatMap((side) =>
      sheet[side].rows.map((row) => ({ side, row, capacity: rowCapacity(sheet, side, row), limitKey: canonicalJson(row.limits) })),
    );
    const byShape = new Map<string, RowEntry[]>();
    for (const entry of entries) {
      const list = byShape.get(entry.row.shape.id) ?? [];
      list.push(entry);
      byShape.set(entry.row.shape.id, list);
    }
    const rows = entries.map((e) => e.capacity);
    const warnings = rows.flatMap((r) => r.warnings);
    let attemptsWithoutRepeat = Math.min(...rows.map((r) => r.attemptsWithoutRepeat));
    for (const group of byShape.values()) {
      const shared = sharedCapacity(sheet, group);
      if (!shared) continue;
      if (shared.attempts < attemptsWithoutRepeat) attemptsWithoutRepeat = shared.attempts;
      const singleMin = Math.min(...shared.rows.map((r) => r.attempts));
      if (shared.attempts < UNSEEN_ATTEMPTS && shared.attempts < singleMin) {
        const names = shared.rows.map((r) => `"${r.id}"`).join(", ");
        const { possible, items, attempts } = shared;
        warnings.push(`Sheet "${sheet.id}", rows ${names}: together their limits allow ${possible} ${possible === 1 ? "question" : "questions"} for ${items} ${items === 1 ? "place" : "places"}, so ${attempts === 0 ? "one attempt of the sheet repeats a question" : "the next attempt of the sheet repeats questions"} across these rows.`);
      }
    }
    return { sheet: sheet.id, attemptsWithoutRepeat, rows, warnings };
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
