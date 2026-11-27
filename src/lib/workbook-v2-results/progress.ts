// The position of a child in a level, from what the BookStore holds: the engine's position() over the issued sheets of
// the child's v2 books, their accepted page scans and the stored sheet results. Nothing here is stored: position is
// computed each time (architecture spec 9.3).
import type { Snapshot } from "@/lib/workbook-v2/bank/snapshot";
import { position, type IssuedSheet, type PositionOutcome, type QueueReason, type ScanReceipt, type SheetResultRecord } from "@/lib/workbook-v2/assemble/position";
import type { BookStore } from "./types";

export interface ChildHistory { issued: IssuedSheet[]; receipts: ScanReceipt[]; results: SheetResultRecord[] }

/**
 * The history of a child for one level, as position() reads it. Only the sheets of `snapshot` count, and only the scans
 * of their pages. workbook_sheets keeps no queue reason, so the reason of attempt 2 or later is read from the attempt
 * before it: "repeat" when its stored result is a repeat, else "unscanned" (docs/workbook-v2-results.md, "Limits").
 */
export async function childHistory(books: BookStore, childId: string, snapshot: Snapshot): Promise<ChildHistory> {
  const [own, sheets, scans, stored] = await Promise.all([books.books(childId), books.issuedSheets(childId), books.receipts(childId), books.sheetResults(childId)]);
  const numberOf = new Map(own.map((b) => [b.workbookId, b.number]));
  const resultOf = (sheetId: string, attempt: number) => stored.find((r) => r.sheetId === sheetId && r.attempt === attempt)?.result;
  const issued = sheets.filter((s) => numberOf.has(s.workbookId) && snapshot.sheets.has(s.sheetId)).map((s): IssuedSheet => {
    const reason: QueueReason = s.attempt === 1 ? "new" : resultOf(s.sheetId, s.attempt - 1) === "repeat" ? "repeat" : "unscanned";
    return { bookId: s.workbookId, bookNumber: numberOf.get(s.workbookId) ?? 0, sheetId: s.sheetId, attempt: s.attempt, pages: [s.frontPage, s.backPage], reason };
  });
  const pages = new Set(issued.flatMap((s) => s.pages.map((p) => `${s.bookId} ${p}`)));
  const issuedAttempt = new Set(issued.map((s) => `${s.bookId} ${s.sheetId} ${s.attempt}`));
  return {
    issued,
    receipts: scans.filter((r) => pages.has(`${r.workbookId} ${r.pageNumber}`)).map((r) => ({ bookId: r.workbookId, pageNumber: r.pageNumber })),
    results: stored.filter((r) => issuedAttempt.has(`${r.workbookId} ${r.sheetId} ${r.attempt}`))
      .map((r) => ({ bookId: r.workbookId, sheetId: r.sheetId, attempt: r.attempt, result: r.result, itemsScored: r.itemsScored, mistakes: r.mistakes })),
  };
}

/** The position of a child in the level of `snapshot`, from its start sheet (child_bank_state) when it has one. */
export async function childPosition(books: BookStore, childId: string, snapshot: Snapshot, startSheetId?: string | null): Promise<PositionOutcome> {
  const { issued, receipts, results } = await childHistory(books, childId, snapshot);
  return position({ childId, ...(startSheetId ? { startSheetId } : {}) }, issued, receipts, results, snapshot);
}
