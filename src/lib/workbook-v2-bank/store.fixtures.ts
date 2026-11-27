// Shared pieces of the bank store tests: synthetic drafts from the invented topic, and a fake Supabase (PostgREST)
// whose bank_write_level keeps the rules of the memory store, so the Supabase adapter is tested through the wire it
// really uses, with PostgREST's cap of 1,000 rows a read.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { inventedDraft } from "@/lib/workbook-v2/testing/sample";
import { memoryBankStore, type MemoryBankStore } from "./memory-store";

type Rec = Record<string, unknown>;
const recs = (value: unknown) => value as Rec[];

/** The invented topic as a draft of the level `synth-test-<tag>`, its sheet ids marked with the tag too. */
export function synthDraft(tag: string): Rec {
  const draft = inventedDraft();
  const sheetId = (id: unknown) => `${tag}-${String(id)}`;
  (draft.level as Rec).id = `synth-test-${tag}`;
  for (const topic of recs(draft.topics)) topic.sheets = (topic.sheets as string[]).map(sheetId);
  for (const sheet of recs(draft.sheets)) sheet.id = sheetId(sheet.id);
  return draft;
}

/** The draft with `count` more questions: copies of its first question under new ids. */
export function withExtraQuestions(draft: Rec, count: number, prefix = "extra"): Rec {
  const copy = structuredClone(draft);
  const first = recs(copy.questions)[0];
  const extra = Array.from({ length: count }, (_, i) => ({ ...structuredClone(first), id: `${prefix}-${i + 1}`, basis: { note: `Synthetic copy ${i + 1}.` } }));
  copy.questions = [...recs(copy.questions), ...extra];
  return copy;
}

type Row = Record<string, unknown>;

/** One PostgREST filter: `eq.value` or `in.(a,b)`. */
function matches(value: unknown, filter: string): boolean {
  if (filter.startsWith("eq.")) return String(value) === filter.slice(3);
  if (filter.startsWith("in.(") && filter.endsWith(")")) return filter.slice(4, -1).split(",").map((v) => v.replace(/^"|"$/g, "")).includes(String(value));
  throw new Error(`filter ${filter} is not modelled`);
}

/** Orders by each `column.direction` of PostgREST's order, numbers as numbers. */
function compareBy(order: string): (a: Row, b: Row) => number {
  const columns = order.split(",").filter(Boolean).map((one) => one.split(".")[0]);
  return (a, b) => {
    for (const col of columns) {
      const [x, y] = [a[col], b[col]];
      const diff = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      if (diff !== 0) return diff;
    }
    return 0;
  };
}

/** PostgREST's answer to a read: eq and in filters, order by columns, offset and limit, at most 1000 rows. */
function select(rows: Row[], params: URLSearchParams): Row[] {
  const out = rows
    .filter((r) => [...params].every(([k, v]) => ["select", "order", "limit", "offset"].includes(k) || matches(r[k], v)))
    .sort(compareBy(params.get("order") ?? ""));
  const offset = Number(params.get("offset") ?? 0);
  return out.slice(offset, offset + Math.min(Number(params.get("limit") ?? 1000), 1000));
}

export interface FakeBankSupabase {
  db: ReturnType<typeof createClient<Database>>;
  memory: MemoryBankStore;
  /** Each call as "METHOD /path?offset". */
  calls: string[];
  /** Optional hook run before a request executes, for injecting concurrent writes between paged reads. */
  onRequest?: (call: string) => Promise<void> | void;
}

export function fakeBankSupabase(): FakeBankSupabase {
  const memory = memoryBankStore();
  const calls: string[] = [];
  const json = (status: number, body: unknown) => Response.json(body, { status });
  const tables = (): Record<string, Row[]> => {
    const t = memory.tables;
    const rows = (list: Iterable<object>): Row[] => [...list].map((row) => Object.fromEntries(Object.entries(row)));
    return {
      bank_levels: rows([...t.levels.values()].map(({ row, version }) => ({ ...row, updated_at: version }))),
      bank_topics: rows(t.topics.values()), bank_sheets: rows(t.sheets.values()), bank_questions: rows(t.questions.values()),
      bank_scenarios: rows(t.scenarios.values()), bank_region_packs: rows(t.regionPacks.values()),
      bank_reviews: rows(t.reviews), bank_snapshots: rows(t.snapshots.values()),
      bank_snapshot_items: [...t.snapshotItems].flatMap(([snapshotId, items]) => rows(items.map((item) => ({ snapshot_id: snapshotId, ...item })))),
    };
  };
  const fake: FakeBankSupabase = {
    db: null as unknown as ReturnType<typeof createClient<Database>>,
    memory,
    calls,
  };
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    const path = decodeURIComponent(url.pathname);
    const call = `${method} ${path}?${url.searchParams.get("offset") ?? ""}`;
    calls.push(call);
    if (fake.onRequest) await fake.onRequest(call);
    if (method === "POST" && path === "/rest/v1/rpc/bank_write_level") {
      const written = await memory.writeLevel(JSON.parse(String(init?.body)).p_write);
      if (written.ok) return json(200, { version: written.version });
      return json(400, { code: written.problem.includes("changed since") ? "PT409" : "23505", message: written.problem });
    }
    if (method === "POST" && path === "/rest/v1/rpc/bank_freeze_level") {
      try {
        const written = await memory.writeSnapshot(JSON.parse(String(init?.body)).p_freeze);
        return written.ok ? json(200, { snapshotId: written.snapshotId, version: written.version }) : json(400, { code: "PT409", message: written.problem });
      } catch (error) {
        return json(400, { code: "23514", message: error instanceof Error ? error.message : String(error) });
      }
    }
    if (method === "POST" && path === "/rest/v1/bank_reviews") {
      const row = await memory.addReview(JSON.parse(String(init?.body)));
      return json(201, new Headers(init?.headers).get("accept") === "application/vnd.pgrst.object+json" ? row : [row]);
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
  fake.db = createClient<Database>("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch } });
  return fake;
}
