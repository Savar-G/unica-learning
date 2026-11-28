// The BookStore in memory: the same rules as the tables and write_child_sheet_results of migrations
// 20261127205443_child_sheet_results and child_sheet_results_hardening, for tests and for the fake PostgREST.
import { SHEET_RESULTS } from "@/lib/workbook-v2/results/sheet-results";
import { firstIssuedAttempts, sheetAttemptKey } from "./issuance";
import { LEVEL_TEST_STATES, PAGES_REQUESTS, type BookItemRow, type BookRow, type BookStore, type ChildBankState, type IssuedSheetRow, type ReceiptRow, type SheetResultWrite, type StoredSheetResult } from "./types";

const REVISION_HEX = /^[0-9a-f]{28}$/;
const LEVEL_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const intIn = (n: unknown, min: number, max: number): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= min && n <= max;

export interface MemoryBookTables {
  /** child id -> parent id. */
  children: Map<string, string>;
  /** Books by child id. */
  books: Map<string, BookRow[]>;
  sheets: Map<string, IssuedSheetRow[]>;
  items: Map<string, BookItemRow[]>;
  receipts: Map<string, ReceiptRow[]>;
  results: Map<string, StoredSheetResult[]>;
  resultsRevision: Map<string, number>;
  states: Map<string, ChildBankState>;
}

export type MemoryBookStore = BookStore & { tables: MemoryBookTables };

const copy = <T>(rows: readonly T[] | undefined): T[] => structuredClone([...(rows ?? [])]);

function rowProblem(row: SheetResultWrite, books: readonly BookRow[], firstWorkbook: ReadonlyMap<string, string>): string | null {
  if (!REVISION_HEX.test(row.printedRevision)) return `bad printed revision for ${row.sheetId}`;
  if (typeof row.sheetId !== "string" || row.sheetId.length < 1 || row.sheetId.length > 120) return "bad sheetId";
  if (!intIn(row.attempt, 1, 1000)) return `bad attempt for ${row.sheetId}`;
  if (!intIn(row.itemsTotal, 1, 1000)) return `items_total out of range for ${row.sheetId}`;
  if (!intIn(row.itemsScored, 0, row.itemsTotal)) return `items_scored out of range for ${row.sheetId}`;
  if (!intIn(row.mistakes, 0, row.itemsScored)) return `mistakes out of range for ${row.sheetId}`;
  if (!(SHEET_RESULTS as readonly string[]).includes(row.result)) return `bad result for ${row.sheetId}`;
  const book = books.find((b) => b.workbookId === row.workbookId);
  if (!book || book.printedRevision === null || book.printedRevision !== row.printedRevision) return `printed_revision does not match workbook ${row.workbookId}`;
  const first = firstWorkbook.get(sheetAttemptKey(row));
  if (!first) return `${row.sheetId} ${row.attempt} was not issued`;
  if (first !== row.workbookId) return `${row.sheetId} ${row.attempt} was first issued in another workbook`;
  return null;
}

export function memoryBookStore(): MemoryBookStore {
  const tables: MemoryBookTables = {
    children: new Map(), books: new Map(), sheets: new Map(), items: new Map(),
    receipts: new Map(), results: new Map(), resultsRevision: new Map(), states: new Map(),
  };
  return {
    tables,
    async books(childId) { return copy(tables.books.get(childId)).sort((a, b) => a.number - b.number); },
    async issuedSheets(childId) { return copy(tables.sheets.get(childId)); },
    async bookItems(childId) {
      const revisionOf = new Map((tables.books.get(childId) ?? []).map((b) => [b.workbookId, b.printedRevision]));
      return copy(tables.items.get(childId)).filter((i) => revisionOf.get(i.workbookId) === i.printedRevision);
    },
    async receipts(childId) { return copy(tables.receipts.get(childId)); },
    async sheetResults(childId) {
      const revisionOf = new Map((tables.books.get(childId) ?? []).map((b) => [b.workbookId, b.printedRevision]));
      return copy(tables.results.get(childId)).filter((r) => revisionOf.get(r.workbookId) === r.printedRevision);
    },

    async writeSheetResults(childId, marksVersion, rows) {
      if (!Number.isSafeInteger(marksVersion) || marksVersion < 0) return { status: "refused", reason: "the marks version must be a whole number, 0 or more" };
      if (!tables.children.has(childId)) return { status: "refused", reason: "the child is not known" };
      const childBooks = tables.books.get(childId) ?? [];
      const issued = tables.sheets.get(childId) ?? [];
      const firstWorkbook = new Map(firstIssuedAttempts(issued, childBooks).map((row) => [sheetAttemptKey(row), row.workbookId]));
      const stored = copy(tables.results.get(childId));
      // Validate the entire batch against the books and their first issuances before mutating anything.
      for (const row of rows) {
        const problem = rowProblem(row, childBooks, firstWorkbook);
        if (problem) return { status: "refused", reason: `the results do not pass the database check (${problem})` };
      }
      let written = 0;
      let stale = 0;
      for (const row of rows) {
        const at = stored.findIndex((s) => s.sheetId === row.sheetId && s.attempt === row.attempt);
        if (at >= 0 && stored[at].marksVersion > marksVersion) { stale++; continue; }
        const next = { ...structuredClone(row), marksVersion };
        if (at >= 0) stored[at] = next; else stored.push(next);
        written++;
      }
      tables.results.set(childId, stored);
      const versions = stored.map((s) => s.marksVersion);
      return { status: "written", written, stale, marksVersion: versions.length > 0 ? Math.max(...versions) : null };
    },

    async recordResultsRevision(childId, marksVersion) {
      if (!Number.isSafeInteger(marksVersion) || marksVersion < 0) throw new Error("sheet results revision: invalid version");
      if (!tables.children.has(childId)) throw new Error("sheet results revision: the child is not known");
      const prev = tables.resultsRevision.get(childId) ?? -1;
      tables.resultsRevision.set(childId, Math.max(prev, marksVersion));
    },

    async childState(childId, levelId) {
      const state = tables.states.get(`${childId} ${levelId}`);
      return state ? structuredClone(state) : null;
    },
    async saveChildState(state) {
      if (!tables.children.has(state.childId)) throw new Error("child bank state: the child is not known");
      if (!LEVEL_ID.test(state.levelId)) throw new Error("child bank state: invalid level_id");
      if (state.startSheetId !== null && (state.startSheetId.length < 1 || state.startSheetId.length > 120)) throw new Error("child bank state: invalid start_sheet_id");
      if (!(LEVEL_TEST_STATES as readonly string[]).includes(state.levelTestState)) throw new Error("child bank state: invalid level_test_state");
      if (!(PAGES_REQUESTS as readonly string[]).includes(state.pagesRequest)) throw new Error("child bank state: invalid pages_request");
      tables.states.set(`${state.childId} ${state.levelId}`, structuredClone(state));
    },
  };
}
