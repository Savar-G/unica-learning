import { beforeEach, expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({db:vi.fn(),retry:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase-auth",()=>({adminClient:f.db}));
vi.mock("@/lib/child-delete-server",()=>({retryChildDeletions:f.retry}));
import { GET } from "./route";
beforeEach(()=>{vi.stubEnv("CRON_SECRET","test-secret");f.db.mockReturnValue({});f.retry.mockResolvedValue({deleted:1,pending:0,failed:0});});
it("requires the cron secret before reading or changing a family",async()=>{
 expect((await GET(new Request("https://unica.test/api/child-deletions"))).status).toBe(401);
 expect(f.retry).not.toHaveBeenCalled();
});
it("retries only durable child requests and reports failures",async()=>{
 const result=await GET(new Request("https://unica.test/api/child-deletions",{headers:{authorization:"Bearer test-secret"}}));
 expect(await result.json()).toEqual({ok:true,deleted:1,pending:0,failed:0});
});
