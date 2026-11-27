// The BookStore in memory: the same rules as the tables and write_child_sheet_results of migration
// 20261127205443_child_sheet_results, for tests and for the fake PostgREST of book-store.fixtures.ts.
import type { BookItemRow, BookRow, BookStore, ChildBankState, IssuedSheetRow, ReceiptRow, StoredSheetResult } from "./types";

export interface MemoryBookTables {
  /** child id -> parent id. */
  children: Map<string, string>;
  /** Books by child id. */
  books: Map<string, BookRow[]>;
  sheets: Map<string, IssuedSheetRow[]>;
  items: Map<string, BookItemRow[]>;
  receipts: Map<string, ReceiptRow[]>;
  results: Map<string, StoredSheetResult[]>;
  states: Map<string, ChildBankState>;
}

export type MemoryBookStore = BookStore & { tables: MemoryBookTables };

const copy = <T>(rows: readonly T[] | undefined): T[] => structuredClone([...(rows ?? [])]);

export function memoryBookStore(): MemoryBookStore {
  const tables: MemoryBookTables = { children: new Map(), books: new Map(), sheets: new Map(), items: new Map(), receipts: new Map(), results: new Map(), states: new Map() };
  return {
    tables,
    async books(childId) { return copy(tables.books.get(childId)).sort((a, b) => a.number - b.number); },
    async issuedSheets(childId) { return copy(tables.sheets.get(childId)); },
    async bookItems(childId) { return copy(tables.items.get(childId)); },
    async receipts(childId) { return copy(tables.receipts.get(childId)); },
    async sheetResults(childId) { return copy(tables.results.get(childId)); },

    async writeSheetResults(childId, marksVersion, rows) {
      if (!Number.isSafeInteger(marksVersion) || marksVersion < 0) return { status: "refused", reason: "the marks version must be a whole number, 0 or more" };
      if (!tables.children.has(childId)) return { status: "refused", reason: "the child is not known" };
      const issued = tables.sheets.get(childId) ?? [];
      const bad = rows.find((r) => !issued.some((s) => s.workbookId === r.workbookId && s.sheetId === r.sheetId && s.attempt === r.attempt)
        || !(r.itemsTotal >= 1 && r.itemsScored >= 0 && r.itemsScored <= r.itemsTotal && r.mistakes >= 0 && r.mistakes <= r.itemsScored));
      if (bad) return { status: "refused", reason: `the results do not pass the database check (${bad.sheetId} ${bad.attempt})` };
      const stored = copy(tables.results.get(childId));
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

    async childState(childId, levelId) {
      const state = tables.states.get(`${childId} ${levelId}`);
      return state ? structuredClone(state) : null;
    },
    async saveChildState(state) {
      if (!tables.children.has(state.childId)) throw new Error("child bank state: the child is not known");
      tables.states.set(`${state.childId} ${state.levelId}`, structuredClone(state));
    },
  };
}
