import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryFeedbackStore } from "@/lib/feedback-memory";
import type { FeedbackInput } from "@/lib/feedback";
const auth = vi.hoisted(() => ({ parent: null as string | null, cookie: undefined as string | undefined, rpc: vi.fn(), service: true }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => auth.cookie ? { value: auth.cookie } : undefined }) }));
vi.mock("@/lib/desk-server", () => ({ sameOrigin: (r: Request) => !r.headers.get("origin") || r.headers.get("origin") === new URL(r.url).origin }));
vi.mock("@/lib/supabase-auth", () => ({ parentId: async () => auth.parent, sessionClient: async () => ({}), adminClient: () => auth.service ? { rpc: auth.rpc } : null }));
import { POST } from "./route";
const parent = randomUUID(), child = randomUUID(), other = randomUUID();
let store: MemoryFeedbackStore;
const body = (extra = {}) => ({ requestId: randomUUID(), product: "other", text: "A message", ...extra });
const post = (data: unknown, headers = {}) => POST(new Request("https://unicalearning.com/api/account/feedback", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(data) }));
beforeEach(() => {
  store = new MemoryFeedbackStore(() => 1000000);store.parents.add(parent);store.children.set(child,parent);
  auth.parent = parent; auth.cookie = undefined;auth.service = true;
  auth.rpc.mockReset().mockImplementation(async (name, args) => {
    expect(name).toBe("submit_feedback");
    const input: FeedbackInput = { requestId: args.p_request, childId: args.p_child, product: args.p_product, text: args.p_text, source: args.p_source };
    return { data: await store.submit(args.p_parent, input), error: null };
  });
});
it("requires a session, and never trusts an actor in the body", async () => {
  auth.parent = null; expect((await post(body({ parentId: parent }))).status).toBe(401);expect(auth.rpc).not.toHaveBeenCalled();
  auth.parent = parent; expect((await post(body({ parentId: other }))).status).toBe(200);
  expect(store.rows[0].parent).toBe(parent);
});
it("refuses a missing product before calling the store",async()=>{
  const response=await post(body({product:""}));expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ok:false,error:"no_product"});expect(auth.rpc).not.toHaveBeenCalled();expect(store.rows).toHaveLength(0);
});
it("refuses open-Desk direct POSTs without touching the store", async () => {
  auth.cookie = `${parent}.${child}`;
  const response = await post(body());expect(response.status).toBe(423);expect(await response.json()).toEqual({ ok: false, error: "desk_open" });expect(auth.rpc).not.toHaveBeenCalled();
});
it("refuses cross-origin, non-JSON, malformed JSON and oversized requests", async () => {
  expect((await post(body(), {origin:"https://evil.test"})).status).toBe(403);
  expect((await post(body(), {"content-type":"text/plain"})).status).toBe(415);
  expect((await POST(new Request("https://unicalearning.com/api/account/feedback", {method:"POST",headers:{"content-type":"application/json"},body:"{"}))).status).toBe(400);
  expect((await post(body({text:"x".repeat(70001)}))).status).toBe(413);expect(auth.rpc).not.toHaveBeenCalled();
});
it("enforces text validation, ownership, deletion and rate outcomes through the real service adapter", async () => {
  expect((await post(body({text:" "}))).status).toBe(400);
  expect((await post(body({text:"x".repeat(5001)}))).status).toBe(400);
  expect((await post(body({childId:other}))).status).toBe(403);
  const b=body(); expect((await post(b)).status).toBe(200);expect((await post(b)).status).toBe(200);
  expect((await post({...b,text:"Changed"})).status).toBe(409);
  for(let i=0;i<4;i++)expect((await post(body())).status).toBe(200);
  expect((await post(body())).status).toBe(429);
  store.deletingParents.add(parent);expect((await post(body())).status).toBe(410);
});
it.each([{data:{ok:true},error:null},{data:null,error:{code:"connection"}},{data:"unknown",error:null}])("fails closed on a malformed or failed RPC answer", async answer => {
  auth.rpc.mockResolvedValue(answer);const response=await post(body());expect(response.status).toBe(503);expect(await response.json()).toEqual({ok:false,error:"unavailable"});
});
