import { describe, expect, it, vi } from "vitest";
import { runWorkbookScanRecovery } from "@/lib/workbook-scan-recovery";
import type { ScanClockStore } from "@/lib/workbook-scan-clock";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const options = {clockVersion:"reviewed-clock",time:{now:()=>0,endAt:1000}};
const clocks = () => ({reconcile:vi.fn<ScanClockStore["reconcile"]>().mockResolvedValue(undefined),requests:vi.fn<ScanClockStore["requests"]>().mockResolvedValue([]),record:vi.fn<ScanClockStore["record"]>()});

describe("bounded workbook scan recovery turn",()=>{
  it("reconciles old deliveries and due books, then recovers the saved clock requests",async()=>{
    const store=clocks();
    const sources={unseeded:vi.fn(async()=>[id(2),id(1)]),due:vi.fn(async()=>[id(2),id(3)])};
    const result=await runWorkbookScanRecovery(sources,store,options);
    expect(store.reconcile.mock.calls).toEqual([[[id(1),id(2),id(3)]]]);
    expect(result).toMatchObject({selectedBooks:3,reconciledBooks:3,outOfTime:false});
    expect(result.clocks?.outcomes).toEqual([]);
    expect(store.requests).toHaveBeenCalledWith(100);
  });
  it("chunks two full selector results into two bounded database calls",async()=>{
    const store=clocks();
    const a=Array.from({length:100},(_,i)=>id(i+1)),b=Array.from({length:100},(_,i)=>id(i+101));
    const result=await runWorkbookScanRecovery({unseeded:async()=>a,due:async()=>b},store,options);
    expect(store.reconcile.mock.calls.map(c=>c[0].length)).toEqual([100,100]);
    expect(result.reconciledBooks).toBe(200);
    expect(store.reconcile.mock.calls.flatMap(c=>c[0])).toEqual([...a,...b]);
  });
  it("makes no request after the budget is already exhausted",async()=>{
    const store=clocks(),unseeded=vi.fn(async()=>[]),due=vi.fn(async()=>[]);
    const result=await runWorkbookScanRecovery({unseeded,due},store,{...options,time:{now:()=>1000,endAt:1000}});
    expect(result.outOfTime).toBe(true);expect(unseeded).not.toHaveBeenCalled();expect(due).not.toHaveBeenCalled();expect(store.requests).not.toHaveBeenCalled();
  });
  it("leaves durable work for a later turn when selection uses the remaining budget",async()=>{
    let now=0;const store=clocks(),due=vi.fn(async()=>[]);
    const result=await runWorkbookScanRecovery({unseeded:async()=>{now=1000;return[id(1)];},due},store,{...options,time:{now:()=>now,endAt:1000}});
    expect(result).toMatchObject({selectedBooks:1,reconciledBooks:0,clocks:null,outOfTime:true});
    expect(due).not.toHaveBeenCalled();expect(store.reconcile).not.toHaveBeenCalled();
  });
  it("stops between reconcile batches and starts no clock writes after the budget",async()=>{
    let now=0;const store=clocks();store.reconcile.mockImplementation(async()=>{now=1000;});
    const a=Array.from({length:100},(_,i)=>id(i+1)),b=Array.from({length:100},(_,i)=>id(i+101));
    const result=await runWorkbookScanRecovery({unseeded:async()=>a,due:async()=>b},store,{...options,time:{now:()=>now,endAt:1000}});
    expect(result).toMatchObject({selectedBooks:200,reconciledBooks:100,clocks:null,outOfTime:true});
    expect(store.requests).not.toHaveBeenCalled();
  });
  it("a later turn advances through state removed by completed database writes",async()=>{
    const pending=[id(1),id(2)];const store=clocks();
    store.reconcile.mockImplementation(async ids=>{for(const v of ids){const i=pending.indexOf(v);if(i>=0)pending.splice(i,1);}});
    const sources={unseeded:async()=>pending.slice(0,1),due:async()=>[]};
    await runWorkbookScanRecovery(sources,store,{...options,limit:1});
    await runWorkbookScanRecovery(sources,store,{...options,limit:1});
    expect(store.reconcile.mock.calls).toEqual([[[id(1)]],[[id(2)]]]);
    expect(pending).toEqual([]);
  });
  it.each([{ids:["invalid"],limit:5},{ids:[id(1),id(1)],limit:5},{ids:[id(1),id(2)],limit:1}])("rejects a malformed or oversized selector instead of claiming a partial set",async({ids,limit})=>{
    const store=clocks();await expect(runWorkbookScanRecovery({unseeded:async()=>ids,due:async()=>[]},store,{...options,limit})).rejects.toThrow("scan_recovery_book_shape");
    expect(store.reconcile).not.toHaveBeenCalled();expect(store.requests).not.toHaveBeenCalled();
  });
  it("does not claim clock recovery succeeded when a selector or reconcile failed",async()=>{
    const store=clocks();store.reconcile.mockRejectedValue(Error("database unavailable"));
    await expect(runWorkbookScanRecovery({unseeded:async()=>[id(1)],due:async()=>[]},store,options)).rejects.toThrow("database unavailable");
    expect(store.requests).not.toHaveBeenCalled();
  });
});
