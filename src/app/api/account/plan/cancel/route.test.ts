import { beforeEach, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ parent: vi.fn(), cancel: vi.fn(), alert: vi.fn(), after: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: f.after }));
vi.mock("@/lib/supabase-auth", () => ({ sessionClient: async () => ({}), parentId: f.parent }));
vi.mock("@/lib/parent-plan-server", () => ({ cancelFamilyPlan: f.cancel, planCancelledAlert: f.alert }));
import { POST } from "./route";

const card = "11111111-1111-4111-8111-111111111111";
const request = (body: unknown, headers: Record<string, string> = {}) => new Request("https://unica.test/api/account/plan/cancel", {
  method: "POST", headers: { origin: "https://unica.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.resetAllMocks();
  f.parent.mockResolvedValue("parent-1");
  f.cancel.mockResolvedValue({ ok: true, changed: true, endsAt: "2026-12-05T00:00:00.000Z", child: "Asha" });
});

it("refuses another site, a form post and a signed-out parent before any cancel", async () => {
  expect((await POST(request({ card }, { origin: "https://other.test" }))).status).toBe(403);
  expect((await POST(request({ card }, { "content-type": "text/plain" }))).status).toBe(415);
  f.parent.mockResolvedValue(null);
  expect((await POST(request({ card }))).status).toBe(401);
  expect(f.cancel).not.toHaveBeenCalled();
});
it.each([{}, { card: "not-a-uuid" }, { card: 7 }, null])("refuses a body without a card setup id", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(f.cancel).not.toHaveBeenCalled();
});
it("cancels for the signed-in parent, whatever else the body says", async () => {
  const response = await POST(request({ card: card.toUpperCase(), customer: "cus_other", parent: "parent-2" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, endsAt: "2026-12-05T00:00:00.000Z" });
  expect(f.cancel).toHaveBeenCalledWith("parent-1", card);
});
it("answers 404 for another family's card", async () => {
  f.cancel.mockResolvedValue({ ok: false, error: "not_found" });
  expect((await POST(request({ card }))).status).toBe(404);
});
it("tells the team once: on the change and not on a second press", async () => {
  await POST(request({ card }));
  expect(f.after).toHaveBeenCalledTimes(1);
  await f.after.mock.calls[0][0]();
  expect(f.alert).toHaveBeenCalledWith(card, "Asha", "2026-12-05T00:00:00.000Z");
  f.cancel.mockResolvedValue({ ok: true, changed: false, endsAt: null, child: "Asha" });
  await POST(request({ card }));
  expect(f.after).toHaveBeenCalledTimes(1);
});
it("does not claim a cancel when Stripe fails", async () => {
  f.cancel.mockRejectedValue(Error("Stripe down"));
  const response = await POST(request({ card }));
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ ok: false, error: "failed" });
});
