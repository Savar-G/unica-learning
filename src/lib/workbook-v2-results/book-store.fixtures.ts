// Shared pieces of the BookStore tests: an invented family and its v2 books (no reference, vault or family content), a
// seeder for each adapter, and a fake Supabase (PostgREST) over the memory store, so the Supabase adapter is tested
// through the wire it really uses, with PostgREST's cap of 1,000 rows a read.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { QueueReason } from "@/lib/workbook-v2/assemble/position";
import { memoryBookStore, type MemoryBookStore } from "./memory-store";
import type { BookItemRow, BookRow, IssuedSheetRow, StoredSheetResult } from "./types";

/** One issued sheet attempt of an invented book, with `items` questions: the first half on its front, the rest on its back. */
export interface SeedSheet { sheetId: string; attempt: number; items: number; reason?: QueueReason | null }
export interface SeedBook { workbookId: string; number: number; printedRevision: string; levels: number[]; sheets: SeedSheet[] }
export interface SeedFamily { parentId: string; childId: string; books: SeedBook[] }

/** The engine's id of the `i`th question (from 1) of a sheet attempt. */
export const itemIdOf = (sheetId: string, attempt: number, i: number, items: number) =>
  `${sheetId}/${attempt}/${i <= Math.ceil(items / 2) ? "front" : "back"}/${i <= Math.ceil(items / 2) ? i : i - Math.ceil(items / 2)}`;

/** The page numbers of the `k`th sheet (from 0) of a book. */
export const pagesOf = (k: number): [number, number] => [2 * k + 1, 2 * k + 2];

/** A seeded question as the BookStore reads it: without its page and number. */
export const bookItemOf = ({ workbookId, printedRevision, itemId, sheetId, attempt }: BookItemRow): BookItemRow => ({ workbookId, printedRevision, itemId, sheetId, attempt });

export interface SeedRows { book: BookRow; sheets: IssuedSheetRow[]; items: (BookItemRow & { pageNumber: number; questionNumber: number })[] }

/** The rows a book is published as: its issued sheets and every printed question, with its page and number. */
export function seedRows(family: SeedFamily, book: SeedBook): SeedRows {
  const sheets: IssuedSheetRow[] = [];
  const items: SeedRows["items"] = [];
  book.sheets.forEach((s, k) => {
    const [frontPage, backPage] = pagesOf(k);
    const reason = s.reason !== undefined ? s.reason : s.attempt === 1 ? "new" : null;
    sheets.push({ workbookId: book.workbookId, sheetId: s.sheetId, attempt: s.attempt, frontPage, backPage, reason });
    for (let i = 1; i <= s.items; i++) {
      const front = i <= Math.ceil(s.items / 2);
      items.push({
        workbookId: book.workbookId, printedRevision: book.printedRevision, itemId: itemIdOf(s.sheetId, s.attempt, i, s.items), sheetId: s.sheetId, attempt: s.attempt,
        pageNumber: front ? frontPage : backPage, questionNumber: front ? i : i - Math.ceil(s.items / 2),
      });
    }
  });
  return { book: { workbookId: book.workbookId, parentId: family.parentId, number: book.number, printedRevision: book.printedRevision, levels: book.levels }, sheets, items };
}

/** Puts a family into a store, and adds accepted page scans. */
export interface BookSeeder {
  seed(family: SeedFamily): Promise<void>;
  scan(family: SeedFamily, workbookId: string, pageNumber: number): Promise<void>;
  seedResult(childId: string, result: StoredSheetResult): void;
}

export function memorySeeder(store: MemoryBookStore): BookSeeder {
  const t = store.tables;
  return {
    seedResult(childId, result) {
      t.results.set(childId, [...(t.results.get(childId) ?? []), result]);
    },
    async seed(family) {
      t.children.set(family.childId, family.parentId);
      for (const book of family.books) {
        const rows = seedRows(family, book);
        t.books.set(family.childId, [...(t.books.get(family.childId) ?? []), rows.book]);
        t.sheets.set(family.childId, [...(t.sheets.get(family.childId) ?? []), ...rows.sheets]);
        t.items.set(family.childId, [...(t.items.get(family.childId) ?? []), ...rows.items.map(bookItemOf)]);
      }
    },
    async scan(family, workbookId, pageNumber) {
      t.receipts.set(family.childId, [...(t.receipts.get(family.childId) ?? []), { workbookId, pageNumber }]);
    },
  };
}

type Row = Record<string, unknown>;

/** PostgREST's answer to a read: eq, gt and in filters, order by one column, offset and limit, at most 1,000 rows. */
function select(rows: Row[], params: URLSearchParams): Row[] {
  const keep = (r: Row) => [...params].every(([k, v]) => {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(k)) return true;
    if (v.startsWith("eq.")) return String(r[k]) === v.slice(3);
    if (v.startsWith("gt.")) {
      const bound = v.slice(3);
      return typeof r[k] === "number" ? Number(r[k]) > Number(bound) : String(r[k]) > bound;
    }
    if (v.startsWith("in.(")) return v.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(r[k]));
    throw new Error(`filter ${k}=${v} is not modelled`);
  });
  const col = (params.get("order") ?? "").split(".")[0];
  const out = rows.filter(keep).sort((a, b) => (col ? (typeof a[col] === "number" ? Number(a[col]) - Number(b[col]) : String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) : 0));
  const offset = Number(params.get("offset") ?? 0);
  return out.slice(offset, offset + Math.min(Number(params.get("limit") ?? 1000), 1000));
}

export interface FakeBookSupabase {
  db: SupabaseClient<Database>;
  memory: MemoryBookStore;
  seeder: BookSeeder;
  calls: string[];
  /** Optional hook invoked right before serving a request (e.g. to simulate concurrent inserts between keyset pages). */
  onRequest?: (method: string, path: string, params: URLSearchParams) => void;
}

/** A fake PostgREST whose tables are the memory store's, and whose RPCs keep its rules. */
export function fakeBookSupabase(): FakeBookSupabase {
  const memory = memoryBookStore();
  const t = memory.tables;
  const calls: string[] = [];
  const pageId = (workbookId: string, n: number) => `${workbookId}-page-${n}`;
  const stableIds = new WeakMap<object, string>();
  let nextRowId = 1;
  const rowId = (obj: object) => {
    let assigned = stableIds.get(obj);
    if (!assigned) {
      assigned = String(nextRowId++).padStart(8, "0");
      stableIds.set(obj, assigned);
    }
    return assigned;
  };
  const tables = (): Record<string, Row[]> => {
    const all = <T extends object>(m: Map<string, T[]>) => [...m.entries()].flatMap(([childId, rows]) => rows.map((row) => ({ childId, row })));
    return {
      children: [...t.children.entries()].map(([childId, parentId]) => ({ id: childId, parent_id: parentId })),
      workbooks: all(t.books).map(({ childId, row: b }) => ({ id: b.workbookId, parent_id: b.parentId, child_id: childId, number: b.number, printed_revision: b.printedRevision, levels: b.levels, generator: "v2" })),
      workbook_sheets: all(t.sheets).map(({ childId, row: s }) => ({ id: rowId(s), child_id: childId, workbook_id: s.workbookId, sheet_id: s.sheetId, attempt: s.attempt, front_page_number: s.frontPage, back_page_number: s.backPage, queue_reason: s.reason })),
      workbook_item_answers: all(t.items).map(({ childId, row: s }) => ({ id: rowId(s), child_id: childId, workbook_id: s.workbookId, printed_revision: s.printedRevision, item_id: s.itemId, sheet_id: s.sheetId, attempt: s.attempt })),
      workbook_pages: all(t.sheets).flatMap(({ row: s }) => [s.frontPage, s.backPage].map((n) => ({ id: pageId(s.workbookId, n), workbook_id: s.workbookId, page_number: n }))),
      workbook_scan_receipts: all(t.receipts).map(({ childId, row: r }) => ({
        id: rowId(r), child_id: childId, workbook_id: r.workbookId, page_id: pageId(r.workbookId, r.pageNumber), status: "accepted",
        printed_revision: (t.books.get(childId) ?? []).find((b) => b.workbookId === r.workbookId)?.printedRevision,
      })),
      child_sheet_results: all(t.results).map(({ childId, row: r }) => ({
        id: rowId(r), child_id: childId, workbook_id: r.workbookId, printed_revision: r.printedRevision, sheet_id: r.sheetId, attempt: r.attempt,
        items_total: r.itemsTotal, items_scored: r.itemsScored, mistakes: r.mistakes, result: r.result, marks_version: r.marksVersion,
      })),
      child_bank_state: [...t.states.values()].map((s) => ({ child_id: s.childId, level_id: s.levelId, start_sheet_id: s.startSheetId, level_test_state: s.levelTestState, pages_request: s.pagesRequest })),
    };
  };
  const json = (status: number, body: unknown) => (body === null ? new Response(null, { status }) : Response.json(body, { status }));
  const fake: FakeBookSupabase = { db: null as unknown as SupabaseClient<Database>, memory, seeder: memorySeeder(memory), calls };
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    const path = decodeURIComponent(url.pathname);
    fake.onRequest?.(method, path, url.searchParams);
    calls.push(`${method} ${path}?${url.searchParams.get("id") ?? url.searchParams.get("number") ?? ""}`);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (method === "POST" && path === "/rest/v1/rpc/write_child_sheet_results") {
      return json(200, await memory.writeSheetResults(body.p_child, body.p_marks_version, body.p_results));
    }
    if (method === "POST" && path === "/rest/v1/rpc/mark_sheet_results_revision") {
      try {
        await memory.recordResultsRevision(body.p_child, body.p_marks_version);
        return json(200, { status: "recorded", sheetResultsRevision: t.resultsRevision.get(body.p_child) ?? body.p_marks_version });
      } catch (e) {
        return json(200, { status: "refused", reason: e instanceof Error ? e.message : "refused" });
      }
    }
    if (method === "POST" && path === "/rest/v1/child_bank_state") {
      try {
        for (const r of [body].flat()) await memory.saveChildState({ childId: r.child_id, levelId: r.level_id, startSheetId: r.start_sheet_id, levelTestState: r.level_test_state, pagesRequest: r.pages_request });
        return json(201, null);
      } catch (e) {
        return json(400, { message: e instanceof Error ? e.message : "invalid" });
      }
    }
    const table = path.replace("/rest/v1/", "");
    const all = tables();
    if (method !== "GET" || !(table in all)) throw new Error(`${method} ${path} is not modelled`);
    const rows = select(all[table], url.searchParams);
    if (new Headers(init?.headers).get("accept") === "application/vnd.pgrst.object+json") {
      return rows.length === 1 ? json(200, rows[0]) : json(406, { code: "PGRST116", message: "no rows" });
    }
    return json(200, rows);
  };
  fake.db = createClient<Database>("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch } });
  return fake;
}
