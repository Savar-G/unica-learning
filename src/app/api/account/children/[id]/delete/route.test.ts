import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ user: vi.fn(), access: vi.fn(), service: vi.fn(), request: vi.fn(), run: vi.fn(), prove: vi.fn(), plans: vi.fn(), stripe: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ sessionClient: async () => ({ auth: { getUser: f.user } }), adminClient: f.service }));
vi.mock("@/lib/parent-dashboard-access", () => ({ parentDashboardAccess: f.access }));
vi.mock("@/lib/family-delete-code", () => ({ codeProof: f.prove }));
vi.mock("@/lib/family-delete", () => ({ requestFamilyDelete: f.request }));
vi.mock("@/lib/family-delete-server", () => ({ supabaseDeleteCodes: () => "codes" }));
vi.mock("@/lib/child-delete-server", () => ({ childDeleteStore: () => "store", childDeletePlans: f.plans, runChildDeletion: f.run }));
vi.mock("@/lib/family-time-server", () => ({ familyRetryTime: async () => ({ retryWhen: "after 4 PM" }) }));
vi.mock("@/lib/stripe", () => ({ stripe: f.stripe }));
import { POST } from "./route";
const parent = "11111111-1111-4111-8111-111111111111", child = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ id: child }) };
const req = (headers: Record<string,string> = {}, body: unknown = { code: "123456", confirm: "DELETE" }) => new Request(`https://unica.test/api/account/children/${child}/delete`, { method: "POST", headers: { origin: "https://unica.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); f.user.mockResolvedValue({ data: { user: { id: parent, email: "parent@example.invalid", email_confirmed_at: "yes" } } });
  f.access.mockResolvedValue(true); f.service.mockReturnValue({ db: true }); f.stripe.mockReturnValue({ test: true });
  f.request.mockResolvedValue({ ok: true, plansStopped: 1 }); f.run.mockResolvedValue("deleted");
});
it("checks origin, JSON, session and the dashboard switch before any delete", async () => {
  expect((await POST(req({ origin: "https://other.test" }),context)).status).toBe(403);
  expect((await POST(req({ "content-type": "text/plain" }),context)).status).toBe(415);
  f.access.mockResolvedValue(false); expect((await POST(req(),context)).status).toBe(404);
  f.user.mockResolvedValue({ data: { user: null } }); expect((await POST(req(),context)).status).toBe(401);
  expect(f.request).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled();
});
it("binds the shared code to the session and URL child, and keeps the parent session", async () => {
  const response = await POST(req({}, { code: "123456", confirm: "DELETE", parent: "attacker", child: "sibling" }),context);
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true, plansStopped: 1, state: "deleted" });
  expect(f.prove).toHaveBeenCalledWith("codes",parent,"parent@example.invalid",{ child });
  expect(f.run).toHaveBeenCalledWith({ db: true },parent,child);
});
it.each(["wrong_code","busy","plan_start","unavailable","not_finished"])("does not remove rows or files after %s", async error => {
  f.request.mockResolvedValue({ ok:false,error,attemptsLeft:4,plansStopped:0 });
  expect((await POST(req(),context)).status).toBeGreaterThanOrEqual(400); expect(f.run).not.toHaveBeenCalled();
});
it("returns 409 for an unresolved plan start and preserves the stopped-plan count", async () => {
  const result = { ok: false, error: "plan_start", plansStopped: 1 };
  f.request.mockResolvedValue(result);
  const response = await POST(req(), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual(result);
  expect(f.run).not.toHaveBeenCalled();
});
it("reports a saved request without claiming the files are gone after a worker failure", async () => {
  f.run.mockRejectedValue(Error("files failed"));
  const response=await POST(req(),context);
  expect(await response.json()).toEqual({ ok:true,plansStopped:1,state:"pending" });
});
it("refuses an invalid child and an unconfirmed address", async () => {
  expect((await POST(req(),{ params: Promise.resolve({id:"invalid"}) })).status).toBe(404);
  f.user.mockResolvedValue({data:{user:{id:parent,email:"parent@example.invalid"}}});
  expect((await POST(req(),context)).status).toBe(401); expect(f.request).not.toHaveBeenCalled();
});

it("checks the browser origin against the actual Host when the server normalizes its URL", async () => {
  expect((await POST(req({ host: "preview.unica.test", origin: "https://preview.unica.test" }),context)).status).toBe(200);
  expect((await POST(req({ host: "preview.unica.test", origin: "https://other.test" }),context)).status).toBe(403);
});
