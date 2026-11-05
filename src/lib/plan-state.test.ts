import { describe, expect, it } from "vitest";
import type { KnownPlan, PlanSubscription } from "@/lib/parent-plan";
import { applyPlanEvent, fillChildPlan, planColumns, planFromColumns, readChildPlan, type PlanEvent } from "@/lib/plan-state";
import { memoryPlanStates } from "@/lib/plan-state-memory";

const key = { parentId: "parent-1", childId: "child-1" };
const card = { ...key, customer: "cus_1", cardSaved: true };
const NOW = new Date("2026-11-04T12:00:00.000Z");
const FIRST_CHARGE = 1_800_000_000;
const when = (seconds: number) => new Date(seconds * 1000).toISOString();

const sub = (over: Partial<PlanSubscription> = {}): PlanSubscription => ({
  status: "trialing", cancelAtPeriodEnd: false, trialEnd: FIRST_CHARGE, periodEnd: FIRST_CHARGE, cents: 7999, created: 1_797_000_000, ...over,
});
const event = (over: Partial<PlanEvent> = {}): PlanEvent => ({
  id: "evt_1", type: "customer.subscription.updated", created: 1_799_000_000, customer: "cus_1", ...over,
});
/** A family with one saved card, and Stripe's subscriptions for it. */
const family = (subscriptions: PlanSubscription[] = [sub()]) =>
  memoryPlanStates({ cards: [card], subscriptions: { cus_1: subscriptions }, now: () => NOW });

const KINDS: [KnownPlan, PlanSubscription[]][] = [
  [{ kind: "not_started" }, []],
  [{ kind: "free_month", firstCharge: when(FIRST_CHARGE), monthly: 79.99 }, [sub()]],
  [{ kind: "paying", nextCharge: when(FIRST_CHARGE), monthly: 79.99 }, [sub({ status: "active", trialEnd: null })]],
  [{ kind: "payment_failed" }, [sub({ status: "past_due" })]],
  [{ kind: "ending", endsOn: when(FIRST_CHARGE), free: true }, [sub({ cancelAtPeriodEnd: true })]],
  [{ kind: "ended" }, [sub({ status: "canceled" })]],
  [{ kind: "ended", endedOn: when(FIRST_CHARGE) }, [sub({ status: "canceled", endedAt: FIRST_CHARGE })]],
];

describe("a Stripe event stores the child's plan", () => {
  it.each(KINDS)("stores %j", async (plan, subscriptions) => {
    const states = family(subscriptions);
    expect(await applyPlanEvent(event(), states)).toBe("stored");
    expect(await readChildPlan(key, states.store)).toEqual(plan);
    expect(states.rows[0]).toMatchObject({ childId: "child-1", parentId: "parent-1", eventId: "evt_1", eventAt: when(1_799_000_000) });
  });

  it.each(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"] as const)(
    "%s stores what Stripe says now, so the zero invoice of a free month does not read as paying", async (type) => {
      const states = family([sub()]);
      expect(await applyPlanEvent(event({ type }), states)).toBe("stored");
      expect((await readChildPlan(key, states.store)).kind).toBe("free_month");
    });

  it("a new event replaces the row with Stripe's new answer", async () => {
    const states = family([sub()]);
    await applyPlanEvent(event(), states);
    states.subscriptions.cus_1 = [sub({ status: "past_due" })];
    expect(await applyPlanEvent(event({ id: "evt_2", type: "invoice.payment_failed", created: 1_799_000_100 }), states)).toBe("stored");
    expect(await readChildPlan(key, states.store)).toEqual({ kind: "payment_failed" });
    expect(states.rows).toHaveLength(1);
  });
});

describe("the order of events", () => {
  it("an older event never replaces a newer one, and asks Stripe nothing", async () => {
    const states = family([sub({ status: "past_due" })]);
    await applyPlanEvent(event({ id: "evt_new", created: 200 }), states);
    states.subscriptions.cus_1 = [sub()];
    const reads = states.calls.plan;
    expect(await applyPlanEvent(event({ id: "evt_old", created: 100 }), states)).toBe("older");
    expect(states.calls.plan).toBe(reads);
    expect(states.rows[0]).toMatchObject({ eventId: "evt_new", eventAt: when(200) });
    expect(await readChildPlan(key, states.store)).toEqual({ kind: "payment_failed" });
  });

  it("an older event that was already reading Stripe when the newer one was stored changes nothing", async () => {
    const states = family([sub()]);
    const read = states.hold("plan");
    const older = applyPlanEvent(event({ id: "evt_old", created: 100 }), states);
    await read.reached;
    states.subscriptions.cus_1 = [sub({ status: "past_due" })];
    await applyPlanEvent(event({ id: "evt_new", created: 200 }), states);
    read.release();
    expect(await older).toBe("older");
    expect(states.rows[0]).toMatchObject({ eventId: "evt_new" });
    expect(await readChildPlan(key, states.store)).toEqual({ kind: "payment_failed" });
  });

  it("two events of one second both count, and the earlier read does not replace the later one", async () => {
    const clock = [new Date("2026-11-04T12:00:01.000Z"), new Date("2026-11-04T12:00:02.000Z")];
    const states = memoryPlanStates({ cards: [card], subscriptions: { cus_1: [sub()] }, now: () => clock.shift()! });
    const read = states.hold("plan");
    const first = applyPlanEvent(event({ id: "evt_a", created: 100 }), states);
    await read.reached;
    states.subscriptions.cus_1 = [sub({ status: "past_due" })];
    expect(await applyPlanEvent(event({ id: "evt_b", created: 100 }), states)).toBe("stored");
    read.release();
    expect(await first).toBe("older");
    expect(await readChildPlan(key, states.store)).toEqual({ kind: "payment_failed" });
  });

  it("stores the later read of two events of one second that arrive in turn", async () => {
    const clock = [new Date("2026-11-04T12:00:01.000Z"), new Date("2026-11-04T12:00:02.000Z")];
    const states = memoryPlanStates({ cards: [card], subscriptions: { cus_1: [sub()] }, now: () => clock.shift()! });
    await applyPlanEvent(event({ id: "evt_a", created: 100 }), states);
    states.subscriptions.cus_1 = [sub({ status: "past_due" })];
    expect(await applyPlanEvent(event({ id: "evt_b", type: "invoice.payment_failed", created: 100 }), states)).toBe("stored");
    expect(await readChildPlan(key, states.store)).toEqual({ kind: "payment_failed" });
  });

  it("stores a duplicate event once", async () => {
    const states = family();
    expect(await applyPlanEvent(event(), states)).toBe("stored");
    expect(await applyPlanEvent(event(), states)).toBe("duplicate");
    expect(states.writes).toBe(1);
    expect(states.calls.plan).toBe(1);
  });

  it("stores two copies of an event that arrive together once", async () => {
    const states = family();
    const outcomes = await Promise.all([applyPlanEvent(event(), states), applyPlanEvent(event(), states)]);
    expect(outcomes.sort()).toEqual(["duplicate", "stored"]);
    expect(states.writes).toBe(1);
  });
});

describe("what an event cannot use", () => {
  it("ignores a customer with no card setup, such as an old booking", async () => {
    const states = family();
    expect(await applyPlanEvent(event({ customer: "cus_old_booking" }), states)).toBe("no_match");
    expect(states.rows).toEqual([]);
    expect(states.calls.plan).toBe(0);
  });

  it("ignores an event with no customer", async () => {
    const states = family();
    expect(await applyPlanEvent(event({ customer: null }), states)).toBe("no_match");
    expect(states.calls.owner).toBe(0);
  });

  it("stores nothing when Stripe cannot answer, keeps the row, and throws so Stripe sends the event again", async () => {
    const states = family();
    await applyPlanEvent(event(), states);
    states.fail.plan = new Error("Stripe down");
    await expect(applyPlanEvent(event({ id: "evt_2", created: 1_799_000_100 }), states)).rejects.toThrow("Stripe down");
    expect(states.rows[0]).toMatchObject({ eventId: "evt_1" });
    expect((await readChildPlan(key, states.store)).kind).toBe("free_month");
  });

  it("throws when the store refuses the write", async () => {
    const states = family();
    states.fail.save = new Error("family_unavailable");
    await expect(applyPlanEvent(event(), states)).rejects.toThrow("family_unavailable");
  });
});

describe("reading a child's plan", () => {
  it("reads unknown with no row, without asking Stripe", async () => {
    const states = family();
    expect(await readChildPlan(key, states.store)).toEqual({ kind: "unknown" });
    expect(states.calls.plan).toBe(0);
  });

  it("reads unknown when the store fails", async () => {
    const states = family();
    await applyPlanEvent(event(), states);
    states.fail.load = new Error("Database down");
    expect(await readChildPlan(key, states.store)).toEqual({ kind: "unknown" });
  });

  it("reads another family's child as unknown", async () => {
    const states = family();
    await applyPlanEvent(event(), states);
    expect(await readChildPlan({ parentId: "parent-2", childId: "child-1" }, states.store)).toEqual({ kind: "unknown" });
  });
});

describe("filling a missing row from Stripe", () => {
  it.each(KINDS)("fills %j", async (plan, subscriptions) => {
    const states = family(subscriptions);
    expect(await fillChildPlan(key, states)).toEqual(plan);
    expect(await readChildPlan(key, states.store)).toEqual(plan);
    expect(states.rows[0]).toMatchObject({ eventAt: null, eventId: null, readAt: NOW.toISOString() });
  });

  it("does not ask Stripe when the row is there", async () => {
    const states = family();
    await applyPlanEvent(event(), states);
    const reads = states.calls.plan;
    expect((await fillChildPlan(key, states)).kind).toBe("free_month");
    expect(states.calls.plan).toBe(reads);
  });

  it("stays unknown and stores nothing when Stripe cannot answer", async () => {
    const states = family();
    states.fail.plan = new Error("Stripe down");
    expect(await fillChildPlan(key, states)).toEqual({ kind: "unknown" });
    expect(states.rows).toEqual([]);
  });

  it("stays unknown when the store cannot write", async () => {
    const states = family();
    states.fail.save = new Error("family_unavailable");
    expect(await fillChildPlan(key, states)).toEqual({ kind: "unknown" });
  });

  it("stays unknown, and asks Stripe nothing, without a saved card", async () => {
    const states = memoryPlanStates({ cards: [{ ...card, cardSaved: false }], subscriptions: { cus_1: [] }, now: () => NOW });
    expect(await fillChildPlan(key, states)).toEqual({ kind: "unknown" });
    expect(states.calls.plan).toBe(0);
    expect(states.rows).toEqual([]);
  });

  it("stays unknown for a child with no card setup and for another family's child", async () => {
    const states = family();
    expect(await fillChildPlan({ parentId: "parent-1", childId: "child-2" }, states)).toEqual({ kind: "unknown" });
    expect(await fillChildPlan({ parentId: "parent-2", childId: "child-1" }, states)).toEqual({ kind: "unknown" });
    expect(states.calls.plan).toBe(0);
    expect(states.rows).toEqual([]);
  });

  it("an event stored during the fill stays: the fill never replaces a row", async () => {
    const states = family([sub()]);
    const read = states.hold("plan");
    const filling = fillChildPlan(key, states);
    await read.reached;
    states.subscriptions.cus_1 = [sub({ status: "past_due" })];
    await applyPlanEvent(event(), states);
    read.release();
    expect(await filling).toEqual({ kind: "payment_failed" });
    expect(states.rows).toHaveLength(1);
    expect(states.rows[0]).toMatchObject({ eventId: "evt_1" });
  });

  it("any later event replaces a filled row, with Stripe's answer at that time", async () => {
    const states = family([sub()]);
    await fillChildPlan(key, states);
    states.subscriptions.cus_1 = [sub({ status: "past_due" })];
    expect(await applyPlanEvent(event({ created: 1 }), states)).toBe("stored");
    expect(await readChildPlan(key, states.store)).toEqual({ kind: "payment_failed" });
  });
});

describe("the row's columns", () => {
  it.each(KINDS)("keep %j", (plan) => {
    expect(planFromColumns(planColumns(plan))).toEqual(plan);
  });

  it("keep the monthly price in whole cents", () => {
    expect(planColumns({ kind: "paying", nextCharge: null, monthly: 79.99 }).monthly_cents).toBe(7999);
    expect(planFromColumns({ kind: "paying", next_charge_at: null, ends_at: null, monthly_cents: 7999, ending_free: false }))
      .toEqual({ kind: "paying", nextCharge: null, monthly: 79.99 });
  });

  it("read a free month with no first charge as unknown", () => {
    expect(planFromColumns({ kind: "free_month", next_charge_at: null, ends_at: null, monthly_cents: 7999, ending_free: false })).toEqual({ kind: "unknown" });
  });
});
