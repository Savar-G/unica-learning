import { beforeEach, expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({parent:"parent" as string|null,desk:false,services:{} as unknown,overview:vi.fn(),apply:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>({value:"desk"})})}));
vi.mock("@/lib/supabase-auth",()=>({sessionClient:async()=>({}),parentId:async()=>f.parent}));
vi.mock("@/lib/desk",()=>({DESK_COOKIE:"desk",deskAccess:()=>({state:f.desk?"open":"closed"})}));
vi.mock("@/lib/desk-server",()=>({sameOrigin:(r:Request)=>r.headers.get("origin")===new URL(r.url).origin}));
vi.mock("@/lib/referral-server",()=>({liveReferrals:()=>f.services}));
vi.mock("@/lib/referrals",()=>({referralOverview:f.overview,applyReferral:f.apply}));
vi.mock("@/lib/account-server",()=>({linkOrigin:()=>"https://unica.test"}));
import{GET,POST}from"./route";
const request=(body:unknown={code:"U-SOURCE1"},origin="https://unica.test")=>new Request("https://unica.test/api/account/referrals",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();f.parent="parent";f.desk=false;f.services={};f.overview.mockResolvedValue({ok:false,error:"unavailable"});f.apply.mockResolvedValue({ok:false,error:"invalid"});});
it("authenticates reads and writes and blocks the child's desk before service work",async()=>{
 f.parent=null;expect((await GET(request())).status).toBe(401);expect((await POST(request())).status).toBe(401);
 f.parent="parent";f.desk=true;expect((await GET(request())).status).toBe(423);expect((await POST(request())).status).toBe(423);expect(f.overview).not.toHaveBeenCalled();expect(f.apply).not.toHaveBeenCalled();
});
it("requires same-origin JSON writes and bounded input",async()=>{
 expect((await POST(request({},"https://other.test"))).status).toBe(403);expect((await POST(request({code:"x".repeat(600)}))).status).toBe(413);expect(f.apply).not.toHaveBeenCalled();
});
it("uses no-store on failures and passes only the signed-in family to admission",async()=>{
 const result=await POST(request());expect(result.headers.get("cache-control")).toBe("no-store");expect(await result.json()).toEqual({ok:false,error:"invalid"});expect(f.apply).toHaveBeenCalledWith("parent","U-SOURCE1",f.services,"https://unica.test");
 const read=await GET(request());expect(read.status).toBe(503);expect(read.headers.get("cache-control")).toBe("no-store");
});
it("keeps retryable store failures non-successful",async()=>{f.apply.mockRejectedValue(Error("Private diagnostic"));const result=await POST(request());expect(result.status).toBe(503);expect(await result.text()).not.toContain("Private diagnostic");});
