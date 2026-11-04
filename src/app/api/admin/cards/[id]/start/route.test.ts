import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({ session: vi.fn(), receipt: vi.fn(), books: vi.fn(), stripe: vi.fn(), start: vi.fn() }));
vi.mock("@/lib/admin-store", () => ({ adminSession: f.session }));
vi.mock("@/lib/workbook-delivery-store", () => ({ workbookDeliveryStore: () => ({ receipt: f.receipt }) }));
vi.mock("@/lib/workbook-store", () => ({ workbookStore: () => ({ childWorkbooks: f.books }) }));
vi.mock("@/lib/stripe", () => ({ stripe: f.stripe, startPlan: f.start }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
vi.mock("@/lib/workbook-email-server", () => ({ sendPlanStartEmail: vi.fn() }));
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
  f.stripe.mockReturnValue({ provider: "fake" }); f.start.mockResolvedValue({ ok: true, subscription: "sub", firstChargeAt: "2026-12-02" });
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
