// Shared pieces of the v2 publish tests: invented ids, small and full-size requests, deterministic job seams, and a fake
// Supabase (PostgREST and Storage) whose two functions keep the rules of the memory store, so the Supabase adapter is
// tested through the wire it really uses.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { fakeRenderer } from "@/lib/workbook-v2/testing/fake-renderer";
import { FULL_BOOK_SNAPSHOT, fullBookPlan, type PlannedBookSheet } from "./full-book";
import type { JobDeps } from "./job";
import { memoryFiles, memoryPublishStore, type MemoryStoreOptions } from "./memory-store";
import type { PublishPayload, PublishRequest, V2PublishStore, V2Storage } from "./types";

export const PARENT = "11111111-1111-4111-8111-111111111111";
export const CHILD = "22222222-2222-4222-8222-222222222222";
export const REAL_PARENT = "33333333-3333-4333-8333-333333333333";
export const REAL_CHILD = "44444444-4444-4444-8444-444444444444";
export const SECOND_CHILD = "55555555-5555-4555-8555-555555555555";

export const STORE_OPTIONS: MemoryStoreOptions = {
  children: [{ id: CHILD, parentId: PARENT }, { id: SECOND_CHILD, parentId: PARENT }, { id: REAL_CHILD, parentId: REAL_PARENT }],
  testParents: [PARENT],
  numbers: { [CHILD]: [1, 2] },
};

/** Two days of two new sheets in level order: facts and brackets, then bar models and word problems (8 pages, 78 questions). */
export const SMALL_PLAN: PlannedBookSheet[] = [
  { sheetId: "times-facts", attempt: 1, startsDay: true, day: 1 },
  { sheetId: "division-brackets", attempt: 1, startsDay: false, day: 1 },
  { sheetId: "equal-groups", attempt: 1, startsDay: true, day: 2 },
  { sheetId: "story-problems", attempt: 1, startsDay: false, day: 2 },
];

export const request = (o: Partial<PublishRequest> = {}): PublishRequest => ({
  requestKey: "test-book-0001", childId: CHILD, snapshot: structuredClone(FULL_BOOK_SNAPSHOT), sheets: SMALL_PLAN, region: "US", ...o,
});

export const fullRequest = (o: Partial<PublishRequest> = {}): PublishRequest => request({ requestKey: "test-full-book-0001", sheets: fullBookPlan(), region: "CA", ...o });

/** Job seams with a counter for ids and tokens and a clock that moves 7 ms each time it is read. */
export function deps(store: V2PublishStore, files: V2Storage, o: { renderer?: JobDeps["renderer"]; seed?: string } = {}): JobDeps & { opened: () => number } {
  let n = 0;
  let t = 1000;
  let opened = 0;
  const seed = o.seed ?? "a";
  return {
    store, files,
    renderer: o.renderer ?? (async () => { opened++; return fakeRenderer(); }),
    opened: () => opened,
    now: () => new Date("2026-11-27T02:35:00.000Z"),
    clock: () => (t += 7),
    uuid: () => `00000000-0000-4000-8${seed.padEnd(3, "0")}-${String(++n).padStart(12, "0")}`,
    token: () => `${seed}tok${String(++n).padStart(20, "0")}`,
  };
}

export const memory = () => ({ store: memoryPublishStore(STORE_OPTIONS), files: memoryFiles() });

// ---------- A fake Supabase for the Supabase adapters ----------

type Row = Record<string, unknown>;

/** The rows of today's workbook tables that a published payload becomes, as publish_v2_workbook writes them. */
export function rowsOf(payload: PublishPayload, parentId: string): { workbooks: Row[]; workbook_pages: Row[]; workbook_questions: Row[] } {
  const w = payload.workbook;
  const pageId = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`;
  return {
    workbooks: [{
      id: w.id, created_at: "2026-11-27T02:35:00+00:00", parent_id: parentId, child_id: w.childId, number: w.number, levels: w.levels, status: "draft", pdf_path: w.pdfPath,
      profile_build: null, approved_at: null, printed_at: null, shipped_at: null, pdf_sha256: w.pdfSha256, print_manifest: w.printManifest, printed_revision: w.printedRevision,
      generator: "v2", input_hash: w.inputHash, input_path: w.inputPath, engine_version: w.engineVersion, renderer_version: w.rendererVersion, font_hashes: w.fontHashes,
    }],
    workbook_pages: payload.pages.map((p) => ({
      id: pageId(p.number), workbook_id: w.id, parent_id: parentId, page_number: p.number, day_label: p.dayLabel, page_type: p.type, image_path: p.image.path,
      image_width: p.image.width, image_height: p.image.height, qr_token: p.qrToken, print_contract: p.printContract,
    })),
    workbook_questions: payload.questions.map((q, i) => ({
      id: `00000000-0000-4000-a000-${String(i + 1).padStart(12, "0")}`, workbook_id: w.id, page_id: pageId(q.pageNumber), parent_id: parentId, question_number: q.number,
      question_key: q.package.id, schema_version: payload.schemaVersion, package: q.package, box_x: q.box.x, box_y: q.box.y, box_width: q.box.width, box_height: q.box.height,
      regions: q.regions, teaching: null,
    })),
  };
}

/** PostgREST's answer to a read: eq filters, order by one column, offset and limit, at most 1000 rows. */
function select(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows.filter((r) => [...params].every(([k, v]) => ["select", "order", "limit", "offset"].includes(k) || (v.startsWith("eq.") && String(r[k]) === v.slice(3))));
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(".");
    out = [...out].sort((a, b) => (typeof a[col] === "number" ? (a[col] as number) - (b[col] as number) : String(a[col]).localeCompare(String(b[col]))) * (dir === "desc" ? -1 : 1));
  }
  const offset = Number(params.get("offset") ?? 0);
  return out.slice(offset, offset + Math.min(Number(params.get("limit") ?? 1000), 1000));
}

export interface FakeSupabase {
  db: ReturnType<typeof createClient<Database>>;
  memory: ReturnType<typeof memory>;
  calls: string[];
  /** Set to make the next call of this RPC write and then lose its answer (a 504 after the write). */
  loseNext: Set<string>;
}

export function fakeSupabase(): FakeSupabase {
  const m = memory();
  const calls: string[] = [];
  const loseNext = new Set<string>();
  const json = (status: number, body: unknown) => Response.json(body, { status });
  const tables = () => {
    const rows = { children: STORE_OPTIONS.children.map((c) => ({ id: c.id, parent_id: c.parentId })), test_accounts: STORE_OPTIONS.testParents.map((p) => ({ parent_id: p })),
      workbooks: [] as Row[], workbook_pages: [] as Row[], workbook_questions: [] as Row[] };
    for (const book of m.store.tables.books) {
      const r = rowsOf(book.payload, book.parentId);
      rows.workbooks.push(...r.workbooks);
      rows.workbook_pages.push(...r.workbook_pages);
      rows.workbook_questions.push(...r.workbook_questions);
    }
    return rows as Record<string, Row[]>;
  };
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    const path = decodeURIComponent(url.pathname);
    calls.push(`${method} ${path}`);
    if (method === "POST" && path.startsWith("/rest/v1/rpc/")) {
      const name = path.slice("/rest/v1/rpc/".length);
      const body = JSON.parse(String(init?.body));
      const answer = name === "allocate_v2_workbook" ? await m.store.allocate(body.p_allocation)
        : name === "publish_v2_workbook" ? await m.store.publish(body.p_payload) : null;
      if (answer === null) throw new Error(`rpc ${name} is not modelled`);
      if (loseNext.delete(name)) return json(504, { message: "upstream timed out" });
      return json(200, answer);
    }
    const object = "/storage/v1/object/workbook-pages/";
    if (path.startsWith(object)) {
      const key = path.slice(object.length);
      if (method === "GET") {
        const bytes = await m.files.get(key);
        return bytes ? new Response(new Uint8Array(bytes)) : json(400, { statusCode: "404", error: "not_found", message: "Object not found" });
      }
      const raw = init?.body;
      const bytes = new Uint8Array(await new Response(raw as BodyInit).arrayBuffer());
      const stored = await m.files.put({ path: key, contentType: new Headers(init?.headers).get("content-type") as never, bytes });
      return stored === "stored" ? json(200, { Key: `workbook-pages/${key}` }) : json(400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
    }
    const table = path.replace("/rest/v1/", "");
    const all = tables();
    if (method !== "GET" || !(table in all)) throw new Error(`${method} ${path} is not modelled`);
    const rows = select(all[table], url.searchParams).map((r) => JSON.parse(JSON.stringify(r)));
    if (new Headers(init?.headers).get("accept") === "application/vnd.pgrst.object+json") {
      return rows.length === 1 ? json(200, rows[0]) : json(406, { code: "PGRST116", message: "no rows" });
    }
    return json(200, rows);
  };
  const db = createClient<Database>("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch } });
  return { db, memory: m, calls, loseNext };
}
