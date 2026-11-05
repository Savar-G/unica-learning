import Stripe from "stripe";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readChildPlan } from "@/lib/plan-state";
import { memoryPlanStates } from "@/lib/plan-state-memory";

const f = vi.hoisted(() => ({ seams: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/plan-state-server", () => ({ livePlanStates: f.seams }));
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
  now: () => new Date("2026-11-04T12:00:00.000Z"),
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
