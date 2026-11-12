// The admin Maya call page's scope count (childScopeSummary) reads only each call's refusal list (two JSON paths), never
// the whole trace or live state, and counts what scopeSummary counts over the whole rows, for every stored shape:
// a trace with refusals, a trace with none, a live chat with no trace yet, and a call with neither.
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import type { AdminSession } from "@/lib/admin-store";
import { callRefusals, scopeSummary } from "@/lib/maya-scope-review";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
import { childScopeSummary } from "@/lib/maya-call-server";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const child = id(1);
const refusal = (reason: string, at: number) => ({ reason, at });
type Call = { id: string; child_id: string; trace: Record<string, unknown> | null; live: Record<string, unknown> | null };
const big = "x".repeat(10_000);
const calls: Call[] = [
  { id: id(13), child_id: child, trace: { version: 7, transcript: big, scopeRefusals: [refusal("outside_work", 1), refusal("other_subject", 2)] }, live: null },
  { id: id(11), child_id: child, trace: { version: 3, transcript: big }, live: { text: { session: { scopeRefusals: [refusal("outside_work", 3)] } } } },
  { id: id(12), child_id: child, trace: null, live: { package: big, text: { session: { log: big, scopeRefusals: [refusal("other_subject", 4)] } } } },
  { id: id(14), child_id: child, trace: null, live: null },
  { id: id(15), child_id: child, trace: { version: 7, scopeRefusals: [] }, live: null },
  { id: id(16), child_id: id(2), trace: { version: 7, scopeRefusals: [refusal("outside_work", 5)] }, live: null },
  ...Array.from({ length: 450 }, (_, i) => ({ id: id(100 + i), child_id: child, trace: i % 3 ? null : { version: 7, scopeRefusals: [refusal("outside_work", i)] }, live: i % 3 ? { text: { session: { scopeRefusals: i % 2 ? [refusal("other_subject", i)] : undefined } } } : null })),
];

/** `trace->a->b`, as PostgREST reads a JSON path: null where any step is missing. */
const path = (row: Record<string, unknown>, expr: string) =>
  expr.split("->").slice(1).reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] ?? null : null), row[expr.split("->")[0]]);

it("reads only the two refusal paths and counts what the whole rows count", async () => {
  const selects: string[] = [];
  const fetch = async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const select = url.searchParams.get("select")!;
    selects.push(select);
    let rows: Call[] = calls.filter((c) => url.searchParams.get("child_id") === `eq.${c.child_id}`);
    const trace = url.searchParams.get("trace");
    if (trace === "not.is.null") rows = rows.filter((r) => r.trace !== null);
    else if (trace === "is.null") rows = rows.filter((r) => r.trace === null);
    const after = url.searchParams.get("id");
    if (after) rows = rows.filter((r) => r.id > after.slice(3));
    rows = rows.sort((x, y) => (x.id < y.id ? -1 : 1)).slice(0, Number(url.searchParams.get("limit")));
    return Response.json(rows.map((r) => Object.fromEntries(select.split(",").map((s) => s.trim()).map((s) => {
      const [alias, expr] = s.includes(":") ? s.split(":") : [s, s];
      return [alias, expr.includes("->") ? path(r, expr) : r[expr as keyof Call]];
    }))));
  };
  const db = createClient<Database>("https://example.com", "test", { global: { fetch: fetch as typeof globalThis.fetch } });
  const got = await childScopeSummary({ db, userId: id(9999), email: "admin@example.invalid" } as AdminSession, child);
  const whole = scopeSummary(calls.filter((c) => c.child_id === child).sort((x, y) => (x.id < y.id ? -1 : 1)).map((c) => callRefusals(c as Parameters<typeof callRefusals>[0])));
  expect(got).toEqual(whole);
  expect(Object.keys(got.reasons)).toEqual(Object.keys(whole.reasons));
  expect(got.count).toBe(whole.count);
  // never the whole trace or live column
  for (const s of new Set(selects)) expect(s.split(",").map((x) => x.trim()).every((x) => x === "id" || /^refusals:(trace|live)->/.test(x))).toBe(true);
});
