import { beforeEach, expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({parent:vi.fn(),access:vi.fn(),preview:vi.fn(),confirm:vi.fn(),restart:vi.fn(),context:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase-auth",()=>({sessionClient:async()=>({}),parentId:f.parent}));
vi.mock("@/lib/parent-dashboard-access",()=>({parentDashboardAccess:f.access,planManagementAccess:f.access}));
vi.mock("@/lib/plan-controls-server",()=>({livePauses:()=>({store:{context:f.context}}),restartFamilyPlan:f.restart}));
vi.mock("@/lib/plan-pause",()=>({previewPause:f.preview,confirmPause:f.confirm}));
import {POST as pause} from "./pause/route";
import {POST as restart} from "./restart/route";
const card="11111111-1111-4111-8111-111111111111",token="a".repeat(64);
const request=(body:unknown,headers:Record<string,string>={})=>new Request("https://unica.test/api/account/plan/pause",{method:"POST",headers:{origin:"https://unica.test","content-type":"application/json",...headers},body:JSON.stringify(body)});
beforeEach(()=>{
 vi.resetAllMocks();f.parent.mockResolvedValue("parent");f.access.mockResolvedValue(true);f.context.mockResolvedValue({zone:"America/Vancouver",used:5});
 const quote={weeks:2,used:3,year:2026,late:false,targetNumber:2,chargeAt:"2026-12-01T18:00:00Z",earliest:"2026-11-15",latest:"2026-11-30",subscription:"sub_private",shippedAt:"private"};
 f.preview.mockResolvedValue({ok:true,token,state:"preview",quote});f.confirm.mockResolvedValue({ok:true,token,state:"applied",quote});f.restart.mockResolvedValue({ok:true,state:"preview",price:79.99,token});
});
it.each([pause,restart])("checks origin, JSON, session and dashboard access before an operation",async(handler)=>{
 expect((await handler(request({card,action:"preview",weeks:2},{origin:"https://foreign.test"}))).status).toBe(403);
 expect((await handler(request({card,action:"preview",weeks:2},{"content-type":"text/plain"}))).status).toBe(415);
 f.parent.mockResolvedValue(null);expect((await handler(request({card,action:"preview",weeks:2}))).status).toBe(401);
 f.parent.mockResolvedValue("parent");f.access.mockResolvedValue(false);expect((await handler(request({card,action:"preview",weeks:2}))).status).toBe(404);
 expect(f.preview).not.toHaveBeenCalled();expect(f.restart).not.toHaveBeenCalled();expect(f.confirm).not.toHaveBeenCalled();
});
it.each([null,{}, {card,action:"confirm",token:"bad",weeks:2},{card,action:"preview",weeks:2.5},{card,action:"preview",weeks:0}])("refuses malformed pause input %j",async body=>{
 expect((await pause(request(body))).status).toBe(400);expect(f.preview).not.toHaveBeenCalled();expect(f.confirm).not.toHaveBeenCalled();
});
it("returns date labels and an opaque token without private provider or delivery data",async()=>{
 const response=await pause(request({card,action:"preview",weeks:2,year:1900,owner:"other",subscription:"foreign",delivery:"fake"}));
 const body=await response.json();expect(response.status).toBe(200);expect(body.remaining).toBe(3);expect(body.charge).toBe("December 1, 2026");
 expect(JSON.stringify(body)).not.toContain("private");expect(JSON.stringify(body)).not.toContain("sub_");expect(f.preview.mock.calls[0].slice(0,3)).toEqual(["parent",card,2]);
});
it("confirms only the signed-in parent's card and opaque token",async()=>{
 await pause(request({card,action:"confirm",weeks:2,token,customer:"foreign",parent:"foreign"}));expect(f.confirm.mock.calls[0].slice(0,4)).toEqual(["parent",card,2,token]);
});
it("restarts with server terms and leaves a pending operation visible",async()=>{
 await restart(request({card,action:"confirm",token,price:0,trial_days:30}));expect(f.restart).toHaveBeenCalledWith("parent",card,token);
 f.restart.mockResolvedValue({ok:false,error:"unconfirmed"});expect((await restart(request({card,action:"confirm",token}))).status).toBe(409);
 f.confirm.mockResolvedValue({ok:false,error:"pending"});expect((await pause(request({card,action:"confirm",weeks:2,token}))).status).toBe(409);
});
it("maps another family's row to not found",async()=>{
 f.preview.mockResolvedValue({ok:false,error:"not_found"});f.restart.mockResolvedValue({ok:false,error:"not_found"});
 expect((await pause(request({card,action:"preview",weeks:1}))).status).toBe(404);expect((await restart(request({card,action:"preview"}))).status).toBe(404);
});
