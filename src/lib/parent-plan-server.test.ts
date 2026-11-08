import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const list = vi.fn();
vi.mock("@/lib/stripe", () => ({ stripe: () => ({ subscriptions: { list } }), cancelPlan: vi.fn() }));
vi.mock("@/lib/supabase-auth", () => ({
  adminClient: () => ({
    from: () => {
      const rows = {
        data: [{ id: "card-1", stripe_customer_id: "cus_1", child: { first_name: "Iris", created_at: "2026-11-01T00:00:00.000Z" } }],
        error: null,
      };
      const chain = { select: () => chain, eq: () => chain, not: () => Promise.resolve(rows) };
      return chain;
    },
  }),
}));
import { familyPlans } from "@/lib/parent-plan-server";

const subscription = (id: string, status: string, created: number) => ({
  id, status, created, cancel_at_period_end: false, trial_end: null, ended_at: status === "canceled" ? 1_800_000_500 : null,
  items: { data: [{ current_period_end: 1_800_000_000, price: { unit_amount: 7999 } }] },
}) as unknown as Stripe.Subscription;

// The current plan page reads through this function.
describe("the plan page's read of a family's plans", () => {
  beforeEach(() => {
    list.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows the older running plan of a customer with a full page of newer cancelled plans", async () => {
    const newer = Array.from({ length: 100 }, (_, i) => subscription(`sub_new_${i}`, "canceled", 2000 - i));
    list.mockResolvedValueOnce({ data: newer, has_more: true }).mockResolvedValueOnce({ data: [subscription("sub_old", "active", 1)], has_more: false });
    expect(await familyPlans("parent-1")).toEqual([
      { cardId: "card-1", childName: "Iris", plan: { kind: "paying", nextCharge: new Date(1_800_000_000 * 1000).toISOString(), monthly: 79.99 } },
    ]);
  });

  it("shows unknown when a later page fails, not the plan of the first page", async () => {
    list.mockResolvedValueOnce({ data: [subscription("sub_new", "canceled", 2)], has_more: true }).mockRejectedValueOnce(new Error("Stripe down"));
    expect(await familyPlans("parent-1")).toEqual([{ cardId: "card-1", childName: "Iris", plan: { kind: "unknown" } }]);
  });
});
