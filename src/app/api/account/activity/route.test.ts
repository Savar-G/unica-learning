import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ consent: "granted", parent: "00000000-0000-4000-8000-000000000001" as string | null, rpc: vi.fn(), admin: true }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "unica_activity_consent" ? { value: state.consent } : undefined }) }));
vi.mock("@/lib/supabase-auth", () => ({ sessionClient: async () => ({}), parentId: async () => state.parent, adminClient: () => ({ rpc: state.rpc }) }));
vi.mock("@/lib/admin-store", () => ({ adminSession: async () => state.admin ? { userId: "00000000-0000-4000-8000-000000000009" } : null }));
import { POST } from "./route";
import { POST as notePost } from "@/app/api/admin/customer-activity/route";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const payload = () => ({ event: "scanner_opened", page: "scanner", request: id(3), child: id(2), book: null });
const request = (body: unknown, path = "account/activity", headers: Record<string, string> = {}) => new Request(`https://unicalearning.com/api/${path}`, { method: "POST", headers: { origin: "https://unicalearning.com", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); state.consent = "granted"; state.parent = id(1); state.admin = true; state.rpc.mockResolvedValue({ data: "saved", error: null }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("rejects consent withdrawal, missing auth and cross-origin requests before any write", async () => {
  state.consent = "denied"; expect((await POST(request(payload()))).status).toBe(403);
  state.consent = "granted"; state.parent = null; expect((await POST(request(payload()))).status).toBe(401);
  state.parent = id(1); expect((await POST(request(payload(), undefined, { origin: "https://other.test" }))).status).toBe(403);
  expect(state.rpc).not.toHaveBeenCalled();
});
it("rejects oversize and malformed events and fabricated completions", async () => {
  expect((await POST(request({ ...payload(), event: "completed" }))).status).toBe(400);
  expect((await POST(request({ ...payload(), rawError: "x".repeat(1001) }))).status).toBe(413);
  expect((await POST(request(payload(), undefined, { "content-type": "text/plain" }))).status).toBe(415);
  expect(state.rpc).not.toHaveBeenCalled();
});
it("derives family and actor from the authenticated session and leaves ownership to atomic admission", async () => {
  expect((await POST(request(payload()))).status).toBe(204);
  expect(state.rpc).toHaveBeenCalledWith("record_customer_activity", expect.objectContaining({ p_parent: id(1), p_actor: id(1), p_child: id(2), p_note: null }));
  state.rpc.mockResolvedValue({ data: "refused", error: null }); expect((await POST(request(payload()))).status).toBe(403);
  state.rpc.mockResolvedValue({ data: "rate_limited", error: null }); expect((await POST(request(payload()))).status).toBe(429);
  state.rpc.mockResolvedValue({ data: "duplicate", error: null }); expect((await POST(request(payload()))).status).toBe(204);
  state.rpc.mockRejectedValue(new Error("offline")); expect((await POST(request(payload()))).status).toBe(503);
});
it("requires an admin for a private note and never accepts a client actor", async () => {
  const note = { parent: id(1), child: id(2), request: id(3), note: "Called the family." };
  state.admin = false; expect((await notePost(request(note, "admin/customer-activity"))).status).toBe(404);
  state.admin = true; expect((await notePost(request({ ...note, actor: id(8) }, "admin/customer-activity"))).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
  expect((await notePost(request(note, "admin/customer-activity"))).status).toBe(200);
  expect(state.rpc).toHaveBeenCalledWith("record_customer_activity", expect.objectContaining({ p_actor: id(9), p_event: "contact_note", p_note: note.note }));
});
