import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({ session: vi.fn(), stripe: vi.fn(), end: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/admin-store", () => ({ adminSession: f.session }));
vi.mock("@/lib/stripe", () => ({ stripe: f.stripe, endStuckPlanStart: f.end }));
import { POST } from "./route";

const id = "00000000-0000-4000-8000-000000000001";
const request = (body: unknown = { generation: 2, checkedStripe: true }, headers: Record<string, string> = { origin: "https://example.test", "content-type": "application/json" }) =>
  new Request(`https://example.test/api/admin/cards/${id}/plan-start`, { method: "POST", headers, body: JSON.stringify(body) });
const context = { params: Promise.resolve({ id }) };

beforeEach(() => {
  vi.resetAllMocks();
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: f.read };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  f.read.mockResolvedValue({ data: { id, stripe_customer_id: "cus_1" }, error: null });
  f.session.mockResolvedValue({ userId: "admin-1", db: { rpc: () => chain } });
  f.stripe.mockReturnValue({ provider: "fake" });
  f.end.mockResolvedValue({ ok: true });
});

it("closes the start of the generation the admin saw, as that admin", async () => {
  const res = await POST(request(), context);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(f.end).toHaveBeenCalledExactlyOnceWith({ provider: "fake" }, { cardSetup: id, customer: "cus_1", generation: 2, admin: "admin-1" });
});

it("calls nothing for anyone who is not an admin, or from another site", async () => {
  f.session.mockResolvedValue(null);
  expect((await POST(request(), context)).status).toBe(404);
  f.session.mockResolvedValue({ userId: "admin-1", db: {} });
  expect((await POST(request(undefined, { origin: "https://other.test", "content-type": "application/json" }), context)).status).toBe(403);
  expect(f.end).not.toHaveBeenCalled();
});

it("needs the admin's check and a generation in the request", async () => {
  for (const body of [{ generation: 2 }, { generation: 2, checkedStripe: false }, { checkedStripe: true }, { generation: 0, checkedStripe: true }, { generation: "2", checkedStripe: true }]) {
    expect((await POST(request(body), context)).status).toBe(400);
  }
  expect(f.end).not.toHaveBeenCalled();
});

it("answers why it did not close, and a failed Stripe read closes nothing", async () => {
  f.end.mockResolvedValue({ ok: false, error: "landed" });
  const res = await POST(request(), context);
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ ok: false, error: "landed" });
  f.end.mockRejectedValue(new Error("Stripe down"));
  const down = await POST(request(), context);
  expect(down.status).toBe(502);
  expect(await down.json()).toEqual({ ok: false, error: "unavailable" });
});
