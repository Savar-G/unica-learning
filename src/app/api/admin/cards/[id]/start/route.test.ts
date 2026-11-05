import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({ session: vi.fn(), receipt: vi.fn(), books: vi.fn(), stripe: vi.fn(), start: vi.fn(), admin: vi.fn(), hold: vi.fn(), release: vi.fn(), confirm: vi.fn() }));
vi.mock("@/lib/admin-store", () => ({ adminSession: f.session }));
vi.mock("@/lib/workbook-delivery-store", () => ({ workbookDeliveryStore: () => ({ receipt: f.receipt }) }));
vi.mock("@/lib/workbook-store", () => ({ workbookStore: () => ({ childWorkbooks: f.books }) }));
vi.mock("@/lib/stripe", () => ({ stripe: f.stripe, startPlan: f.start }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: f.admin }));
vi.mock("@/lib/workbook-email-server", () => ({ sendPlanStartEmail: f.confirm }));
vi.mock("@/lib/family-deletion-store", () => ({ holdPlanStart: f.hold, endCardOperation: f.release }));
import { POST } from "./route";
const id = "00000000-0000-4000-8000-000000000001";
const book = { id, childId: "child", parentId: "parent", number: 1, status: "shipped" };
const receipt = { workbookId: id, childId: "child", parentId: "parent", number: 1 };
function request(confirmed = true) { return new Request(`https://example.test/api/admin/cards/${id}/start`, { method: "POST", headers: { origin: "https://example.test", "content-type": "application/json" }, body: JSON.stringify({ deliveryConfirmed: confirmed }) }); }
const context = { params: Promise.resolve({ id }) };
beforeEach(() => {
  vi.resetAllMocks();
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id, child_id: "child", parent_id: "parent", card_saved_at: "2026-10-01", stripe_customer_id: "customer", price: 79.99, plan: "one" } }) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
  f.session.mockResolvedValue({ db: { rpc: () => chain } });
  f.books.mockResolvedValue([book]); f.receipt.mockResolvedValue(receipt);
  f.stripe.mockReturnValue({ provider: "fake" }); f.start.mockResolvedValue({ ok: true, subscription: "sub", firstChargeAt: "2026-12-02", generation: 1 });
  f.confirm.mockResolvedValue({ status: "sent", emailId: "email-1" });
  f.admin.mockReturnValue({ service: true }); f.hold.mockResolvedValue("held"); f.release.mockResolvedValue(undefined);
});
it("holds the family before Stripe, so a plan cannot start under a deletion, and lets go after a known result", async () => {
  expect((await POST(request(), context)).status).toBe(200);
  expect(f.hold).toHaveBeenCalledExactlyOnceWith({ service: true }, "parent", id);
  expect(f.hold.mock.invocationCallOrder[0]).toBeLessThan(f.start.mock.invocationCallOrder[0]);
  expect(f.release).toHaveBeenCalledExactlyOnceWith({ service: true }, id);
  f.release.mockClear();
  f.start.mockResolvedValue({ ok: false, error: "already" });
  expect((await POST(request(), context)).status).toBe(409);
  expect(f.release).toHaveBeenCalledExactlyOnceWith({ service: true }, id);
});
it("starts no plan for a family that asked for deletion", async () => {
  f.hold.mockResolvedValue("fenced");
  const response = await POST(request(), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ ok: false, error: "family_unavailable" });
  expect(f.start).not.toHaveBeenCalled();
  expect(f.release).not.toHaveBeenCalled();
});
it("starts no plan when the hold cannot be taken", async () => {
  f.hold.mockRejectedValue(new Error("Card operation unavailable"));
  expect((await POST(request(), context)).status).toBe(502);
  f.hold.mockResolvedValue("held");
  f.admin.mockReturnValue(null);
  expect((await POST(request(), context)).status).toBe(503);
  expect(f.start).not.toHaveBeenCalled();
});
it("lets go of the hold when startPlan answers unconfirmed: a timeout takes this return path, and the plan start record, not the hold, then refuses a deletion", async () => {
  f.start.mockResolvedValue({ ok: false, error: "unconfirmed" });
  const response = await POST(request(), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ ok: false, error: "unconfirmed" });
  expect(f.release).toHaveBeenCalledExactlyOnceWith({ service: true }, id);
});
it("keeps the hold when startPlan throws: its work stopped at a point it cannot name, and a retry with the same key ends the hold", async () => {
  f.start.mockRejectedValue(new Error("Store down"));
  expect((await POST(request(), context)).status).toBe(502);
  expect(f.release).not.toHaveBeenCalled();
  f.start.mockResolvedValue({ ok: true, subscription: "sub", firstChargeAt: "2026-12-02", generation: 1 });
  expect((await POST(request(), context)).status).toBe(200);
  expect(f.release).toHaveBeenCalledExactlyOnceWith({ service: true }, id);
});
it("sends the confirmation of the start's own generation", async () => {
  f.start.mockResolvedValue({ ok: true, subscription: "sub", firstChargeAt: "2026-12-02", generation: 3 });
  expect((await POST(request(), context)).status).toBe(200);
  expect(f.confirm).toHaveBeenCalledExactlyOnceWith({ service: true }, { cardId: id, generation: 3, price: 79.99, firstChargeAt: "2026-12-02", origin: "https://example.test" });
});
it("makes zero billing calls when the first receipt is absent or belongs to book 2", async () => {
  for (const value of [null, { ...receipt, number: 2 }, { ...receipt, childId: "other" }]) {
    f.receipt.mockResolvedValue(value);
    const r = await POST(request(), context);
    expect(r.status).toBe(409); expect(await r.json()).toEqual({ ok: false, error: "delivery_receipt_required" });
  }
  expect(f.stripe).not.toHaveBeenCalled(); expect(f.start).not.toHaveBeenCalled();
});
it("requires the separate existing billing confirmation even with a receipt", async () => {
  expect((await POST(request(false), context)).status).toBe(409);
  expect(f.stripe).not.toHaveBeenCalled(); expect(f.start).not.toHaveBeenCalled();
});
it("passes the existing billing parameters unchanged once workbook 1's receipt exists", async () => {
  expect((await POST(request(), context)).status).toBe(200);
  expect(f.start).toHaveBeenCalledExactlyOnceWith({ provider: "fake" }, { cardSetup: id, customer: "customer", price: 79.99, deliveryConfirmed: true });
});
it("refuses a non-admin before any billing or workbook read", async () => {
  f.session.mockResolvedValue(null);
  expect((await POST(request(), context)).status).toBe(404);
  expect(f.books).not.toHaveBeenCalled(); expect(f.stripe).not.toHaveBeenCalled();
});
