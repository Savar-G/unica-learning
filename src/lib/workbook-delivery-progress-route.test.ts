import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/workbooks/[id]/delivery/route";
import { AfterContext } from "next/dist/server/after/after-context";
vi.mock("server-only",()=>({}));
const h=vi.hoisted(()=>({admin:true,bookExists:true,after:[] as (()=>void|Promise<void>)[],
  registrationFailure:null as (()=>void)|null,confirm:vi.fn(),correct:vi.fn(),refresh:vi.fn()}));
const book="00000000-0000-4000-8000-000000000001",child="00000000-0000-4000-8000-000000000002";
vi.mock("next/server",()=>({after:(fn:()=>void|Promise<void>)=>{h.registrationFailure?.();h.after.push(fn);}}));
vi.mock("@/lib/workbook-scan-recovery-server",()=>({refreshWorkbookScanClock:(id:string)=>h.refresh(id)}));
vi.mock("@/lib/workbook-delivery",()=>({confirmDelivery:(...args:unknown[])=>h.confirm(...args),correctDelivery:(...args:unknown[])=>h.correct(...args)}));
vi.mock("@/lib/workbook-delivery-store",()=>({workbookDeliveryStore:()=>({receipt:async()=>null})}));
vi.mock("@/lib/admin-store",()=>({adminSession:async()=>h.admin?{db:{
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:h.bookExists?{parent_id:"parent"}:null,error:null})})})}),
  rpc:(name:string)=>name==="admin_parents"
    ?{select:()=>({eq:()=>({maybeSingle:async()=>({data:{time_zone:"UTC",postal:null},error:null})})})}
    :{select:()=>({eq:async()=>({data:[],error:null})})},
}}:null}));
const ctx={params:Promise.resolve({id:book})};
const request=(extra:Record<string,unknown>={})=>new Request(`https://unica.test/api/admin/workbooks/${book}/delivery`,{
  method:"POST",headers:{"Content-Type":"application/json",origin:"https://unica.test"},
  body:JSON.stringify({localTime:"2026-11-01T12:00",timeZone:"UTC",childId:child,number:1,...extra}),
});
beforeEach(()=>{vi.restoreAllMocks();vi.spyOn(console,"warn").mockImplementation(()=>{});h.admin=true;h.bookExists=true;h.after=[];h.registrationFailure=null;h.confirm.mockReset().mockResolvedValue({status:"confirmed",receipt:{workbookId:book}});h.correct.mockReset().mockResolvedValue({status:"confirmed",receipt:{workbookId:book}});h.refresh.mockReset().mockResolvedValue(undefined);});

describe("delivery response and durable scan clock recovery",()=>{
  it.each(["waitUntil","onClose"])("keeps the committed confirmation after a real Next %s registration error",async failure=>{
    const broken = new AfterContext({waitUntil:undefined,onTaskError:undefined,onClose:()=>{
      if(failure==="onClose")throw new Error("synthetic lifecycle failure");
    }});
    h.registrationFailure=()=>Reflect.apply(broken.after,broken,[()=>{},undefined]);
    const response=await POST(request(),ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({status:"confirmed"});
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.after).toEqual([]);expect(h.refresh).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith("[scan progress] delivery callback registration deferred");
  });
  it("answers confirmed before running bounded recovery and forwards no browser calendar",async()=>{
    const response=await POST(request({backstopAt:"1900-01-01Z",clockVersion:"forged",p_at:"2099-01-01Z"}),ctx);
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({status:"confirmed"});
    expect(h.after).toHaveLength(1);expect(h.refresh).not.toHaveBeenCalled();
    await h.after[0]();expect(h.refresh).toHaveBeenCalledExactlyOnceWith(book);
  });
  it("also schedules recovery after a confirmed delivery correction",async()=>{
    const response=await POST(request({action:"correct",reason:"corrected date",requestId:book,expectedAuditId:1}),ctx);
    expect(response.status).toBe(200);expect(h.correct).toHaveBeenCalledTimes(1);expect(h.confirm).not.toHaveBeenCalled();
    expect(h.after).toHaveLength(1);await h.after[0]();expect(h.refresh).toHaveBeenCalledWith(book);
  });
  it.each(["confirm","correct"] as const)("schedules nothing after a refused %s",async method=>{
    h[method].mockResolvedValue({status:"refused",reason:"invalid_time"});
    const response=await POST(request(method==="correct"?{action:"correct"}:{}),ctx);
    expect(response.status).toBe(409);expect(h.after).toEqual([]);expect(h.refresh).not.toHaveBeenCalled();
  });
  it("retains admin, origin, workbook and zone checks before any recovery task",async()=>{
    h.admin=false;expect((await POST(request(),ctx)).status).toBe(404);h.admin=true;
    const foreign=request();foreign.headers.set("origin","https://foreign.test");expect((await POST(foreign,ctx)).status).toBe(403);
    h.bookExists=false;expect((await POST(request(),ctx)).status).toBe(404);h.bookExists=true;
    expect((await POST(request({timeZone:"America/Vancouver"}),ctx)).status).toBe(409);
    expect(h.after).toEqual([]);expect(h.confirm).not.toHaveBeenCalled();expect(h.refresh).not.toHaveBeenCalled();
  });
});
