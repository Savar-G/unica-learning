import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { listCalls, type CallListPage } from "@/lib/maya-call-server";
import type { Database } from "@/lib/database";

// A small PostgREST reader: execute the request's filters, order and limit against rows in memory.
type Row = Record<string, string | number | boolean | null>;
function terms(text: string): string[] {
  let depth = 0, start = 0;
  const found: string[] = [];
  [...text].forEach((c, i) => {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) { found.push(text.slice(start, i)); start = i + 1; }
  });
  return [...found, text.slice(start)];
}
function matches(row: Row, term: string): boolean {
  if (term.startsWith("and(")) return terms(term.slice(4, -1)).every((t) => matches(row, t));
  if (term.startsWith("or(")) return terms(term.slice(3, -1)).some((t) => matches(row, t));
  const [field, op, ...parts] = term.split(".");
  const value = parts.join(".");
  if (op === "lt") return String(row[field]) < value;
  if (op === "gt") return String(row[field]) > value;
  if (op !== "is" && op !== "eq") throw new Error(`Unsupported filter ${term}`);
  return String(row[field]) === value;
}
function reader(rows: Row[], fail = false) {
  const urls: URL[] = [];
  const db = createClient<Database>("https://test.invalid", "test-key", { global: { fetch: async (input) => {
    const url = new URL(String(input)); urls.push(url);
    if (fail) return new Response(JSON.stringify({ message: "read failed" }), { status: 500 });
    if (url.pathname.endsWith("/rpc/admin_children")) return Response.json([{ id: "child", first_name: "Iris" }]);
    if (!url.pathname.endsWith("/maya_calls")) throw new Error(url.pathname);
    const filter = url.searchParams.get("or");
    const filtered = filter ? rows.filter((r) => terms(filter.slice(1, -1)).some((t) => matches(r, t))) : rows;
    const order = url.searchParams.get("order")!.split(",").map((s) => s.split("."));
    const sorted = [...filtered].sort((a, b) => {
      for (const [field, direction] of order) {
        const delta = String(a[field]).localeCompare(String(b[field]));
        if (delta) return direction === "desc" ? -delta : delta;
      }
      return 0;
    });
    return Response.json(sorted.slice(0, Number(url.searchParams.get("limit") ?? 1000)));
  } } });
  return { admin: { db, userId: "admin", email: "admin@example.test" }, urls };
}
const row = (id: string, extra: Row = {}): Row => ({
  id, created_at: "2026-11-02T16:00:00Z", child_id: "child", question_text: "27 + 39 = ?", status: "ended", model: "fake", outcome_reason: "solved", assistance: "hint", call_seconds: 40, learning_event_id: "event", mode: "text", connected_seconds: null, mishearing_confirmations: 1, mishearing_corrections: 2, flag: null, safety_severity: null, safety_flag: false, ...extra,
});

describe("admin saved call priority", () => {
  it("keeps old flags ahead of more than 50 newer ordinary calls, by level then newest, including old safety fields", async () => {
    const rows = Array.from({ length: 65 }, (_, i) => row(`normal-${String(i).padStart(2, "0")}`));
    rows.push(
      row("danger-old", { flag: "safety_immediate", created_at: "2026-10-01T10:00:00Z", mode: "voice" }),
      row("danger-new", { safety_severity: "immediate", safety_flag: true, created_at: "2026-10-02T10:00:00Z" }),
      row("concern", { flag: "safety_concern", created_at: "2026-10-03T10:00:00Z" }),
      row("legacy-concern", { safety_flag: true, created_at: "2026-10-04T10:00:00Z" }),
      row("legacy-severity", { safety_severity: "concern", created_at: "2026-10-05T10:00:00Z" }),
      row("harmful", { flag: "unsafe_request" }),
    );
    const s = reader(rows);
    const page = await listCalls(s.admin);
    const result = page.calls;
    expect(result).toHaveLength(50);
    expect(result.slice(0, 6).map((r) => r.id)).toEqual(["danger-new", "danger-old", "legacy-severity", "legacy-concern", "concern", "harmful"]);
    expect(new Set(result.map((r) => r.id)).size).toBe(50);
    expect(result[1].mode).toBe("voice");
    expect(result[0].mishearing).toEqual({ confirmations: 1, corrections: 2 });
    const callReads = s.urls.filter((u) => u.pathname.endsWith("/maya_calls"));
    expect(callReads).toHaveLength(4);
    expect(callReads.every((u) => u.searchParams.get("limit") === "51")).toBe(true);
  });
  it("does not turn a failed read into an empty review list", async () => {
    await expect(listCalls(reader([], true).admin)).rejects.toThrow("read failed");
  });
});

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
it("R442-3: reaches the 51st flagged call, then returns to the first page", async () => {
  const s = reader(Array.from({ length: 51 }, (_, i) => row(uuid(i), { flag: "safety_immediate" })));
  const first = await listCalls(s.admin);
  expect(first.calls).toHaveLength(50);
  expect(first.newer).toBeNull();
  expect(first.older).not.toBeNull();
  const last = await listCalls(s.admin, 50, first.older!);
  expect(last.calls.map((r) => r.id)).toEqual([uuid(0)]);
  expect(last.older).toBeNull();
  expect(last.newer).not.toBeNull();
  expect((await listCalls(s.admin, 50, last.newer!)).calls).toEqual(first.calls);
});

it("R442-3: reaches every call across flag levels and date ties beyond 1,000 rows, in both directions", async () => {
  const flags = ["safety_immediate", "safety_concern", "unsafe_request", null];
  const rows = Array.from({ length: 1055 }, (_, i) => row(uuid(i), {
    flag: flags[i % 4], created_at: `2026-11-0${1 + i % 3}T16:00:00.000Z`,
  }));
  // The old severity fields still belong to the same flag levels.
  rows[5] = { ...rows[5], flag: null, safety_severity: "immediate" };
  rows[6] = { ...rows[6], flag: null, safety_flag: true };
  const rank = (r: Row) => r.flag ? flags.indexOf(String(r.flag)) : r.safety_severity === "immediate" ? 0 : r.safety_flag ? 1 : 3;
  const expected = [...rows].sort((a, b) => rank(a) - rank(b) || String(b.created_at).localeCompare(String(a.created_at)) || String(b.id).localeCompare(String(a.id))).map((r) => r.id);
  const s = reader(rows);
  const pages: CallListPage[] = [];
  let page = await listCalls(s.admin);
  while (true) {
    pages.push(page);
    expect(pages.length).toBeLessThan(30);
    if (!page.older) break;
    page = await listCalls(s.admin, 50, page.older);
  }
  expect(pages.flatMap((p) => p.calls.map((r) => r.id))).toEqual(expected);
  for (let i = pages.length - 2; i >= 0; i--) {
    expect(page.newer).not.toBeNull();
    page = await listCalls(s.admin, 50, page.newer!);
    expect(page.calls.map((r) => r.id)).toEqual(pages[i].calls.map((r) => r.id));
  }
  expect(page.newer).toBeNull();
  expect(s.urls.filter((u) => u.pathname.endsWith("/maya_calls")).every((u) => u.searchParams.get("limit") === "51")).toBe(true);
});

it("ignores an invalid cursor and lets an empty old page return to the start", async () => {
  const s = reader([row(uuid(1))]);
  const first = await listCalls(s.admin);
  expect(await listCalls(s.admin, 50, "invalid-input")).toEqual(first);
  const token = Buffer.from(JSON.stringify({ group: 3, at: "2020-01-01T00:00:00Z", id: uuid(0), direction: "older" })).toString("base64url");
  const empty = await listCalls(s.admin, 50, token);
  expect(empty).toEqual({ calls: [], older: null, newer: "start" });
  expect(await listCalls(s.admin, 50, empty.newer!)).toEqual(first);
});
