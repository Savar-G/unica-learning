import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ admin: true, start: vi.fn(), stripe: vi.fn(), read: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-store", () => ({ adminSession: async () => state.admin ? { db: { rpc: () => ({ select: () => ({ eq: () => ({ maybeSingle: state.read }) }) }) } } : null }));
vi.mock("@/lib/stripe", () => ({ startPlan: state.start, stripe: state.stripe }));
vi.mock("@/lib/workbook-store", () => ({ workbookStore: () => ({ childWorkbooks: async () => [{ id: "book", childId: "child", parentId: "parent", number: 1, status: "shipped" }] }) }));
vi.mock("@/lib/workbook-delivery-store", () => ({ workbookDeliveryStore: () => ({ receipt: async () => ({ workbookId: "book", childId: "child", parentId: "parent", number: 1 }) }) }));
const { POST } = await import("@/app/api/admin/cards/[id]/start/route");
const id = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id }) };
const request = (value: unknown) => new Request(`https://unica.test/api/admin/cards/${id}/start`, {
  method: "POST", headers: { origin: "https://unica.test", "content-type": "application/json" }, body: JSON.stringify(value),
});
beforeEach(() => {
  state.admin = true;
  state.start.mockReset().mockResolvedValue({ ok: true, subscription: "sub_1", firstChargeAt: "2026-12-05T00:00:00Z" });
  state.stripe.mockReset().mockReturnValue({});
  state.read.mockReset().mockResolvedValue({ data: { id, child_id: "child", parent_id: "parent", card_saved_at: "2026-11-01T00:00:00Z", stripe_customer_id: "cus_real", price: 79.99, plan: "one" }, error: null });
});

describe("the admin delivery confirmation route", () => {
  it("rejects the old bodyless shipment button before contacting Stripe", async () => {
    const old = new Request(`https://unica.test/api/admin/cards/${id}/start`, { method: "POST", headers: { origin: "https://unica.test" } });
    expect((await POST(old, ctx)).status).toBe(415);
    expect(state.stripe).not.toHaveBeenCalled();
    expect(state.start).not.toHaveBeenCalled();
  });
  it.each([{}, { deliveryConfirmed: false }, { deliveryConfirmed: "true" }, { shipped: true }, null])("requires an explicit true home-delivery confirmation", async (body) => {
    const response = await POST(request(body), ctx);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "not_delivered" });
    expect(state.stripe).not.toHaveBeenCalled();
    expect(state.start).not.toHaveBeenCalled();
  });
  it("requires an admin and the site's origin", async () => {
    state.admin = false;
    expect((await POST(request({ deliveryConfirmed: true }), ctx)).status).toBe(404);
    state.admin = true;
    const foreign = request({ deliveryConfirmed: true });
    foreign.headers.set("origin", "https://other.test");
    expect((await POST(foreign, ctx)).status).toBe(403);
    expect(state.start).not.toHaveBeenCalled();
  });
  it("starts only the stored customer's plan after delivery confirmation", async () => {
    expect((await POST(request({ deliveryConfirmed: true, customer: "cus_forged", price: 1 }), ctx)).status).toBe(200);
    expect(state.start).toHaveBeenCalledWith({}, { cardSetup: id, customer: "cus_real", price: 79.99, deliveryConfirmed: true });
  });
  it("still requires a saved card", async () => {
    state.read.mockResolvedValue({ data: { id, card_saved_at: null }, error: null });
    expect((await POST(request({ deliveryConfirmed: true }), ctx)).status).toBe(409);
    expect(state.start).not.toHaveBeenCalled();
  });
});
