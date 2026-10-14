import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSession,
  nextQuestion,
  recordAnswer,
  restoreSession,
  startAttempt,
  storedTest,
  submitAnswer,
  type Attempt,
  type Grade,
  type StartState,
  type StoredTest,
  type Submission,
} from "@/lib/assessment";
import { allRight, type Script } from "@/lib/assessment/scripted-child";
import { nextStep, startStates, startTest, stateFor, StoreError } from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";

// The test attempt module (#146) against the in-memory store, which keeps the database's guards: one open test per
// child (a unique index), updates that only change a test while it is still open (guarded updates), and reads that
// return only the parent's own rows. Every store call yields first, so two requests started together interleave.
// A scripted child from the assessment core gives the answers already stored.
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 10, 18, 0);

const P1 = "parent-1";
const C1 = "child-1";
const ASHA = { grade: 4, province: "BC" } as const;
/** Asha, grade 4 in BC: parent 1's child. */
const asha = { id: C1, parentId: P1, ...ASHA };

/** The answers a scripted child gives to the first `count` questions of a stored test. */
function answersOf(test: StoredTest, count: number, script: Script = allRight): Submission[] {
  let session = restoreSession(test, []);
  const answers: Submission[] = [];
  for (let q = nextQuestion(session); q && answers.length < count; q = nextQuestion(session)) {
    const answer = { questionId: q.id, response: script(q, answers.length) ? q.answer : "no idea", timeMs: 20_000 };
    session = submitAnswer(session, answer);
    answers.push(answer);
  }
  return answers;
}

/** Asha's stored test (or another grade 4 child's), drawn from `seed`, with the first `answered` answers of a scripted child. */
function stored(attempt: Attempt, { seed = 7, parent = P1, child = C1, answered = 0 }: { seed?: number; parent?: string; child?: string; answered?: number } = {}): MemoryTest {
  const test = storedTest(createSession(ASHA, seed));
  return { ...attempt, parentId: parent, childId: child, seed, test, answers: answersOf(test, answered) };
}

/** Parent 1's family: Asha and her stored tests. */
const family = (...tests: MemoryTest[]) => memoryAttemptStore({ children: [asha], tests });

const open = (id: string, at: number) => startAttempt(id, at);
const done = (id: string, at: number) => ({ ...startAttempt(id, at), status: "completed" as const, completedAt: at + HOUR });

/** Seeds in a fixed order, so a test can make the first draw repeat an old seed. */
const seeds = (...list: number[]) => () => list.shift() ?? 999;

/** Keeps the expected store failures out of the test output, and lets a test read what was logged. */
const logs = () => vi.spyOn(console, "error").mockImplementation(() => {});
afterEach(() => vi.restoreAllMocks());

/** Parent 1 presses Start (or Continue, or Start again with `restart`) for Asha. */
const start = (store: Parameters<typeof startTest>[0], now: number, options: Parameters<typeof startTest>[4]) => startTest(store, P1, C1, now, options);

describe("starting a child's test", () => {
  it("creates the first test with a new seed", async () => {
    const { store, tests: rows } = family();
    const result = await start(store, T0, { restart: false, newSeed: seeds(42) });
    expect(result).toEqual({ ok: true, id: "a1", resumed: false });
    expect(rows).toMatchObject([{ id: "a1", status: "in_progress", seed: 42, startedAt: T0, resumeUntil: T0 + DAY }]);
  });

  it("continues the open test, and opening it does not move its deadline", async () => {
    const { store, tests: rows } = family(stored(open("a1", T0), { seed: 7 }));
    const result = await start(store, T0 + 20 * HOUR, { restart: false, newSeed: seeds(42) });
    expect(result).toEqual({ ok: true, id: "a1", resumed: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].resumeUntil).toBe(T0 + 24 * HOUR);
  });

  it("tells a family who pressed Continue after 24 hours that the test expired, and changes nothing", async () => {
    const { store, tests: rows } = family(stored(open("a1", T0), { seed: 7 }));
    const result = await start(store, T0 + 25 * HOUR, { restart: false, newSeed: seeds(42) });
    expect(result).toEqual({ ok: false, error: "expired" });
    expect(rows).toMatchObject([{ id: "a1", status: "in_progress" }]);
  });

  it("on Start again, marks the old test expired and starts a new one with another seed", async () => {
    const { store, tests: rows } = family(stored(open("a1", T0), { seed: 7 }));
    const result = await start(store, T0 + 25 * HOUR, { restart: true, newSeed: seeds(7, 8) });
    expect(result).toEqual({ ok: true, id: "a2", resumed: false });
    expect(rows).toMatchObject([
      { id: "a1", status: "expired", seed: 7 },
      { id: "a2", status: "in_progress", seed: 8, startedAt: T0 + 25 * HOUR },
    ]);
  });

  it("refuses a new test inside the 30 days after a completed one", async () => {
    const { store, tests: rows } = family(stored(done("a1", T0), { seed: 7 }));
    const result = await start(store, T0 + 3 * DAY, { restart: false, newSeed: seeds(42) });
    expect(result).toEqual({ ok: false, error: "retake_closed", opensAt: T0 + HOUR + 30 * DAY });
    expect(rows).toHaveLength(1);
  });

  it("starts a retake after the 30 days", async () => {
    const { store } = family(stored(done("a1", T0), { seed: 7 }));
    expect(await start(store, T0 + 31 * DAY, { restart: false, newSeed: seeds(42) })).toEqual({ ok: true, id: "a2", resumed: false });
  });

  it("hands back a test with every answer in, even after 24 hours, so it can be scored", async () => {
    const { store, tests: rows } = family(stored(open("a1", T0), { seed: 7, answered: 36 }));
    const result = await start(store, T0 + 3 * DAY, { restart: true, newSeed: seeds(42) });
    expect(result).toEqual({ ok: true, id: "a1", resumed: true });
    expect(rows).toHaveLength(1);
  });
});

describe("two start requests at once", () => {
  it("first test: one test is created and both requests get it", async () => {
    const { store, tests: rows } = family();
    const results = await Promise.all([
      start(store, T0, { restart: false, newSeed: seeds(1) }),
      start(store, T0, { restart: false, newSeed: seeds(2) }),
    ]);
    expect(rows).toHaveLength(1);
    expect(results.map((r) => r.ok && r.id)).toEqual(["a1", "a1"]);
  });

  it("Start again pressed twice: one new test, and both requests get it", async () => {
    const { store, tests: rows } = family(stored(open("a1", T0), { seed: 7 }));
    const at = T0 + 30 * HOUR;
    const results = await Promise.all([
      start(store, at, { restart: true, newSeed: seeds(11) }),
      start(store, at, { restart: true, newSeed: seeds(12) }),
    ]);
    expect(rows.filter((r) => r.status === "in_progress")).toHaveLength(1);
    expect(rows.map((r) => r.status)).toEqual(["expired", "in_progress"]);
    expect(results.map((r) => r.ok && r.id)).toEqual(["a2", "a2"]);
  });

  it("a retake requested twice: one new test", async () => {
    const { store, tests: rows } = family(stored(done("a1", T0), { seed: 7 }));
    const at = T0 + 40 * DAY;
    const results = await Promise.all([
      start(store, at, { restart: false, newSeed: seeds(11) }),
      start(store, at, { restart: false, newSeed: seeds(12) }),
    ]);
    expect(rows).toHaveLength(2);
    expect(results.map((r) => r.ok && r.id)).toEqual(["a2", "a2"]);
  });
});

describe("the new test a start request stores", () => {
  it("has the questions drawn from its seed for the child's grade and province, and no answers", async () => {
    const { store, tests: rows } = family();
    await start(store, T0, { restart: false, newSeed: seeds(42) });
    expect(rows[0].test).toEqual(storedTest(createSession(ASHA, 42)));
    expect(rows[0].answers).toEqual([]);
    expect(await nextStep(store, P1, "a1", T0)).toMatchObject({ ok: true, step: { status: "question", number: 1 } });
  });

  it("is not made for another family's child", async () => {
    const { store, tests: rows } = family();
    expect(await startTest(store, "parent-2", C1, T0, { restart: false, newSeed: seeds(42) })).toEqual({ ok: false, error: "not_found" });
    expect(rows).toEqual([]);
  });

  it("is not made for a grade the question bank cannot cover", async () => {
    const log = logs();
    const { store, tests: rows } = memoryAttemptStore({ children: [{ ...asha, grade: 9 as Grade }] });
    expect(await start(store, T0, { restart: false, newSeed: seeds(42) })).toEqual({ ok: false, error: "not_ready" });
    expect(rows).toEqual([]);
    expect(log.mock.calls).toEqual([["[test] cannot build a test", 9, "No grade band for grade 9"]]);
  });
});

describe("the next step of a test", () => {
  it("is the first question of a fresh test, without its answer", async () => {
    const memory = memoryAttemptStore({ tests: [stored(startAttempt("a1", T0))] });
    const first = memory.tests[0].test.stage1[0];
    const result = await nextStep(memory.store, P1, "a1", T0 + HOUR);
    expect(result).toMatchObject({ ok: true, step: { status: "question", number: 1, total: 36, breakAfter: 18, question: { id: first.id, prompt: first.prompt } } });
    expect(result.ok && result.step.status === "question" && result.step.question).not.toHaveProperty("answer");
  });

  it("is the question after the answers stored so far", async () => {
    const memory = memoryAttemptStore({ tests: [stored(startAttempt("a1", T0), { answered: 5 })] });
    const sixth = memory.tests[0].test.stage1[5];
    const result = await nextStep(memory.store, P1, "a1", T0 + HOUR);
    expect(result).toMatchObject({ ok: true, step: { status: "question", number: 6, question: { id: sixth.id } } });
  });

  it("is complete when every answer is in", async () => {
    const memory = memoryAttemptStore({ tests: [stored(startAttempt("a1", T0), { answered: 36 })] });
    expect(await nextStep(memory.store, P1, "a1", T0 + HOUR)).toEqual({ ok: true, step: { status: "complete", total: 36 } });
  });

  it("is expired 24 hours after the last answer, and the store then holds the test as expired", async () => {
    const memory = memoryAttemptStore({ tests: [stored(recordAnswer(startAttempt("a1", T0), T0 + HOUR), { answered: 5 })] });
    expect(await nextStep(memory.store, P1, "a1", T0 + 25 * HOUR)).toMatchObject({ ok: true });
    expect(await nextStep(memory.store, P1, "a1", T0 + 25 * HOUR + 1)).toEqual({ ok: false, error: "expired" });
    expect(memory.tests).toMatchObject([{ id: "a1", status: "expired" }]);
    expect(memory.tests[0].answers).toHaveLength(5);
  });

  it("never expires a test with every answer in: it only waits to be scored", async () => {
    const memory = memoryAttemptStore({ tests: [stored(recordAnswer(startAttempt("a1", T0), T0 + HOUR), { answered: 36 })] });
    expect(await nextStep(memory.store, P1, "a1", T0 + 3 * DAY)).toEqual({ ok: true, step: { status: "complete", total: 36 } });
    expect(memory.tests).toMatchObject([{ id: "a1", status: "in_progress" }]);
  });

  it("is not found for another family's test, and the request changes nothing", async () => {
    const memory = memoryAttemptStore({ tests: [stored(startAttempt("a1", T0), { parent: "parent-2", answered: 3 })] });
    expect(await nextStep(memory.store, P1, "a1", T0 + HOUR)).toEqual({ ok: false, error: "not_found" });
    expect(await nextStep(memory.store, P1, "a1", T0 + 3 * DAY)).toEqual({ ok: false, error: "not_found" });
    expect(memory.tests).toMatchObject([{ id: "a1", status: "in_progress" }]);
    expect(await nextStep(memory.store, P1, "no-such-test", T0)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("what each child's start screen offers", () => {
  /** Parent 1's five children at T0 + 2 hours, and one child of another family. */
  const families = () => memoryAttemptStore({
    children: [1, 2, 3, 4, 5, 6].map((n) => ({ ...asha, id: `child-${n}`, parentId: n === 6 ? "parent-2" : P1 })),
    tests: [
      stored(recordAnswer(open("a1", T0), T0 + HOUR), { answered: 5 }),
      stored(done("a2", T0 - 3 * DAY), { child: "child-2" }),
      stored(open("a3", T0 - 2 * DAY), { child: "child-3", answered: 36 }),
      stored(open("a4", T0 - 2 * DAY), { child: "child-4", answered: 2 }),
      stored(open("a5", T0), { child: "child-6", parent: "parent-2" }),
    ],
  });
  const at = T0 + 2 * HOUR;

  it("is read for every child of the parent, by the start request's rules, and writes nothing", async () => {
    const memory = families();
    const states = await startStates(memory.store, P1, at);
    expect(states).toEqual(new Map<string, StartState>([
      ["child-1", { kind: "resume", attemptId: "a1", resumeUntil: T0 + HOUR + DAY }],
      ["child-2", { kind: "wait", completedAt: T0 - 3 * DAY + HOUR, opensAt: T0 - 3 * DAY + HOUR + 30 * DAY }],
      ["child-3", { kind: "finish", attemptId: "a3" }],
      ["child-4", { kind: "expired", attemptId: "a4" }],
    ]));
    // A child with no test starts one.
    expect(stateFor(states, "child-5")).toEqual({ kind: "start", retake: false });
    expect(memory.tests.map((t) => t.status)).toEqual(["in_progress", "completed", "in_progress", "in_progress", "in_progress"]);
  });

  it("is read for one child", async () => {
    expect(await startStates(families().store, P1, at, "child-3")).toEqual(new Map([["child-3", { kind: "finish", attemptId: "a3" }]]));
  });

  it("agrees with the start request for each child", async () => {
    const memory = families();
    const pressStart = (child: string) => startTest(memory.store, P1, child, at, { restart: false, newSeed: seeds(42) });
    expect(await pressStart("child-1")).toEqual({ ok: true, id: "a1", resumed: true });
    expect(await pressStart("child-2")).toEqual({ ok: false, error: "retake_closed", opensAt: T0 - 3 * DAY + HOUR + 30 * DAY });
    expect(await pressStart("child-3")).toEqual({ ok: true, id: "a3", resumed: true });
    expect(await pressStart("child-4")).toEqual({ ok: false, error: "expired" });
    expect(await pressStart("child-5")).toEqual({ ok: true, id: "a6", resumed: false });
  });

  it("offers Start test to every child when the store fails", async () => {
    const log = logs();
    const memory = families();
    memory.fail.attempts = new StoreError("attempts load failed", "timeout");
    expect(await startStates(memory.store, P1, at)).toEqual(new Map());
    expect(log.mock.calls).toEqual([["[test]", "attempts load failed: timeout"]]);
  });

  it("offers Start test to every child when an open test cannot be read, logged as before", async () => {
    const log = logs();
    const memory = families();
    memory.fail.load = new StoreError("load failed", "timeout");
    expect(await startStates(memory.store, P1, at)).toEqual(new Map());
    // One line for each of the three open tests, then the request's own.
    expect(log.mock.calls).toEqual([...Array(3).fill(["[test] load failed", "timeout"]), ["[test]", "open test read failed"]]);
  });
});

describe("when the store fails", () => {
  it("a failed read is store_failed, logged as before", async () => {
    const log = logs();
    const memory = memoryAttemptStore({ tests: [stored(startAttempt("a1", T0))] });
    memory.fail.load = new StoreError("answers load failed", "connection reset");
    expect(await nextStep(memory.store, P1, "a1", T0)).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual([["[test] answers load failed", "connection reset"]]);
  });

  it("a stored test the assessment core cannot rebuild is store_failed, as unreadable", async () => {
    const log = logs();
    const broken = stored(startAttempt("a1", T0), { answered: 2 });
    broken.answers[1].questionId = "not-this-test";
    const memory = memoryAttemptStore({ tests: [broken] });
    expect(await nextStep(memory.store, P1, "a1", T0)).toEqual({ ok: false, error: "store_failed", unreadable: true });
    expect(log.mock.calls).toEqual([["[test] restore failed", "a1", "Expected an answer to s1-1, got not-this-test"]]);
  });

  it("a test that ran out of time is still expired when marking it fails", async () => {
    const log = logs();
    const memory = memoryAttemptStore({ tests: [stored(startAttempt("a1", T0))] });
    memory.fail.expire = new StoreError("expire failed", "timeout");
    expect(await nextStep(memory.store, P1, "a1", T0 + 25 * HOUR)).toEqual({ ok: false, error: "expired" });
    expect(log.mock.calls).toEqual([["[test]", "expire failed: timeout"]]);
  });

  it("a failed start is store_failed, logged as before", async () => {
    const log = logs();
    const { store, tests: rows, fail } = family(stored(open("a1", T0), { seed: 7 }));
    fail.create = new StoreError("start failed", "insert refused");
    expect(await start(store, T0 + 25 * HOUR, { restart: true, newSeed: seeds(8) })).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual([["[test] start failed", "start failed: insert refused"]]);
    expect(rows).toHaveLength(1);
  });

  it("a failed child read is store_failed, logged as before", async () => {
    const log = logs();
    const { store, fail } = family();
    fail.child = new StoreError("child load failed", "timeout");
    expect(await start(store, T0, { restart: false, newSeed: seeds(8) })).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual([["[test] child load failed", "timeout"]]);
  });

  it("an open test that cannot be read stops the start request, logged as before", async () => {
    const log = logs();
    const { store, tests: rows, fail } = family(stored(open("a1", T0), { seed: 7 }));
    fail.load = new StoreError("load failed", "timeout");
    expect(await start(store, T0, { restart: false, newSeed: seeds(8) })).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual([["[test] load failed", "timeout"], ["[test] start failed", "open test read failed"]]);
    expect(rows).toHaveLength(1);
  });
});
