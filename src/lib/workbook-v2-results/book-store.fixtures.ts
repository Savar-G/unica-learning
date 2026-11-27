// Shared pieces of the BookStore tests: an invented family and its v2 books (no reference, vault or family content), a
// seeder for each adapter, and a fake Supabase (PostgREST) over the memory store, so the Supabase adapter is tested
// through the wire it really uses, with PostgREST's cap of 1,000 rows a read.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { memoryBookStore, type MemoryBookStore } from "./memory-store";
import type { BookItemRow, BookRow, IssuedSheetRow } from "./types";

/** One issued sheet attempt of an invented book, with `items` questions: the first half on its front, the rest on its back. */
export interface SeedSheet { sheetId: string; attempt: number; items: number }
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
    sheets.push({ workbookId: book.workbookId, sheetId: s.sheetId, attempt: s.attempt, frontPage, backPage });
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
}

export function memorySeeder(store: MemoryBookStore): BookSeeder {
  const t = store.tables;
  return {
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

/** PostgREST's answer to a read: eq and in filters, order by one column, offset and limit, at most 1,000 rows. */
function select(rows: Row[], params: URLSearchParams): Row[] {
  const keep = (r: Row) => [...params].every(([k, v]) => {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(k)) return true;
    if (v.startsWith("eq.")) return String(r[k]) === v.slice(3);
    if (v.startsWith("in.(")) return v.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(r[k]));
    throw new Error(`filter ${k}=${v} is not modelled`);
  });
  const col = (params.get("order") ?? "").split(".")[0];
  const out = rows.filter(keep).sort((a, b) => (col ? (typeof a[col] === "number" ? Number(a[col]) - Number(b[col]) : String(a[col]).localeCompare(String(b[col]))) : 0));
  const offset = Number(params.get("offset") ?? 0);
  return out.slice(offset, offset + Math.min(Number(params.get("limit") ?? 1000), 1000));
}

export interface FakeBookSupabase { db: SupabaseClient<Database>; memory: MemoryBookStore; seeder: BookSeeder; calls: string[] }

/** A fake PostgREST whose tables are the memory store's, and whose write_child_sheet_results keeps its rules. */
export function fakeBookSupabase(): FakeBookSupabase {
  const memory = memoryBookStore();
  const t = memory.tables;
  const calls: string[] = [];
  const pageId = (workbookId: string, n: number) => `${workbookId}-page-${n}`;
  const tables = (): Record<string, Row[]> => {
    const all = <T>(m: Map<string, T[]>) => [...m.entries()].flatMap(([childId, rows]) => rows.map((row) => ({ childId, row })));
    const id = (i: number) => String(i).padStart(8, "0");
    return {
      children: [...t.children.entries()].map(([childId, parentId]) => ({ id: childId, parent_id: parentId })),
      workbooks: all(t.books).map(({ childId, row: b }) => ({ id: b.workbookId, parent_id: b.parentId, child_id: childId, number: b.number, printed_revision: b.printedRevision, levels: b.levels, generator: "v2" })),
      workbook_sheets: all(t.sheets).map(({ childId, row: s }, i) => ({ id: id(i), child_id: childId, workbook_id: s.workbookId, sheet_id: s.sheetId, attempt: s.attempt, front_page_number: s.frontPage, back_page_number: s.backPage })),
      workbook_item_answers: all(t.items).map(({ childId, row: s }, i) => ({ id: id(i), child_id: childId, workbook_id: s.workbookId, printed_revision: s.printedRevision, item_id: s.itemId, sheet_id: s.sheetId, attempt: s.attempt })),
      workbook_pages: all(t.sheets).flatMap(({ row: s }) => [s.frontPage, s.backPage].map((n) => ({ id: pageId(s.workbookId, n), workbook_id: s.workbookId, page_number: n }))),
      workbook_scan_receipts: all(t.receipts).map(({ childId, row: r }, i) => ({
        id: id(i), child_id: childId, workbook_id: r.workbookId, page_id: pageId(r.workbookId, r.pageNumber), status: "accepted",
        printed_revision: (t.books.get(childId) ?? []).find((b) => b.workbookId === r.workbookId)?.printedRevision,
      })),
      child_sheet_results: all(t.results).map(({ childId, row: r }, i) => ({
        id: id(i), child_id: childId, workbook_id: r.workbookId, printed_revision: r.printedRevision, sheet_id: r.sheetId, attempt: r.attempt,
        items_total: r.itemsTotal, items_scored: r.itemsScored, mistakes: r.mistakes, result: r.result, marks_version: r.marksVersion,
      })),
      child_bank_state: [...t.states.values()].map((s) => ({ child_id: s.childId, level_id: s.levelId, start_sheet_id: s.startSheetId, level_test_state: s.levelTestState, pages_request: s.pagesRequest })),
    };
  };
  const json = (status: number, body: unknown) => (body === null ? new Response(null, { status }) : Response.json(body, { status }));
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    const path = decodeURIComponent(url.pathname);
    calls.push(`${method} ${path}?${url.searchParams.get("offset") ?? ""}`);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (method === "POST" && path === "/rest/v1/rpc/write_child_sheet_results") {
      return json(200, await memory.writeSheetResults(body.p_child, body.p_marks_version, body.p_results));
    }
    if (method === "POST" && path === "/rest/v1/child_bank_state") {
      for (const r of [body].flat()) await memory.saveChildState({ childId: r.child_id, levelId: r.level_id, startSheetId: r.start_sheet_id, levelTestState: r.level_test_state, pagesRequest: r.pages_request });
      return json(201, null);
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
  const db = createClient<Database>("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch } });
  return { db, memory, seeder: memorySeeder(memory), calls };
}

const hex = (n: number, seed: string) => Array.from({ length: n }, (_, i) => ((seed.charCodeAt(i % seed.length) + i) % 16).toString(16)).join("");
const must = async (what: string, run: PromiseLike<{ error: { message: string } | null }>) => {
  const { error } = await run;
  if (error) throw new Error(`live seed ${what}: ${error.message}`);
};

/**
 * Seeds an invented family into the live project with the secret key: an Auth user `<id>@example.invalid`, its parent
 * row (marked as a test family when an admin exists), a child and its v2 books, pages, issued sheets and questions.
 * `remove` deletes the Auth user, and the cascades remove every row; it refuses any family it did not make.
 */
export function liveSeeder(db: SupabaseClient<Database>): BookSeeder & { made: string[]; remove(): Promise<void> } {
  const made: string[] = [];
  const pageIds = new Map<string, string>();
  return {
    made,
    async seed(family) {
      const created = await db.auth.admin.createUser({ id: family.parentId, email: `${family.parentId}@example.invalid`, email_confirm: true });
      if (created.error) throw new Error(`live seed user: ${created.error.message}`);
      made.push(family.parentId);
      await must("parent", db.from("parents").insert({ id: family.parentId, name: "Book store probe", email: `${family.parentId}@example.invalid` }));
      const { data: admin } = await db.from("admin_users").select("user_id").limit(1).maybeSingle();
      if (admin) await must("test account", db.from("test_accounts").insert({ parent_id: family.parentId, marked_by: admin.user_id }));
      await must("child", db.from("children").insert({ id: family.childId, parent_id: family.parentId, first_name: "Probe", grade: 3, province: "BC" }));
      for (const book of family.books) {
        const rows = seedRows(family, book);
        const inputHash = hex(64, book.workbookId);
        await must("book", db.from("workbooks").insert({
          id: book.workbookId, parent_id: family.parentId, child_id: family.childId, number: book.number, levels: book.levels, printed_revision: book.printedRevision,
          generator: "v2", bank_snapshot_id: "probe-snapshot", bank_snapshot_hash: hex(64, "snapshot"), engine_version: "probe", renderer_version: "probe",
          font_hashes: {}, input_hash: inputHash, input_path: `${family.parentId}/${book.workbookId}/${inputHash}.json`, pages_per_day: 4,
        }));
        const pages = rows.sheets.flatMap((s) => [s.frontPage, s.backPage]).map((n) => ({ id: crypto.randomUUID(), parent_id: family.parentId, workbook_id: book.workbookId, page_number: n, page_type: "practice", qr_token: crypto.randomUUID().replaceAll("-", "") }));
        for (const p of pages) pageIds.set(`${book.workbookId} ${p.page_number}`, p.id);
        await must("pages", db.from("workbook_pages").insert(pages));
        await must("sheets", db.from("workbook_sheets").insert(rows.sheets.map((s) => ({
          workbook_id: book.workbookId, parent_id: family.parentId, child_id: family.childId, sheet_id: s.sheetId, attempt: s.attempt, day: 1,
          front_page_number: s.frontPage, back_page_number: s.backPage, snapshot_id: "probe-snapshot", starts_day: s.frontPage === 1,
        }))));
        await must("items", db.from("workbook_item_answers").insert(rows.items.map((i) => ({
          workbook_id: book.workbookId, parent_id: family.parentId, child_id: family.childId, printed_revision: book.printedRevision,
          page_id: pageIds.get(`${book.workbookId} ${i.pageNumber}`) ?? "", page_number: i.pageNumber, item_id: i.itemId, question_number: i.questionNumber,
          snapshot_id: "probe-snapshot", sheet_id: i.sheetId, row_id: "row-1", attempt: i.attempt, engine_version: "probe", shape: "probe", shape_version: 1,
          params: {}, prompt: "1 + 1", answer_kind: "whole-number", answer_value: "2", parts: [{ name: "answer", kind: "whole-number", value: "2" }], worked_steps: [{ text: "2", marks: [] }], difficulty: 1, item_hash: hex(64, i.itemId),
        }))));
      }
    },
    async scan(family, workbookId, pageNumber) {
      const book = family.books.find((b) => b.workbookId === workbookId);
      if (!book) throw new Error("live seed scan: no such book");
      // Only the scan functions write receipts (the secret key may read them, not insert them), so the probe inserts its
      // receipt with SQL through the Management API (SUPABASE_ACCESS_TOKEN).
      const token = process.env.SUPABASE_ACCESS_TOKEN;
      const project = process.env.SUPABASE_PROJECT_REF;
      if (!token || !project) throw new Error("live seed scan: set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF");
      const values = [family.parentId, family.childId, workbookId, pageIds.get(`${workbookId} ${pageNumber}`) ?? "", crypto.randomUUID(), crypto.randomUUID()];
      if (!values.every((v) => /^[0-9a-f-]{36}$/.test(v)) || !/^[0-9a-f]{28}$/.test(book.printedRevision)) throw new Error("live seed scan: bad id");
      const [p, c, w, page, photo, token2] = values;
      const query = `insert into public.workbook_scan_receipts(parent_id, child_id, workbook_id, number, printed_revision, page_id, photo_revision, calibration_token)
        values ('${p}', '${c}', '${w}', ${book.number}, '${book.printedRevision}', '${page}', '${photo}', '${token2}')`;
      const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ query }),
      });
      if (!response.ok) throw new Error(`live seed receipt: ${response.status} ${await response.text()}`);
    },
    async remove() {
      for (const id of made.splice(0)) {
        const { data } = await db.from("parents").select("name").eq("id", id).maybeSingle();
        if (data && data.name !== "Book store probe") throw new Error("live cleanup: refusing a family that is not the probe's");
        const { error } = await db.auth.admin.deleteUser(id);
        if (error) throw new Error(`live cleanup: ${error.message}`);
        const { count } = await db.from("child_sheet_results").select("id", { count: "exact", head: true }).eq("parent_id", id);
        if (count !== 0) throw new Error(`live cleanup: ${count} sheet results left`);
      }
    },
  };
}
