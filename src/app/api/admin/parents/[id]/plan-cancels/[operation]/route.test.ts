import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({ admin: vi.fn(), check: vi.fn(), db: {}, client: {} }));
vi.mock("@/lib/admin-store", () => ({ adminSession: f.admin }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => f.db }));
vi.mock("@/lib/stripe", () => ({ stripeWithin: () => f.client }));
vi.mock("@/lib/plan-cancel-admin-server", () => ({ checkOpenCancel: f.check }));
import { POST } from "./route";
const parent = "11111111-1111-4111-8111-111111111111", operation = "22222222-2222-4222-8222-222222222222";
const request = (origin = "https://unica.test", type = "application/json") => new Request(`https://unica.test/api/admin/parents/${parent}/plan-cancels/${operation}`, { method: "POST", headers: { origin, "content-type": type }, body: "{}" });
const ctx = { params: Promise.resolve({ id: parent, operation }) };
beforeEach(() => { vi.clearAllMocks(); f.admin.mockResolvedValue({ userId: "admin" }); f.check.mockResolvedValue({ ok: true, state: "applied" }); });
it("requires a live admin, same origin, and JSON before the Stripe check", async () => {
  f.admin.mockResolvedValueOnce(null);
  expect((await POST(request(), ctx)).status).toBe(404);
  expect((await POST(request("https://other.test"), ctx)).status).toBe(403);
  expect((await POST(request("https://unica.test", "text/plain"), ctx)).status).toBe(415);
  expect(f.check).not.toHaveBeenCalled();
});
it("checks only the selected family's operation", async () => {
  const response = await POST(request(), ctx);
  expect(response.status).toBe(200);
  expect(f.check).toHaveBeenCalledWith(f.db, f.client, parent, operation);
  expect((await response.json()).message).toContain("This Cancel is closed.");
});
it("says plainly that Stripe cannot be read and nothing changed", async () => {
  f.check.mockResolvedValue({ ok: false, error: "stripe_unavailable" });
  const response = await POST(request(), ctx);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ ok: false, message: "Stripe could not be read. This Cancel is still open. Try again later." });
});
it("says that the parent can retry after a refused close", async () => {
  f.check.mockResolvedValue({ ok: true, state: "refused" });
  expect((await (await POST(request(), ctx)).json()).message).toContain("The parent can press Cancel again.");
});
it("rejects invalid operation and family identifiers", async () => {
  expect((await POST(request(), { params: Promise.resolve({ id: "bad", operation }) })).status).toBe(404);
  expect((await POST(request(), { params: Promise.resolve({ id: parent, operation: "bad" }) })).status).toBe(404);
  expect(f.check).not.toHaveBeenCalled();
});
