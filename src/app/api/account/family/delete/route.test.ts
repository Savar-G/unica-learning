import { beforeEach, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  user: vi.fn(), access: vi.fn(), admin: vi.fn(), stripe: vi.fn(), request: vi.fn(), finish: vi.fn(), alert: vi.fn(), after: vi.fn(),
  signOut: vi.fn(), prover: vi.fn(), retry: vi.fn(), cookieDelete: vi.fn(), cookieSet: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: f.after }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  getAll: () => [{ name: "sb-project-auth-token.0" }, { name: "sb-project-auth-token.1" }, { name: "theme" }],
  delete: f.cookieDelete, set: f.cookieSet,
}) }));
vi.mock("@/lib/supabase-auth", () => ({ sessionClient: async () => ({ auth: { getUser: f.user, signOut: f.signOut } }), adminClient: f.admin }));
vi.mock("@/lib/parent-dashboard-access", () => ({ parentDashboardAccess: f.access }));
vi.mock("@/lib/stripe", () => ({ stripe: f.stripe }));
vi.mock("@/lib/desk-server", () => ({ passwordProver: f.prover }));
vi.mock("@/lib/family-time-server", () => ({ familyRetryTime: f.retry }));
vi.mock("@/lib/family-delete", async (original) => ({ ...(await original<typeof import("@/lib/family-delete")>()), requestFamilyDelete: f.request }));
vi.mock("@/lib/family-delete-server", () => ({ supabaseDeleteStore: () => "store", stripeFamilyPlans: () => "plans", finishFamilyDelete: f.finish, familyDeleteAlert: f.alert }));
import { POST } from "./route";

const parent = "11111111-1111-4111-8111-111111111111";
const body = { password: "secret", confirm: "DELETE" };
const request = (value: unknown = body, headers: Record<string, string> = {}) => new Request("https://unica.test/api/account/family/delete", {
  method: "POST", headers: { origin: "https://unica.test", "content-type": "application/json", ...headers }, body: typeof value === "string" ? value : JSON.stringify(value),
});

beforeEach(() => {
  vi.resetAllMocks();
  f.user.mockResolvedValue({ data: { user: { id: parent, email: "parent@example.invalid" } } });
  f.access.mockResolvedValue(true);
  f.admin.mockReturnValue({ db: true });
  f.stripe.mockReturnValue({ s: true });
  f.prover.mockReturnValue("prover");
  f.signOut.mockResolvedValue({ error: null });
  f.request.mockResolvedValue({ ok: true, plansStopped: 2 });
  f.retry.mockResolvedValue({ retryWhen: "at 3:15 PM", retryTime: "3:15 PM" });
});

it("refuses another site, a form post and a signed-out parent before any step", async () => {
  expect((await POST(request(body, { origin: "https://other.test" }))).status).toBe(403);
  expect((await POST(request(body, { "content-type": "text/plain" }))).status).toBe(415);
  f.user.mockResolvedValue({ data: { user: null } });
  expect((await POST(request())).status).toBe(401);
  expect(f.request).not.toHaveBeenCalled();
});
it("does not exist for a family the dashboard's switch does not open to", async () => {
  f.access.mockResolvedValue(false);
  expect((await POST(request())).status).toBe(404);
  expect(f.request).not.toHaveBeenCalled();
});
it("refuses a body that is not JSON", async () => {
  expect((await POST(request("{not json"))).status).toBe(400);
  expect(f.request).not.toHaveBeenCalled();
});
it("answers 503 with no Stripe key or database key, before any step", async () => {
  f.stripe.mockReturnValue(null);
  expect((await POST(request())).status).toBe(503);
  f.stripe.mockReturnValue({ s: true });
  f.admin.mockReturnValue(null);
  expect((await POST(request())).status).toBe(503);
  expect(f.request).not.toHaveBeenCalled();
});
it("takes the parent and the email from the session, whatever the body says", async () => {
  await POST(request({ ...body, parent: "22222222-2222-4222-8222-222222222222", email: "other@example.invalid" }));
  expect(f.prover).toHaveBeenCalledWith(parent, "parent@example.invalid");
  expect(f.request.mock.calls[0][0]).toBe(parent);
  expect(f.request.mock.calls[0][2]).toBe("prover");
});
it.each([
  [{ ok: false, error: "invalid" }, 400],
  [{ ok: false, error: "wrong_password", attemptsLeft: 3 }, 403],
  [{ ok: false, error: "protected" }, 403],
  [{ ok: false, error: "not_found" }, 404],
  [{ ok: false, error: "busy" }, 409],
  [{ ok: false, error: "unavailable" }, 503],
  [{ ok: false, error: "not_finished", plansStopped: 0 }, 502],
])("keeps the session and starts no deletion for %j", async (result, status) => {
  f.request.mockResolvedValue(result);
  const response = await POST(request());
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual(result);
  expect(f.signOut).not.toHaveBeenCalled();
  expect(f.after).not.toHaveBeenCalled();
});
it("gives the lock's end in family time", async () => {
  f.request.mockResolvedValue({ ok: false, error: "locked", retryAt: 1234 });
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ ok: false, error: "locked", retryAt: 1234, retryWhen: "at 3:15 PM", retryTime: "3:15 PM" });
});
it("answers 503 and changes nothing more when a step throws", async () => {
  f.request.mockRejectedValue(new Error("Database down"));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ ok: false, error: "unavailable" });
  expect(f.after).not.toHaveBeenCalled();
});
it("tells the team when plans stopped and the family was not queued, so the parent's retry is not the only record", async () => {
  f.request.mockResolvedValue({ ok: false, error: "not_finished", plansStopped: 1 });
  await POST(request());
  expect(f.after).toHaveBeenCalledTimes(1);
  await f.after.mock.calls[0][0]();
  expect(f.alert).toHaveBeenCalledWith(parent, { plansStopped: 1, state: "not_queued" });
  expect(f.finish).not.toHaveBeenCalled();
});
it("after the request, ends the session on every device, clears its cookies and runs the deletion after the answer", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(f.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "global" });
  expect(f.cookieDelete.mock.calls.flat()).toEqual(["sb-project-auth-token.0", "sb-project-auth-token.1"]);
  expect(f.cookieSet).toHaveBeenCalledWith({ name: "unica_last_child", value: "", path: "/account", maxAge: 0 });
  expect(f.cookieSet).toHaveBeenCalledWith(expect.objectContaining({ name: "unica_plans_stopped", value: "1", path: "/family-deleted", httpOnly: true }));
  expect(f.finish).not.toHaveBeenCalled();
  await f.after.mock.calls[0][0]();
  expect(f.finish).toHaveBeenCalledExactlyOnceWith(parent, 2);
});
it("still answers ok and still runs the deletion when the sign-out fails: the request is saved", async () => {
  f.signOut.mockRejectedValue(new Error("Auth down"));
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(f.after).toHaveBeenCalledTimes(1);
  expect(f.cookieDelete).toHaveBeenCalled();
});
it("checks the error Supabase returns from the sign-out, logs it and tries once more", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  f.signOut.mockResolvedValueOnce({ error: { code: "unexpected_failure", status: 500 } }).mockResolvedValueOnce({ error: null });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(f.signOut).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledWith("[family-delete] sign-out failed", "unexpected_failure");
  log.mockRestore();
});
it("keeps the request and claims no sign-out when both tries return an error", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  f.signOut.mockResolvedValue({ error: { status: 500 } });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(f.signOut).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledTimes(2);
  expect(f.after).toHaveBeenCalledTimes(1);
  log.mockRestore();
});

it("answers 409 for an open plan start, and tells the team, whether or not plans stopped", async () => {
  f.after.mockImplementation((work: () => unknown) => work());
  for (const plansStopped of [0, 2]) {
    f.alert.mockClear();
    f.request.mockResolvedValue({ ok: false, error: "plan_start", plansStopped });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "plan_start", plansStopped });
    expect(f.alert).toHaveBeenCalledExactlyOnceWith(parent, { plansStopped, state: "plan_start" });
  }
  expect(f.finish).not.toHaveBeenCalled();
  expect(f.signOut).not.toHaveBeenCalled();
});
