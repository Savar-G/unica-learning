import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanClockStore } from "@/lib/workbook-scan-clock";
import { refreshWorkbookScanClock } from "@/lib/workbook-scan-recovery-server";
vi.mock("server-only",()=>({}));
const h=vi.hoisted(()=>({configured:true,clientThrows:false,signals:[] as (AbortSignal|undefined)[],
  store:{reconcile:vi.fn<ScanClockStore["reconcile"]>(),requests:vi.fn<ScanClockStore["requests"]>(),record:vi.fn<ScanClockStore["record"]>()}}));
vi.mock("@/lib/supabase-auth",()=>({adminClient:(signal?:AbortSignal)=>{h.signals.push(signal);if(h.clientThrows)throw Error("private client error");return h.configured?{}:null;}}));
vi.mock("@/lib/workbook-scan-clock-store",async real=>({...await real<typeof import("@/lib/workbook-scan-clock-store")>(),workbookScanClockStore:()=>h.store}));
const book="00000000-0000-4000-8000-000000000001";
const pending={workbookId:book,deliveryAuditId:3,deliveredAt:"2026-10-15T12:00:00Z",timeZone:"America/Edmonton",zoneOverride:false};
beforeEach(()=>{vi.restoreAllMocks();h.configured=true;h.clientThrows=false;h.signals=[];h.store.reconcile.mockReset().mockResolvedValue();h.store.requests.mockReset().mockResolvedValue([]);h.store.record.mockReset().mockResolvedValue("waiting");vi.spyOn(console,"warn").mockImplementation(()=>{});});

describe("delivery clock recovery after the response",()=>{
  it("rechecks the authorized book and limits the immediate recovery unit",async()=>{
    await expect(refreshWorkbookScanClock(book)).resolves.toBeUndefined();
    expect(h.store.reconcile).toHaveBeenCalledWith([book]);expect(h.store.requests).toHaveBeenCalledWith(1);
    expect(h.signals).toHaveLength(1);expect(h.signals[0]).toBeInstanceOf(AbortSignal);
  });
  it("uses the saved request and the actual runtime clock version",async()=>{
    h.store.requests.mockResolvedValue([pending]);await refreshWorkbookScanClock(book);
    expect(h.store.record).toHaveBeenCalledWith(pending,{backstopAt:"2026-11-05T13:00:00.000Z",clockVersion:expect.stringContaining(`tz=${process.versions.tz}`)});
  });
  it("does not open a client for an invalid book",async()=>{
    await refreshWorkbookScanClock("invalid");expect(h.signals).toEqual([]);expect(h.store.reconcile).not.toHaveBeenCalled();
  });
  it("leaves the saved request for scheduled recovery when service configuration is absent",async()=>{
    h.configured=false;await expect(refreshWorkbookScanClock(book)).resolves.toBeUndefined();
    expect(h.store.reconcile).not.toHaveBeenCalled();expect(h.store.record).not.toHaveBeenCalled();
  });
  it("does not propagate a client setup failure after delivery committed",async()=>{
    h.clientThrows=true;await expect(refreshWorkbookScanClock(book)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith("[scan progress] clock recovery deferred");
  });
  it("does not propagate a read failure or write failure after delivery committed",async()=>{
    h.store.reconcile.mockRejectedValueOnce(Error("private read detail"));await expect(refreshWorkbookScanClock(book)).resolves.toBeUndefined();
    h.store.requests.mockResolvedValue([pending]);h.store.record.mockRejectedValueOnce(Error("private write detail"));
    await expect(refreshWorkbookScanClock(book)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith("[scan progress] clock recovery needs another check");
    expect(h.store.record).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls.flat().join(" ")).not.toContain("private");
    expect(vi.mocked(console.warn).mock.calls.flat().join(" ")).not.toContain(book);
  });
  it("retains the first conflicting calendar and reports it without a write retry",async()=>{
    h.store.requests.mockResolvedValue([pending]);h.store.record.mockResolvedValue("calendar-conflict");
    await refreshWorkbookScanClock(book);expect(h.store.record).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith("[scan progress] clock recovery needs another check");
  });
});
