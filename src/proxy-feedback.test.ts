import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({deleting:false}));
vi.mock("@/lib/supabase-auth",()=>({adminClient:()=>null}));
vi.mock("@/lib/scan-pages-access",()=>({scanPagesAccess:async()=>false}));
vi.mock("@supabase/ssr",()=>({createServerClient:()=>({auth:{getClaims:async()=>({data:{claims:{sub:"00000000-0000-4000-8000-000000000001"}},error:null})},rpc:async()=>({data:state.deleting?"queued":null,error:null})})}));
import { proxy } from "./proxy";
const request=(path:string,locked:boolean)=>new NextRequest(`https://unicalearning.com${path}`,{headers:locked?{Cookie:"unica_desk=00000000-0000-4000-8000-000000000001.00000000-0000-4000-8000-000000000002"}:{}});
beforeEach(()=>{state.deleting=false;});
it("blocks Feedback page and POST paths under the existing Desk lock",async()=>{
  const page=await proxy(request("/account/feedback",true));expect(page.status).toBe(307);expect(page.headers.get("location")).toBe("https://unicalearning.com/tutor");
  const api=await proxy(request("/api/account/feedback",true));expect(api.status).toBe(423);expect(await api.json()).toEqual({ok:false,error:"desk_open"});
});
it("keeps Feedback private and uncached; queued deletion refuses both paths",async()=>{
  const page=await proxy(request("/account/feedback",false));expect(page.headers.get("x-middleware-next")).toBe("1");expect(page.headers.get("cache-control")).toContain("no-store");
  state.deleting=true;expect((await proxy(request("/account/feedback",false))).headers.get("location")).toBe("https://unicalearning.com/family-deleted");
  const api=await proxy(request("/api/account/feedback",false));expect(api.status).toBe(410);
});
