import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
import { sweepPlanReads, type SweepTime } from "@/lib/card-reconcile";
import type { Database } from "@/lib/database";
import type { KnownPlan, PlanSubscription } from "@/lib/parent-plan";
import { childPlanAccess, familyHasPlanHistory, planAccessRule } from "@/lib/plan-access";
import { applyPlanEvent, applyPlanStart, PLAN_READ_KINDS, PLAN_START_READ_KINDS, planColumns, planReadMayStore, readChildPlan, rereadPlan, type PlanRead } from "@/lib/plan-state";
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
  it("free_month, paying, ending, payment_failed and paused, never ended or not_started, and only when not read for 24 hours", async () => {
    const { states } = await families({ a: [active], b: [trial], c: [cancelling], d: [over], e: [past], f: [paused], g: [] });
    const due = await states.reads.duePlanReads(100);
    expect(due.map((r: PlanRead) => r.childId)).toEqual(["a", "b", "c", "e", "f"]);
    expect(due.map((r: PlanRead) => r.kind)).toEqual(["paying", "free_month", "ending", "payment_failed", "paused"]);
    expect(due[0]).toMatchObject({ parentId: "p-a", customer: "cus_a", kind: "paying", eventAt: new Date(1_700_000_000_000).toISOString() });
    const fresh = await families({ a: [active] }, { age: DAY - 1000 });
    expect(await fresh.states.reads.duePlanReads(100)).toEqual([]);
    const exactly = await families({ a: [active] }, { age: DAY + 1 });
    expect(await exactly.states.reads.duePlanReads(100)).toHaveLength(1);
  });

  it("a row read leaves the list for 24 hours, whatever wrote it", async () => {
    const { states, tick } = await families({ a: [active], b: [active] });
    const sweep = await sweepPlanReads(states.reads, states, time());
    expect(sweep).toEqual({ due: 2, read: 2, changed: 0, unclear: 0, failed: 0, outOfTime: false });
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
    expect(await sweepPlanReads(states.reads, states, time())).toEqual({ due: 2, read: 2, changed: 1, unclear: 0, failed: 0, outOfTime: false });
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
    expect(await sweepPlanReads(states.reads, states, time(), 1)).toEqual({ due: 1, read: 0, changed: 0, unclear: 0, failed: 1, outOfTime: false });
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
    expect(await sweepPlanReads(states.reads, states, { now: () => at, startBy: 25_000 })).toEqual({ due: 3, read: 1, changed: 0, unclear: 0, failed: 0, outOfTime: true });
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
    expect(await run).toEqual({ due: 3, read: 0, changed: 0, unclear: 0, failed: 1, outOfTime: true });
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

describe("the rule for what a read of a closed row may store", () => {
  const firstCharge = "2027-01-01T00:00:00.000Z";
  const ANSWERS: [KnownPlan, boolean][] = [
    [{ kind: "paying", nextCharge: firstCharge, monthly: 79.99 }, true],
    [{ kind: "ending", endsOn: firstCharge, free: false }, true],
    [{ kind: "payment_failed" }, true],
    [{ kind: "paused", resumesOn: firstCharge, monthly: 79.99 }, true],
    [{ kind: "ended" }, true],
    [{ kind: "ended", endedOn: firstCharge }, true],
    [{ kind: "free_month", firstCharge, monthly: 79.99 }, false],
    [{ kind: "ending", endsOn: firstCharge, free: true }, false],
    [{ kind: "not_started" }, false],
  ];
  it.each(ANSWERS)("a closed row and the answer %j: %s", (plan, stored) => {
    expect(planReadMayStore("payment_failed", plan)).toBe(stored);
    expect(planReadMayStore("paused", plan)).toBe(stored);
  });
  it("covers every kind of plan Stripe can answer", () => {
    expect(new Set(ANSWERS.map(([p]) => p.kind))).toEqual(new Set(["paying", "ending", "payment_failed", "paused", "ended", "free_month", "not_started"]));
  });
  it.each(ANSWERS)("an open row keeps its behaviour for the answer %j", (plan) => {
    for (const kind of ["free_month", "paying", "ending"] as const) expect(planReadMayStore(kind, plan)).toBe(true);
  });
  it("the read's kinds are the five, without ended and not_started", () => {
    expect([...PLAN_READ_KINDS].sort()).toEqual(["ending", "free_month", "paused", "payment_failed", "paying"].sort());
  });
});

describe("a closed row, with no webhook", () => {
  afterEach(() => vi.restoreAllMocks());
  const trialing: PlanSubscription = { ...active, status: "trialing", trialEnd: 1_900_000_000 };
  const freeEnding: PlanSubscription = { ...trialing, cancelAtPeriodEnd: true };
  const paidEnding: PlanSubscription = { ...active, cancelAtPeriodEnd: true };
  type States = Awaited<ReturnType<typeof families>>["states"];
  /** The gate's own read over the memory rows, as the database would answer it. */
  const gateDb = (states: States) => {
    const rows = () => states.rows.map((r) => ({ parent_id: r.parentId, child_id: r.childId, ...planColumns(r.plan) }));
    return {
      from(table: string) {
        const filters: ((row: Record<string, unknown>) => boolean)[] = [];
        const answer = () => ({ data: table === "child_plan_states" ? rows().filter((r) => filters.every((f) => f(r))) : [], error: null });
        const chain = {
          select: () => chain,
          eq(column: string, value: unknown) { filters.push((r) => r[column] === value); return chain; },
          in: () => chain,
          limit: () => chain,
          async maybeSingle() { return { data: answer().data[0] ?? null, error: null }; },
          then<T>(resolve: (value: ReturnType<typeof answer>) => T) { return Promise.resolve(answer()).then(resolve); },
        };
        return chain;
      },
    } as unknown as SupabaseClient<Database>;
  };
  const access = (states: States, child = "a") => childPlanAccess({ parentId: `p-${child}`, childId: child }, { db: gateDb(states), now: () => NOW });
  const history = (states: States, child = "a") => familyHasPlanHistory({ parentId: `p-${child}` }, { db: gateDb(states) });
  const fields = (states: States) => { const { plan, eventAt, eventId, readOrder } = states.rows[0]; return { plan, eventAt, eventId, readOrder }; };

  it("1. payment_failed, then paid: the sweep stores paying and the gate opens", async () => {
    const { states } = await families({ a: [past] });
    expect(await access(states)).toEqual({ open: false, reason: "payment_failed" });
    states.subscriptions.cus_a = [active];
    expect(await sweepPlanReads(states.reads, states, time())).toEqual({ due: 1, read: 1, changed: 1, unclear: 0, failed: 0, outOfTime: false });
    expect(states.rows[0].plan.kind).toBe("paying");
    expect(await access(states)).toEqual({ open: true, reason: "open" });
  });

  it("2. payment_failed, still past due: stays closed, and is read again only after 24 hours", async () => {
    const { states } = await families({ a: [past] });
    expect(await sweepPlanReads(states.reads, states, time())).toEqual({ due: 1, read: 1, changed: 0, unclear: 0, failed: 0, outOfTime: false });
    expect(states.rows[0].plan.kind).toBe("payment_failed");
    expect(await access(states)).toEqual({ open: false, reason: "payment_failed" });
    expect(await states.reads.duePlanReads(100)).toEqual([]);
  });

  it("3. paused, then resumed: the gate opens", async () => {
    const { states } = await families({ a: [paused] });
    expect(await access(states)).toEqual({ open: false, reason: "paused" });
    states.subscriptions.cus_a = [active];
    expect(await sweepPlanReads(states.reads, states, time())).toMatchObject({ read: 1, changed: 1, unclear: 0 });
    expect(states.rows[0].plan.kind).toBe("paying");
    expect(await access(states)).toEqual({ open: true, reason: "open" });
  });

  it("paid and cancelling at the period's end also opens", async () => {
    const { states } = await families({ a: [past] });
    states.subscriptions.cus_a = [paidEnding];
    expect(await sweepPlanReads(states.reads, states, time())).toMatchObject({ read: 1, changed: 1, unclear: 0 });
    expect(states.rows[0].plan).toMatchObject({ kind: "ending", free: false });
    expect(await access(states)).toEqual({ open: true, reason: "ending_until_end" });
  });

  it("a closed plan that has ended stays closed, and leaves the list", async () => {
    const { states } = await families({ a: [paused] });
    states.subscriptions.cus_a = [over];
    expect(await sweepPlanReads(states.reads, states, time())).toMatchObject({ read: 1, changed: 1 });
    expect(await access(states)).toMatchObject({ open: false, reason: "ended" });
  });

  it.each([["payment_failed", past], ["paused", paused]] as const)("4. Stripe not answering, %s: nothing changes, and the gate stays closed", async (reason, sub) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { states } = await families({ a: [sub] });
    const before = fields(states), writes = states.writes;
    states.fail.plan = new Error("Stripe down");
    expect(await sweepPlanReads(states.reads, states, time())).toEqual({ due: 1, read: 0, changed: 0, unclear: 0, failed: 1, outOfTime: false });
    expect(fields(states)).toEqual(before);
    expect(states.writes).toBe(writes);
    expect(await access(states)).toEqual({ open: false, reason });
    expect(await states.reads.duePlanReads(100)).toHaveLength(1);
  });

  describe("5. the read and a webhook event", () => {
    const row = async (states: States) => (await states.reads.duePlanReads(1))[0];
    const paidEvent = (created = 1_700_000_100) => ({ id: "evt_paid", type: "invoice.paid" as const, created, customer: "cus_a" });

    it("the event takes after the read and saves first: the read's save answers older", async () => {
      const { states } = await families({ a: [past] });
      const due = await row(states);
      const hold = states.hold("plan");
      const read = rereadPlan(due, states);
      await hold.reached;
      states.subscriptions.cus_a = [active];
      expect(await applyPlanEvent(paidEvent(), states)).toBe("stored");
      hold.release();
      expect((await read).save).toBe("older");
      expect(states.rows[0]).toMatchObject({ eventId: "evt_paid", plan: { kind: "paying" } });
    });

    it("the event takes before the read and the read saves first: the event's save answers older, and the read saw it", async () => {
      const { states } = await families({ a: [past] });
      const due = await row(states);
      const hold = states.hold("plan");
      const event = applyPlanEvent(paidEvent(), states);
      await hold.reached;
      states.subscriptions.cus_a = [active];
      expect((await rereadPlan(due, states)).save).toBe("stored");
      hold.release();
      expect(await event).toBe("older");
      expect(states.rows[0].plan.kind).toBe("paying");
    });

    it("the read saves first and a later event takes after it: the event's answer stays", async () => {
      const { states } = await families({ a: [past] });
      const due = await row(states);
      states.subscriptions.cus_a = [active];
      expect((await rereadPlan(due, states)).save).toBe("stored");
      states.subscriptions.cus_a = [past];
      expect(await applyPlanEvent({ id: "evt_failed", type: "invoice.payment_failed", created: 1_700_000_200, customer: "cus_a" }, states)).toBe("stored");
      expect(states.rows[0]).toMatchObject({ eventId: "evt_failed", plan: { kind: "payment_failed" } });
    });

    it("a real event right after a re-read still applies: the re-read keeps the row's event time", async () => {
      const { states } = await families({ a: [past] });
      const eventAt = states.rows[0].eventAt;
      states.subscriptions.cus_a = [active];
      expect((await rereadPlan(await row(states), states)).save).toBe("stored");
      expect(states.rows[0].eventAt).toBe(eventAt);
      states.subscriptions.cus_a = [over];
      // One second after the row's last real event, and long before our clock's "now".
      expect(await applyPlanEvent({ id: "evt_end", type: "customer.subscription.deleted", created: 1_700_000_001, customer: "cus_a" }, states)).toBe("stored");
      expect(states.rows[0]).toMatchObject({ eventId: "evt_end", plan: { kind: "ended" } });
    });
  });

  describe.each([["payment_failed", past], ["paused", paused]] as const)("6. %s, and an answer that is not clear", (reason, sub) => {
    it.each([["free_month", trialing], ["free ending", freeEnding], ["not_started", null]] as const)("%s: nothing stored, unclear counts it, closed, and the family keeps its plan's pages", async (_, answer) => {
      const logged = [vi.spyOn(console, "info").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {})];
      const { states } = await families({ a: [sub] });
      const before = fields(states), writes = states.writes, saves = states.calls.save, takes = states.calls.take;
      states.subscriptions.cus_a = answer ? [answer] : [];
      expect(await sweepPlanReads(states.reads, states, time())).toEqual({ due: 1, read: 0, changed: 0, unclear: 1, failed: 0, outOfTime: false });
      expect(fields(states)).toEqual(before);
      expect(states.writes).toBe(writes);
      expect(states.calls.save).toBe(saves);
      // The order was taken before the read, and is simply unused.
      expect(states.calls.take).toBe(takes + 1);
      expect(await access(states)).toEqual({ open: false, reason });
      expect(await history(states)).toBe(true);
      expect(JSON.stringify(logged.flatMap((spy) => spy.mock.calls))).not.toContain("cus_");
    });
  });

  it("an unclear row stays due, goes behind the others, and cannot hold them up", async () => {
    const { states, tick } = await families({ a: [past], b: [past], c: [past] });
    states.subscriptions.cus_a = [trialing];
    expect(await sweepPlanReads(states.reads, states, time(), 1)).toEqual({ due: 1, read: 0, changed: 0, unclear: 1, failed: 0, outOfTime: false });
    tick(900_000);
    expect((await states.reads.duePlanReads(100)).map((r: PlanRead) => r.childId)).toEqual(["b", "c", "a"]);
    expect(await sweepPlanReads(states.reads, states, time(), 2)).toMatchObject({ read: 2, unclear: 0 });
    tick(900_000);
    expect((await states.reads.duePlanReads(100)).map((r: PlanRead) => r.childId)).toEqual(["a"]);
    // A later clear answer still reopens it.
    states.subscriptions.cus_a = [active];
    expect(await sweepPlanReads(states.reads, states, time())).toMatchObject({ read: 1, changed: 1, unclear: 0 });
    expect(await access(states)).toEqual({ open: true, reason: "open" });
  });

  it("an open row's answer is stored as before, even when a closed row could not store it", async () => {
    const { states } = await families({ a: [active] });
    states.subscriptions.cus_a = [];
    expect(await sweepPlanReads(states.reads, states, time())).toMatchObject({ read: 1, changed: 1, unclear: 0 });
    expect(states.rows[0].plan.kind).toBe("not_started");
  });
});

describe("a started plan whose plan state write failed, with the webhook lost too (#713)", () => {
  afterEach(() => vi.restoreAllMocks());
  const firstCharge = "2027-01-01T00:00:00.000Z";
  const key = { parentId: "p-a", childId: "a" };
  /** One family, card a, no row, no start yet. The database's clock is `clock`. */
  const family = (subscriptions: PlanSubscription[] = []) => {
    let clock = NOW;
    const states = memoryPlanStates({ cards: [{ ...key, customer: "cus_a", cardSaved: true }], subscriptions: { cus_a: subscriptions }, now: () => clock });
    return { states, tick: (ms: number) => { clock += ms; }, at: () => clock };
  };
  type Family = ReturnType<typeof family>;
  /** A start as startPlan leaves it: the record is `started`, and the plan state write after it failed. No event ever arrives. */
  const lostStart = async ({ states, at }: Family, plan: PlanSubscription[], generation = 1) => {
    states.subscriptions.cus_a = plan;
    states.starts.push({ childId: "a", generation, state: "started", finishedAt: at() });
    states.fail.save = new Error("Database down");
    await expect(applyPlanStart({ customer: "cus_a", cardSetup: "card-a", generation, startedAt: at() - 1000 }, states)).rejects.toThrow("Database down");
    delete states.fail.save;
  };
  const gate = async ({ states }: Family) => planAccessRule(await readChildPlan(key, states.store), NOW);
  const row = ({ states }: Family) => states.rows.find((r) => r.childId === "a");

  describe("what a read may store on a row a start backs", () => {
    // [answer, row not_started, row ended, no row]
    const TABLE: [KnownPlan, boolean, boolean, boolean, string][] = [
      [{ kind: "free_month", firstCharge, monthly: 79.99 }, true, true, true, "the free month is what a new start makes"],
      [{ kind: "paying", nextCharge: firstCharge, monthly: 79.99 }, true, true, true, "a Restart is paid at once"],
      [{ kind: "ending", endsOn: firstCharge, free: true }, true, true, true, "the started free month, set to end by the parent: Stripe still runs it"],
      [{ kind: "ending", endsOn: firstCharge, free: false }, true, true, true, "a paid plan running to its period's end"],
      [{ kind: "payment_failed" }, true, true, true, "stays closed, with the reason Stripe gives"],
      [{ kind: "paused", resumesOn: firstCharge, monthly: 79.99 }, true, true, true, "stays closed, with the reason Stripe gives"],
      [{ kind: "ended" }, true, true, true, "the started plan has ended: stays closed"],
      [{ kind: "not_started" }, false, false, true, "an empty list contradicts the start record; with no row it is what a fill stores, and closed either way"],
    ];
    it.each(TABLE)("%j: not_started %s, ended %s, no row %s (%s)", (plan, notStarted, ended, none) => {
      expect(planReadMayStore("not_started", plan)).toBe(notStarted);
      expect(planReadMayStore("ended", plan)).toBe(ended);
      expect(planReadMayStore(null, plan)).toBe(none);
    });
    it("covers every kind Stripe can answer, and the closed rows keep their rule", () => {
      expect(new Set(TABLE.map(([p]) => p.kind))).toEqual(new Set(["paying", "ending", "payment_failed", "paused", "ended", "free_month", "not_started"]));
      expect(planReadMayStore("payment_failed", { kind: "free_month", firstCharge, monthly: 79.99 })).toBe(false);
      expect(planReadMayStore("paused", { kind: "ending", endsOn: firstCharge, free: true })).toBe(false);
      expect([...PLAN_START_READ_KINDS].sort()).toEqual(["ended", "not_started"]);
    });
  });

  it("an admin start on a child with no row: one re-read stores the free month, and the gate opens", async () => {
    const f = family();
    await lostStart(f, [trial]);
    expect(row(f)).toBeUndefined();
    expect((await gate(f)).open).toBe(false);
    const due = await f.states.reads.duePlanReads(100);
    expect(due).toEqual([{ ...key, customer: "cus_a", kind: null, eventAt: null }]);
    expect(await sweepPlanReads(f.states.reads, f.states, time())).toEqual({ due: 1, read: 1, changed: 1, unclear: 0, failed: 0, outOfTime: false });
    expect(row(f)).toMatchObject({ plan: { kind: "free_month" }, eventAt: new Date(0).toISOString() });
    expect(await gate(f)).toEqual({ open: true, reason: "open" });
    expect(await f.states.reads.duePlanReads(100)).toEqual([]);
  });

  it("an admin start on a not_started row: one re-read opens it", async () => {
    const f = family();
    await f.states.store.save("cus_a", { plan: { kind: "not_started" }, eventAt: null, eventId: null, readOrder: await f.states.store.takeReadOrder() });
    f.tick(60_000);
    await lostStart(f, [trial]);
    expect(row(f)?.plan.kind).toBe("not_started");
    expect(await sweepPlanReads(f.states.reads, f.states, time())).toMatchObject({ due: 1, read: 1, changed: 1, unclear: 0 });
    expect(row(f)?.plan.kind).toBe("free_month");
    expect(await gate(f)).toEqual({ open: true, reason: "open" });
  });

  it("a Restart on an ended row: one re-read stores paying and keeps the row's event time, and the gate opens", async () => {
    const f = family([over]);
    await applyPlanEvent({ id: "evt_end", type: "customer.subscription.deleted", created: 1_760_000_000, customer: "cus_a" }, f.states);
    f.states.starts.push({ childId: "a", generation: 1, state: "started", finishedAt: f.at() - 40 * DAY });
    f.tick(2 * DAY);
    await lostStart(f, [over, { ...active, created: 1_800_000_000 }], 2);
    expect(row(f)?.plan.kind).toBe("ended");
    expect((await gate(f)).open).toBe(false);
    expect(await f.states.reads.duePlanReads(100)).toMatchObject([{ kind: "ended", eventAt: new Date(1_760_000_000_000).toISOString() }]);
    expect(await sweepPlanReads(f.states.reads, f.states, time())).toMatchObject({ due: 1, read: 1, changed: 1, unclear: 0 });
    expect(row(f)).toMatchObject({ plan: { kind: "paying" }, eventAt: new Date(1_760_000_000_000).toISOString() });
    expect(await gate(f)).toEqual({ open: true, reason: "open" });
  });

  it("Stripe not answering changes nothing, and the child stays due", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = family([over]);
    await applyPlanEvent({ id: "evt_end", type: "customer.subscription.deleted", created: 1_760_000_000, customer: "cus_a" }, f.states);
    f.tick(60_000);
    await lostStart(f, [active]);
    const before = { ...row(f)! }, writes = f.states.writes;
    f.states.fail.plan = new Error("Stripe down");
    expect(await sweepPlanReads(f.states.reads, f.states, time())).toEqual({ due: 1, read: 0, changed: 0, unclear: 0, failed: 1, outOfTime: false });
    expect(row(f)).toEqual(before);
    expect(f.states.writes).toBe(writes);
    expect((await gate(f)).open).toBe(false);
    expect(await f.states.reads.duePlanReads(100)).toHaveLength(1);
    // With no row, too.
    const none = family();
    await lostStart(none, [trial]);
    none.states.fail.plan = new Error("Stripe down");
    expect(await sweepPlanReads(none.states.reads, none.states, time())).toMatchObject({ read: 0, failed: 1 });
    expect(none.states.rows).toEqual([]);
    expect(await none.states.reads.duePlanReads(100)).toHaveLength(1);
  });

  it("a newer webhook is never overwritten: the event takes after the read and saves first", async () => {
    const f = family();
    await lostStart(f, [trial]);
    const [due] = await f.states.reads.duePlanReads(1);
    const hold = f.states.hold("plan");
    const read = rereadPlan(due, f.states);
    await hold.reached;
    f.states.subscriptions.cus_a = [active];
    expect(await applyPlanEvent({ id: "evt_paid", type: "invoice.paid", created: 1_800_000_000, customer: "cus_a" }, f.states)).toBe("stored");
    hold.release();
    expect((await read).save).toBe("older");
    expect(row(f)).toMatchObject({ eventId: "evt_paid", plan: { kind: "paying" } });
  });

  it("a webhook after the read still applies: no event reads as older than the read's time", async () => {
    const f = family();
    await lostStart(f, [trial]);
    await sweepPlanReads(f.states.reads, f.states, time());
    f.states.subscriptions.cus_a = [past];
    expect(await applyPlanEvent({ id: "evt_failed", type: "invoice.payment_failed", created: 1_700_000_000, customer: "cus_a" }, f.states)).toBe("stored");
    expect(row(f)?.plan.kind).toBe("payment_failed");
  });

  it("a child with no started plan start is not read", async () => {
    // No start at all, with no row and with an ended row.
    const none = family([trial]);
    expect(await none.states.reads.duePlanReads(100)).toEqual([]);
    const ended = family([over]);
    await applyPlanEvent({ id: "evt_end", type: "customer.subscription.deleted", created: 1_760_000_000, customer: "cus_a" }, ended.states);
    ended.tick(2 * DAY);
    expect(await ended.states.reads.duePlanReads(100)).toEqual([]);
    // A newest start that is open, refused or closed by the team is not read: the card sweep decides an open one.
    for (const state of ["open", "refused", "team_ended"] as const) {
      ended.states.starts.splice(0, ended.states.starts.length, { childId: "a", generation: 1, state: "started", finishedAt: ended.at() - DAY }, { childId: "a", generation: 2, state, finishedAt: state === "open" ? null : ended.at() });
      expect(await ended.states.reads.duePlanReads(100)).toEqual([]);
    }
    // A start that finished more than 40 days ago is not read.
    ended.states.starts.splice(0, ended.states.starts.length, { childId: "a", generation: 1, state: "started", finishedAt: ended.at() - 41 * DAY });
    expect(await ended.states.reads.duePlanReads(100)).toEqual([]);
    expect(await sweepPlanReads(ended.states.reads, ended.states, time())).toMatchObject({ due: 0, read: 0 });
    expect(row(ended)?.plan.kind).toBe("ended");
  });

  it("a row read after its start is read again only after 24 hours, and an ended answer stays closed", async () => {
    const f = family([over]);
    await applyPlanEvent({ id: "evt_end", type: "customer.subscription.deleted", created: 1_760_000_000, customer: "cus_a" }, f.states);
    f.tick(60_000);
    await lostStart(f, [over]);
    expect(await sweepPlanReads(f.states.reads, f.states, time())).toMatchObject({ read: 1, changed: 0 });
    expect(await f.states.reads.duePlanReads(100)).toEqual([]);
    f.tick(DAY + 1);
    expect(await f.states.reads.duePlanReads(100)).toHaveLength(1);
    expect((await gate(f)).open).toBe(false);
  });

  it("an empty list on an ended row a start backs is unclear: nothing stored, and the family keeps its plan's pages", async () => {
    const f = family([over]);
    await applyPlanEvent({ id: "evt_end", type: "customer.subscription.deleted", created: 1_760_000_000, customer: "cus_a" }, f.states);
    f.tick(60_000);
    await lostStart(f, []);
    const before = { ...row(f)! };
    expect(await sweepPlanReads(f.states.reads, f.states, time())).toEqual({ due: 1, read: 0, changed: 0, unclear: 1, failed: 0, outOfTime: false });
    expect(row(f)).toEqual(before);
  });

  it("the start rows come first, before the rows of the daily re-read, inside the limit", async () => {
    let clock = NOW - 2 * DAY;
    const s = memoryPlanStates({
      cards: [{ parentId: "p-b", childId: "b", customer: "cus_b", cardSaved: true }, { parentId: "p-s", childId: "s", customer: "cus_s", cardSaved: true }],
      subscriptions: { cus_b: [active], cus_s: [trial] }, now: () => clock,
    });
    await applyPlanEvent({ id: "evt_b", type: "customer.subscription.updated", created: 1_700_000_000, customer: "cus_b" }, s);
    clock = NOW;
    s.starts.push({ childId: "s", generation: 1, state: "started", finishedAt: NOW - 1000 });
    expect((await s.reads.duePlanReads(100)).map((r: PlanRead) => [r.childId, r.kind])).toEqual([["s", null], ["b", "paying"]]);
    expect((await s.reads.duePlanReads(1)).map((r: PlanRead) => r.childId)).toEqual(["s"]);
  });
});
