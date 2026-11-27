// The seams of a child's v2 sheet results (UNI-243, architecture spec 9.3 and 10.3, docs/workbook-v2-results.md): the
// BookStore reads what a child's v2 books issued and printed, the accepted page scans and the stored sheet results, and
// writes the results and the child's bank state. It has a memory adapter (memory-store.ts) and a Supabase adapter
// (supabase-store.ts), and both pass the contract of book-store.test.ts. The engine (src/lib/workbook-v2) knows none of it.
import type { FirstTry, SheetResultKind } from "@/lib/workbook-v2/results/sheet-results";

/** The values of child_bank_state.level_test_state. */
export const LEVEL_TEST_STATES = ["not-due", "due", "issued", "passed", "failed"] as const;
export type LevelTestState = (typeof LEVEL_TEST_STATES)[number];
/** The values of child_bank_state.pages_request: the parent's request for fewer or more pages a day. */
export const PAGES_REQUESTS = ["fewer", "same", "more"] as const;
export type PagesRequest = (typeof PAGES_REQUESTS)[number];

/** A v2 book of the child (workbooks with generator 'v2'). */
export interface BookRow { workbookId: string; parentId: string; number: number; printedRevision: string | null; levels: number[] }

/** One issued sheet attempt (workbook_sheets). */
export interface IssuedSheetRow { workbookId: string; sheetId: string; attempt: number; frontPage: number; backPage: number }

/** One printed question (workbook_item_answers): the engine's item id and the sheet attempt it is on. */
export interface BookItemRow { workbookId: string; printedRevision: string; itemId: string; sheetId: string; attempt: number }

/** An accepted scan of a page (workbook_scan_receipts). The same page scanned again is one more row. */
export interface ReceiptRow { workbookId: string; pageNumber: number }

/** What a rebuild writes for one sheet attempt. */
export interface SheetResultWrite {
  workbookId: string;
  printedRevision: string;
  sheetId: string;
  attempt: number;
  itemsTotal: number;
  itemsScored: number;
  mistakes: number;
  result: SheetResultKind;
}

/** A stored sheet result (child_sheet_results), with the marks version it was computed from. */
export interface StoredSheetResult extends SheetResultWrite { marksVersion: number }

/** written: rows that took the new version; stale: rows that a newer version already holds and were left as they are. */
export type WriteResultsOutcome = { status: "written"; written: number; stale: number; marksVersion: number | null } | { status: "refused"; reason: string };

/** What cannot be computed about a child in a level (child_bank_state). */
export interface ChildBankState {
  childId: string;
  levelId: string;
  startSheetId: string | null;
  levelTestState: LevelTestState;
  pagesRequest: PagesRequest;
}

export interface BookStore {
  /** The child's v2 books, by number. Empty for a child with v1 books only: one read, and a rebuild stops there. */
  books(childId: string): Promise<BookRow[]>;
  /** The issued sheet attempts of the child's v2 books. */
  issuedSheets(childId: string): Promise<IssuedSheetRow[]>;
  /** Every printed question of the child's v2 books. A full book has about 2,000, so a read pages past 1,000 rows. */
  bookItems(childId: string): Promise<BookItemRow[]>;
  /** The accepted page scans of the child's v2 books. */
  receipts(childId: string): Promise<ReceiptRow[]>;
  sheetResults(childId: string): Promise<StoredSheetResult[]>;
  /** Writes the rows in one transaction. A row whose stored marks version is newer than `marksVersion` is left as it is. */
  writeSheetResults(childId: string, marksVersion: number, rows: SheetResultWrite[]): Promise<WriteResultsOutcome>;
  childState(childId: string, levelId: string): Promise<ChildBankState | null>;
  saveChildState(state: ChildBankState): Promise<void>;
}

/** The effective first try of a printed v2 question, from marking (a team mark change replaces it; a correction never does). */
export interface ChildMark { workbookId: string; itemId: string; firstTry: FirstTry }

/** The child's marks and their version. The version only goes up; it is read before the marks. */
export interface MarkSource {
  version(parentId: string, childId: string): Promise<number>;
  marks(parentId: string, childId: string): Promise<ChildMark[]>;
}
