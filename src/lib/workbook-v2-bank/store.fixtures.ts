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

/** PostgREST's answer to a read: eq filters, order by one column, offset and limit, at most 1000 rows. */
function select(rows: Row[], params: URLSearchParams): Row[] {
  const out = rows
    .filter((r) => [...params].every(([k, v]) => ["select", "order", "limit", "offset"].includes(k) || (v.startsWith("eq.") && String(r[k]) === v.slice(3))))
    .sort((a, b) => { const col = (params.get("order") ?? "").split(".")[0]; return col ? String(a[col]).localeCompare(String(b[col])) : 0; });
  const offset = Number(params.get("offset") ?? 0);
  return out.slice(offset, offset + Math.min(Number(params.get("limit") ?? 1000), 1000));
}

export interface FakeBankSupabase {
  db: ReturnType<typeof createClient<Database>>;
  memory: MemoryBankStore;
  /** Each call as "METHOD /path?offset". */
  calls: string[];
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
    };
  };
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    const path = decodeURIComponent(url.pathname);
    calls.push(`${method} ${path}?${url.searchParams.get("offset") ?? ""}`);
    if (method === "POST" && path === "/rest/v1/rpc/bank_write_level") {
      const written = await memory.writeLevel(JSON.parse(String(init?.body)).p_write);
      if (written.ok) return json(200, { version: written.version });
      return json(400, { code: written.problem.includes("changed since") ? "PT409" : "23505", message: written.problem });
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
  return { db, memory, calls };
}
