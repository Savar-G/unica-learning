import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PLANNER_NOT_READY, prepareFromSnapshot, TEST_FAMILIES_ONLY, type AdminNextBookDeps, type AdminNextBookFamily } from "./next-book-admin";
import { ADMIN, MIN, nextBookWorld, REV, uuid, type Family } from "./next-book-step.fixture";

// #476: "Prepare from snapshot" through its public interface: the memory snapshot store, a fake planner, the family as
// the child page reads it, and a passed-in clock. Each status line, and the refusals.

// 7:10 p.m. in Vancouver (UTC-7 since 2026-03-08): the 30-minute wait ends at 7:40 p.m.
const T0 = Date.parse("2026-11-08T02:10:00.000Z");

function setup() {
  const w = nextBookWorld(T0);
  const families = new Map<string, AdminNextBookFamily>();
  const reads: string[] = [];
  const add = (f: Family, over: Partial<AdminNextBookFamily> = {}) =>
    families.set(f.childId, { parentId: f.parentId, deleting: false, testFamily: true, deliveredBook1: f.bookId, zone: "America/Vancouver", ...over });
  const deps = (over: Partial<AdminNextBookDeps> = {}): AdminNextBookDeps => ({
    planner: w.planner, prepare: w.prepare, realFamilies: false,
    family: async id => { reads.push(id); return families.get(id) ?? null; },
    now: () => w.clock.now, ...over,
  });
  const press = (f: Family, over: Partial<AdminNextBookDeps> = {}, admin: typeof ADMIN | null = ADMIN) => prepareFromSnapshot(admin, f.childId, deps(over));
  return { w, add, press, reads };
}

describe("Prepare from snapshot", () => {
  it("waits for the last marks in the family's time, then queues the next book", async () => {
    const s = setup();
    const f = s.w.family(1, "waiting");
    s.add(f);
    expect(await s.press(f)).toEqual({ ok: true, line: "Waiting for the last marks (until 7:40 p.m.)." });
    expect(s.w.chainOf(f)).toMatchObject({ reason: "admin_prepare", actor: ADMIN, frozen: null });
    s.w.m.state.jobs.set("photo-1", "finished");
    s.w.clock.now = T0 + MIN;
    expect(await s.press(f)).toEqual({ ok: true, line: "Next book queued." });
    expect(s.w.m.state.runs).toEqual([expect.objectContaining({ childId: f.childId, number: 2, startedBy: ADMIN.id })]);
    // Pressing again is safe: the same run.
    expect(await s.press(f)).toEqual({ ok: true, line: "Next book queued." });
    expect(s.w.m.state.runs).toHaveLength(1);
  });

  // Review P2-1. Falsifier: with real families off (production until the worker reads plan_input), the admin button
  // freezes, plans or queues anything for a family that is not in test_accounts.
  it("refuses a real family before any write, and still queues a test family", async () => {
    const s = setup();
    const real = s.w.family(1), test = s.w.family(2);
    s.add(real, { testFamily: false });
    s.add(test);
    s.w.claim(real, T0 - MIN);
    s.w.claim(test, T0 - MIN);
    expect(await s.press(real)).toEqual({ ok: false, error: "test-families-only", line: TEST_FAMILIES_ONLY });
    expect(s.w.writes).toEqual([]);
    expect(s.w.chainOf(real)).toBeUndefined();
    expect(s.w.m.state.snapshots).toEqual([]);
    expect(s.w.m.state.runs).toEqual([]);
    expect(await s.press(test)).toEqual({ ok: true, line: "Next book queued." });
    expect(s.w.m.state.runs).toEqual([expect.objectContaining({ childId: test.childId, number: 2 })]);
    expect(s.w.chainOf(real)).toBeUndefined();
    // Once the worker reads plan_input (realFamilies true), the same real family is queued.
    expect(await s.press(real, { realFamilies: true })).toEqual({ ok: true, line: "Next book queued." });
  });

  it("uses the book's claim when there is one", async () => {
    const s = setup();
    const f = s.w.family(1);
    s.add(f);
    s.w.claim(f, T0 - MIN);
    expect(await s.press(f)).toEqual({ ok: true, line: "Next book queued." });
    expect(s.w.chainOf(f)).toMatchObject({ reason: "day7_scanned", triggerId: uuid(14) });
  });

  it("says when no page was scanned, and when no page is marked yet", async () => {
    const s = setup();
    const unscanned = s.w.family(1), pending = s.w.family(2);
    s.add(unscanned);
    s.add(pending);
    s.w.hold(unscanned, T0 - MIN);
    expect(await s.press(unscanned)).toEqual({ ok: false, error: "refused", line: "On hold: no pages scanned." });
    s.w.holdCaptures();
    expect(await s.press(pending)).toEqual({ ok: true, line: "No marked pages yet." });
    expect(s.w.m.state.runs).toEqual([]);
  });

  it("uses only book 1, and says when the book already has a next book", async () => {
    const s = setup();
    const f = s.w.family(1), other = s.w.family(2);
    const book2 = uuid(999);
    s.w.m.state.books.push({ id: book2, parentId: f.parentId, childId: f.childId, number: 2, status: "shipped", printedRevision: REV });
    s.add(f, { deliveredBook1: book2 });
    expect(await s.press(f)).toEqual({ ok: true, line: "Only book 1 can be used for now." });
    s.w.m.state.books.push({ id: uuid(998), parentId: other.parentId, childId: other.childId, number: 2, status: "approved", printedRevision: null });
    s.add(other);
    expect(await s.press(other)).toEqual({ ok: false, error: "refused", line: "This book already has a next book." });
    expect(s.w.m.state.runs).toEqual([]);
  });

  it("with no planner says so and reads and writes nothing", async () => {
    const s = setup();
    const f = s.w.family(1);
    s.add(f);
    expect(await s.press(f, { planner: null })).toEqual({ ok: false, error: "planner-not-ready", line: PLANNER_NOT_READY });
    expect(await s.press(f, { prepare: () => null })).toMatchObject({ ok: false, line: "The planner is not ready yet." });
    expect(s.reads).toEqual([]);
    expect(s.w.writes).toEqual([]);
  });

  it("refuses a non-admin, and writes nothing", async () => {
    const s = setup();
    const f = s.w.family(1);
    s.add(f);
    expect(await s.press(f, {}, null)).toMatchObject({ ok: false, error: "not-found" });
    expect(s.w.writes).toEqual([]);
    // An actor the database does not know as an admin is refused by the store too.
    expect(await s.press(f, {}, { id: uuid(9_001), email: null } as unknown as typeof ADMIN)).toMatchObject({ ok: false, error: "not-found" });
    expect(s.w.m.state.snapshots).toEqual([]);
  });

  it("refuses a family in deletion before any write, and the store refuses it too", async () => {
    const s = setup();
    const f = s.w.family(1), g = s.w.family(2);
    s.add(f, { deleting: true });
    expect(await s.press(f)).toEqual({ ok: false, error: "family-deleting", line: "This family is being deleted." });
    expect(s.w.writes).toEqual([]);
    // A deletion that starts after the page read: the database's family fence refuses the claim.
    s.add(g);
    s.w.m.state.deletingParents.add(g.parentId);
    expect(await s.press(g)).toEqual({ ok: false, error: "refused", line: "This family is being deleted." });
    expect(s.w.m.state.snapshots).toEqual([]);
  });

  it("refuses a child with no delivered book 1, and hides errors behind plain words", async () => {
    const s = setup();
    const f = s.w.family(1), g = s.w.family(2);
    s.add(f, { deliveredBook1: null });
    expect(await s.press(f)).toEqual({ ok: false, error: "no-delivered-book", line: "Book 1 has not been delivered yet." });
    s.add(g);
    const failed = await s.press(g, { family: async () => { throw new Error("connection refused at 10.0.0.1"); } });
    expect(failed).toEqual({ ok: false, error: "unavailable", line: "It could not be prepared. Try again later." });
    expect(await s.press({ ...g, childId: uuid(7_777) })).toMatchObject({ ok: false, error: "not-found" });
    expect(s.w.writes).toEqual([]);
  });
});
