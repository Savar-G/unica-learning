// The memory and PostgREST adapters run the same contract. The hosted SQL probe uses a transaction that rolls back.
import { describe, expect, it } from "vitest";
import { bookItemOf, fakeBookSupabase, itemIdOf, memorySeeder, seedRows, type BookSeeder, type SeedFamily } from "./book-store.fixtures";
import { memoryBookStore } from "./memory-store";
import { BOOK_PAGE_ROWS, supabaseBookStore, writeAnswer } from "./supabase-store";
import type { BookStore, SheetResultWrite } from "./types";

const REV = "0123456789abcdef0123456789ab";
/** A family whose book prints 1,020 questions (51 sheets of 20), so every read of its questions needs two pages. */
function bigFamily(): SeedFamily {
  const workbookId = crypto.randomUUID();
  return {
    parentId: crypto.randomUUID(), childId: crypto.randomUUID(),
    books: [{ workbookId, number: 1, printedRevision: REV, levels: [3], sheets: Array.from({ length: 51 }, (_, k) => ({ sheetId: `synth-sheet-${k + 1}`, attempt: 1, items: 20 })) }],
  };
}
const emptyFamily = (): SeedFamily => ({ parentId: crypto.randomUUID(), childId: crypto.randomUUID(), books: [] });
const resultRow = (family: SeedFamily, k: number, o: Partial<SheetResultWrite> = {}): SheetResultWrite => ({
  workbookId: family.books[0].workbookId, printedRevision: REV, sheetId: `synth-sheet-${k}`, attempt: 1, itemsTotal: 20, itemsScored: 16, mistakes: 1, result: "unknown", ...o,
});
const byKey = <T extends { sheetId: string; attempt: number }>(rows: T[]) => [...rows].sort((a, b) => `${a.sheetId} ${a.attempt}`.localeCompare(`${b.sheetId} ${b.attempt}`));

export function runBookStoreContract(name: string, make: () => { store: BookStore; seeder: BookSeeder }, timeout = 30_000) {
  describe(`the ${name} book store`, () => {
    it("reads no book for a child with no v2 book", async () => {
      const { store, seeder } = make();
      const family = emptyFamily();
      await seeder.seed(family);
      expect(await store.books(family.childId)).toEqual([]);
      expect(await store.bookItems(family.childId)).toEqual([]);
      expect(await store.receipts(family.childId)).toEqual([]);
    }, timeout);

    it("reads the books, issued sheets and every question field for field, past 1,000 rows", async () => {
      const { store, seeder } = make();
      const family = bigFamily();
      await seeder.seed(family);
      const rows = seedRows(family, family.books[0]);
      expect(await store.books(family.childId)).toEqual([rows.book]);
      expect(byKey(await store.issuedSheets(family.childId))).toEqual(byKey(rows.sheets));
      const items = await store.bookItems(family.childId);
      expect(items.length).toBeGreaterThan(BOOK_PAGE_ROWS);
      expect([...items].sort((a, b) => a.itemId.localeCompare(b.itemId))).toEqual(rows.items.map(bookItemOf).sort((a, b) => a.itemId.localeCompare(b.itemId)));
      expect(items.find((i) => i.itemId === itemIdOf("synth-sheet-7", 1, 12, 20))).toMatchObject({ sheetId: "synth-sheet-7", attempt: 1 });
    }, timeout);

    it("reads each accepted page scan by its page number, a page scanned again twice", async () => {
      const { store, seeder } = make();
      const family = bigFamily();
      await seeder.seed(family);
      const book = family.books[0].workbookId;
      for (const page of [1, 2, 2, 7]) await seeder.scan(family, book, page);
      expect((await store.receipts(family.childId)).map((r) => `${r.workbookId === book} ${r.pageNumber}`).sort()).toEqual(["true 1", "true 2", "true 2", "true 7"]);
    }, timeout);

    it("keeps the newest marks version: an older rebuild is skipped, the same version writes again", async () => {
      const { store, seeder } = make();
      const family = bigFamily();
      await seeder.seed(family);
      expect(await store.writeSheetResults(family.childId, 5, [resultRow(family, 1), resultRow(family, 2, { result: "mastered", itemsScored: 20, mistakes: 0 })]))
        .toEqual({ status: "written", written: 2, stale: 0, marksVersion: 5 });
      expect(await store.writeSheetResults(family.childId, 4, [resultRow(family, 1, { result: "repeat", mistakes: 3 }), resultRow(family, 3)]))
        .toEqual({ status: "written", written: 1, stale: 1, marksVersion: 5 });
      expect(await store.writeSheetResults(family.childId, 5, [resultRow(family, 2, { result: "repeat", mistakes: 3 })])).toMatchObject({ written: 1, stale: 0 });
      expect(await store.writeSheetResults(family.childId, 6, [resultRow(family, 1, { result: "repeat", itemsScored: 20, mistakes: 4 })])).toMatchObject({ written: 1, marksVersion: 6 });
      expect(byKey(await store.sheetResults(family.childId))).toEqual([
        { ...resultRow(family, 1, { result: "repeat", itemsScored: 20, mistakes: 4 }), marksVersion: 6 },
        { ...resultRow(family, 2, { result: "repeat", mistakes: 3 }), marksVersion: 5 },
        { ...resultRow(family, 3), marksVersion: 4 },
      ]);
    }, timeout);

    it("refuses unissued attempts, invalid counts, wrong printed revision, workbook swaps, or unknown child, and writes nothing atomically", async () => {
      const { store, seeder } = make();
      const family = bigFamily();
      await seeder.seed(family);
      expect(await store.writeSheetResults(family.childId, 1, [resultRow(family, 1), resultRow(family, 1, { sheetId: "never-issued" })])).toMatchObject({ status: "refused" });
      expect(await store.writeSheetResults(family.childId, 1, [resultRow(family, 1), resultRow(family, 2, { itemsTotal: 1001 })])).toMatchObject({ status: "refused" });
      expect(await store.writeSheetResults(family.childId, 1, [resultRow(family, 1), resultRow(family, 2, { printedRevision: "f".repeat(28) })])).toMatchObject({ status: "refused" });
      expect(await store.writeSheetResults(family.childId, 1, [resultRow(family, 1, { attempt: 2 })])).toMatchObject({ status: "refused" });
      expect(await store.writeSheetResults(crypto.randomUUID(), 1, [resultRow(family, 1)])).toEqual({ status: "refused", reason: "the child is not known" });
      expect(await store.sheetResults(family.childId)).toEqual([]);
      // Once written, a result for (sheetId, attempt) cannot be rebound to another workbook.
      expect(await store.writeSheetResults(family.childId, 1, [resultRow(family, 1)])).toMatchObject({ status: "written", written: 1 });
      expect(await store.writeSheetResults(family.childId, 2, [resultRow(family, 2), resultRow(family, 1, { workbookId: crypto.randomUUID() })])).toMatchObject({ status: "refused" });
      expect(await store.sheetResults(family.childId)).toEqual([{ ...resultRow(family, 1), marksVersion: 1 }]);
    }, timeout);

    it("saves and reads the child's bank state of a level", async () => {
      const { store, seeder } = make();
      const family = emptyFamily();
      await seeder.seed(family);
      expect(await store.childState(family.childId, "synth-level")).toBeNull();
      const state = { childId: family.childId, levelId: "synth-level", startSheetId: "synth-sheet-3", levelTestState: "not-due" as const, pagesRequest: "same" as const };
      await store.saveChildState(state);
      await store.saveChildState({ ...state, pagesRequest: "more", levelTestState: "due" });
      expect(await store.childState(family.childId, "synth-level")).toEqual({ ...state, pagesRequest: "more", levelTestState: "due" });
      expect(await store.childState(family.childId, "other-level")).toBeNull();
    }, timeout);
  });
}

runBookStoreContract("memory", () => { const store = memoryBookStore(); return { store, seeder: memorySeeder(store) }; });
runBookStoreContract("Supabase (fake PostgREST)", () => { const fake = fakeBookSupabase(); return { store: supabaseBookStore(fake.db), seeder: fake.seeder }; });

describe("the Supabase book store over PostgREST", () => {
  it("reads the questions with keyset pagination of 1,000 rows and writes the results in one call", async () => {
    const fake = fakeBookSupabase();
    const store = supabaseBookStore(fake.db);
    const family = bigFamily();
    await fake.seeder.seed(family);
    await store.bookItems(family.childId);
    const itemCalls = fake.calls.filter((c) => c.startsWith("GET /rest/v1/workbook_item_answers"));
    expect(itemCalls).toHaveLength(2);
    expect(itemCalls[0]).toBe("GET /rest/v1/workbook_item_answers?");
    expect(itemCalls[1]).toMatch(/^GET \/rest\/v1\/workbook_item_answers\?gt\./);
    fake.calls.length = 0;
    await store.writeSheetResults(family.childId, 1, [resultRow(family, 1), resultRow(family, 2)]);
    expect(fake.calls).toEqual(["POST /rest/v1/rpc/write_child_sheet_results?"]);
  });

  it("ignores a concurrently published new book between keyset pages without duplicating boundary questions", async () => {
    const fake = fakeBookSupabase();
    const store = supabaseBookStore(fake.db);
    const family = bigFamily();
    await fake.seeder.seed(family);
    let injected = false;
    fake.onRequest = (_method, path, params) => {
      if (!injected && path === "/rest/v1/workbook_item_answers" && params.has("id")) {
        injected = true;
        const wb2 = crypto.randomUUID();
        const extra = seedRows(family, { workbookId: wb2, number: 2, printedRevision: REV, levels: [3], sheets: [{ sheetId: "synth-sheet-99", attempt: 1, items: 5 }] });
        fake.memory.tables.books.get(family.childId)?.push(extra.book);
        // Prepend into the table so offset pagination would shift and duplicate the boundary row; keyset + fixed workbook IDs must not.
        fake.memory.tables.items.set(family.childId, [...extra.items.map(bookItemOf), ...(fake.memory.tables.items.get(family.childId) ?? [])]);
      }
    };
    const items = await store.bookItems(family.childId);
    expect(items).toHaveLength(1020);
    expect(new Set(items.map((i) => i.itemId)).size).toBe(1020);
  });

  it.each([
    [{ status: "written", written: 1, stale: 0, marksVersion: 3 }, { status: "written", written: 1, stale: 0, marksVersion: 3 }],
    [{ status: "refused", reason: "no" }, { status: "refused", reason: "no" }],
  ])("reads the writer's answer %j", (data, outcome) => { expect(writeAnswer(data)).toEqual(outcome); });

  it.each([null, { status: "written", written: -1, stale: 0, marksVersion: 1 }, { status: "maybe" }])("throws on an answer it cannot read: %j", (data) => {
    expect(() => writeAnswer(data)).toThrow(/unexpected answer/);
  });
});
