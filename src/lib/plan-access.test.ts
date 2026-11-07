import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { parentPlan, type ParentPlan } from "@/lib/parent-plan";
import { childPlanAccess, familyHasPlanHistory, familyOpenPlanChildren, familyPlanAccess, planAccessRule } from "./plan-access";

const NOW = Date.parse("2026-11-07T12:00:00Z");
const clock = { now: () => NOW };
const later = "2026-12-01T00:00:00Z", earlier = "2026-11-01T00:00:00Z";

type Row = Record<string, unknown>;
const stateRow = (parent: string, child: string, kind: string, over: Row = {}): Row => ({
  parent_id: parent, child_id: child, kind, next_charge_at: kind === "free_month" ? later : null, ends_at: null, monthly_cents: 7999, ending_free: false, ...over,
});

/** The Supabase calls this module makes: from(table).select().eq().eq() and .in(), then maybeSingle() or the list. */
function fakeDb(tables: Record<string, Row[]>, fail: readonly string[] = []) {
  const db = {
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      const answer = () => (fail.includes(table) ? { data: null, error: { message: "down" } } : { data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null });
      const chain = {
        select: () => chain,
        eq(column: string, value: unknown) { filters.push((r) => r[column] === value); return chain; },
        in(column: string, values: readonly unknown[]) { filters.push((r) => values.includes(r[column])); return chain; },
        limit: () => chain,
        async maybeSingle() { const a = answer(); return { data: a.data?.[0] ?? null, error: a.error }; },
        then<T>(resolve: (value: ReturnType<typeof answer>) => T) { return Promise.resolve(answer()).then(resolve); },
      };
      return chain;
    },
  };
  return db as unknown as SupabaseClient<Database>;
}
const throwingDb = { from() { throw new Error("no network"); } } as unknown as SupabaseClient<Database>;

describe("planAccessRule", () => {
  it.each<[ParentPlan | null, boolean, string]>([
    [{ kind: "free_month", firstCharge: later, monthly: 79.99 }, true, "open"],
    [{ kind: "paying", nextCharge: later, monthly: 79.99 }, true, "open"],
    [{ kind: "paying", nextCharge: null, monthly: null }, true, "open"],
    [{ kind: "ending", endsOn: later, free: true }, true, "ending_until_end"],
    [{ kind: "ending", endsOn: later, free: false }, true, "ending_until_end"],
    [{ kind: "ending", endsOn: earlier, free: false }, false, "ended"],
    [{ kind: "ending", endsOn: new Date(NOW).toISOString(), free: false }, false, "ended"],
    [{ kind: "ending", endsOn: null, free: false }, false, "unknown"],
    [{ kind: "ending", endsOn: "not a date", free: false }, false, "unknown"],
    [null, false, "no_plan"],
    [{ kind: "not_started" }, false, "no_plan"],
    [{ kind: "ended" }, false, "ended"],
    [{ kind: "ended", endedOn: earlier }, false, "ended"],
    [{ kind: "payment_failed" }, false, "payment_failed"],
    [{ kind: "paused", resumesOn: later, monthly: 79.99 }, false, "paused"],
    [{ kind: "unknown" }, false, "unknown"],
  ])("%j reads open=%s because %s", (plan, open, reason) => {
    expect(planAccessRule(plan, NOW)).toEqual({ open, reason });
  });

  it("closes a kind the code does not know", () => {
    expect(planAccessRule({ kind: "free_trial_v2" } as unknown as ParentPlan, NOW)).toEqual({ open: false, reason: "unknown" });
    expect(planAccessRule(undefined, NOW)).toEqual({ open: false, reason: "no_plan" });
  });

  it("follows parentPlan's reading of Stripe's states", () => {
    const sub = { cancelAtPeriodEnd: false, trialEnd: null, periodEnd: Date.parse(later) / 1000, cents: 7999, created: 1 };
    const read = (over: { status: string; trialEnd?: number; cancelAtPeriodEnd?: boolean; endedAt?: number }) => planAccessRule(parentPlan([{ ...sub, ...over }]), NOW);
    expect(read({ status: "trialing", trialEnd: Date.parse(later) / 1000 }).open).toBe(true);
    expect(read({ status: "active" }).open).toBe(true);
    expect(read({ status: "active", cancelAtPeriodEnd: true })).toEqual({ open: true, reason: "ending_until_end" });
    for (const status of ["past_due", "unpaid", "incomplete"]) expect(read({ status })).toEqual({ open: false, reason: "payment_failed" });
    expect(read({ status: "paused" })).toEqual({ open: false, reason: "paused" });
    expect(read({ status: "canceled", endedAt: 5 })).toEqual({ open: false, reason: "ended" });
    expect(planAccessRule(parentPlan([]), NOW)).toEqual({ open: false, reason: "no_plan" });
  });
});

describe("childPlanAccess", () => {
  const input = { parentId: "p1", childId: "c1" };
  const read = (rows: Row[]) => childPlanAccess(input, { db: fakeDb({ child_plan_states: rows }), ...clock });

  it("opens each running kind, from the stored row", async () => {
    expect(await read([stateRow("p1", "c1", "free_month")])).toEqual({ open: true, reason: "open" });
    expect(await read([stateRow("p1", "c1", "paying")])).toEqual({ open: true, reason: "open" });
    expect(await read([stateRow("p1", "c1", "ending", { ends_at: later })])).toEqual({ open: true, reason: "ending_until_end" });
  });

  it("closes an ending row at its end date, by the passed clock, with no event", async () => {
    const row = [stateRow("p1", "c1", "ending", { ends_at: later })];
    const db = fakeDb({ child_plan_states: row });
    expect(await childPlanAccess(input, { db, now: () => Date.parse(later) - 1 })).toEqual({ open: true, reason: "ending_until_end" });
    expect(await childPlanAccess(input, { db, now: () => Date.parse(later) })).toEqual({ open: false, reason: "ended" });
  });

  it("closes every other stored state", async () => {
    expect(await read([])).toEqual({ open: false, reason: "no_plan" });
    expect(await read([stateRow("p1", "c1", "not_started")])).toEqual({ open: false, reason: "no_plan" });
    expect(await read([stateRow("p1", "c1", "ended")])).toEqual({ open: false, reason: "ended" });
    expect(await read([stateRow("p1", "c1", "payment_failed")])).toEqual({ open: false, reason: "payment_failed" });
    expect(await read([stateRow("p1", "c1", "paused")])).toEqual({ open: false, reason: "paused" });
    expect(await read([stateRow("p1", "c1", "ending")])).toEqual({ open: false, reason: "unknown" });
    expect(await read([stateRow("p1", "c1", "ending", { ends_at: "soon" })])).toEqual({ open: false, reason: "unknown" });
    expect(await read([stateRow("p1", "c1", "gold")])).toEqual({ open: false, reason: "unknown" });
    expect(await read([stateRow("p1", "c1", "free_month", { next_charge_at: null })])).toEqual({ open: false, reason: "unknown" });
  });

  it("reads another family's child as no_plan: the read is scoped to both ids", async () => {
    expect(await read([stateRow("p2", "c1", "paying")])).toEqual({ open: false, reason: "no_plan" });
    expect(await read([stateRow("p1", "c2", "paying")])).toEqual({ open: false, reason: "no_plan" });
  });

  it("returns read_failed and never throws when the read fails or no client exists", async () => {
    const closed = { open: false, reason: "read_failed" };
    expect(await childPlanAccess(input, { db: fakeDb({}, ["child_plan_states"]), ...clock })).toEqual(closed);
    expect(await childPlanAccess(input, { db: throwingDb, ...clock })).toEqual(closed);
    expect(await childPlanAccess(input, { db: null, ...clock })).toEqual(closed);
    expect(await childPlanAccess(input)).toEqual(closed);
  });
});

describe("familyPlanAccess", () => {
  const read = (rows: Row[]) => familyPlanAccess({ parentId: "p1" }, { db: fakeDb({ child_plan_states: rows }), ...clock });

  it("opens when any child of the family is open", async () => {
    expect(await read([stateRow("p1", "c1", "ended"), stateRow("p1", "c2", "paying")])).toEqual({ open: true, reason: "open" });
    expect(await read([stateRow("p1", "c1", "ending", { ends_at: later })])).toEqual({ open: true, reason: "ending_until_end" });
  });

  it("stays closed with no child open, and names a stopped plan before no_plan", async () => {
    expect(await read([])).toEqual({ open: false, reason: "no_plan" });
    expect(await read([stateRow("p1", "c1", "not_started")])).toEqual({ open: false, reason: "no_plan" });
    expect(await read([stateRow("p1", "c1", "not_started"), stateRow("p1", "c2", "payment_failed")])).toEqual({ open: false, reason: "payment_failed" });
    expect(await read([stateRow("p2", "c9", "paying")])).toEqual({ open: false, reason: "no_plan" });
  });

  it("fails closed", async () => {
    expect(await familyPlanAccess({ parentId: "p1" }, { db: fakeDb({}, ["child_plan_states"]), ...clock })).toEqual({ open: false, reason: "read_failed" });
    expect(await familyPlanAccess({ parentId: "p1" }, { db: throwingDb, ...clock })).toEqual({ open: false, reason: "read_failed" });
    expect(await familyPlanAccess({ parentId: "p1" }, { db: null, ...clock })).toEqual({ open: false, reason: "read_failed" });
  });
});

describe("familyOpenPlanChildren", () => {
  it("names only the open children, so a sibling stays closed", async () => {
    const db = fakeDb({ child_plan_states: [stateRow("p1", "c1", "paying"), stateRow("p1", "c2", "ended"), stateRow("p2", "c3", "paying")] });
    expect([...await familyOpenPlanChildren({ parentId: "p1" }, { db, ...clock })]).toEqual(["c1"]);
  });
  it("is empty when the read fails", async () => {
    expect((await familyOpenPlanChildren({ parentId: "p1" }, { db: throwingDb, ...clock })).size).toBe(0);
  });
});

describe("familyHasPlanHistory", () => {
  const read = (tables: Record<string, Row[]>, fail: string[] = []) => familyHasPlanHistory({ parentId: "p1" }, { db: fakeDb(tables, fail) });
  const start = (state: string, parent = "p1"): Row => ({ parent_id: parent, state });

  it.each(["free_month", "paying", "ending", "ended", "payment_failed", "paused", "gold"])("counts a %s row", async (kind) => {
    expect(await read({ child_plan_states: [stateRow("p1", "c1", kind)] })).toBe(true);
  });
  it("counts a plan start a webhook has not reached", async () => {
    for (const state of ["open", "started", "other"]) expect(await read({ plan_starts: [start(state)] })).toBe(true);
  });
  it("does not count a family with no plan, a saved card only, or a start that made no plan", async () => {
    expect(await read({})).toBe(false);
    expect(await read({ child_plan_states: [stateRow("p1", "c1", "not_started")] })).toBe(false);
    for (const state of ["refused", "team_ended"]) expect(await read({ plan_starts: [start(state)] })).toBe(false);
  });
  it("does not count another family's rows", async () => {
    expect(await read({ child_plan_states: [stateRow("p2", "c1", "paying")], plan_starts: [start("started", "p2")] })).toBe(false);
  });
  it("still finds the plan start when the state read fails, and is false when both fail", async () => {
    expect(await read({ plan_starts: [start("started")] }, ["child_plan_states"])).toBe(true);
    expect(await read({}, ["child_plan_states", "plan_starts"])).toBe(false);
    expect(await familyHasPlanHistory({ parentId: "p1" }, { db: throwingDb })).toBe(false);
    expect(await familyHasPlanHistory({ parentId: "p1" }, { db: null })).toBe(false);
  });
});
