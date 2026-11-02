import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { listCalls } from "@/lib/maya-call-server";
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
  const [field, op, value] = term.split(".");
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
    const result = await listCalls(s.admin);
    expect(result).toHaveLength(50);
    expect(result.slice(0, 6).map((r) => r.id)).toEqual(["danger-new", "danger-old", "legacy-severity", "legacy-concern", "concern", "harmful"]);
    expect(new Set(result.map((r) => r.id)).size).toBe(50);
    expect(result[1].mode).toBe("voice");
    expect(result[0].mishearing).toEqual({ confirmations: 1, corrections: 2 });
    const callReads = s.urls.filter((u) => u.pathname.endsWith("/maya_calls"));
    expect(callReads).toHaveLength(4);
    expect(callReads.every((u) => u.searchParams.get("limit") === "50")).toBe(true);
  });
  it("does not turn a failed read into an empty review list", async () => {
    await expect(listCalls(reader([], true).admin)).rejects.toThrow("read failed");
  });
});
