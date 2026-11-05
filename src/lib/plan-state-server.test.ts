import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";

vi.mock("server-only", () => ({}));
import { stripePlanProvider, supabasePlanStore } from "@/lib/plan-state-server";

const when = (seconds: number) => new Date(seconds * 1000).toISOString();

const subscription = (over: Partial<Stripe.Subscription> & { end?: number; cents?: number | null } = {}) => {
  const { end = 1_800_000_000, cents = 7999, ...rest } = over;
  return {
    status: "active", cancel_at_period_end: false, trial_end: null, created: 1, ended_at: null,
    items: { data: [{ current_period_end: end, price: { unit_amount: cents } }] }, ...rest,
  } as unknown as Stripe.Subscription;
};
const stripeWith = (list: ReturnType<typeof vi.fn>) => ({ subscriptions: { list } }) as unknown as Stripe;

describe("Stripe as the plan provider", () => {
  it("reads every subscription of the customer through the parent's plan rule", async () => {
    const list = vi.fn().mockResolvedValue({ data: [subscription()] });
    expect(await stripePlanProvider(stripeWith(list)).plan("cus_1")).toEqual({ kind: "paying", nextCharge: when(1_800_000_000), monthly: 79.99 });
    expect(list.mock.calls[0][0]).toMatchObject({ customer: "cus_1", status: "all" });
  });

  it("keeps the date a plan ended", async () => {
    const list = vi.fn().mockResolvedValue({ data: [subscription({ status: "canceled", ended_at: 1_800_000_500 })] });
    expect(await stripePlanProvider(stripeWith(list)).plan("cus_1")).toEqual({ kind: "ended", endedOn: when(1_800_000_500) });
  });

  it("throws when Stripe fails, and without a key", async () => {
    await expect(stripePlanProvider(stripeWith(vi.fn().mockRejectedValue(new Error("Stripe down")))).plan("cus_1")).rejects.toThrow("Stripe down");
    await expect(stripePlanProvider(null).plan("cus_1")).rejects.toThrow();
  });
});

/** The parts of a Supabase client the store uses, answering what each test sets. */
function fakeDb(answers: { card?: unknown; state?: unknown; rpc?: unknown; error?: { message: string } | null }) {
  const filters: Record<string, Record<string, unknown>> = {};
  const rpc = vi.fn(async () => ({ data: answers.rpc ?? null, error: answers.error ?? null }));
  const from = (table: string) => {
    filters[table] = {};
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => { filters[table][column] = value; return chain; },
      maybeSingle: async () => ({ data: table === "card_setups" ? answers.card ?? null : answers.state ?? null, error: answers.error ?? null }),
    };
    return chain;
  };
  return { db: { from, rpc } as unknown as SupabaseClient<Database>, rpc, filters };
}

const key = { parentId: "parent-1", childId: "child-1" };

describe("the plan state store on Supabase", () => {
  it("finds the owner of a customer and of a child", async () => {
    const row = { parent_id: "parent-1", child_id: "child-1", stripe_customer_id: "cus_1", card_saved_at: "2026-11-01T00:00:00.000Z" };
    const owner = { parentId: "parent-1", childId: "child-1", customer: "cus_1", cardSaved: true };
    const byCustomer = fakeDb({ card: row });
    expect(await supabasePlanStore(byCustomer.db).ownerOfCustomer("cus_1")).toEqual(owner);
    expect(byCustomer.filters.card_setups).toEqual({ stripe_customer_id: "cus_1" });
    const byChild = fakeDb({ card: row });
    expect(await supabasePlanStore(byChild.db).ownerOfChild(key)).toEqual(owner);
    expect(byChild.filters.card_setups).toEqual({ child_id: "child-1", parent_id: "parent-1" });
  });

  it("reads a child with no customer as no owner", async () => {
    const { db } = fakeDb({ card: { parent_id: "parent-1", child_id: "child-1", stripe_customer_id: null, card_saved_at: null } });
    expect(await supabasePlanStore(db).ownerOfChild(key)).toBeNull();
  });

  it("loads a child's row by child and parent", async () => {
    const { db, filters } = fakeDb({ state: { kind: "payment_failed", next_charge_at: null, ends_at: null, monthly_cents: null, ending_free: false, event_at: "2026-11-01T00:00:00+00:00", event_id: "evt_1" } });
    expect(await supabasePlanStore(db).load(key)).toEqual({ plan: { kind: "payment_failed" }, eventAt: "2026-11-01T00:00:00+00:00", eventId: "evt_1" });
    expect(filters.child_plan_states).toEqual({ child_id: "child-1", parent_id: "parent-1" });
  });

  it("sends one atomic write, and returns what the database decided", async () => {
    const { db, rpc } = fakeDb({ rpc: "stored" });
    const write = { plan: { kind: "free_month", firstCharge: when(1_800_000_000), monthly: 79.99 } as const, eventAt: when(100), eventId: "evt_1", readAt: when(101) };
    expect(await supabasePlanStore(db).save("cus_1", write)).toBe("stored");
    expect(rpc).toHaveBeenCalledWith("save_child_plan_state", {
      p_customer: "cus_1", p_kind: "free_month", p_next_charge_at: when(1_800_000_000), p_ends_at: null, p_monthly_cents: 7999, p_ending_free: false,
      p_event_at: when(100), p_event_id: "evt_1", p_read_at: when(101),
    });
  });

  it("throws when a read or a write fails", async () => {
    const { db } = fakeDb({ error: { message: "down" } });
    const store = supabasePlanStore(db);
    await expect(store.ownerOfCustomer("cus_1")).rejects.toThrow("down");
    await expect(store.ownerOfChild(key)).rejects.toThrow("down");
    await expect(store.load(key)).rejects.toThrow("down");
    await expect(store.save("cus_1", { plan: { kind: "ended" }, eventAt: null, eventId: null, readAt: when(1) })).rejects.toThrow("down");
  });

  it("throws on an answer it does not know", async () => {
    const { db } = fakeDb({ rpc: "something" });
    await expect(supabasePlanStore(db).save("cus_1", { plan: { kind: "ended" }, eventAt: null, eventId: null, readAt: when(1) })).rejects.toThrow();
  });
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
