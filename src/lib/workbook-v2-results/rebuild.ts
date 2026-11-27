// Rebuilds the stored results of a child's v2 sheets from the current effective first-try marks (architecture spec 9.3:
// "Rebuilt when a mark changes"). It reads the marks version before the marks, so a result is never newer than its
// version says; the store keeps the newest version and skips an older rebuild that finishes late.
import { WORKBOOK_1_PACES } from "@/lib/workbook-v2/assemble/level-config";
import { sheetResults, type ResultConfig } from "@/lib/workbook-v2/results/sheet-results";
import type { BookRow, BookStore, MarkSource, SheetResultWrite } from "./types";

export interface RebuildDeps {
  books: BookStore;
  marks: MarkSource;
  /** The mastery line of a book; `masteryConfigFor(book.levels)` when not given. Null: the book has no result yet. */
  configFor?: (book: BookRow) => ResultConfig | null;
}

export type RebuildOutcome =
  | { status: "no-v2-books" }
  | { status: "written"; marksVersion: number; written: number; stale: number; problems: string[] }
  | { status: "refused"; reason: string; problems: string[] };

/**
 * The mastery line of a book's levels, from the level configs (product spec 7.3: 90% at Levels 1 to 6, 80% from
 * Level 7). This picks a config by its data and decides nothing itself. Null when a level has no config, or when the
 * levels of the book disagree.
 */
export function masteryConfigFor(levels: readonly number[]): ResultConfig | null {
  const percents = new Set(levels.map((n) => WORKBOOK_1_PACES.find((p) => p.names.includes(String(n)))?.config.masteryPercent));
  const [only] = [...percents];
  return percents.size === 1 && only !== undefined ? { masteryPercent: only } : null;
}

export async function rebuildSheetResults(deps: RebuildDeps, childId: string): Promise<RebuildOutcome> {
  const books = await deps.books.books(childId);
  if (books.length === 0) return { status: "no-v2-books" };
  const parentId = books[0].parentId;
  const marksVersion = await deps.marks.version(parentId, childId);
  const [marks, items] = await Promise.all([deps.marks.marks(parentId, childId), deps.books.bookItems(childId)]);
  const configFor = deps.configFor ?? ((book: BookRow) => masteryConfigFor(book.levels));
  const rows: SheetResultWrite[] = [];
  const problems: string[] = [];
  for (const book of books) {
    const printedRevision = book.printedRevision;
    if (printedRevision === null) continue;
    const own = items.filter((i) => i.workbookId === book.workbookId && i.printedRevision === printedRevision);
    if (own.length === 0) continue;
    const config = configFor(book);
    if (!config) {
      problems.push(`Book ${book.number}: no mastery line for its levels (${book.levels.join(", ")}).`);
      continue;
    }
    const ids = new Set(own.map((i) => i.itemId));
    const ownMarks = marks.filter((m) => m.workbookId === book.workbookId && ids.has(m.itemId)).map((m) => ({ itemId: m.itemId, firstTry: m.firstTry }));
    const outcome = sheetResults(ownMarks, own.map((i) => ({ id: i.itemId, sheetId: i.sheetId, attempt: i.attempt })), config);
    if (!outcome.ok) {
      problems.push(...outcome.problems.map((p) => `Book ${book.number}: ${p}`));
      continue;
    }
    rows.push(...outcome.sheets.map((s) => ({
      workbookId: book.workbookId, printedRevision, sheetId: s.sheetId, attempt: s.attempt,
      itemsTotal: s.total, itemsScored: s.itemsScored, mistakes: s.mistakes, result: s.result,
    })));
  }
  if (rows.length === 0) return { status: "written", marksVersion, written: 0, stale: 0, problems };
  const written = await deps.books.writeSheetResults(childId, marksVersion, rows);
  if (written.status === "refused") return { status: "refused", reason: written.reason, problems };
  return { status: "written", marksVersion, written: written.written, stale: written.stale, problems };
}
