import { describe, expect, it } from "vitest";
import { startAttempt } from "@/lib/assessment";
import { startTest, type StartStore, type StoredAttempt } from "@/lib/test-start";

// The start request (#72) against an in-memory store that keeps the database's guards: one open test per child
// (a unique index), and updates that only change a test while it is still open (guarded updates).
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 10, 18, 0);

function memoryStore(initial: StoredAttempt[] = []) {
  const rows = initial.map((r) => ({ ...r }));
  let next = rows.length;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const store: StartStore = {
    async attempts() {
      await tick();
      return rows.map((r) => ({ ...r }));
    },
    async expire(id, now) {
      await tick();
      const row = rows.find((r) => r.id === id && r.status === "in_progress" && r.resumeUntil < now);
      if (row) row.status = "expired";
    },
    async create(seed, attempt) {
      await tick();
      if (rows.some((r) => r.status === "in_progress")) return "taken";
      const id = `a${++next}`;
      rows.push({ ...attempt, id, seed });
      return { id };
    },
  };
  return { store, rows };
}

const open = (id: string, at: number) => startAttempt(id, at);
const done = (id: string, at: number) => ({ ...startAttempt(id, at), status: "completed" as const, completedAt: at + HOUR });

/** Seeds in a fixed order, so a test can make the first draw repeat an old seed. */
const seeds = (...list: number[]) => () => list.shift() ?? 999;

describe("starting a child's test", () => {
  it("creates the first test with a new seed", async () => {
    const { store, rows } = memoryStore();
    const result = await startTest(store, T0, { restart: false, newSeed: seeds(42) });
    expect(result).toEqual({ ok: true, id: "a1", resumed: false });
    expect(rows).toMatchObject([{ id: "a1", status: "in_progress", seed: 42, startedAt: T0, resumeUntil: T0 + DAY }]);
  });

  it("continues the open test, and opening it does not move its deadline", async () => {
    const { store, rows } = memoryStore([{ ...open("a1", T0), seed: 7 }]);
    const result = await startTest(store, T0 + 20 * HOUR, { restart: false, newSeed: seeds(42) });
    expect(result).toEqual({ ok: true, id: "a1", resumed: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].resumeUntil).toBe(T0 + 24 * HOUR);
  });

  it("tells a family who pressed Continue after 24 hours that the test expired, and changes nothing", async () => {
    const { store, rows } = memoryStore([{ ...open("a1", T0), seed: 7 }]);
    const result = await startTest(store, T0 + 25 * HOUR, { restart: false, newSeed: seeds(42) });
    expect(result).toEqual({ ok: false, error: "expired" });
    expect(rows).toMatchObject([{ id: "a1", status: "in_progress" }]);
  });

  it("on Start again, marks the old test expired and starts a new one with another seed", async () => {
    const { store, rows } = memoryStore([{ ...open("a1", T0), seed: 7 }]);
    const result = await startTest(store, T0 + 25 * HOUR, { restart: true, newSeed: seeds(7, 8) });
    expect(result).toEqual({ ok: true, id: "a2", resumed: false });
    expect(rows).toMatchObject([
      { id: "a1", status: "expired", seed: 7 },
      { id: "a2", status: "in_progress", seed: 8, startedAt: T0 + 25 * HOUR },
    ]);
  });

  it("refuses a new test inside the 30 days after a completed one", async () => {
    const { store, rows } = memoryStore([{ ...done("a1", T0), seed: 7 }]);
    const result = await startTest(store, T0 + 3 * DAY, { restart: false, newSeed: seeds(42) });
    expect(result).toEqual({ ok: false, error: "retake_closed", opensAt: T0 + HOUR + 30 * DAY });
    expect(rows).toHaveLength(1);
  });

  it("starts a retake after the 30 days", async () => {
    const { store } = memoryStore([{ ...done("a1", T0), seed: 7 }]);
    expect(await startTest(store, T0 + 31 * DAY, { restart: false, newSeed: seeds(42) })).toEqual({ ok: true, id: "a2", resumed: false });
  });

  it("hands back a test with every answer in, even after 24 hours, so it can be scored", async () => {
    const { store, rows } = memoryStore([{ ...open("a1", T0), seed: 7, answeredAll: true }]);
    const result = await startTest(store, T0 + 3 * DAY, { restart: true, newSeed: seeds(42) });
    expect(result).toEqual({ ok: true, id: "a1", resumed: true });
    expect(rows).toHaveLength(1);
  });
});

describe("two start requests at once", () => {
  it("first test: one test is created and both requests get it", async () => {
    const { store, rows } = memoryStore();
    const results = await Promise.all([
      startTest(store, T0, { restart: false, newSeed: seeds(1) }),
      startTest(store, T0, { restart: false, newSeed: seeds(2) }),
    ]);
    expect(rows).toHaveLength(1);
    expect(results.map((r) => r.ok && r.id)).toEqual(["a1", "a1"]);
  });

  it("Start again pressed twice: one new test, and both requests get it", async () => {
    const { store, rows } = memoryStore([{ ...open("a1", T0), seed: 7 }]);
    const at = T0 + 30 * HOUR;
    const results = await Promise.all([
      startTest(store, at, { restart: true, newSeed: seeds(11) }),
      startTest(store, at, { restart: true, newSeed: seeds(12) }),
    ]);
    expect(rows.filter((r) => r.status === "in_progress")).toHaveLength(1);
    expect(rows.map((r) => r.status)).toEqual(["expired", "in_progress"]);
    expect(results.map((r) => r.ok && r.id)).toEqual(["a2", "a2"]);
  });

  it("a retake requested twice: one new test", async () => {
    const { store, rows } = memoryStore([{ ...done("a1", T0), seed: 7 }]);
    const at = T0 + 40 * DAY;
    const results = await Promise.all([
      startTest(store, at, { restart: false, newSeed: seeds(11) }),
      startTest(store, at, { restart: false, newSeed: seeds(12) }),
    ]);
    expect(rows).toHaveLength(2);
    expect(results.map((r) => r.ok && r.id)).toEqual(["a2", "a2"]);
  });
});
