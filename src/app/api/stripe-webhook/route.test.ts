import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryBilling } from "@/lib/billing-memory";
import { readChildPlan } from "@/lib/plan-state";
import { memoryPlanStates } from "@/lib/plan-state-memory";

const f = vi.hoisted(() => ({ seams: vi.fn(), cards: vi.fn(), referrals: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/plan-state-server", () => ({ livePlanStates: f.seams }));
vi.mock("@/lib/referral-server", () => ({ REFERRAL_EVENTS: new Set(["invoice.created","invoice.paid"]), handleReferralEvent: f.referrals }));
vi.mock("@/lib/card-sweep-server", () => ({ liveCardChecks: f.cards }));
import { POST } from "./route";

const SECRET = "whsec_test_secret";
const key = { parentId: "parent-1", childId: "child-1" };
const created = 1_799_000_000;

const payload = (over: Record<string, unknown> = {}, object: Record<string, unknown> = { customer: "cus_1" }) => JSON.stringify({
  id: "evt_1", object: "event", type: "customer.subscription.updated", created, livemode: false, data: { object }, ...over,
});
const signed = (body: string, secret = SECRET) => new Request("https://unica.test/api/stripe-webhook", {
  method: "POST", body, headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload: body, secret }) },
});
const family = () => memoryPlanStates({
  cards: [{ ...key, customer: "cus_1", cardSaved: true }],
  subscriptions: { cus_1: [{ status: "past_due", cancelAtPeriodEnd: false, trialEnd: null, periodEnd: 1_800_000_000, cents: 7999, created: 1 }] },
});

let states: ReturnType<typeof family>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  states = family();
  f.seams.mockReturnValue(states);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("answers 503 without the secret, and reads nothing", async () => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
  expect((await POST(signed(payload()))).status).toBe(503);
  expect(f.seams).not.toHaveBeenCalled();
});

it("refuses a wrong signature, a changed body and no signature, and stores nothing", async () => {
  expect((await POST(signed(payload(), "whsec_other"))).status).toBe(400);
  const changed = new Request("https://unica.test/api/stripe-webhook", {
    method: "POST", body: payload({ id: "evt_changed" }),
    headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload: payload(), secret: SECRET }) },
  });
  expect((await POST(changed)).status).toBe(400);
  expect((await POST(new Request("https://unica.test/api/stripe-webhook", { method: "POST", body: payload() }))).status).toBe(400);
  expect(states.rows).toEqual([]);
  expect(f.seams).not.toHaveBeenCalled();
});

it("refuses a signature from outside the time limit", async () => {
  const body = payload();
  const late = new Request("https://unica.test/api/stripe-webhook", {
    method: "POST", body,
    headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 }) },
  });
  expect((await POST(late)).status).toBe(400);
  expect(states.rows).toEqual([]);
});

it.each(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"])(
  "stores the plan from a signed %s", async (type) => {
    const response = await POST(signed(payload({ type })));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(await readChildPlan(key, states.store)).toEqual({ kind: "payment_failed" });
    expect(states.rows[0]).toMatchObject({ eventId: "evt_1", eventAt: new Date(created * 1000).toISOString() });
  });

it("takes a type the site does not keep, and reads nothing", async () => {
  expect((await POST(signed(payload({ type: "customer.created" })))).status).toBe(204);
  expect(f.seams).not.toHaveBeenCalled();
  expect(states.rows).toEqual([]);
});

it("takes a duplicate and an older event, and stores each once", async () => {
  expect((await POST(signed(payload()))).status).toBe(204);
  expect((await POST(signed(payload()))).status).toBe(204);
  expect(states.writes).toBe(1);
  expect((await POST(signed(payload({ id: "evt_old", created: created - 100 })))).status).toBe(204);
  expect(states.rows[0]).toMatchObject({ eventId: "evt_1" });
});

it("takes a customer with no card setup and logs it, so Stripe does not send it again", async () => {
  const warn = vi.mocked(console.warn);
  expect((await POST(signed(payload({}, { customer: "cus_old_booking" })))).status).toBe(204);
  expect(states.rows).toEqual([]);
  expect(warn.mock.calls.flat().join(" ")).toContain("cus_old_booking");
});

it("takes and logs an event with no customer", async () => {
  expect((await POST(signed(payload({}, { customer: null })))).status).toBe(204);
  expect(vi.mocked(console.warn)).toHaveBeenCalled();
  expect(states.rows).toEqual([]);
});

it("reads the customer from an object as well as from an id", async () => {
  expect((await POST(signed(payload({}, { customer: { id: "cus_1" } })))).status).toBe(204);
  expect(states.rows).toHaveLength(1);
});

it("answers 503 when the database or Stripe key is missing, so Stripe sends the event again", async () => {
  f.seams.mockReturnValue(null);
  expect((await POST(signed(payload()))).status).toBe(503);
});

it("answers 500 when Stripe or the store fails, so Stripe sends the event again", async () => {
  states.fail.plan = new Error("Stripe down");
  expect((await POST(signed(payload()))).status).toBe(500);
  expect(states.rows).toEqual([]);
  states.fail.plan = undefined;
  states.fail.save = new Error("family_unavailable");
  expect((await POST(signed(payload()))).status).toBe(500);
  expect(states.rows).toEqual([]);
  states.fail.save = undefined;
  expect((await POST(signed(payload()))).status).toBe(204);
  expect(states.rows).toHaveLength(1);
});

describe("the card comparison", () => {
  const withRow = async () => {
    const b = memoryBilling({ children: [{ parentId: "parent-1", childId: "child-1", firstName: "Leah", card: { id: "card-1", customer: "cus_1", saved: true } }], subscriptions: [{ id: "sub_1", customer: "cus_1", status: "active", defaultCard: "pm_stray" }], customerDefaults: { cus_1: "pm_new" } });
    await b.store.recordCard("card-1", { parentId: "parent-1", session: "cs_1", created: 1, paymentMethod: "pm_new" });
    await b.store.settleCard("card-1", "cs_1", true);
    const announced: string[] = [];
    f.cards.mockReturnValue({ rows: b.store, stripe: b.provider, canWrite: () => true, announcePlan: async (_row: unknown, plan: { id: string }) => { announced.push(plan.id); } });
    return { b, announced };
  };

  it.each(["customer.subscription.created", "customer.subscription.updated"])("%s brings the plan to the row's card, and keeps the plan state's work and its answer", async (type) => {
    const { b } = await withRow();
    expect((await POST(signed(payload({ type })))).status).toBe(204);
    expect(b.subscriptions[0].defaultCard).toBe("pm_new");
    expect(states.rows).toHaveLength(1);
  });

  it.each(["customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"])("%s does not", async (type) => {
    const { b } = await withRow();
    expect((await POST(signed(payload({ type })))).status).toBe(204);
    expect(b.subscriptions[0].defaultCard).toBe("pm_stray");
    expect(f.cards).not.toHaveBeenCalled();
  });

  it("the event of a correction finds nothing to change", async () => {
    const { b } = await withRow();
    await POST(signed(payload()));
    const reads = b.calls.state;
    const writes = b.calls.setDefault;
    expect((await POST(signed(payload({ id: "evt_2" })))).status).toBe(204);
    expect(b.calls.state).toBe(reads + 1);
    expect(b.calls.setDefault).toBe(writes);
  });

  it("does nothing for a customer with no row", async () => {
    const b = memoryBilling({ children: [] });
    f.cards.mockReturnValue({ rows: b.store, stripe: b.provider, canWrite: () => true, announcePlan: async () => {} });
    expect((await POST(signed(payload()))).status).toBe(204);
    expect(b.calls.state).toBe(0);
  });

  it("answers 204 when Stripe fails, as the row is flagged and the sweep comes back", async () => {
    const { b } = await withRow();
    b.fail.setDefault = new Error("Stripe down");
    expect((await POST(signed(payload()))).status).toBe(204);
    expect(b.updates.get("child-1")).toMatchObject({ needsRepair: true });
    expect(states.rows).toHaveLength(1);
  });

  it("answers 500 when the row cannot be read, and still stores the plan state", async () => {
    const { b } = await withRow();
    b.fail.rows = new Error("Database down");
    expect((await POST(signed(payload()))).status).toBe(500);
    expect(states.rows).toHaveLength(1);
  });

  it("still compares the card when the plan state fails, and answers 500", async () => {
    const { b } = await withRow();
    states.fail.plan = new Error("Stripe down");
    expect((await POST(signed(payload()))).status).toBe(500);
    expect(b.subscriptions[0].defaultCard).toBe("pm_new");
  });
});


it("verifies the signature before referral work and retries a referral failure while preserving plan work", async () => {
  expect((await POST(signed(payload({ type: "invoice.paid" }), "wrong"))).status).toBe(400);
  expect(f.referrals).not.toHaveBeenCalled();
  f.referrals.mockRejectedValue(new Error("Referral store unavailable"));
  expect((await POST(signed(payload({ type: "invoice.paid" })))).status).toBe(500);
  expect(states.rows).toHaveLength(1);
});
it("retries a draft-invoice referral failure without requiring a plan event", async () => {
  f.referrals.mockRejectedValue(new Error("Referral provider unavailable"));
  expect((await POST(signed(payload({ type: "invoice.created" })))).status).toBe(500);
  expect(f.seams).not.toHaveBeenCalled();
});
