import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { NextBookTrigger } from "./next-book-snapshot";
import type { NextBookPlanner } from "./next-book-snapshot";
import { NEXT_BOOK_STEP_ANSWER_MS, NEXT_BOOK_STEP_LIMIT, NEXT_BOOK_STEP_PAGE, nextBookRelease, runNextBookStep, type NextBookStepDeps,
  type NextBookStepResult } from "./next-book-step";
import { memoryNextBookDue } from "./next-book-step-memory";
import { MIN, nextBookWorld, uuid, type Family } from "./next-book-step.fixture";

// #476: the automatic step through its public interface: the memory snapshot store with the SQL's refusals, the memory
// due reader, a fake planner, and a passed-in clock and budget.

const T0 = Date.parse("2026-11-08T18:00:00.000Z");
afterEach(() => { vi.useRealTimers(); });

function setup(env: { mode?: string; tests?: Family[] | string } = {}) {
  const w = nextBookWorld(T0);
  const reader = memoryNextBookDue(w.m.state);
  const testAccounts = new Set<string>();
  const openPlans = new Set<string>();
  const calls: NextBookTrigger[] = [];
  const step = (over: Partial<NextBookStepDeps> & { mode?: string; tests?: string } = {}) => runNextBookStep({
    release: nextBookRelease({ NEXT_BOOK_PREPARE_ENABLED: over.mode ?? env.mode ?? "test-only",
      WORKBOOK_SCAN_TEST_PARENT_IDS: over.tests ?? (typeof env.tests === "string" ? env.tests : (env.tests ?? []).map(f => f.parentId).join(",")) }),
    planner: w.planner,
    prepare: p => { const call = w.prepare(p); return (t, now) => { calls.push(t); return call(t, now); }; },
    reader,
    testAccount: async id => testAccounts.has(id),
    // The behaviour once the worker reads plan_input; "real families stay out" below covers production's false.
    realFamilies: true,
    openPlan: async ({ childId }) => openPlans.has(childId),
    time: { now: () => w.clock.now, endAt: w.clock.now + 55_000 },
    ...over,
  });
  return { w, reader, testAccounts, openPlans, calls, step };
}
const ran = (r: NextBookStepResult) => {
  if (r.status !== "ran") throw Error(JSON.stringify(r));
  return r;
};

describe("the release switch", () => {
  it("is off unless it is exactly test-only or families, and a malformed parent list fails closed", () => {
    const list = `${uuid(1)},${uuid(2)}`;
    for (const value of [undefined, "", "on", "true", "TEST-ONLY", " test-only", "family", "all"]) {
      expect(nextBookRelease({ NEXT_BOOK_PREPARE_ENABLED: value, WORKBOOK_SCAN_TEST_PARENT_IDS: list })).toBeNull();
    }
    for (const mode of ["test-only", "families"]) {
      for (const bad of ["not-a-uuid", `${uuid(1)},${uuid(1)}`, `${uuid(1)},`, Array.from({ length: 21 }, (_, i) => uuid(i + 1)).join(",")]) {
        expect(nextBookRelease({ NEXT_BOOK_PREPARE_ENABLED: mode, WORKBOOK_SCAN_TEST_PARENT_IDS: bad })).toBeNull();
      }
    }
    expect(nextBookRelease({ NEXT_BOOK_PREPARE_ENABLED: "test-only" })).toBeNull();
    expect(nextBookRelease({ NEXT_BOOK_PREPARE_ENABLED: "test-only", WORKBOOK_SCAN_TEST_PARENT_IDS: ` ${uuid(1)} , ${uuid(2)}` }))
      .toEqual({ mode: "test-only", testParents: [uuid(1), uuid(2)] });
    expect(nextBookRelease({ NEXT_BOOK_PREPARE_ENABLED: "families" })).toEqual({ mode: "families", testParents: [] });
  });

  it("off: the step reads and writes nothing", async () => {
    const s = setup();
    const f = s.w.family(1);
    s.w.claim(f, T0 - MIN);
    s.testAccounts.add(f.parentId);
    expect(await s.step({ mode: "on", tests: f.parentId })).toEqual({ status: "off" });
    expect(await s.step({ release: null })).toEqual({ status: "off" });
    expect(s.reader.reads).toBe(0);
    expect(s.w.writes).toEqual([]);
    expect(s.w.m.state.snapshots).toEqual([]);
  });

  it("test-only: a listed test family's claim is queued; a real family and a listed parent no longer marked as a test are not", async () => {
    const s = setup();
    const test = s.w.family(1), unmarked = s.w.family(2), real = s.w.family(3);
    for (const f of [test, unmarked, real]) s.w.claim(f, T0 - 10 * MIN + f.n);
    s.testAccounts.add(test.parentId);
    s.openPlans.add(real.childId);
    const r = ran(await s.step({ tests: `${test.parentId},${unmarked.parentId}` }));
    expect(r).toMatchObject({ due: 2, prepared: 1, skipped: 1, errors: 0, outcomes: { queued: 1 } });
    expect(s.w.chainOf(test)?.runId).toBeTruthy();
    expect(s.w.chainOf(unmarked)).toBeUndefined();
    expect(s.w.chainOf(real)).toBeUndefined();
    expect(s.w.m.state.runs.map(run => run.childId)).toEqual([test.childId]);
  });

  it("families: a real family with an open plan is admitted; one with a closed plan is skipped", async () => {
    const s = setup({ mode: "families" });
    const open = s.w.family(1), closed = s.w.family(2);
    s.w.claim(open, T0 - 2 * MIN);
    s.w.claim(closed, T0 - 3 * MIN);
    s.openPlans.add(open.childId);
    const r = ran(await s.step());
    expect(r).toMatchObject({ due: 2, prepared: 1, skipped: 1, outcomes: { queued: 1 } });
    expect(s.w.chainOf(open)?.runId).toBeTruthy();
    expect(s.w.chainOf(closed)).toBeUndefined();
    // The plan is checked again before each item: once it opens, the next run admits it.
    s.openPlans.add(closed.childId);
    expect(ran(await s.step())).toMatchObject({ prepared: 1, outcomes: { queued: 1 } });
    expect(s.w.chainOf(closed)?.runId).toBeTruthy();
  });

  // Review P2-1. Falsifier: with real families off (production until the worker reads plan_input), "families" makes a
  // chain, a plan or a run for a real family with an open plan.
  it("real families stay out: with realFamilies false, families admits only listed test families", async () => {
    const s = setup({ mode: "families" });
    const test = s.w.family(1), real = s.w.family(2);
    s.w.claim(test, T0 - 2 * MIN);
    s.w.claim(real, T0 - 3 * MIN);
    s.testAccounts.add(test.parentId);
    s.openPlans.add(test.childId).add(real.childId);
    const r = ran(await s.step({ realFamilies: false, tests: test.parentId }));
    expect(r).toMatchObject({ due: 2, prepared: 1, skipped: 1, outcomes: { queued: 1 } });
    expect(s.w.chainOf(test)?.runId).toBeTruthy();
    expect(s.w.chainOf(real)).toBeUndefined();
    expect(s.w.m.state.runs.map(run => run.childId)).toEqual([test.childId]);
    // Off stays off: no read at all.
    expect(await s.step({ mode: "off", realFamilies: false })).toEqual({ status: "off" });
  });
});

describe("the step", () => {
  it("with no planner answers planner-not-ready before any read or write", async () => {
    const s = setup({ mode: "families" });
    const f = s.w.family(1), held = s.w.family(2);
    s.w.claim(f, T0 - MIN);
    s.w.hold(held, T0 - MIN);
    s.openPlans.add(f.childId).add(held.childId);
    expect(await s.step({ planner: null })).toEqual({ status: "planner-not-ready" });
    // A planner without the rest of the wiring (no selection, no service key) is not ready either.
    expect(await s.step({ prepare: () => null })).toEqual({ status: "planner-not-ready" });
    expect(s.reader.reads).toBe(0);
    expect(s.w.writes).toEqual([]);
    expect(s.w.m.state.snapshots).toEqual([]);
  });

  it("retries a waiting chain on the next run and freezes it at the 30-minute deadline", async () => {
    const s = setup();
    const f = s.w.family(1, "waiting");
    s.testAccounts.add(f.parentId);
    s.w.claim(f, T0);
    s.w.clock.now = T0 + MIN;
    expect(ran(await s.step({ tests: f.parentId })).outcomes).toEqual({ waiting: 1 });
    const chain = s.w.chainOf(f)!;
    expect(chain.frozen).toBeNull();
    s.w.clock.now = T0 + 15 * MIN;
    expect(ran(await s.step({ tests: f.parentId })).outcomes).toEqual({ waiting: 1 });
    expect(s.calls.at(-1)).toEqual({ kind: "snapshot", snapshotId: chain.id });
    s.w.clock.now = T0 + 30 * MIN;
    expect(ran(await s.step({ tests: f.parentId })).outcomes).toEqual({ queued: 1 });
    expect(s.w.chainOf(f)!.frozen!.scope.jobs).toEqual({ captured: 1, waiting: 1, deadlineReached: true });
    // Done: it leaves the due list.
    expect(ran(await s.step({ tests: f.parentId }))).toMatchObject({ due: 0, outcomes: {} });
  });

  it("records the held row of a #628 hold once", async () => {
    const s = setup();
    const f = s.w.family(1);
    s.testAccounts.add(f.parentId);
    s.w.hold(f, T0 - 5 * MIN);
    expect(ran(await s.step({ tests: f.parentId })).outcomes).toEqual({ held: 1 });
    expect(s.w.m.state.snapshots).toEqual([expect.objectContaining({ workbookId: f.bookId, held: { reason: "no-accepted-scans-at-backstop", at: T0 - 5 * MIN } })]);
    expect(ran(await s.step({ tests: f.parentId }))).toMatchObject({ due: 0, prepared: 0 });
    expect(s.w.m.state.runs).toEqual([]);
  });

  it("takes at most 20 items, oldest first by anchor, across claims, chains and holds", async () => {
    const s = setup({ mode: "families" });
    const anchors = new Map<string, number>();
    // 22 claims and 3 holds, their times interleaved and pushed out of order.
    const order = Array.from({ length: 25 }, (_, i) => (i * 7) % 25);
    for (const i of order) {
      const f = s.w.family(i + 1);
      s.openPlans.add(f.childId);
      const at = T0 - (100 - i) * MIN;
      if (i % 8 === 3) { s.w.hold(f, at); anchors.set(f.bookId, at); } else { s.w.claim(f, at); anchors.set(uuid((i + 1) * 10 + 4), at); }
    }
    expect(ran(await s.step())).toMatchObject({ due: NEXT_BOOK_STEP_LIMIT, prepared: NEXT_BOOK_STEP_LIMIT });
    const seen = s.calls.map(t => anchors.get(t.kind === "claim" ? t.triggerId : t.kind === "backstop-hold" ? t.workbookId : "")!);
    const oldest = [...anchors.values()].sort((a, b) => a - b);
    expect(seen).toEqual(oldest.slice(0, NEXT_BOOK_STEP_LIMIT));
    expect(s.calls.filter(t => t.kind === "backstop-hold")).toHaveLength(3);
    // The next run takes the 5 that were left. The 22 chains it made are queued; one run per child.
    s.calls.length = 0;
    expect(ran(await s.step())).toMatchObject({ due: 5, prepared: 5 });
    expect(s.calls.map(t => anchors.get(t.kind === "claim" ? t.triggerId : ""))).toEqual(oldest.slice(NEXT_BOOK_STEP_LIMIT));
    expect(s.w.m.state.runs).toHaveLength(22);
  });

  it("puts a waiting chain made earlier ahead of a newer claim", async () => {
    const s = setup({ mode: "families" });
    const waiting = s.w.family(1, "waiting"), fresh = s.w.family(2);
    s.openPlans.add(waiting.childId).add(fresh.childId);
    s.w.claim(waiting, T0 - 2 * MIN);
    await s.step();
    s.w.claim(fresh, T0 - MIN);
    s.calls.length = 0;
    expect(ran(await s.step()).outcomes).toEqual({ waiting: 1, queued: 1 });
    expect(s.calls.map(t => t.kind)).toEqual(["snapshot", "claim"]);
  });

  it("stops early when less than 8 seconds of its time is left, and the next run goes on", async () => {
    const s = setup({ mode: "families" });
    const families = [1, 2, 3, 4, 5].map(n => s.w.family(n));
    families.forEach((f, i) => { s.w.claim(f, T0 - (10 - i) * MIN); s.openPlans.add(f.childId); });
    const start = s.w.clock.now;
    const slow: NextBookStepDeps["prepare"] = p => {
      const call = s.w.prepare(p);
      return async (t, now) => { const out = await call(t, now); s.w.clock.now += 10_000; s.calls.push(t); return out; };
    };
    // 30 s: three items start with 30, 20 and 10 s left; the fourth would start with none.
    const r = ran(await s.step({ prepare: slow, time: { now: () => s.w.clock.now, endAt: start + 30_000 } }));
    expect(r).toMatchObject({ due: 3, prepared: 3, outOfTime: true });
    expect(families.map(f => !!s.w.chainOf(f))).toEqual([true, true, true, false, false]);
    // With less than 8 s at the start it does not even read.
    const reads = s.reader.reads;
    expect(ran(await s.step({ time: { now: () => s.w.clock.now, endAt: s.w.clock.now + 7_999 } }))).toMatchObject({ due: 0, outOfTime: true });
    expect(s.reader.reads).toBe(reads);
    expect(ran(await s.step())).toMatchObject({ due: 2, prepared: 2, outOfTime: false });
  });

  it("a failed or truncated read ends the step with no writes, and the next run does the work", async () => {
    const s = setup({ mode: "families" });
    const f = s.w.family(1);
    s.w.claim(f, T0 - MIN);
    s.openPlans.add(f.childId);
    s.reader.failNext = true;
    expect(await s.step()).toEqual({ status: "read-failed" });
    expect(s.w.writes).toEqual([]);
    expect(s.w.m.state.snapshots).toEqual([]);
    expect(ran(await s.step()).outcomes).toEqual({ queued: 1 });
  });

  it("a failed later read stops the step and keeps the items already prepared", async () => {
    const s = setup({ mode: "families" });
    for (let n = 1; n <= NEXT_BOOK_STEP_PAGE + 5; n++) {
      const f = s.w.family(n);
      s.w.claim(f, T0 - (100 - n) * MIN);
      if (n === 1) s.openPlans.add(f.childId);
    }
    s.reader.failAfter = 1;
    const r = ran(await s.step());
    expect(r).toMatchObject({ readFailed: true, prepared: 1, skipped: NEXT_BOOK_STEP_PAGE - 1, outcomes: { queued: 1 } });
  });

  it("skipped items use no slot: 60 older items left out by the release, and the newer released one is prepared on the first run", async () => {
    const s = setup({ mode: "families" });
    // Ten test families' children no longer marked as tests, and real families with closed plans, all older.
    const testParents: string[] = [];
    for (let n = 1; n <= 60; n++) {
      const f = s.w.family(n);
      s.w.claim(f, T0 - (200 - n) * MIN);
      if (n <= 10) testParents.push(f.parentId);
    }
    const customer = s.w.family(61);
    s.w.claim(customer, T0 - MIN);
    s.openPlans.add(customer.childId);
    const r = ran(await s.step({ tests: testParents.join(",") }));
    expect(r).toMatchObject({ due: 61, skipped: 60, prepared: 1, outcomes: { queued: 1 }, outOfTime: false });
    expect(s.w.chainOf(customer)?.runId).toBeTruthy();
    expect(s.calls).toEqual([{ kind: "claim", triggerId: uuid(61 * 10 + 4) }]);
    expect(s.reader.reads).toBe(2);
  });

  it("moves past 60 skipped items at one identical time: the newer released item is prepared on the first run, none read twice or lost", async () => {
    const s = setup({ mode: "families" });
    const same = T0 - 30 * MIN;
    for (let n = 1; n <= 60; n++) s.w.claim(s.w.family(n), same);
    const customer = s.w.family(61);
    s.w.claim(customer, T0 - MIN);
    s.openPlans.add(customer.childId);
    const checked: string[] = [];
    const r = ran(await s.step({ openPlan: async ({ childId }) => { checked.push(childId); return s.openPlans.has(childId); } }));
    expect(r).toMatchObject({ due: 61, skipped: 60, prepared: 1, readFailed: false, outcomes: { queued: 1 } });
    expect(s.calls).toEqual([{ kind: "claim", triggerId: uuid(61 * 10 + 4) }]);
    expect(s.reader.returned).toHaveLength(61);
    expect(new Set(s.reader.returned).size).toBe(61);
    expect(new Set(checked).size).toBe(61);
    expect(checked).toHaveLength(61);
    expect(s.reader.reads).toBe(2);
  });

  it("a stalled candidate read or access read ends at the deadline before endAt, with no write", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: T0 });
    const s = setup({ mode: "families" });
    const f = s.w.family(1);
    s.w.claim(f, T0 - MIN);
    s.openPlans.add(f.childId);
    const signals: AbortSignal[] = [];
    const hang = <T>(signal?: AbortSignal) => { if (signal) signals.push(signal); return new Promise<T>(() => {}); };
    for (const over of [
      { reader: { page: (input: { signal?: AbortSignal }) => hang<never>(input.signal) } },
      { openPlan: (_: unknown, signal: AbortSignal) => hang<boolean>(signal) },
    ] as Partial<NextBookStepDeps>[]) {
      const start = Date.now(), end = start + 55_000;
      let returnedAt = 0;
      const running = s.step({ ...over, time: { now: () => Date.now(), endAt: end } }).then(r => { returnedAt = Date.now(); return r; });
      await vi.advanceTimersByTimeAsync(55_000);
      expect(ran(await running)).toMatchObject({ timedOut: true, outOfTime: true, prepared: 0 });
      expect(returnedAt).toBe(end - NEXT_BOOK_STEP_ANSWER_MS);
    }
    // Each stalled read was given the step's signal, and the signal aborted at the deadline.
    expect(signals).toHaveLength(2);
    expect(signals.every(x => x.aborted)).toBe(true);
    expect(s.w.writes).toEqual([]);
    expect(s.w.m.state.snapshots).toEqual([]);
  });

  it("stops a slow planner at its deadline before endAt, saves no plan after it, and the next run finishes the item", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: T0 });
    const s = setup({ mode: "families" });
    const f = s.w.family(1), later = s.w.family(2);
    s.w.claim(f, T0 - 2 * MIN);
    s.w.claim(later, T0 - MIN);
    s.openPlans.add(f.childId).add(later.childId);
    const slow: NextBookPlanner = { plan: input => new Promise(resolve => setTimeout(() => resolve(s.w.planner.plan(input)), 120_000)) };
    const endAt = Date.now() + 55_000;
    let returnedAt = 0;
    const running = s.step({ planner: slow, time: { now: () => Date.now(), endAt } }).then(r => { returnedAt = Date.now(); return r; });
    await vi.advanceTimersByTimeAsync(55_000);
    const r = ran(await running);
    expect(returnedAt).toBe(endAt - NEXT_BOOK_STEP_ANSWER_MS);
    expect(r).toMatchObject({ timedOut: true, outOfTime: true, prepared: 0, due: 1 });
    // The slow answer arrives later and is refused: the chain stays frozen without a plan, and no run starts.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(s.w.chainOf(f)).toMatchObject({ plan: null, runId: null });
    expect(s.w.chainOf(f)!.frozen).not.toBeNull();
    expect(s.w.chainOf(later)).toBeUndefined();
    vi.useRealTimers();
    s.w.clock.now = T0 + 3 * MIN;
    const next = ran(await s.step({ time: { now: () => s.w.clock.now, endAt: s.w.clock.now + 55_000 } }));
    expect(next).toMatchObject({ prepared: 2, outcomes: { queued: 2 } });
    expect(s.w.chainOf(f)?.runId).toBeTruthy();
  });

  it("counts an error on one item and goes on to the next", async () => {
    const s = setup({ mode: "families" });
    const broken = s.w.family(1), fine = s.w.family(2);
    s.w.claim(broken, T0 - 2 * MIN);
    s.w.claim(fine, T0 - MIN);
    s.openPlans.add(fine.childId);
    const r = ran(await s.step({ openPlan: async ({ childId }) => {
      if (childId === broken.childId) throw new Error("plan read failed");
      return s.openPlans.has(childId);
    } }));
    expect(r).toMatchObject({ due: 2, prepared: 1, errors: 1, outcomes: { queued: 1 } });
    expect(s.w.chainOf(broken)).toBeUndefined();
  });

  it("answers with counts only, refusals by their reason", async () => {
    const s = setup({ mode: "families" });
    const gone = s.w.family(1);
    s.w.claim(gone, T0 - MIN);
    s.openPlans.add(gone.childId);
    s.w.m.state.deletingParents.add(gone.parentId);
    const r = ran(await s.step());
    expect(r.outcomes).toEqual({ "refused:family-unavailable": 1 });
    expect(JSON.stringify(r)).not.toContain(gone.parentId);
  });
});
