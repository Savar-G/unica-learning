// Check 1 of each book, the source (architecture 11.3): every printed item maps to a row of the frozen snapshot (the hash
// of the row's canonical content and shape version) and is one of that row's questions, every answer is computed a second
// time from the printed page and agrees, and the repeat rule of 9.3 holds.
import type { Snapshot, SnapshotRow } from "../bank/snapshot";
import { tokenText, type BookItem, type Region, type Side } from "../contract";
import { canonicalJson, sha256 } from "../hash";
import { STORY_SHAPE_ID, storyRendering, type StoryLimits } from "../shapes/story";
import { bindStory } from "../themes/bind";
import type { BookCheckData, CheckedSheet } from "./book-input";
import { attemptOf, finder, itemPlaces, NONE, pagePlace, type BookFinding } from "./findings";
import { rowMembership } from "./membership";
import { printedAnswerProblem, regionsByItem } from "./printed-answers";
import { repeatFindings } from "./repeat-rule";

const SIDES: readonly Side[] = ["front", "back"];

/** The key of a row of the snapshot that an item names. */
export const sourceKey = (sheetId: string, side: Side, rowId: string): string => `${sheetId}/${side}/${rowId}`;

/** What a row is made of: its limits, or for a row of word problems the questions that it names (a book binds them to its theme). */
const contentOf = ({ shape, limits }: Pick<SnapshotRow, "shape" | "limits">): unknown => (shape.id === STORY_SHAPE_ID ? { questions: (limits as StoryLimits).ids } : limits);

interface RowClaim { sheet: string; side: Side; row: string; shape: string; version: number; items: number; content: unknown }
const rowHash = (claim: RowClaim): string => sha256(canonicalJson(claim));
const claimOf = (sheet: string, side: Side, row: SnapshotRow): RowClaim => ({ sheet, side, row: row.id, shape: row.shape.id, version: row.shape.version, items: row.items, content: contentOf(row) });

/** The hash of each row of a snapshot: its sheet, side, id, shape, shape version, number of questions and canonical content, by the key of the row. */
export function snapshotRowHashes(snapshot: Snapshot): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const sheet of snapshot.sheets.values()) for (const side of SIDES) for (const row of sheet[side].rows) hashes.set(sourceKey(sheet.id, side, row.id), rowHash(claimOf(sheet.id, side, row)));
  return hashes;
}

/** The hash of the row that a printed item claims: its own sheet, side, row, shape and version, with the row of the book that made it. */
export const itemRowHash = (item: Pick<BookItem, "sheetId" | "side" | "rowId" | "shape" | "shapeVersion">, row: SnapshotRow): string =>
  rowHash({ sheet: item.sheetId, side: item.side, row: item.rowId, shape: item.shape, version: item.shapeVersion, items: row.items, content: contentOf(row) });

const rowOf = (sheet: { front: { rows: SnapshotRow[] }; back: { rows: SnapshotRow[] } } | undefined, side: Side, rowId: string): SnapshotRow | undefined => sheet?.[side].rows.find((r) => r.id === rowId);

/**
 * The limits that a question of a frozen row must meet in this book: the frozen limits, and for a row of word problems its
 * frozen questions bound again to the theme and region that the book's row was bound to.
 */
function frozenLimits(snapshot: Snapshot, frozen: SnapshotRow, own: SnapshotRow): unknown {
  if (frozen.shape.id !== STORY_SHAPE_ID || !snapshot.stories) return frozen.limits;
  const { interest, region, seen } = own.limits as StoryLimits;
  try {
    return bindStory((frozen.limits as StoryLimits).ids, snapshot.stories, { interest, region }, seen);
  } catch {
    return { ...(frozen.limits as StoryLimits), questions: [] };
  }
}

/**
 * What is wrong with the printed text of a word problem, or null: the page must print the frozen phrasing filled for the
 * question and numbers that its item holds, word for word, with the unit of that filling beside its answer area. The
 * answer key is worked from the item, so a page that asks another question than the key answers is stopped here.
 */
function printedStoryProblem(item: BookItem, limits: unknown, own: readonly Region[]): string | null {
  const rendering = storyRendering(item.question, limits as StoryLimits);
  if (!rendering) return "its question cannot be filled again from the frozen phrasing";
  const ink = own.find((r) => r.role === "question")?.ink ?? [];
  const flow = ink.find((i) => i.kind === "flow");
  const printed = flow?.kind === "flow" ? flow.tokens : [];
  if (canonicalJson(printed) !== canonicalJson(rendering.tokens)) {
    return `the page prints "${printed.map(tokenText).join(" ")}", and the frozen phrasing "${rendering.phrasing}" filled for this question prints "${rendering.tokens.map(tokenText).join(" ")}"`;
  }
  const units = ink.flatMap((i) => (i.kind === "text" ? [i.text] : []));
  return units.length === 1 && units[0] === rendering.unit ? null : `the unit beside the answer area is ${units.map((u) => `"${u}"`).join(", ") || "missing"}, and the frozen phrasing filled for this question has "${rendering.unit}"`;
}

/** What the source check finds wrong with a book. */
export function checkSource(input: BookCheckData): BookFinding[] {
  const { snapshot, sheets, items, pages, shapes } = input;
  const found: BookFinding[] = [];
  const tell = finder("source", found);
  const placeOf = itemPlaces(pages, items);
  const hashes = snapshotRowHashes(snapshot);
  const has = rowMembership();
  const ofBook = new Map<string, CheckedSheet>(sheets.map((s) => [`${s.sheet.id}/${s.attempt}`, s]));
  const regions = regionsByItem(pages);

  for (const item of items) {
    const key = sourceKey(item.sheetId, item.side, item.rowId);
    const checked = ofBook.get(`${item.sheetId}/${attemptOf(item)}`);
    if (!checked) tell("snapshot-item", placeOf(item), `question ${item.number} belongs to no sheet of the book`);
    const frozen = rowOf(snapshot.sheets.get(item.sheetId), item.side, item.rowId);
    const own = rowOf(checked?.sheet, item.side, item.rowId) ?? frozen;
    const wanted = hashes.get(key);
    if (!frozen || !own || !wanted) {
      tell("snapshot-item", placeOf(item), `question ${item.number} names the row "${key}", which the snapshot "${snapshot.id}" does not have`);
      continue;
    }
    const hash = itemRowHash(item, own);
    if (hash !== wanted) {
      tell("snapshot-item", placeOf(item), `question ${item.number} has the row hash ${hash.slice(0, 12)} (shape "${item.shape}" version ${item.shapeVersion}), and the snapshot row "${key}" has ${wanted.slice(0, 12)} (shape "${frozen.shape.id}" version ${frozen.shape.version})`);
      continue;
    }
    const limits = frozenLimits(snapshot, frozen, own);
    const member = has({ shape: frozen.shape, limits }, item.question);
    if (member === true) {
      const story = frozen.shape.id === STORY_SHAPE_ID ? printedStoryProblem(item, limits, regions.get(item.id) ?? []) : null;
      if (story) tell("story-text", placeOf(item), `question ${item.number}: ${story}`);
      continue;
    }
    tell("snapshot-item", placeOf(item), member === false
      ? `question ${item.number} (${canonicalJson(item.question).slice(0, 80)}) is not a question of the snapshot row "${key}" (shape "${frozen.shape.id}" version ${frozen.shape.version})`
      : `question ${item.number} cannot be proved a question of the snapshot row "${key}": the shape "${frozen.shape.id}" cannot read a question back`);
  }

  // Every row of the snapshot prints exactly its number of questions: none is missing and none is added.
  for (const { sheet, attempt } of sheets) {
    for (const side of SIDES) {
      const page = pages.find((p) => p.sheetId === sheet.id && p.attempt === attempt && p.side === side);
      for (const row of snapshot.sheets.get(sheet.id)?.[side].rows ?? []) {
        const own = items.filter((i) => i.sheetId === sheet.id && i.side === side && i.rowId === row.id && attemptOf(i) === attempt);
        if (own.length === row.items) continue;
        const place = own[0] ? placeOf(own[0]) : page ? pagePlace(page) : { sheet: sheet.id, page: NONE, slot: "page" };
        tell("snapshot-item", place, `the row "${row.id}" prints ${own.length} ${own.length === 1 ? "question" : "questions"}, and the snapshot row has ${row.items}`);
      }
    }
  }

  // The second computation of every answer reads the printed rows of the page model, with code apart from the first.
  for (const item of items) {
    const problem = printedAnswerProblem(item, regions.get(item.id) ?? [], shapes);
    if (problem) tell("answer-twice", placeOf(item), `question ${item.number} (${problem.rows.join(" ")}): ${problem.problem}`);
  }

  for (const finding of repeatFindings(input, placeOf, has)) found.push(finding);
  return found;
}
