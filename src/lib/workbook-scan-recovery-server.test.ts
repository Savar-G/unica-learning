import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { refreshWorkbookScanClock } from "@/lib/workbook-scan-recovery-server";
vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({ db: null as unknown, clientThrows: false, signals: [] as (AbortSignal | undefined)[] }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: (signal?: AbortSignal) => {
  h.signals.push(signal);
  if (h.clientThrows) throw new Error("private client error");
  return h.db;
} }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const book = id(1), parent = id(2);
function setup({ test = true, foreign = false, removedAt = Infinity, fail = "", conflict = false, plan = "" } = {}) {
  const calls: { name: string; body: Record<string, unknown>; query: URLSearchParams }[] = [];
  let gates = 0;
  h.db = createClient<Database>("https://recovery.example.invalid", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const name = url.pathname.split("/").at(-1)!, body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ name, body, query: url.searchParams });
      if (name === fail) return new Response(JSON.stringify({ code: "failure", message: "private service detail" }), { status: 400 });
      const pending = { workbook_id: foreign ? id(99) : book, delivery_audit_id: 3, delivered_at: "2026-10-15T12:00:00Z",
        time_zone: "America/Edmonton", zone_override: false };
      let data: unknown, count: number | undefined;
      switch (name) {
        case "workbooks": data = [{ id: book, parent_id: parent, child_id: id(3), status: "shipped" }]; break;
        case "child_plan_states": data = plan ? [{ kind: plan, next_charge_at: null, ends_at: null, monthly_cents: 1000, ending_free: false }] : []; break;
        case "test_accounts": gates++; data = test && gates < removedAt ? [{ parent_id: parent }] : []; break;
        case "reconcile_workbook_scan_progress": data = (body.p_books as string[]).map(workbookId => ({ workbookId, result: { status: "waiting" } })); break;
        case "workbook_scan_clock_requests": data = [pending]; count = 1; break;
        case "list_workbook_scan_clock_requests": data = [pending]; break;
        case "record_workbook_scan_delivery_calendar": data = { status: conflict ? "calendar-conflict" : "waiting" }; break;
        default: throw new Error(`Unexpected synthetic request ${name}`);
      }
      return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json",
        ...(count === undefined ? {} : { "Content-Range": `0-0/${count}` }) } });
    } },
  });
  return { calls };
}

beforeEach(() => {
  vi.restoreAllMocks();
  h.db = null; h.clientThrows = false; h.signals = [];
  vi.stubEnv("WORKBOOK_SCAN_PROGRESS_ENABLED", "test-only");
  vi.stubEnv("WORKBOOK_SCAN_REMINDERS_ENABLED", "off");
  vi.stubEnv("WORKBOOK_SCAN_TEST_PARENT_IDS", parent);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("gated delivery clock recovery after the response", () => {
  it("authorizes the delivered book and reads only that book's saved clock requests", async () => {
    const f = setup();
    await expect(refreshWorkbookScanClock(book)).resolves.toBeUndefined();
    expect(h.signals).toHaveLength(1);
    expect(h.signals[0]).toBeInstanceOf(AbortSignal);
    expect(f.calls.find(c => c.name === "reconcile_workbook_scan_progress")?.body).toEqual({ p_books: [book] });
    expect(f.calls.find(c => c.name === "workbook_scan_clock_requests")?.query.get("workbook_id")).toBe(`in.(${book})`);
    expect(f.calls.some(c => c.name === "list_workbook_scan_clock_requests")).toBe(false);
    expect(f.calls.find(c => c.name === "record_workbook_scan_delivery_calendar")?.body).toMatchObject({
      p_book: book, p_delivery_audit: 3, p_backstop: "2026-11-05T13:00:00.000Z",
      p_clock_version: expect.stringContaining(`tz=${process.versions.tz}`),
    });
  });

  it.each(["off", "", "on"])("opens no client when the progress release is %j", async mode => {
    const f = setup();
    vi.stubEnv("WORKBOOK_SCAN_PROGRESS_ENABLED", mode);
    await refreshWorkbookScanClock(book);
    expect(h.signals).toEqual([]);
    expect(f.calls).toEqual([]);
  });

  it("recovers a real family only with an open child plan", async () => {
    const f = setup({ test: false, plan: "paying" });
    vi.stubEnv("WORKBOOK_SCAN_PROGRESS_ENABLED", "families");
    vi.stubEnv("WORKBOOK_SCAN_TEST_PARENT_IDS", id(90));
    await refreshWorkbookScanClock(book);
    expect(f.calls.some(c => c.name === "record_workbook_scan_delivery_calendar")).toBe(true);
  });
  it("does not recover a real family with a closed child plan", async () => {
    const f = setup({ test: false, plan: "paused" });
    vi.stubEnv("WORKBOOK_SCAN_PROGRESS_ENABLED", "families");
    vi.stubEnv("WORKBOOK_SCAN_TEST_PARENT_IDS", id(90));
    await refreshWorkbookScanClock(book);
    expect(f.calls.some(c => /reconcile_|record_/.test(c.name))).toBe(false);
  });

  it("does not mutate a delivered book whose owner is outside the configured test list", async () => {
    const f = setup();
    vi.stubEnv("WORKBOOK_SCAN_TEST_PARENT_IDS", id(90));
    await refreshWorkbookScanClock(book);
    expect(f.calls.map(c => c.name)).toEqual(["workbooks"]);
  });

  it("does not mutate a listed real parent without a live test marker", async () => {
    const f = setup({ test: false });
    await refreshWorkbookScanClock(book);
    expect(f.calls.some(c => /reconcile_|record_/.test(c.name))).toBe(false);
  });

  it("never writes a foreign request returned to the scoped reader", async () => {
    const f = setup({ foreign: true });
    await refreshWorkbookScanClock(book);
    expect(f.calls.some(c => c.name === "record_workbook_scan_delivery_calendar")).toBe(false);
    expect(f.calls.some(c => c.name === "list_workbook_scan_clock_requests")).toBe(false);
  });

  it("rechecks a removed test marker before the calendar write", async () => {
    const f = setup({ removedAt: 4 });
    await refreshWorkbookScanClock(book);
    expect(f.calls.some(c => c.name === "record_workbook_scan_delivery_calendar")).toBe(false);
  });

  it("does not open a client for an invalid book or propagate missing configuration", async () => {
    await refreshWorkbookScanClock("invalid");
    expect(h.signals).toEqual([]);
    await expect(refreshWorkbookScanClock(book)).resolves.toBeUndefined();
  });

  it.each(["workbooks", "test_accounts", "reconcile_workbook_scan_progress", "record_workbook_scan_delivery_calendar"])
  ("does not change a committed response after %s fails", async fail => {
    const f = setup({ fail });
    await expect(refreshWorkbookScanClock(book)).resolves.toBeUndefined();
    const last = f.calls.findIndex(c => c.name === fail);
    expect(last).toBeGreaterThanOrEqual(0);
    expect(f.calls).toHaveLength(last + 1);
    expect(vi.mocked(console.warn).mock.calls.flat().join(" ")).not.toContain("private service detail");
  });

  it("does not propagate client setup failure", async () => {
    h.clientThrows = true;
    await expect(refreshWorkbookScanClock(book)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith("[scan progress] clock recovery deferred");
  });

  it("keeps a conflicting calendar without retrying its write", async () => {
    const f = setup({ conflict: true });
    await refreshWorkbookScanClock(book);
    expect(f.calls.filter(c => c.name === "record_workbook_scan_delivery_calendar")).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledWith("[scan progress] clock recovery needs another check");
  });
});
