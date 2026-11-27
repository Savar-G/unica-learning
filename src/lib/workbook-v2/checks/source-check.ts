// Check 1 of each book, the source (architecture 11.3): every printed item maps to an item hash of the snapshot, every
// answer is computed a second time from the printed page and agrees, and the repeat rule of 9.3 holds.
import type { Snapshot } from "../bank/snapshot";
import type { BookItem, Side } from "../contract";
import { canonicalJson, sha256 } from "../hash";
import type { BookCheckInput } from "./book-input";
import { attemptOf, finder, itemPlaces, NONE, pagePlace, type BookFinding } from "./findings";
import { printedAnswerProblem, regionsByItem } from "./printed-answers";
import { repeatFindings } from "./repeat-rule";

const SIDES: readonly Side[] = ["front", "back"];

/** The key of a row of the snapshot that an item names. */
export const sourceKey = (sheetId: string, side: Side, rowId: string): string => `${sheetId}/${side}/${rowId}`;

const sourceHash = (sheet: string, side: Side, row: string, shape: string, version: number): string => sha256(canonicalJson({ sheet, side, row, shape, version }));

/** The item hash of each row of a snapshot: its sheet, side, row, shape and shape version, by the key of the row. */
export function snapshotItemHashes(snapshot: Snapshot): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const sheet of snapshot.sheets.values()) {
    for (const side of SIDES) for (const row of sheet[side].rows) hashes.set(sourceKey(sheet.id, side, row.id), sourceHash(sheet.id, side, row.id, row.shape.id, row.shape.version));
  }
  return hashes;
}

/** The item hash that a printed item claims, from its own fields. */
export const itemSourceHash = (item: Pick<BookItem, "sheetId" | "side" | "rowId" | "shape" | "shapeVersion">): string => sourceHash(item.sheetId, item.side, item.rowId, item.shape, item.shapeVersion);

/** What the source check finds wrong with a book. */
export function checkSource(input: BookCheckInput): BookFinding[] {
  const { snapshot, sheets, items, pages, shapes } = input;
  const found: BookFinding[] = [];
  const tell = finder("source", found);
  const placeOf = itemPlaces(pages, items);
  const hashes = snapshotItemHashes(snapshot);
  const known = new Set(hashes.values());
  const ofBook = new Set(sheets.map((s) => `${s.sheet.id}/${s.attempt}`));

  for (const item of items) {
    const key = sourceKey(item.sheetId, item.side, item.rowId);
    if (!ofBook.has(`${item.sheetId}/${attemptOf(item)}`)) tell("snapshot-item", placeOf(item), `question ${item.number} belongs to no sheet of the book`);
    const hash = itemSourceHash(item);
    if (known.has(hash)) continue;
    const wanted = hashes.get(key);
    tell("snapshot-item", placeOf(item), wanted
      ? `question ${item.number} has the item hash ${hash.slice(0, 12)} (shape "${item.shape}" version ${item.shapeVersion}), and the snapshot row "${key}" has ${wanted.slice(0, 12)}`
      : `question ${item.number} names the row "${key}", which the snapshot "${snapshot.id}" does not have`);
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
  const regions = regionsByItem(pages);
  for (const item of items) {
    const problem = printedAnswerProblem(item, regions.get(item.id) ?? [], shapes);
    if (problem) tell("answer-twice", placeOf(item), `question ${item.number} (${problem.rows.join(" ")}): ${problem.problem}`);
  }

  for (const finding of repeatFindings(input, placeOf)) found.push(finding);
  return found;
}
