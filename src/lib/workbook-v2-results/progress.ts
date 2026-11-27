// The position of a child in a level, from what the BookStore holds: the engine's position() over the issued sheets of
// the child's v2 books, their accepted page scans and the stored sheet results. Nothing here is stored: position is
// computed each time (architecture spec 9.3).
import type { Snapshot } from "@/lib/workbook-v2/bank/snapshot";
import { position, type BookScanCoverage, type IssuedSheet, type PositionOutcome, type QueueReason, type ScanReceipt, type SheetResultRecord } from "@/lib/workbook-v2/assemble/position";
import { firstIssuedAttempts } from "./issuance";
import type { BookStore } from "./types";

export interface ChildHistory {
  issued: IssuedSheet[];
  receipts: ScanReceipt[];
  results: SheetResultRecord[];
  /** Full-book page scan counts computed before filtering out retired sheets no longer in `snapshot`. */
  bookCoverage: Map<string, BookScanCoverage>;
}

/**
 * The history of a child for one level, as position() reads it. Full-book scan coverage is computed across every issued
 * sheet of each v2 book (so retiring a sheet never shrinks an old book's page count or drops its scanned pages), while
 * only active snapshot sheets enter the queue. Queue reasons come from workbook_sheets.queue_reason when stored, falling
 * back only on pre-migration rows where queue_reason is null.
 */
export async function childHistory(books: BookStore, childId: string, snapshot: Snapshot): Promise<ChildHistory> {
  const [own, sheets, scans, stored] = await Promise.all([books.books(childId), books.issuedSheets(childId), books.receipts(childId), books.sheetResults(childId)]);
  const numberOf = new Map(own.map((b) => [b.workbookId, b.number]));
  const allSheets = sheets.filter((s) => numberOf.has(s.workbookId));
  const bookCoverage = new Map<string, BookScanCoverage>();
  for (const book of own) {
    const bookSheets = allSheets.filter((s) => s.workbookId === book.workbookId);
    if (bookSheets.length === 0) continue;
    const validPages = new Set(bookSheets.flatMap((s) => [s.frontPage, s.backPage]));
    const scannedPages = new Set(scans.filter((r) => r.workbookId === book.workbookId && validPages.has(r.pageNumber)).map((r) => r.pageNumber)).size;
    bookCoverage.set(book.workbookId, { issuedPages: bookSheets.length * 2, scannedPages });
  }
  const resultOf = (sheetId: string, attempt: number) => stored.find((r) => r.sheetId === sheetId && r.attempt === attempt)?.result;
  const issued = firstIssuedAttempts(allSheets, own).filter((s) => snapshot.sheets.has(s.sheetId)).map((s): IssuedSheet => {
    const reason: QueueReason = s.reason ?? (s.attempt === 1 ? "new" : resultOf(s.sheetId, s.attempt - 1) === "repeat" ? "repeat" : "unscanned");
    return { bookId: s.workbookId, bookNumber: numberOf.get(s.workbookId) ?? 0, sheetId: s.sheetId, attempt: s.attempt, pages: [s.frontPage, s.backPage], reason };
  });
  const pages = new Set(issued.flatMap((s) => s.pages.map((p) => `${s.bookId} ${p}`)));
  const issuedAttempt = new Set(issued.map((s) => `${s.bookId} ${s.sheetId} ${s.attempt}`));
  return {
    issued,
    receipts: scans.filter((r) => pages.has(`${r.workbookId} ${r.pageNumber}`)).map((r) => ({ bookId: r.workbookId, pageNumber: r.pageNumber })),
    results: stored.filter((r) => issuedAttempt.has(`${r.workbookId} ${r.sheetId} ${r.attempt}`))
      .map((r) => ({ bookId: r.workbookId, sheetId: r.sheetId, attempt: r.attempt, result: r.result, itemsScored: r.itemsScored, mistakes: r.mistakes })),
    bookCoverage,
  };
}

/** A missing start uses the saved start for this level. Explicit null uses the level's default start. */
export async function childPosition(books: BookStore, childId: string, snapshot: Snapshot, startSheetId?: string | null): Promise<PositionOutcome> {
  const [{ issued, receipts, results, bookCoverage }, saved] = await Promise.all([
    childHistory(books, childId, snapshot),
    startSheetId === undefined ? books.childState(childId, snapshot.level.id) : null,
  ]);
  const start = startSheetId === undefined ? saved?.startSheetId : startSheetId;
  return position({ childId, ...(start ? { startSheetId: start } : {}) }, issued, receipts, results, snapshot, bookCoverage);
}
