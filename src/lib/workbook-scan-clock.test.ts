import { describe, expect, it, vi } from "vitest";
import { recoverWorkbookScanClocks, type ScanClockRequest, type ScanClockStore, type ScanClockWriteStatus } from "@/lib/workbook-scan-clock";

const request = (deliveryAuditId = 1, changes: Partial<ScanClockRequest> = {}): ScanClockRequest => ({
  workbookId: "00000000-0000-4000-8000-000000000001", deliveryAuditId,
  deliveredAt: "2026-10-15T12:00:00Z", timeZone: "America/Edmonton", zoneOverride: false, ...changes,
});
const options = { clockVersion: "family-time-review;node22;tz2026a" };
function setup(rows: ScanClockRequest[]) {
  const pending = [...rows];
  const saved: { request: ScanClockRequest; backstopAt: string; clockVersion: string }[] = [];
  const reconcile = vi.fn(async () => {});
  const requests = vi.fn(async (limit: number) => pending.slice(0, limit));
  const record = vi.fn(async (r: ScanClockRequest, c: { backstopAt: string; clockVersion: string }): Promise<ScanClockWriteStatus> => {
    saved.push({ request: structuredClone(r), ...c });
    const i = pending.findIndex(p => p.deliveryAuditId === r.deliveryAuditId);
    if (i >= 0) pending.splice(i, 1);
    return "waiting";
  });
  const store: ScanClockStore = { reconcile, requests, record };
  return { store, reconcile, requests, record, pending, saved };
}

describe("bounded workbook scan clock recovery", () => {
  it("uses the real family clock in both override modes without a browser time", async () => {
    const s = setup([request(), request(2, { zoneOverride: true })]);
    const result = await recoverWorkbookScanClocks(s.store, options);
    expect(s.saved.map(x=>x.backstopAt)).toEqual(["2026-11-05T13:00:00.000Z", "2026-11-05T12:00:00.000Z"]);
    expect(s.saved.every(x=>x.clockVersion===options.clockVersion)).toBe(true);
    expect(result.outcomes.map(x=>x.status)).toEqual(["waiting", "waiting"]);
    expect(result.moreMayRemain).toBe(false);
  });

  it("creates missing requests before reading them and reconciles future deadlines on later runs", async () => {
    const s = setup([]);
    s.reconcile.mockImplementation(async () => { if (!s.saved.length) s.pending.push(request()); });
    const a = await recoverWorkbookScanClocks(s.store, { ...options, workbookIds: ["b", "a", "b"] });
    const b = await recoverWorkbookScanClocks(s.store, { ...options, workbookIds: ["a"] });
    expect(s.reconcile.mock.calls).toEqual([[["a", "b"]], [["a"]]]);
    expect(a.reconciledBooks).toBe(2);
    expect(b.outcomes).toEqual([]);
    expect(s.saved).toHaveLength(1);
  });

  it("reads the replacement audit after a delivery correction and never resubmits the old audit", async () => {
    const s = setup([request()]);
    s.record.mockImplementationOnce(async () => {
      s.pending.splice(0, 1, request(2, { deliveredAt: "2026-10-16T12:00:00Z" }));
      return "stale-delivery";
    });
    const result = await recoverWorkbookScanClocks(s.store, options);
    expect(result.outcomes.map(x=>[x.deliveryAuditId,x.status])).toEqual([[1,"stale-delivery"],[2,"waiting"]]);
    expect(s.record.mock.calls.map(x=>x[0].deliveryAuditId)).toEqual([1,2]);
    expect(s.saved[0].backstopAt).toBe("2026-11-06T13:00:00.000Z");
  });

  it("bounds a continuously changing delivery and leaves the newest request for recovery", async () => {
    const s = setup([request()]);
    s.record.mockImplementation(async r => {
      s.pending.splice(0, 1, request(r.deliveryAuditId + 1));
      return "stale-delivery";
    });
    const result = await recoverWorkbookScanClocks(s.store, options);
    expect(s.record).toHaveBeenCalledTimes(2);
    expect(s.requests).toHaveBeenCalledTimes(2);
    expect(s.pending[0].deliveryAuditId).toBe(3);
    expect(result.moreMayRemain).toBe(true);
  });

  it("retains an unsatisfied request after a lost write and continues the rest of the batch", async () => {
    const s = setup([request(), request(2)]);
    s.record.mockRejectedValueOnce(new Error("lost reply"));
    const a = await recoverWorkbookScanClocks(s.store, options);
    expect(a.outcomes.map(x=>x.status)).toEqual(["write-failed","waiting"]);
    expect(s.pending.map(x=>x.deliveryAuditId)).toEqual([1]);
    expect(a.moreMayRemain).toBe(true);
    const b = await recoverWorkbookScanClocks(s.store, options);
    expect(b.outcomes.map(x=>x.status)).toEqual(["waiting"]);
    expect(s.saved.map(x=>x.request.deliveryAuditId)).toEqual([2,1]);
  });

  it("does not repeat a committed write after its reply is lost", async () => {
    const s = setup([request()]);
    s.record.mockImplementationOnce(async () => { s.pending.length = 0; throw new Error("lost committed reply"); });
    await recoverWorkbookScanClocks(s.store, options);
    const result = await recoverWorkbookScanClocks(s.store, options);
    expect(s.record).toHaveBeenCalledTimes(1);
    expect(result.outcomes).toEqual([]);
  });

  it("reports a calendar conflict without replacing or retrying the stored clock", async () => {
    const s = setup([request()]);
    s.record.mockResolvedValue("calendar-conflict");
    const result = await recoverWorkbookScanClocks(s.store, options);
    expect(result.outcomes[0].status).toBe("calendar-conflict");
    expect(s.record).toHaveBeenCalledTimes(1);
    expect(s.saved).toEqual([]);
  });

  it.each(["hold", "claimed", "missing-delivery", "unavailable"] as const)("preserves the database decision %s", async status => {
    const s = setup([request()]); s.record.mockResolvedValue(status);
    expect((await recoverWorkbookScanClocks(s.store, options)).outcomes[0].status).toBe(status);
    expect(s.record).toHaveBeenCalledTimes(1);
  });

  it("limits one pass and resumes the remaining durable requests on the next pass", async () => {
    const s = setup([request(),request(2),request(3)]);
    const a = await recoverWorkbookScanClocks(s.store, { ...options, limit: 2 });
    expect(a.outcomes).toHaveLength(2); expect(a.moreMayRemain).toBe(true);
    const b = await recoverWorkbookScanClocks(s.store, { ...options, limit: 2 });
    expect(b.outcomes).toHaveLength(1); expect(b.moreMayRemain).toBe(false);
    expect(s.saved).toHaveLength(3);
  });

  it.each([0,101,1.5,NaN])("refuses invalid batch limit %s before storage access", async limit => {
    const s = setup([request()]);
    await expect(recoverWorkbookScanClocks(s.store, { ...options, limit })).rejects.toThrow("Invalid workbook scan clock");
    expect(s.requests).not.toHaveBeenCalled(); expect(s.record).not.toHaveBeenCalled();
  });

  it("refuses malformed requests without losing valid requests in the same batch", async () => {
    const s = setup([request(1,{timeZone:"invalid"}),request(2,{deliveredAt:"invalid"}),request(3)]);
    const result = await recoverWorkbookScanClocks(s.store, options);
    expect(result.outcomes.map(x=>x.status)).toEqual(["invalid-request","invalid-request","waiting"]);
    expect(s.saved.map(x=>x.request.deliveryAuditId)).toEqual([3]);
    expect(result.moreMayRemain).toBe(true);
  });
});
