import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { recoverWorkbookScanClocks } from "@/lib/workbook-scan-clock";
import { workbookScanClockStore, workbookScanClockVersion } from "@/lib/workbook-scan-clock-store";
vi.mock("server-only", () => ({}));

const book = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const row = { workbook_id: book, delivery_audit_id: 23, delivered_at: "2026-10-15T12:00:00Z", time_zone: "America/Edmonton", zone_override: false };
type Call = { name: string; body: Record<string, unknown> };
function setup(reply: (call: Call, index: number) => { data: unknown; status?: number }) {
  const calls: Call[] = [];
  const db = createClient<Database>("https://scan-clock.example.invalid", "synthetic-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const call = { name: new URL(url).pathname.split("/").at(-1)!, body: JSON.parse(String(init?.body)) };
      calls.push(call);
      const result = reply(call, calls.length - 1);
      return new Response(JSON.stringify(result.data), { status: result.status ?? 200, headers: { "Content-Type": "application/json" } });
    } },
  });
  return { store: workbookScanClockStore(db), calls };
}
const reconciled = (ids: unknown) => (ids as string[]).map(workbookId=>({ workbookId, result: { status: "clock-required" } }));

describe("workbook scan clock Supabase adapter", () => {
  it("runs recovery through the real client and sends the saved delivery identity and canonical deadline", async () => {
    const s = setup(call => ({ data: call.name === "reconcile_workbook_scan_progress" ? reconciled(call.body.p_books)
      : call.name === "list_workbook_scan_clock_requests" ? [row] : { status: "hold" } }));
    const clockVersion = workbookScanClockVersion();
    const result = await recoverWorkbookScanClocks(s.store, { workbookIds: [book], clockVersion, limit: 7 });
    expect(s.calls.map(c=>c.name)).toEqual(["reconcile_workbook_scan_progress", "list_workbook_scan_clock_requests", "record_workbook_scan_delivery_calendar"]);
    expect(s.calls[1].body).toEqual({ p_limit: 7 });
    expect(s.calls[2].body).toEqual({ p_book: book, p_delivery_audit: 23, p_delivered: row.delivered_at,
      p_zone: row.time_zone, p_override: false, p_backstop: "2026-11-05T13:00:00.000Z", p_clock_version: clockVersion });
    expect(result.outcomes).toEqual([{ workbookId: book, deliveryAuditId: 23, status: "hold" }]);
    expect(clockVersion).toContain(`node=${process.versions.node}`);
    expect(clockVersion).toContain(`tz=${process.versions.tz}`);
    expect(s.calls.every(c=>!("p_at" in c.body))).toBe(true);
  });

  it("isolates a family freeze after the bulk transaction fails and still reconciles another book", async () => {
    const s = setup((call,index) => index < 2 ? { status: 400, data: { code: "55000", message: "family_unavailable" } }
      : { data: reconciled(call.body.p_books) });
    await s.store.reconcile([other,book]);
    expect(s.calls.map(c=>c.body.p_books)).toEqual([[book,other],[book],[other]]);
  });

  it.each(["42501","PGRST301","XX000"])("does not hide or multiply an unrelated reconciliation failure %s", async code => {
    const s = setup(() => ({status:400,data:{code,message:"private diagnostic"}}));
    await expect(s.store.reconcile([book])).rejects.toThrow("scan_clock_reconcile");
    expect(s.calls).toHaveLength(1);
  });

  it.each([null,{},[{...row,zone_override:"false"}],[{...row,delivery_audit_id:Number.MAX_SAFE_INTEGER+1}],[{...row,time_zone:"invalid"}],[{...row,delivered_at:"invalid"}],[row,row]].map(data=>({data})))("refuses malformed or repeated request identities", async ({data}) => {
    const s = setup(() => ({data}));
    await expect(s.store.requests(10)).rejects.toThrow("scan_clock_request_shape");
  });

  it.each([0,101,1.5])("refuses invalid read limit %s without a request", async limit => {
    const s = setup(() => ({data:[]}));
    await expect(s.store.requests(limit)).rejects.toThrow("scan_clock_request_limit");
    expect(s.calls).toEqual([]);
  });

  it("rejects a request read that exceeds its bound", async () => {
    const s = setup(() => ({data:[row,{...row,delivery_audit_id:24}]}));
    await expect(s.store.requests(1)).rejects.toThrow("scan_clock_request_shape");
  });

  it.each([[],[{workbookId:other,result:{status:"waiting"}}],[{workbookId:book,result:{status:"unknown"}}]].map(data=>({data})))("refuses incomplete, substituted or unknown reconciliation answers", async ({data}) => {
    const s = setup(() => ({data}));
    await expect(s.store.reconcile([book])).rejects.toThrow("scan_clock_reconcile_shape");
  });

  it("reports a malformed calendar reply as a recoverable write failure", async () => {
    const s = setup(call=>({data:call.name === "list_workbook_scan_clock_requests" ? [row] : {status:"clock-required"}}));
    const result = await recoverWorkbookScanClocks(s.store,{clockVersion:"reviewed-test-clock"});
    expect(result.outcomes[0].status).toBe("write-failed");
    expect(result.moreMayRemain).toBe(true);
  });
});
