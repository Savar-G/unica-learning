import { beforeEach, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ user: vi.fn(), access: vi.fn(), admin: vi.fn(), ask: vi.fn(), retry: vi.fn(), after: vi.fn(), alert: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: f.after }));
vi.mock("@/lib/supabase-auth", () => ({ sessionClient: async () => ({ auth: { getUser: f.user } }), adminClient: f.admin }));
vi.mock("@/lib/parent-dashboard-access", () => ({ parentDashboardAccess: f.access, planManagementAccess: f.access }));
vi.mock("@/lib/family-time-server", () => ({ familyRetryTime: f.retry }));
vi.mock("@/lib/email-delivery", () => ({ sendEmail: vi.fn(), emailConfigProblem: () => null }));
vi.mock("@/lib/family-delete-code", () => ({ requestDeleteCode: f.ask }));
vi.mock("@/lib/family-delete-server", () => ({ supabaseDeleteStore: () => "store", supabaseDeleteCodes: () => "codes", familyDeleteAlert: f.alert }));
import { POST } from "./route";

const parent = "11111111-1111-4111-8111-111111111111";
const request = (value: unknown = {}, headers: Record<string, string> = {}) => new Request("https://unica.test/api/account/family/delete/code", {
  method: "POST", headers: { origin: "https://unica.test", "content-type": "application/json", ...headers }, body: JSON.stringify(value),
});

beforeEach(() => {
  vi.resetAllMocks();
  f.user.mockResolvedValue({ data: { user: { id: parent, email: "parent@example.invalid", email_confirmed_at: "2026-11-01T00:00:00Z" } } });
  f.access.mockResolvedValue(true);
  f.admin.mockReturnValue({ db: true });
  f.ask.mockResolvedValue({ ok: true, sentTo: "parent@example.invalid", unsure: false });
  f.retry.mockResolvedValue({ retryWhen: "at 3:15 PM", retryTime: "3:15 PM" });
});

it("refuses another site, a form post and a signed-out parent before any step", async () => {
  expect((await POST(request({}, { origin: "https://other.test" }))).status).toBe(403);
  expect((await POST(request({}, { "content-type": "text/plain" }))).status).toBe(415);
  f.user.mockResolvedValue({ data: { user: null } });
  expect((await POST(request())).status).toBe(401);
  expect(f.ask).not.toHaveBeenCalled();
});
it("does not exist for a family the dashboard's switch does not open to", async () => {
  f.access.mockResolvedValue(false);
  expect((await POST(request())).status).toBe(404);
  expect(f.ask).not.toHaveBeenCalled();
});
it("answers 503 with no database key", async () => {
  f.admin.mockReturnValue(null);
  expect((await POST(request())).status).toBe(503);
  expect(f.ask).not.toHaveBeenCalled();
});
it("takes the address from the session's user, whatever the body says", async () => {
  const response = await POST(request({ email: "attacker@example.invalid", parent: "22222222-2222-4222-8222-222222222222" }));
  expect(response.status).toBe(200);
  expect(f.ask.mock.calls[0][0]).toBe(parent);
  expect(f.ask.mock.calls[0][1]).toEqual({ email: "parent@example.invalid", confirmed: true });
  expect(JSON.stringify(f.ask.mock.calls[0])).not.toContain("attacker");
});
it("tells the module when the address is not confirmed", async () => {
  f.user.mockResolvedValue({ data: { user: { id: parent, email: "parent@example.invalid", email_confirmed_at: null } } });
  await POST(request());
  expect(f.ask.mock.calls[0][1]).toEqual({ email: "parent@example.invalid", confirmed: false });
});
it("never gives the code to the browser", async () => {
  const response = await POST(request());
  expect(await response.json()).toEqual({ ok: true, sentTo: "parent@example.invalid", unsure: false });
});
it("refuses a code for an unresolved plan start and tells the team", async () => {
  f.ask.mockResolvedValue({ ok: false, error: "plan_start" });
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ ok: false, error: "plan_start" });
  expect(f.after).toHaveBeenCalledTimes(1);
  await f.after.mock.calls[0][0]();
  expect(f.alert).toHaveBeenCalledWith(parent, { plansStopped: 0, state: "plan_start" });
});
it.each([
  [{ ok: false, error: "no_confirmed_email" }, 409],
  [{ ok: false, error: "protected" }, 403],
  [{ ok: false, error: "not_found" }, 404],
  [{ ok: false, error: "busy" }, 409],
  [{ ok: false, error: "email_failed" }, 502],
  [{ ok: false, error: "unavailable" }, 503],
])("answers %j", async (result, status) => {
  f.ask.mockResolvedValue(result);
  const response = await POST(request());
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual(result);
});
it.each(["too_many", "locked"])("gives the end of %s in family time", async (error) => {
  f.ask.mockResolvedValue({ ok: false, error, retryAt: 1234 });
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ ok: false, error, retryAt: 1234, retryWhen: "at 3:15 PM", retryTime: "3:15 PM" });
});
it("answers 503 when a step throws", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  f.ask.mockRejectedValue(new Error("Database down"));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ ok: false, error: "unavailable" });
  log.mockRestore();
});
