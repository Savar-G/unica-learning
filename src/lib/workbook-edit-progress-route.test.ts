import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({ admin: true, db: null as unknown, signals: [] as AbortSignal[], secret: vi.fn(), job: vi.fn() }));
vi.mock("@/lib/admin-store", () => ({ adminSession: async (signal: AbortSignal) => { h.signals.push(signal); return h.admin ? { db: h.db, userId: "admin", email: "synthetic@example.invalid" } : null; } }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: h.secret }));
vi.mock("@/lib/workbook-job-server", () => ({ runWorkbookJobNow: h.job }));
vi.mock("next/server", () => ({ after: vi.fn() }));
import { GET } from "@/app/api/admin/workbooks/runs/[id]/edit/route";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const run = id(1), draft = id(2), batch = id(3), now = Date.parse("2026-11-06T23:00:00Z");
const request = () => new Request(`https://synthetic.invalid/api/admin/workbooks/runs/${run}/edit`);
const context = (key = run) => ({ params: Promise.resolve({ id: key }) });
type Call = { table: string; params: URLSearchParams; signal: AbortSignal | null | undefined };
let calls: Call[], rows: Record<string, unknown>, count: number;
let hook: ((call: Call) => Response | Promise<Response> | undefined) | undefined;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); h.admin = true; h.signals = []; h.secret.mockClear(); h.job.mockClear();
  calls = []; count = 14; hook = undefined;
  rows = { workbook_runs: { draft_id: draft }, workbook_edits: { id: batch, base_revision: 1, status: "running", heartbeat_at: new Date(now).toISOString(),
    checkpoints: { 1: { number: 1, error: "private cover note" }, 2: { number: 2, error: "private instruction note" },
      6: { number: 6, error: "private fit details" }, 7: { number: 7, page: { number: 7, private: "x".repeat(50000) }, image: { number: 7, path: "private-image" } } }, frame: { model: "private-model" } },
    workbook_comments: [...Array.from({ length: 12 }, (_, n) => ({ batch_id: batch, page_number: n + 1 })),
      { batch_id: batch, page_number: 1 }, { batch_id: batch, page_number: 1 }],
  };
  h.db = createClient<Database>("https://synthetic.invalid", "synthetic-session-key", { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)); const call = { table: url.pathname.split("/").at(-1)!, params: url.searchParams, signal: init?.signal };
      calls.push(call); const custom = hook?.(call); if (custom) return custom;
      return Response.json(rows[call.table], { headers: call.table === "workbook_comments" ? { "Content-Range": `*/${count}` } : {} });
    } },
  });
});
afterEach(() => vi.useRealTimers());

describe("Admin lightweight edit progress route", () => {
  it("reads only scoped run/batch/page references and returns four checked, one ready, three failed", async () => {
    const response = await GET(request(), context()); expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("vary")).toBe("Cookie");
    const body = await response.text(); expect(body.length).toBeLessThan(500);
    expect(JSON.parse(body).batch).toMatchObject({ id: batch, total: 12, checked: 4, ready: 1, failed: 3 });
    expect(body).not.toMatch(/private|checkpoints|model|image|note|path/);
    expect(calls.map(c => c.table)).toEqual(["workbook_runs", "workbook_edits", "workbook_comments"]);
    expect(calls[0].params.get("id")).toBe(`eq.${run}`); expect(calls[1].params.get("draft_id")).toBe(`eq.${draft}`);
    expect(calls[2].params.get("batch_id")).toBe(`eq.${batch}`); expect(calls[2].params.get("select")).toBe("batch_id,page_number");
    expect(h.secret).not.toHaveBeenCalled(); expect(h.job).not.toHaveBeenCalled();
  });
  it("refuses an anonymous or non-admin caller before reading batch data", async () => {
    h.admin = false; expect((await GET(request(), context())).status).toBe(404); expect(calls).toEqual([]);
  });
  it("refuses invalid or unavailable run identities", async () => {
    expect((await GET(request(), context("bad"))).status).toBe(404); expect(calls).toEqual([]);
    rows.workbook_runs = null; expect((await GET(request(), context())).status).toBe(404);
    expect(calls.map(c => c.table)).toEqual(["workbook_runs"]);
  });
  it("returns null when the checked run has no edit batch", async () => {
    rows.workbook_edits = null; const response = await GET(request(), context());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ batch: null }); expect(calls).toHaveLength(2);
  });
  it("does not turn missing comments or a server row cap into a partial total", async () => {
    rows.workbook_comments = [{ batch_id: batch, page_number: 1 }];
    const response = await GET(request(), context()); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Progress is unavailable. Retrying shortly." });
  });
  it("fails closed above the existing 500-comment bound", async () => {
    count = 501; expect((await GET(request(), context())).status).toBe(503);
  });
  it("does not return a database error, stale counts, or private data after a failed read", async () => {
    hook = () => Response.json({ message: "private database details" }, { status: 500 });
    const response = await GET(request(), context()); expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private database details");
  });
  it("aborts the same session and data requests at eight seconds", async () => {
    hook = call => new Promise((_resolve, reject) => {
      if (call.signal?.aborted) reject(call.signal.reason);
      else call.signal?.addEventListener("abort", () => reject(call.signal?.reason), { once: true });
    });
    const response = GET(request(), context()); await vi.advanceTimersByTimeAsync(7_999);
    expect(calls).toHaveLength(1); expect(h.signals[0].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect((await response).status).toBe(503);
    expect(h.signals[0].aborted).toBe(true); expect(calls[0].signal?.aborted).toBe(true);
  });
});
