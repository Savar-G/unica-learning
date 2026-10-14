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
import { answerQuestion, nextStep, startStates, startTest, stateFor, StoreError, type AnswerInput, type AttemptStore } from "@/lib/test-attempt";
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

// Asha's test drawn from seed 7 (grade 4): questions 1 and 2 need shown work; question 3 is a choice question that
// does not, and question 4 a number question that does not.
/** The question the scripted child answers next on a stored test. */
const current = (row: MemoryTest) => nextQuestion(restoreSession(row.test, row.answers))!;
/** The answer a child sends: the right response in 20 seconds, with an empty board unless `work` is given. */
const sent = (row: MemoryTest, work: Partial<AnswerInput["work"]> = {}): AnswerInput =>
  ({ questionId: current(row).id, response: current(row).answer, timeMs: 20_000, work: { png: null, text: "", ...work } });
/** A small PNG drawing: the PNG signature and one byte. */
const DRAWING = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

describe("answering a question", () => {
  it("stores the answer, moves the deadline to 24 hours after it, sets the last answer time, and sends the next question", async () => {
    const memory = family(stored(recordAnswer(open("a1", T0), T0 + HOUR), { answered: 2 }));
    const third = current(memory.tests[0]);
    const at = T0 + 2 * HOUR;
    const result = await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), at);
    expect(result).toMatchObject({ ok: true, step: { status: "question", number: 4, question: { id: memory.tests[0].test.stage1[3].id } } });
    expect(memory.tests[0]).toMatchObject({ status: "in_progress", resumeUntil: T0 + 26 * HOUR, lastAnswerAt: at });
    expect(memory.tests[0].answers).toHaveLength(3);
    expect(memory.tests[0].answers[2]).toEqual({
      position: 2,
      questionId: third.id,
      templateId: third.templateId,
      values: third.values,
      response: third.answer,
      timeMs: 20_000,
      correct: true,
      misconception: null,
      workRequired: false,
      workPath: null,
      workText: null,
    });
  });
});

describe("the work on the whiteboard (#67)", () => {
  it("stores the drawing, and the answer points to it", async () => {
    const memory = family(stored(open("a1", T0)));
    const first = current(memory.tests[0]);
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { png: DRAWING, text: "carry the 1" }), T0 + HOUR)).toMatchObject({ ok: true, step: { number: 2 } });
    const [path] = [...memory.drawings.keys()];
    expect(path).toMatch(new RegExp(`^${P1}/a1/${first.id}-.+\\.png$`));
    expect(memory.drawings.get(path)).toEqual(DRAWING);
    expect(memory.tests[0].answers).toMatchObject([{ questionId: first.id, workRequired: true, workPath: path, workText: "carry the 1" }]);
  });

  it("refuses a show-your-work question answered with an empty board as work required, and stores nothing", async () => {
    const memory = family(stored(open("a1", T0)));
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), T0 + HOUR)).toEqual({ ok: false, error: "work_required" });
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + DAY, lastAnswerAt: null });
    expect(memory.tests[0].answers).toEqual([]);
    // Typed working is work too, from grade 3.
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { text: "7 x 6 = 42" }), T0 + HOUR)).toMatchObject({ ok: true });
    expect(memory.tests[0].answers).toMatchObject([{ workRequired: true, workPath: null, workText: "7 x 6 = 42" }]);
    expect(memory.drawings.size).toBe(0);
  });

  it("refuses typed working in grades 1 and 2, which draw only, and stores nothing; a drawing is taken", async () => {
    const ben = { grade: 2, province: "BC" } as const;
    const test = storedTest(createSession(ben, 7));
    // Ben's test drawn from seed 7 (grade 2): question 2 needs no shown work.
    const memory = memoryAttemptStore({
      children: [{ id: C1, parentId: P1, ...ben }],
      tests: [{ ...open("a1", T0), parentId: P1, childId: C1, seed: 7, test, answers: answersOf(test, 1) }],
    });
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { text: "5" }), T0 + HOUR)).toEqual({ ok: false, error: "typing_off" });
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { png: DRAWING, text: "5" }), T0 + HOUR)).toEqual({ ok: false, error: "typing_off" });
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + DAY, lastAnswerAt: null });
    expect(memory.tests[0].answers).toHaveLength(1);
    expect(memory.drawings.size).toBe(0);
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { png: DRAWING }), T0 + HOUR)).toMatchObject({ ok: true, step: { number: 3 } });
    expect(memory.tests[0].answers[1]).toMatchObject({ workRequired: false, workPath: [...memory.drawings.keys()][0], workText: null });
  });
});

describe("a child who answers every question", () => {
  it("is routed once, when stage 1 ends, and each stored answer moves the deadline and the last answer time", async () => {
    const memory = family(stored(open("a1", T0)));
    const routes: string[] = [];
    const store: AttemptStore = { ...memory.store, recordRoute: (id, route) => (routes.push(route), memory.store.recordRoute(id, route)) };
    const routeAfter: (string | null | undefined)[] = [];
    const first = await nextStep(store, P1, "a1", T0);
    if (!first.ok) throw new Error(first.error);
    let step = first.step;
    for (let n = 1; step.status === "question"; n++) {
      const q = current(memory.tests[0]);
      const at = T0 + n * 60_000;
      const result = await answerQuestion(store, P1, "a1", sent(memory.tests[0], q.showWork ? { png: DRAWING } : {}), at);
      if (!result.ok) throw new Error(`answer ${n}: ${result.error}`);
      step = result.step;
      routeAfter.push(memory.tests[0].route);
      expect(memory.tests[0]).toMatchObject({ resumeUntil: at + DAY, lastAnswerAt: at });
    }
    expect(step).toEqual({ status: "complete", total: 36 });
    expect(memory.tests[0].answers).toHaveLength(36);
    // A child with every answer right goes up after the 18 questions of stage 1.
    expect(routeAfter.slice(0, 17).every((r) => r == null)).toBe(true);
    expect(routeAfter.slice(17)).toEqual(Array(19).fill("up"));
    expect(routes).toEqual(["up"]);
    // Seven questions needed shown work; each drawing is stored with its answer.
    expect(memory.tests[0].answers.filter((a) => a.workRequired).map((a) => a.workPath)).toEqual([...memory.drawings.keys()]);
    expect(memory.drawings.size).toBe(7);
  });

  it("logs a route that cannot be saved, as before, and the answer still moves on", async () => {
    const log = logs();
    const memory = family(stored(open("a1", T0), { answered: 17 }));
    memory.fail.recordRoute = new StoreError("route save failed", "timeout");
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), T0 + HOUR)).toMatchObject({ ok: true, step: { number: 19 } });
    expect(memory.tests[0].answers).toHaveLength(18);
    expect(log.mock.calls).toEqual([["[test] route save failed", "timeout"]]);
  });

  it("never moves the last answer time back: another server stored a later one first", async () => {
    const memory = family(stored({ ...recordAnswer(open("a1", T0), T0 + 2 * HOUR) }, { answered: 2 }));
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), T0 + HOUR)).toMatchObject({ ok: true });
    expect(memory.tests[0].lastAnswerAt).toBe(T0 + 2 * HOUR);
  });
});

describe("when storing an answer fails", () => {
  it("a failed drawing upload puts the deadline back and stores no answer", async () => {
    const log = logs();
    const memory = family(stored(recordAnswer(open("a1", T0), T0 + HOUR)));
    memory.fail.storeDrawing = new StoreError("upload failed", "bucket full");
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { png: DRAWING }), T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + 25 * HOUR, lastAnswerAt: T0 + HOUR });
    expect(memory.tests[0].answers).toEqual([]);
    expect(log.mock.calls).toEqual([["[work] upload failed", "bucket full"]]);
  });

  it("a failed answer insert removes the drawing and puts the deadline back: no drawing is left without its answer", async () => {
    const log = logs();
    const memory = family(stored(recordAnswer(open("a1", T0), T0 + HOUR)));
    memory.fail.insertAnswer = new StoreError("answer save failed", "connection reset");
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { png: DRAWING }), T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + 25 * HOUR, lastAnswerAt: T0 + HOUR });
    expect(memory.tests[0].answers).toEqual([]);
    expect(memory.drawings.size).toBe(0);
    expect(log.mock.calls).toEqual([["[test] answer save failed", "connection reset"]]);
  });

  it("a test that cannot be read is store_failed and changes nothing, logged as before", async () => {
    const log = logs();
    const memory = family(stored(recordAnswer(open("a1", T0), T0 + HOUR), { answered: 2 }));
    memory.fail.load = new StoreError("answers load failed", "timeout");
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + 25 * HOUR, lastAnswerAt: T0 + HOUR });
    expect(memory.tests[0].answers).toHaveLength(2);
    expect(log.mock.calls).toEqual([["[test] answers load failed", "timeout"]]);
  });

  it("a failed answer does not put back a deadline that another tab's stored answer moved since", async () => {
    logs();
    const memory = family(stored(open("a1", T0), { answered: 2 }));
    memory.fail.storeDrawing = new StoreError("upload failed", "bucket full");
    const results = await Promise.all([
      answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { png: DRAWING }), T0 + HOUR),
      answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), T0 + 2 * HOUR),
    ]);
    expect(results).toMatchObject([{ ok: false, error: "store_failed" }, { ok: true, step: { number: 4 } }]);
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + 26 * HOUR, lastAnswerAt: T0 + 2 * HOUR });
    expect(memory.tests[0].answers).toHaveLength(3);
  });

  it("a failed deadline move is store_failed and stores nothing, logged as before", async () => {
    const log = logs();
    const memory = family(stored(recordAnswer(open("a1", T0), T0 + HOUR)));
    memory.fail.openAnswerWindow = new StoreError("deadline update failed", "timeout");
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { png: DRAWING }), T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + 25 * HOUR, lastAnswerAt: T0 + HOUR });
    expect(memory.tests[0].answers).toEqual([]);
    expect(memory.drawings.size).toBe(0);
    expect(log.mock.calls).toEqual([["[test]", "deadline update failed: timeout"]]);
  });

  it("logs each cleanup step that fails too, as before, and still refuses", async () => {
    const log = logs();
    const memory = family(stored(recordAnswer(open("a1", T0), T0 + HOUR)));
    memory.fail.insertAnswer = new StoreError("answer save failed", "connection reset");
    memory.fail.removeDrawing = new StoreError("remove failed", "bucket down");
    memory.fail.undoAnswerWindow = new StoreError("deadline undo failed", "timeout");
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { png: DRAWING }), T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual([
      ["[work] remove failed", "bucket down"],
      ["[test] answer save failed", "connection reset"],
      ["[test] deadline undo failed", "timeout"],
    ]);
    log.mockClear();
    memory.fail.storeDrawing = new StoreError("upload failed", "bucket full");
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { png: DRAWING }), T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual([["[work] upload failed", "bucket full"], ["[test] deadline undo failed", "timeout"]]);
  });

  it("a stored answer whose answer time cannot be saved still moves on, logged as before", async () => {
    const log = logs();
    const memory = family(stored(recordAnswer(open("a1", T0), T0 + HOUR), { answered: 2 }));
    memory.fail.recordAnswerTime = new StoreError("answer time save failed", "timeout");
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), T0 + 2 * HOUR)).toMatchObject({ ok: true, step: { number: 4 } });
    expect(memory.tests[0].answers).toHaveLength(3);
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + 26 * HOUR, lastAnswerAt: T0 + HOUR });
    expect(log.mock.calls).toEqual([["[test] answer time save failed", "timeout"]]);
  });

  it("an answer stored by another tab first: the drawing is removed, and the step after that answer comes back", async () => {
    const memory = family(stored(open("a1", T0)));
    const second = memory.tests[0].test.stage1[1];
    const results = await Promise.all([
      answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { png: DRAWING }), T0 + HOUR),
      answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { png: new Uint8Array([...DRAWING, 2]) }), T0 + HOUR),
    ]);
    expect(results).toMatchObject([
      { ok: true, step: { number: 2, question: { id: second.id } } },
      { ok: false, error: "conflict", step: { number: 2, question: { id: second.id } } },
    ]);
    expect(memory.tests[0].answers).toHaveLength(1);
    expect([...memory.drawings]).toEqual([[memory.tests[0].answers[0].workPath, DRAWING]]);
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + 25 * HOUR, lastAnswerAt: T0 + HOUR });
  });
});

describe("one answer per question", () => {
  it("a double submit stores one answer, and the second request gets a conflict with the next question", async () => {
    const memory = family(stored(open("a1", T0), { answered: 2 }));
    const answer = sent(memory.tests[0]);
    const results = await Promise.all([
      answerQuestion(memory.store, P1, "a1", answer, T0 + HOUR),
      answerQuestion(memory.store, P1, "a1", answer, T0 + HOUR),
    ]);
    const fourth = { status: "question", number: 4, question: { id: memory.tests[0].test.stage1[3].id } };
    expect(results).toMatchObject([{ ok: true, step: fourth }, { ok: false, error: "conflict", step: fourth }]);
    expect(memory.tests[0].answers).toHaveLength(3);
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + 25 * HOUR, lastAnswerAt: T0 + HOUR });
  });

  it("a retried answer to a question already answered gets a conflict with the next question, and stores nothing", async () => {
    const memory = family(stored(open("a1", T0), { answered: 2 }));
    const answer = sent(memory.tests[0]);
    await answerQuestion(memory.store, P1, "a1", answer, T0 + HOUR);
    const retry = await answerQuestion(memory.store, P1, "a1", answer, T0 + 2 * HOUR);
    expect(retry).toMatchObject({ ok: false, error: "conflict", step: { status: "question", number: 4 } });
    expect(memory.tests[0].answers).toHaveLength(3);
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + 25 * HOUR, lastAnswerAt: T0 + HOUR });
  });

  it("an answer to a complete test, or to a test that is not in progress, gets a conflict with its step", async () => {
    const complete = family(stored(open("a1", T0), { answered: 36 }));
    const last = complete.tests[0].answers[35];
    const answer = { questionId: last.questionId, response: last.response, timeMs: 20_000, work: { png: null, text: "" } };
    expect(await answerQuestion(complete.store, P1, "a1", answer, T0 + HOUR)).toEqual({ ok: false, error: "conflict", step: { status: "complete", total: 36 } });
    const scored = family(stored(done("a1", T0), { answered: 2 }));
    expect(await answerQuestion(scored.store, P1, "a1", sent(scored.tests[0]), T0 + 2 * HOUR))
      .toMatchObject({ ok: false, error: "conflict", step: { status: "question", number: 3 } });
    expect([complete.tests[0].answers, scored.tests[0].answers].map((a) => a.length)).toEqual([36, 2]);
  });

  it("refuses a response that does not fit the question, or a time that is not one, and stores nothing", async () => {
    const memory = family(stored(open("a1", T0), { answered: 2 }));
    const third = sent(memory.tests[0]); // a choice question
    const fourth = { ...third, questionId: memory.tests[0].test.stage1[3].id }; // a number question
    const refused = [
      { ...third, response: "not one of the choices" },
      { ...third, response: "  " },
      { ...third, timeMs: Number.NaN },
      { ...third, timeMs: -1 },
    ];
    for (const answer of refused) expect(await answerQuestion(memory.store, P1, "a1", answer, T0 + HOUR)).toEqual({ ok: false, error: "invalid" });
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + DAY, lastAnswerAt: null });
    expect(memory.tests[0].answers).toHaveLength(2);
    // A number answer up to 12 characters, after trimming.
    await answerQuestion(memory.store, P1, "a1", third, T0 + HOUR);
    expect(await answerQuestion(memory.store, P1, "a1", { ...fourth, response: "1234567890123" }, T0 + HOUR)).toEqual({ ok: false, error: "invalid" });
    expect(await answerQuestion(memory.store, P1, "a1", { ...fourth, response: " 123456789012 ", timeMs: 3 * HOUR }, T0 + HOUR)).toMatchObject({ ok: true });
    expect(memory.tests[0].answers[3]).toMatchObject({ response: "123456789012", correct: false, timeMs: HOUR });
  });
});

describe("an answer after the test ran out of time", () => {
  it("is refused as expired and stores nothing: the deadline and the last answer time do not move", async () => {
    const memory = family(stored(recordAnswer(open("a1", T0), T0 + HOUR), { answered: 2 }));
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), T0 + 25 * HOUR + 1)).toEqual({ ok: false, error: "expired" });
    expect(memory.tests[0]).toMatchObject({ status: "expired", resumeUntil: T0 + 25 * HOUR, lastAnswerAt: T0 + HOUR });
    expect(memory.tests[0].answers).toHaveLength(2);
  });

  it("is taken up to the last moment of the deadline", async () => {
    const memory = family(stored(recordAnswer(open("a1", T0), T0 + HOUR), { answered: 2 }));
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), T0 + 25 * HOUR)).toMatchObject({ ok: true });
    expect(memory.tests[0]).toMatchObject({ status: "in_progress", resumeUntil: T0 + 49 * HOUR, lastAnswerAt: T0 + 25 * HOUR });
  });

  it("is refused as expired after Start again closed the test, and stores nothing", async () => {
    const memory = family(stored(recordAnswer(open("a1", T0), T0 + HOUR), { answered: 2 }));
    memory.tests[0].status = "expired";
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), T0 + 2 * HOUR)).toEqual({ ok: false, error: "expired" });
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + 25 * HOUR, lastAnswerAt: T0 + HOUR });
    expect(memory.tests[0].answers).toHaveLength(2);
  });

  // The answer reads the test on its last open moment; another request, a moment later, finds it ran out of time and
  // marks it expired. The store's guards let only one of the two writes win.
  it("racing an expire, loses when the expire is stored first: nothing is stored and the test stays expired", async () => {
    const memory = family(stored(recordAnswer(open("a1", T0), T0 + HOUR), { answered: 2 }));
    const answer = sent(memory.tests[0]);
    const [, answered] = await Promise.all([
      nextStep(memory.store, P1, "a1", T0 + 25 * HOUR + 1),
      answerQuestion(memory.store, P1, "a1", answer, T0 + 25 * HOUR),
    ]);
    expect(answered).toEqual({ ok: false, error: "expired" });
    expect(memory.tests[0]).toMatchObject({ status: "expired", resumeUntil: T0 + 25 * HOUR, lastAnswerAt: T0 + HOUR });
    expect(memory.tests[0].answers).toHaveLength(2);
  });

  it("racing an expire, wins when its deadline move is stored first: the answer is stored and the test stays open", async () => {
    const memory = family(stored(recordAnswer(open("a1", T0), T0 + HOUR), { answered: 2 }));
    const answer = sent(memory.tests[0]);
    const [answered] = await Promise.all([
      answerQuestion(memory.store, P1, "a1", answer, T0 + 25 * HOUR),
      nextStep(memory.store, P1, "a1", T0 + 25 * HOUR + 1),
    ]);
    expect(answered).toMatchObject({ ok: true, step: { number: 4 } });
    expect(memory.tests[0]).toMatchObject({ status: "in_progress", resumeUntil: T0 + 49 * HOUR, lastAnswerAt: T0 + 25 * HOUR });
    expect(memory.tests[0].answers).toHaveLength(3);
  });

  it("is not found for another family's test, and changes nothing", async () => {
    const memory = memoryAttemptStore({ tests: [stored(open("a1", T0), { parent: "parent-2", answered: 2 })] });
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), T0 + HOUR)).toEqual({ ok: false, error: "not_found" });
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + DAY, lastAnswerAt: null });
    expect(memory.tests[0].answers).toHaveLength(2);
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
