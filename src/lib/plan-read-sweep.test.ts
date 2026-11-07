import { describe, expect, it, vi } from "vitest";
import { sweepPlanReads, type SweepTime } from "@/lib/card-reconcile";
import type { PlanSubscription } from "@/lib/parent-plan";
import { applyPlanEvent, type PlanRead } from "@/lib/plan-state";
import { memoryPlanStates } from "@/lib/plan-state-memory";

// What this proves: which rows the re-read takes and in what order (the database's rule, also in supabase/tests/child_plan_states.sql),
// its time limits with slow fakes, and that a failed read changes nothing. It sends nothing: the sweep has no email seam at all.

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 7, 12);
const active: PlanSubscription = { status: "active", cancelAtPeriodEnd: false, trialEnd: null, periodEnd: 1_900_000_000, cents: 7999, created: 1_700_000_000 };
const over: PlanSubscription = { ...active, status: "canceled", endedAt: 1_795_000_000 };
const cancelling: PlanSubscription = { ...active, cancelAtPeriodEnd: true };
const trial: PlanSubscription = { ...active, status: "trialing", trialEnd: 1_900_000_000 };
const past: PlanSubscription = { ...active, status: "past_due" };
const paused: PlanSubscription = { ...active, status: "paused" };

/** Families with a stored row each, all last read `age` ago. */
async function families(kinds: Record<string, PlanSubscription[]>, { age = 2 * DAY } = {}) {
  let clock = NOW - age;
  const names = Object.keys(kinds);
  const states = memoryPlanStates({
    cards: names.map((n) => ({ parentId: `p-${n}`, childId: n, customer: `cus_${n}`, cardSaved: true })),
    subscriptions: Object.fromEntries(names.map((n) => [`cus_${n}`, kinds[n]])),
    now: () => clock,
  });
  for (const [i, n] of names.entries()) {
    clock = NOW - age + i;
    await applyPlanEvent({ id: `evt_${n}`, type: "customer.subscription.updated", created: 1_700_000_000, customer: `cus_${n}` }, states);
  }
  clock = NOW;
  return { states, tick: (ms: number) => { clock += ms; } };
}
const time = (over: Partial<SweepTime> = {}): SweepTime => ({ now: () => Date.now(), startBy: Date.now() + 1000 * 60, ...over });
const stored = (states: Awaited<ReturnType<typeof families>>["states"], child: string) => states.rows.find((r) => r.childId === child)!;

describe("which rows the re-read takes", () => {
  it("only free_month, paying and ending, and only when not read for 24 hours", async () => {
    const { states } = await families({ a: [active], b: [trial], c: [cancelling], d: [over], e: [past], f: [paused], g: [] });
    const due = await states.reads.duePlanReads(100);
    expect(due.map((r: PlanRead) => r.childId)).toEqual(["a", "b", "c"]);
    expect(due[0]).toMatchObject({ parentId: "p-a", customer: "cus_a", kind: "paying", eventAt: new Date(1_700_000_000_000).toISOString() });
    const fresh = await families({ a: [active] }, { age: DAY - 1000 });
    expect(await fresh.states.reads.duePlanReads(100)).toEqual([]);
    const exactly = await families({ a: [active] }, { age: DAY + 1 });
    expect(await exactly.states.reads.duePlanReads(100)).toHaveLength(1);
  });

  it("a row read leaves the list for 24 hours, whatever wrote it", async () => {
    const { states, tick } = await families({ a: [active], b: [active] });
    const sweep = await sweepPlanReads(states.reads, states, time());
    expect(sweep).toEqual({ due: 2, read: 2, changed: 0, failed: 0, outOfTime: false });
    expect(await states.reads.duePlanReads(100)).toEqual([]);
    tick(DAY + 1);
    expect(await states.reads.duePlanReads(100)).toHaveLength(2);
    await applyPlanEvent({ id: "evt_late", type: "invoice.paid", created: 1_800_000_000, customer: "cus_a" }, states);
    expect((await states.reads.duePlanReads(100)).map((r: PlanRead) => r.childId)).toEqual(["b"]);
  });
});

describe("one run", () => {
  it("closes a plan whose ended event was lost, and counts the change", async () => {
    const { states } = await families({ a: [active], b: [active] });
    states.subscriptions.cus_a = [over];
    expect(await sweepPlanReads(states.reads, states, time())).toEqual({ due: 2, read: 2, changed: 1, failed: 0, outOfTime: false });
    expect(stored(states, "a").plan.kind).toBe("ended");
    expect(stored(states, "b").plan.kind).toBe("paying");
  });

  it("a failed read stays as it is and is tried in a later run, behind the rows not yet tried", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { states, tick } = await families({ a: [active], b: [active], c: [active] });
    const before = { ...stored(states, "a") };
    const plan = states.provider.plan;
    states.provider.plan = async (customer) => {
      if (customer === "cus_a") throw new Error("Stripe does not answer for this one");
      return plan(customer);
    };
    expect(await sweepPlanReads(states.reads, states, time(), 1)).toEqual({ due: 1, read: 0, changed: 0, failed: 1, outOfTime: false });
    expect(stored(states, "a")).toEqual(before);
    tick(900_000);
    expect((await states.reads.duePlanReads(100)).map((r: PlanRead) => r.childId)).toEqual(["b", "c", "a"]);
    tick(900_000);
    states.provider.plan = plan;
    states.subscriptions.cus_a = [over];
    expect(await sweepPlanReads(states.reads, states, time())).toMatchObject({ read: 3, failed: 0 });
    expect(stored(states, "a").plan.kind).toBe("ended");
  });

  it("Stripe down everywhere closes no paying family", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { states } = await families({ a: [active], b: [trial], c: [cancelling] });
    const before = states.rows.map((r) => ({ ...r }));
    const writes = states.writes;
    states.fail.plan = new Error("Stripe down");
    expect(await sweepPlanReads(states.reads, states, time())).toMatchObject({ due: 3, read: 0, failed: 3 });
    expect(states.rows).toEqual(before);
    expect(states.writes).toBe(writes);
  });

  it("no new row starts after the time to start, and the next run goes on from there", async () => {
    let at = 0;
    const { states, tick } = await families({ a: [active], b: [active], c: [active] });
    const plan = states.provider.plan;
    states.provider.plan = async (customer) => { at += 30_000; return plan(customer); };
    expect(await sweepPlanReads(states.reads, states, { now: () => at, startBy: 25_000 })).toEqual({ due: 3, read: 1, changed: 0, failed: 0, outOfTime: true });
    tick(900_000);
    expect((await states.reads.duePlanReads(100)).map((r: PlanRead) => r.childId)).toEqual(["b", "c"]);
  });

  it("a row that hangs: the signal ends the run at once, the row stays, and the next run reads the others first", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { states, tick } = await families({ a: [active], b: [active], c: [active] });
    const before = { ...stored(states, "a") };
    const plan = states.provider.plan;
    states.provider.plan = (customer) => (customer === "cus_a" ? new Promise(() => {}) : plan(customer));
    const end = new AbortController();
    const run = sweepPlanReads(states.reads, states, time({ signal: end.signal }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    end.abort(new Error("The sweep's time is over"));
    expect(await run).toEqual({ due: 3, read: 0, changed: 0, failed: 1, outOfTime: true });
    expect(stored(states, "a")).toEqual(before);
    tick(900_000);
    expect((await states.reads.duePlanReads(100)).map((r: PlanRead) => r.childId)).toEqual(["b", "c", "a"]);
    // The row goes on hanging, for run after run. The others are still read.
    const next = await sweepPlanReads(states.reads, states, time(), 2);
    expect(next).toMatchObject({ read: 2, failed: 0 });
    expect(stored(states, "b").readOrder).toBeGreaterThan(before.readOrder);
  });

  it("the signal also ends a list read that hangs, and a failed note does not stop the read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { states } = await families({ a: [active] });
    const end = new AbortController();
    const hanging = { ...states.reads, duePlanReads: () => new Promise<PlanRead[]>(() => {}) };
    const run = sweepPlanReads(hanging, states, time({ signal: end.signal }));
    end.abort(new Error("over"));
    await expect(run).rejects.toThrow();
    const failing = { ...states.reads, notePlanReadTried: async () => { throw new Error("note failed"); } };
    expect(await sweepPlanReads(failing, states, time())).toMatchObject({ read: 1, failed: 0 });
  });

  it("a customer with no card setup is a failure, not a read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { states } = await families({ a: [active] });
    const due = await states.reads.duePlanReads(1);
    const gone = { ...states.reads, duePlanReads: async () => due.map((r: PlanRead) => ({ ...r, customer: "cus_none" })) };
    expect(await sweepPlanReads(gone, states, time())).toMatchObject({ read: 0, failed: 1 });
  });
});
