import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";

export const PROJECT_URL = "https://cdjobwsyzndtltzfpyqa.supabase.co";
export const TABLE = "maya_stream_probe_calls";
export const PARENT = "11111111-1111-4111-8111-111111111111";
export const CHILD = "22222222-2222-4222-8222-222222222222";
export const BOOK = "44444444-4444-4444-8444-444444444444";
export const IDS = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-${String(1101 + i).padStart(12, "0")}`);
export type Timing = { phase: string; method: string; status: number; rows: number; ms: number };

/** A test-only transport adapter. It changes no production store API or generated type. */
export function probeClient(o: { url: string; key: string; ids: readonly string[]; fetch: typeof fetch; timing(t: Timing): void }) {
  if (o.url !== PROJECT_URL || !o.ids.length || o.ids.length > IDS.length || o.ids.some(id => !IDS.includes(id))) throw Error("Probe project or IDs refused");
  let phase = "setup";
  const scoped = new Set(o.ids);
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method?.toUpperCase() ?? "GET";
    if (url.origin !== PROJECT_URL || url.pathname !== "/rest/v1/maya_calls" || !["GET", "POST", "PATCH", "DELETE"].includes(method)) throw Error("Probe request refused");
    const filters = url.searchParams.getAll("id");
    if (filters.length > 1) throw Error("Probe ID filter refused");
    if (filters.length) {
      const filter = filters[0];
      const ids = filter.startsWith("eq.") ? [filter.slice(3)] : /^in\.\([a-f0-9,-]+\)$/.test(filter) ? filter.slice(4, -1).split(",") : [];
      if (!ids.length || ids.some(id => !scoped.has(id))) throw Error("Probe ID filter refused");
    } else {
      if (method === "PATCH" || method === "DELETE") throw Error("Probe mutation needs exact IDs");
      if (method === "GET") url.searchParams.set("id", `in.(${o.ids.join(",")})`);
    }
    const child = url.searchParams.get("child_id");
    if (child && child !== `eq.${CHILD}`) throw Error("Probe child refused");
    if (method === "POST" || method === "PATCH") {
      const body = JSON.parse(String(init?.body));
      const rows = Array.isArray(body) ? body : [body];
      if (rows.length !== 1) throw Error("Probe row bound refused");
      for (const row of rows) {
        if ((method === "POST" && !scoped.has(row.id)) || (row.id !== undefined && !scoped.has(row.id))) throw Error("Probe insert ID refused");
        for (const [column, fixed] of Object.entries({ parent_id: PARENT, child_id: CHILD, started_by: PARENT, model: "fake", kind: "chat", mode: "text", workbook_id: BOOK, workbook_page: 1, workbook_question: 1, question_source: "workbook", assessment_id: null, assessment_question_id: null })) {
          if ((method === "POST" || column in row) && row[column] !== fixed) throw Error("Probe identity refused");
        }
      }
    }
    url.pathname = `/rest/v1/${TABLE}`;
    const headers = new Headers(init?.headers);
    if (method === "POST" || method === "DELETE") {
      headers.set("Prefer", "return=representation");
      url.searchParams.set("select", "id");
    }
    if (method === "GET") url.searchParams.set("limit", String(Math.min(Number(url.searchParams.get("limit") ?? IDS.length), IDS.length)));
    const started = performance.now();
    const label = phase;
    let response: Response;
    try {
      response = await o.fetch(url, { ...init, headers, redirect: "error", signal: AbortSignal.timeout(5000) });
    } catch {
      o.timing({ phase: label, method, status: 0, rows: 0, ms: performance.now() - started });
      throw Error("Probe transport failed");
    }
    const data = await response.clone().json().catch(() => null);
    o.timing({ phase: label, method, status: response.status, rows: response.ok && data !== null ? Array.isArray(data) ? data.length : 1 : 0, ms: performance.now() - started });
    if (!response.ok) throw Error(`Probe HTTP ${response.status}`);
    return response;
  };
  const client = createClient<Database>(o.url, o.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: transport } });
  // Only the unchanged store's table entry is available. RPC, auth, storage, realtime and other tables are absent.
  const db = new Proxy(client, { get(target, property) {
    if (property !== "from") throw Error("Probe client operation refused");
    return (table: string) => {
      if (table !== "maya_calls") throw Error("Probe table refused");
      return target.from("maya_calls");
    };
  } });
  return { db, phase(value: string) { phase = value; } };
}
