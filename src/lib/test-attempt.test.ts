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
import { allRight, knowsUpTo, takeTest, type Script } from "@/lib/assessment/scripted-child";
import { answerQuestion, finishTest, nextStep, retakeState, startStates, startTest, stateFor, StoreError, type AnswerInput, type AttemptStore, type HelpInput } from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";
import { answerFact, readFacts, startFacts } from "@/lib/test-attempt";
import { createFacts } from "@/lib/assessment";

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
    const { store, tests: rows } = family(stored(open("a1", T0), { seed: 7, answered: 42 }));
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
    expect(result).toMatchObject({ ok: true, step: { status: "question", number: 1, total: 42, breakAfter: 18, question: { id: first.id, prompt: first.prompt } } });
    expect(result.ok && result.step.status === "question" && result.step.question).not.toHaveProperty("answer");
  });

  it("is the question after the answers stored so far", async () => {
    const memory = memoryAttemptStore({ tests: [stored(startAttempt("a1", T0), { answered: 5 })] });
    const sixth = memory.tests[0].test.stage1[5];
    const result = await nextStep(memory.store, P1, "a1", T0 + HOUR);
    expect(result).toMatchObject({ ok: true, step: { status: "question", number: 6, question: { id: sixth.id } } });
  });

  it("is complete when every answer is in", async () => {
    const memory = memoryAttemptStore({ tests: [stored(startAttempt("a1", T0), { answered: 42 })] });
    expect(await nextStep(memory.store, P1, "a1", T0 + HOUR)).toEqual({ ok: true, step: { status: "complete", total: 42 } });
  });

  it("is expired 24 hours after the last answer, and the store then holds the test as expired", async () => {
    const memory = memoryAttemptStore({ tests: [stored(recordAnswer(startAttempt("a1", T0), T0 + HOUR), { answered: 5 })] });
    expect(await nextStep(memory.store, P1, "a1", T0 + 25 * HOUR)).toMatchObject({ ok: true });
    expect(await nextStep(memory.store, P1, "a1", T0 + 25 * HOUR + 1)).toEqual({ ok: false, error: "expired" });
    expect(memory.tests).toMatchObject([{ id: "a1", status: "expired" }]);
    expect(memory.tests[0].answers).toHaveLength(5);
  });

  it("never expires a test with every answer in: it only waits to be scored", async () => {
    const memory = memoryAttemptStore({ tests: [stored(recordAnswer(startAttempt("a1", T0), T0 + HOUR), { answered: 42 })] });
    expect(await nextStep(memory.store, P1, "a1", T0 + 3 * DAY)).toEqual({ ok: true, step: { status: "complete", total: 42 } });
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
      // #184: no serve was recorded for this question and the screen sent no events.
      timeline: { shownAt: null, answeredAt: at, events: null },
    });
  });
});

// #189 (spec #181): a very fast answer takes under 3 seconds. After 3 in a row, the next question says "Take your time".
describe("Take your time", () => {
  /** Answers the current question right in `timeMs`, with a drawing when the question needs shown work. */
  const answerIn = async (memory: ReturnType<typeof family>, timeMs: number, at: number) => {
    const row = memory.tests[0];
    const input = { ...sent(row, { png: current(row).showWork ? DRAWING : null }), timeMs };
    const result = await answerQuestion(memory.store, P1, "a1", input, at);
    if (!result.ok || result.step.status !== "question") throw new Error("expected the next question");
    return result.step;
  };

  it("appears after the third very fast answer in a row, stays while the run goes on, and goes after a slower answer", async () => {
    const memory = family(stored(open("a1", T0)));
    expect((await answerIn(memory, 1_000, T0 + 1)).takeYourTime).toBe(false);
    expect((await answerIn(memory, 2_999, T0 + 2)).takeYourTime).toBe(false);
    expect((await answerIn(memory, 500, T0 + 3)).takeYourTime).toBe(true);
    expect((await answerIn(memory, 800, T0 + 4)).takeYourTime).toBe(true);
    expect((await answerIn(memory, 3_000, T0 + 5)).takeYourTime).toBe(false);
  });

  it("is on the step a reload reads, so the message is still there after the page opens again", async () => {
    const memory = family(stored(open("a1", T0)));
    for (let i = 0; i < 3; i++) await answerIn(memory, 1_000, T0 + i);
    expect(await nextStep(memory.store, P1, "a1", T0 + 10)).toMatchObject({ ok: true, step: { status: "question", number: 4, takeYourTime: true } });
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

describe("the whiteboard strokes (#186)", () => {
  /** A stroke recording as the answer route passes it on: checked JSON text. */
  const STROKES = '{"v":1,"width":800,"height":600,"events":[{"kind":"stroke","erase":false,"w":3.2,"pts":[[0.1,0.1,400],[0.2,0.15,480]]}]}';

  it("stores the strokes with the answer, in the parent's folder but not as a drawing, and the answer points to them", async () => {
    const memory = family(stored(open("a1", T0)));
    const first = current(memory.tests[0]);
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { png: DRAWING, strokes: STROKES }), T0 + HOUR)).toMatchObject({ ok: true, step: { number: 2 } });
    const [path] = [...memory.strokes.keys()];
    // The parent's folder: a family deletion removes it. Not a .png: parents read only the drawings (storage policy).
    expect(path).toMatch(new RegExp(`^${P1}/a1/${first.id}-`));
    expect(path).not.toMatch(/\.png$/);
    expect(memory.strokes.get(path)).toBe(STROKES);
    expect(memory.tests[0].answers).toMatchObject([{ questionId: first.id, workPath: [...memory.drawings.keys()][0], strokesPath: path }]);
  });

  it("an answer that is not stored leaves no strokes behind: a failed insert, a failed drawing upload, another tab first", async () => {
    logs();
    const insertFails = family(stored(recordAnswer(open("a1", T0), T0 + HOUR)));
    insertFails.fail.insertAnswer = new StoreError("answer save failed", "connection reset");
    expect(await answerQuestion(insertFails.store, P1, "a1", sent(insertFails.tests[0], { png: DRAWING, strokes: STROKES }), T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect([insertFails.strokes.size, insertFails.drawings.size, insertFails.tests[0].answers.length]).toEqual([0, 0, 0]);

    const uploadFails = family(stored(recordAnswer(open("a1", T0), T0 + HOUR)));
    uploadFails.fail.storeDrawing = new StoreError("upload failed", "bucket full");
    expect(await answerQuestion(uploadFails.store, P1, "a1", sent(uploadFails.tests[0], { png: DRAWING, strokes: STROKES }), T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect([uploadFails.strokes.size, uploadFails.tests[0].answers.length]).toEqual([0, 0]);

    const twoTabs = family(stored(open("a1", T0)));
    const results = await Promise.all([
      answerQuestion(twoTabs.store, P1, "a1", sent(twoTabs.tests[0], { png: DRAWING, strokes: STROKES }), T0 + HOUR),
      answerQuestion(twoTabs.store, P1, "a1", sent(twoTabs.tests[0], { png: DRAWING, strokes: STROKES.replace("400", "401") }), T0 + HOUR),
    ]);
    expect(results).toMatchObject([{ ok: true }, { ok: false, error: "conflict" }]);
    expect([...twoTabs.strokes]).toEqual([[twoTabs.tests[0].answers[0].strokesPath, STROKES]]);
  });

  it("a failed strokes upload never stops the answer: it is stored with the drawing alone, and the failure is logged", async () => {
    const log = logs();
    const memory = family(stored(open("a1", T0)));
    memory.fail.storeStrokes = new StoreError("upload failed", "bucket full");
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { png: DRAWING, strokes: STROKES }), T0 + HOUR)).toMatchObject({ ok: true, step: { number: 2 } });
    expect(memory.tests[0].answers).toHaveLength(1);
    expect(memory.tests[0].answers[0].workPath).toBe([...memory.drawings.keys()][0]);
    expect(memory.tests[0].answers[0].strokesPath).toBeUndefined();
    expect(log.mock.calls).toEqual([["[strokes] upload failed", "bucket full"]]);
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
    expect(step).toEqual({ status: "complete", total: 42 });
    expect(memory.tests[0].answers).toHaveLength(42);
    // A child with every answer right goes up after the 18 questions of stage 1.
    expect(routeAfter.slice(0, 17).every((r) => r == null)).toBe(true);
    expect(routeAfter.slice(17)).toEqual(Array(25).fill("up"));
    expect(routes).toEqual(["up"]);
    // Seven questions needed shown work; each drawing is stored with its answer.
    expect(memory.tests[0].answers.filter((a) => a.workRequired).map((a) => a.workPath)).toEqual([...memory.drawings.keys()]);
    expect(memory.drawings.size).toBe(7);
  });

  it("logs a route that cannot be saved, as before, and the answer still moves on", async () => {
    const log = logs();
    const memory = family(stored(open("a1", T0), { answered: 17 }));
    memory.fail.recordRoute = new StoreError("route save failed", "timeout");
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { png: DRAWING }), T0 + HOUR)).toMatchObject({ ok: true, step: { number: 19 } });
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
    const complete = family(stored(open("a1", T0), { answered: 42 }));
    const last = complete.tests[0].answers[35];
    const answer = { questionId: last.questionId, response: last.response, timeMs: 20_000, work: { png: null, text: "" } };
    expect(await answerQuestion(complete.store, P1, "a1", answer, T0 + HOUR)).toEqual({ ok: false, error: "conflict", step: { status: "complete", total: 42 } });
    const scored = family(stored(done("a1", T0), { answered: 2 }));
    expect(await answerQuestion(scored.store, P1, "a1", sent(scored.tests[0]), T0 + 2 * HOUR))
      .toMatchObject({ ok: false, error: "conflict", step: { status: "question", number: 3 } });
    expect([complete.tests[0].answers, scored.tests[0].answers].map((a) => a.length)).toEqual([42, 2]);
  });

  it("refuses a response that does not fit the question, or a time that is not one, and stores nothing", async () => {
    // A seed whose third question is a choice and whose fourth is a number, whatever the bank holds.
    const seed = Array.from({ length: 200 }, (_, i) => i + 1).find((s) => {
      const { stage1 } = createSession(ASHA, s);
      return stage1[2].format === "choice" && stage1[3].format === "number";
    });
    const memory = family(stored(open("a1", T0), { answered: 2, seed }));
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
      stored(open("a3", T0 - 2 * DAY), { child: "child-3", answered: 42 }),
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

describe("the timed facts section", () => {
  /** Asha's open test at the halfway break: the 18 questions of stage 1 are answered. */
  const atBreak = () => memoryAttemptStore({ children: [asha], tests: [stored(open("a1", T0), { answered: 18 })] });

  it("is ready before it starts, and reading it stores nothing", async () => {
    const memory = atBreak();
    expect(await readFacts(memory.store, P1, "a1", T0 + HOUR)).toEqual({ ok: true, step: { status: "ready", seconds: 60 } });
    expect(memory.facts).toEqual([]);
  });

  it("starts at the clock reading of the start request, with facts drawn from the test's grade and seed", async () => {
    const memory = atBreak();
    const drawn = createFacts(ASHA, 7).facts;
    const result = await startFacts(memory.store, P1, "a1", T0 + HOUR);
    expect(result).toMatchObject({ ok: true, step: { status: "running", seconds: 60, remainingMs: 60_000, answered: 0 } });
    const shown = result.ok && result.step.status === "running" ? result.step.facts : [];
    expect(shown.map((f) => f.id)).toEqual(drawn.map((f) => f.id));
    expect(shown[0]).not.toHaveProperty("answer");
    expect(memory.facts).toEqual([{ assessmentId: "a1", startedAt: T0 + HOUR, test: { grade: 4, facts: drawn }, answers: [] }]);
  });

  it("then runs by the server's clock: 20 seconds after the start 40 are left, and after 60 it is done", async () => {
    const memory = atBreak();
    await startFacts(memory.store, P1, "a1", T0 + HOUR);
    expect(await readFacts(memory.store, P1, "a1", T0 + HOUR + 20_000)).toMatchObject({ ok: true, step: { status: "running", remainingMs: 40_000, answered: 0 } });
    expect(await readFacts(memory.store, P1, "a1", T0 + HOUR + 60_000)).toEqual({ ok: true, step: { status: "done", answered: 0 } });
  });

  it("starts once when Start is pressed twice at once: both requests get the section, timed from the first start", async () => {
    const memory = atBreak();
    const [first, second] = await Promise.all([
      startFacts(memory.store, P1, "a1", T0 + HOUR),
      startFacts(memory.store, P1, "a1", T0 + HOUR + 400),
    ]);
    expect(memory.facts).toHaveLength(1);
    expect(memory.facts[0].startedAt).toBe(T0 + HOUR);
    expect(first).toMatchObject({ ok: true, step: { status: "running", remainingMs: 60_000 } });
    expect(second).toMatchObject({ ok: true, step: { status: "running", remainingMs: 59_600 } });
  });

  it("never sends more than the section's time to a start that lost the race but read the clock first", async () => {
    const memory = atBreak();
    const [won, lost] = await Promise.all([
      startFacts(memory.store, P1, "a1", T0 + HOUR + 20),
      startFacts(memory.store, P1, "a1", T0 + HOUR),
    ]);
    expect(memory.facts).toMatchObject([{ startedAt: T0 + HOUR + 20 }]);
    expect(won).toMatchObject({ ok: true, step: { status: "running", remainingMs: 60_000 } });
    expect(lost).toMatchObject({ ok: true, step: { status: "running", remainingMs: 60_000 } });
  });

  it("carries on with the running section on a second Start or a reload, and never resets its time", async () => {
    const memory = atBreak();
    await startFacts(memory.store, P1, "a1", T0 + HOUR);
    expect(await startFacts(memory.store, P1, "a1", T0 + HOUR + 25_000)).toMatchObject({ ok: true, step: { status: "running", remainingMs: 35_000 } });
    expect(await startFacts(memory.store, P1, "a1", T0 + HOUR + 70_000)).toEqual({ ok: true, step: { status: "done", answered: 0 } });
    expect(memory.facts).toHaveLength(1);
    expect(memory.facts[0].startedAt).toBe(T0 + HOUR);
  });

  it.each(["completed", "expired"] as const)("cannot start once the test is %s, and the refusal stores nothing", async (status) => {
    const memory = memoryAttemptStore({ tests: [{ ...stored(open("a1", T0), { answered: 18 }), status }] });
    expect(await startFacts(memory.store, P1, "a1", T0 + HOUR)).toEqual({ ok: false, error: "conflict" });
    expect(memory.facts).toEqual([]);
  });

  it("stores each fact answer, marked, at its arrival time since the start, and sends the facts still to come", async () => {
    const memory = atBreak();
    const [f0, f1, f2] = createFacts(ASHA, 7).facts;
    await startFacts(memory.store, P1, "a1", T0 + HOUR);
    const first = await answerFact(memory.store, P1, "a1", T0 + HOUR + 2_500, { factId: f0.id, response: String(f0.answer) });
    expect(first).toMatchObject({ ok: true, step: { status: "running", remainingMs: 57_500, answered: 1 } });
    expect(first.ok && first.step.status === "running" && first.step.facts[0].id).toBe(f1.id);
    // A skip is stored too, but does not count as answered.
    expect(await answerFact(memory.store, P1, "a1", T0 + HOUR + 6_000, { factId: f1.id, response: "" }))
      .toMatchObject({ ok: true, step: { status: "running", remainingMs: 54_000, answered: 1 } });
    expect(memory.facts[0].answers).toEqual([
      { position: 0, factId: f0.id, response: String(f0.answer), correct: true, atMs: 2_500 },
      { position: 1, factId: f1.id, response: "", correct: false, atMs: 6_000 },
    ]);
    // A reload goes on from the third fact.
    const reread = await readFacts(memory.store, P1, "a1", T0 + HOUR + 9_000);
    expect(reread).toMatchObject({ ok: true, step: { status: "running", remainingMs: 51_000, answered: 1 } });
    expect(reread.ok && reread.step.status === "running" && reread.step.facts[0].id).toBe(f2.id);
  });

  it("stores each fact answer once: a second answer to the same fact gets a conflict with where the section is now", async () => {
    const memory = atBreak();
    const [f0, f1] = createFacts(ASHA, 7).facts;
    await startFacts(memory.store, P1, "a1", T0 + HOUR);
    await answerFact(memory.store, P1, "a1", T0 + HOUR + 2_000, { factId: f0.id, response: "1" });
    const again = await answerFact(memory.store, P1, "a1", T0 + HOUR + 2_300, { factId: f0.id, response: "1" });
    expect(again).toMatchObject({ ok: false, error: "conflict", step: { status: "running", remainingMs: 57_700, answered: 1 } });
    expect(!again.ok && again.error === "conflict" && again.step?.status === "running" && again.step.facts[0].id).toBe(f1.id);
    expect(memory.facts[0].answers).toHaveLength(1);
  });

  it("a double submit stores one answer: the request that loses the race gets a conflict with a fresh step", async () => {
    const memory = atBreak();
    const [f0, f1] = createFacts(ASHA, 7).facts;
    await startFacts(memory.store, P1, "a1", T0 + HOUR);
    const send = () => answerFact(memory.store, P1, "a1", T0 + HOUR + 2_000, { factId: f0.id, response: String(f0.answer) });
    const [won, lost] = await Promise.all([send(), send()]);
    expect(memory.facts[0].answers).toHaveLength(1);
    expect(won).toMatchObject({ ok: true, step: { status: "running", answered: 1 } });
    // Both requests marked the same fact before either stored it; the store took one, and the other reads again.
    expect(lost).toMatchObject({ ok: false, error: "conflict", step: { status: "running", remainingMs: 58_000, answered: 1 } });
    expect(!lost.ok && lost.error === "conflict" && lost.step?.status === "running" && lost.step.facts[0].id).toBe(f1.id);
  });

  it("refuses a fact answer that arrives after the time is up: it stores nothing, and the step says done", async () => {
    const memory = atBreak();
    const [f0, f1] = createFacts(ASHA, 7).facts;
    await startFacts(memory.store, P1, "a1", T0 + HOUR);
    await answerFact(memory.store, P1, "a1", T0 + HOUR + 2_000, { factId: f0.id, response: String(f0.answer) });
    expect(await answerFact(memory.store, P1, "a1", T0 + HOUR + 63_001, { factId: f1.id, response: String(f1.answer) }))
      .toEqual({ ok: false, error: "conflict", step: { status: "done", answered: 1 } });
    expect(memory.facts[0].answers).toHaveLength(1);
  });

  it("still takes an answer sent just before the end that arrives up to 3 seconds late, and the step says done", async () => {
    const memory = atBreak();
    const [f0] = createFacts(ASHA, 7).facts;
    await startFacts(memory.store, P1, "a1", T0 + HOUR);
    expect(await answerFact(memory.store, P1, "a1", T0 + HOUR + 63_000, { factId: f0.id, response: String(f0.answer) }))
      .toEqual({ ok: true, step: { status: "done", answered: 1 } });
    expect(memory.facts[0].answers).toMatchObject([{ position: 0, factId: f0.id, correct: true, atMs: 63_000 }]);
  });

  it("never times an answer earlier than the answer before it, when two servers' clocks differ a little", async () => {
    const memory = atBreak();
    const [f0, f1] = createFacts(ASHA, 7).facts;
    await startFacts(memory.store, P1, "a1", T0 + HOUR);
    await answerFact(memory.store, P1, "a1", T0 + HOUR + 5_000, { factId: f0.id, response: String(f0.answer) });
    expect(await answerFact(memory.store, P1, "a1", T0 + HOUR + 4_990, { factId: f1.id, response: String(f1.answer) }))
      .toMatchObject({ ok: true, step: { status: "running", remainingMs: 55_000, answered: 2 } });
    expect(memory.facts[0].answers.map((a) => a.atMs)).toEqual([5_000, 5_000]);
  });

  it.each(["completed", "expired"] as const)("takes no fact answer once the test is %s, and the refusal stores nothing", async (status) => {
    const memory = atBreak();
    const [f0] = createFacts(ASHA, 7).facts;
    await startFacts(memory.store, P1, "a1", T0 + HOUR);
    memory.tests[0].status = status;
    expect(await answerFact(memory.store, P1, "a1", T0 + HOUR + 2_000, { factId: f0.id, response: String(f0.answer) }))
      .toEqual({ ok: false, error: "conflict" });
    expect(memory.facts[0].answers).toEqual([]);
  });

  it("takes no fact answer before the section starts", async () => {
    const memory = atBreak();
    const [f0] = createFacts(ASHA, 7).facts;
    expect(await answerFact(memory.store, P1, "a1", T0 + HOUR, { factId: f0.id, response: String(f0.answer) })).toEqual({ ok: false, error: "conflict" });
    expect(memory.facts).toEqual([]);
  });

  it("is still read once the test is completed, so the finish screen can count the facts answered", async () => {
    const memory = atBreak();
    const [f0] = createFacts(ASHA, 7).facts;
    await startFacts(memory.store, P1, "a1", T0 + HOUR);
    await answerFact(memory.store, P1, "a1", T0 + HOUR + 2_000, { factId: f0.id, response: String(f0.answer) });
    memory.tests[0].status = "completed";
    expect(await readFacts(memory.store, P1, "a1", T0 + 2 * HOUR)).toEqual({ ok: true, step: { status: "done", answered: 1 } });
  });

  it("is not found for another family's test, and no request changes anything", async () => {
    const memory = memoryAttemptStore({ tests: [stored(open("a1", T0), { parent: "parent-2", answered: 18 })] });
    const [f0] = createFacts(ASHA, 7).facts;
    expect(await readFacts(memory.store, P1, "a1", T0 + HOUR)).toEqual({ ok: false, error: "not_found" });
    expect(await startFacts(memory.store, P1, "a1", T0 + HOUR)).toEqual({ ok: false, error: "not_found" });
    expect(await answerFact(memory.store, P1, "a1", T0 + HOUR, { factId: f0.id, response: "1" })).toEqual({ ok: false, error: "not_found" });
    expect(memory.facts).toEqual([]);
    expect(await startFacts(memory.store, "parent-2", "a1", T0 + HOUR)).toMatchObject({ ok: true });
    expect(await answerFact(memory.store, P1, "a1", T0 + HOUR + 1_000, { factId: f0.id, response: "1" })).toEqual({ ok: false, error: "not_found" });
    expect(memory.facts[0].answers).toEqual([]);
  });
});

describe("when the facts store fails", () => {
  const atBreak = () => memoryAttemptStore({ tests: [stored(open("a1", T0), { answered: 18 })] });
  const [f0] = createFacts(ASHA, 7).facts;
  const answerF0 = (memory: ReturnType<typeof atBreak>, at: number) =>
    answerFact(memory.store, P1, "a1", at, { factId: f0.id, response: String(f0.answer) });

  it("a failed read of the test is store_failed, logged as before", async () => {
    const log = logs();
    const memory = atBreak();
    memory.fail.load = new StoreError("load failed", "timeout");
    expect(await readFacts(memory.store, P1, "a1", T0)).toEqual({ ok: false, error: "store_failed" });
    expect(await startFacts(memory.store, P1, "a1", T0)).toEqual({ ok: false, error: "store_failed" });
    expect(await answerF0(memory, T0)).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual(Array(3).fill(["[facts] assessment load failed", "timeout"]));
    expect(memory.facts).toEqual([]);
  });

  it("a failed read of the section is store_failed, logged as before", async () => {
    const log = logs();
    const memory = atBreak();
    await startFacts(memory.store, P1, "a1", T0);
    memory.fail.loadFacts = new StoreError("answers load failed", "connection reset");
    expect(await readFacts(memory.store, P1, "a1", T0 + 1_000)).toEqual({ ok: false, error: "store_failed" });
    expect(await startFacts(memory.store, P1, "a1", T0 + 1_000)).toEqual({ ok: false, error: "store_failed" });
    expect(await answerF0(memory, T0 + 1_000)).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual(Array(3).fill(["[facts] answers load failed", "connection reset"]));
    expect(memory.facts[0].answers).toEqual([]);
  });

  it("a stored section the assessment core cannot rebuild is store_failed, as unreadable", async () => {
    const log = logs();
    const memory = atBreak();
    await startFacts(memory.store, P1, "a1", T0);
    memory.facts[0].answers.push({ position: 0, factId: "f5", response: "1", correct: false, atMs: 900 });
    expect(await readFacts(memory.store, P1, "a1", T0 + 1_000)).toEqual({ ok: false, error: "store_failed", unreadable: true });
    expect(log.mock.calls).toEqual([["[facts] restore failed", "a1", "Expected an answer to f0, got f5"]]);
  });

  it("a failed start is store_failed, logged as before, and the section has not started", async () => {
    const log = logs();
    const memory = atBreak();
    memory.fail.insertFacts = new StoreError("start failed", "insert refused");
    expect(await startFacts(memory.store, P1, "a1", T0)).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual([["[facts] start failed", "insert refused"]]);
    expect(memory.facts).toEqual([]);
  });

  it("a failed answer is store_failed, logged as before, and nothing is stored", async () => {
    const log = logs();
    const memory = atBreak();
    await startFacts(memory.store, P1, "a1", T0);
    memory.fail.insertFactAnswer = new StoreError("answer save failed", "insert refused");
    expect(await answerF0(memory, T0 + 1_000)).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual([["[facts] answer save failed", "insert refused"]]);
    expect(memory.facts[0].answers).toEqual([]);
  });

  it("a start or an answer that lost a race, when the winner's section cannot be read, is store_failed", async () => {
    const log = logs();
    const memory = atBreak();
    // The store fails every read of the section after an insert reports "taken".
    const store: typeof memory.store = {
      ...memory.store,
      insertFacts: async (...args) => taken(await memory.store.insertFacts(...args)),
      insertFactAnswer: async (...args) => taken(await memory.store.insertFactAnswer(...args)),
    };
    const taken = (result: "stored" | "taken") => {
      if (result === "taken") memory.fail.loadFacts = new StoreError("load failed", "timeout");
      return result;
    };
    const starts = await Promise.all([startFacts(store, P1, "a1", T0), startFacts(store, P1, "a1", T0)]);
    expect(starts).toMatchObject([{ ok: true }, { ok: false, error: "store_failed" }]);
    delete memory.fail.loadFacts;
    const answers = await Promise.all([answerF0(memory, T0 + 1_000), answerFact(store, P1, "a1", T0 + 1_000, { factId: f0.id, response: "1" })]);
    expect(answers).toMatchObject([{ ok: true }, { ok: false, error: "store_failed" }]);
    expect(log.mock.calls).toEqual([
      ["[facts] load failed", "timeout"],
      ["[facts] start failed", "the section another request started cannot be read"],
      ["[facts] load failed", "timeout"],
      ["[facts] answer save failed", "the answer another request stored cannot be read"],
    ]);
    expect(memory.facts).toHaveLength(1);
    expect(memory.facts[0].answers).toHaveLength(1);
  });
});

// Finish (#150): the child's last answer is in, and the parent's screen sends the test with the answer to "Did anyone
// help?". The module scores it once with the assessment core, together with the timed facts section, and stores it.
/**
 * A scripted child takes Asha's whole test through the module's answer step, one minute apart: each answer is right
 * when the script says so, with a drawing on each question that needs shown work. With `facts`, at the halfway break
 * the child does the first five facts of the timed section. Returns the time of the last answer.
 */
async function takeWholeTest(memory: ReturnType<typeof family>, script: Script, { facts = false, timeMs = () => 20_000 }: { facts?: boolean; timeMs?: (n: number) => number } = {}): Promise<number> {
  let at = T0;
  for (let n = 0; ; n++) {
    const row = memory.tests[0];
    const q = nextQuestion(restoreSession(row.test, row.answers));
    if (!q) return at;
    if (facts && n === row.test.stage1.length) await quickFacts(memory, (at += 60_000));
    const wrong = q.format === "choice" ? q.choices!.find((c) => c !== q.answer)! : "no idea";
    const input = { questionId: q.id, response: script(q, n) ? q.answer : wrong, timeMs: timeMs(n), work: { png: q.showWork ? DRAWING : null, text: "" } };
    const result = await answerQuestion(memory.store, P1, row.id, input, (at += 60_000));
    if (!result.ok) throw new Error(`answer ${n + 1}: ${result.error}`);
  }
}

/** The first five facts of the section from `start`: right, wrong, skipped, right and right, at 2, 4, 5, 7 and 10 seconds. */
async function quickFacts(memory: ReturnType<typeof family>, start: number): Promise<void> {
  const [f0, f1, f2, f3, f4] = createFacts(ASHA, 7).facts;
  const id = memory.tests[0].id;
  if (!(await startFacts(memory.store, P1, id, start)).ok) throw new Error("the facts section did not start");
  const answers = [[f0, String(f0.answer), 2_000], [f1, String(f1.answer + 1), 4_000], [f2, "", 5_000], [f3, String(f3.answer), 7_000], [f4, String(f4.answer), 10_000]] as const;
  for (const [fact, response, atMs] of answers) {
    if (!(await answerFact(memory.store, P1, id, start + atMs, { factId: fact.id, response })).ok) throw new Error(`fact ${fact.id} was not stored`);
  }
}

/** The facts part of the placement after quickFacts: four answered (three right), one skipped, 2 seconds each in the middle. */
const QUICK_FACTS = { seconds: 60, answered: 4, correct: 3, skipped: 1, medianMs: 2_000 };

describe("finishing a test", () => {
  it.each<{ script: Script; route: string; facts: boolean; help: HelpInput; flags: unknown[] }>([
    { script: allRight, route: "up", facts: false, help: null, flags: [] },
    { script: knowsUpTo(3), route: "down", facts: false, help: "yes", flags: [{ kind: "helped", answer: "yes" }] },
    { script: allRight, route: "up", facts: true, help: "no", flags: [] },
    { script: knowsUpTo(3), route: "down", facts: true, help: "a-little", flags: [{ kind: "helped", answer: "a-little" }] },
    { script: knowsUpTo(3), route: "down", facts: true, help: null, flags: [] },
  ])("scores a full test once and stores it: route $route, facts section $facts, help answer $help", async ({ script, route, facts, help, flags }) => {
    const memory = family(stored(open("a1", T0)));
    const last = await takeWholeTest(memory, script, { facts });
    const at = last + 5 * 60_000;
    expect(await finishTest(memory.store, P1, "a1", help, at)).toEqual({ ok: true, id: "a1", finished: "now" });
    // The same child, scored by the assessment core alone.
    const { placement } = takeTest(ASHA, 7, script);
    expect(placement.route).toBe(route);
    expect(memory.tests[0]).toMatchObject({ status: "completed", completedAt: at, lastAnswerAt: last, resumeUntil: last + DAY, route, help });
    expect(memory.tests[0].placement).toEqual({ ...placement, facts: facts ? expect.objectContaining(QUICK_FACTS) : null, flags });
  });

  it("scores once when Finish comes twice: the second is already finished, and changes nothing", async () => {
    const memory = family(stored(open("a1", T0), { answered: 42 }));
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + HOUR)).toEqual({ ok: true, id: "a1", finished: "now" });
    const scored = structuredClone(memory.tests[0]);
    expect(await finishTest(memory.store, P1, "a1", "yes", T0 + 2 * HOUR)).toEqual({ ok: true, id: "a1", finished: "already" });
    expect(memory.tests).toEqual([scored]);
    expect(scored).toMatchObject({ status: "completed", completedAt: T0 + HOUR, help: "no", placement: { flags: [] } });
  });

  it("scores once when Finish is pressed twice at once: both are ok, and the first one's placement and help are stored", async () => {
    const memory = family(stored(open("a1", T0), { answered: 42 }));
    const both = await Promise.all([
      finishTest(memory.store, P1, "a1", "no", T0 + HOUR),
      finishTest(memory.store, P1, "a1", "yes", T0 + HOUR + 1),
    ]);
    expect(both.every((r) => r.ok)).toBe(true);
    expect(memory.tests).toHaveLength(1);
    expect(memory.tests[0]).toMatchObject({ status: "completed", completedAt: T0 + HOUR, help: "no", placement: { flags: [] } });
  });

  it("refuses a test without every answer as incomplete, and changes nothing", async () => {
    const memory = family(stored(recordAnswer(open("a1", T0), T0 + HOUR), { answered: 35 }));
    const before = structuredClone(memory.tests);
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + 2 * HOUR)).toEqual({ ok: false, error: "incomplete" });
    // As before the module, the test is checked before the help answer.
    expect(await finishTest(memory.store, P1, "a1", "invalid", T0 + 2 * HOUR)).toEqual({ ok: false, error: "incomplete" });
    expect(memory.tests).toEqual(before);
  });

  it("refuses an expired test as expired, and scores nothing; a test that ran out of time is then marked expired", async () => {
    const closed = family({ ...stored(recordAnswer(open("a1", T0), T0 + HOUR), { answered: 42 }), status: "expired" });
    expect(await finishTest(closed.store, P1, "a1", "no", T0 + 2 * HOUR)).toEqual({ ok: false, error: "expired" });
    expect(closed.tests[0]).toMatchObject({ status: "expired", completedAt: null });
    expect(closed.tests[0].placement).toBeUndefined();
    const late = family(stored(recordAnswer(open("a1", T0), T0 + HOUR), { answered: 20 }));
    expect(await finishTest(late.store, P1, "a1", "no", T0 + 25 * HOUR + 1)).toEqual({ ok: false, error: "expired" });
    expect(late.tests[0]).toMatchObject({ status: "expired", completedAt: null });
    expect(late.tests[0].placement).toBeUndefined();
  });

  it("finishes a test with every answer in long after its deadline: it only waited to be scored", async () => {
    const memory = family(stored(recordAnswer(open("a1", T0), T0 + HOUR), { answered: 42 }));
    expect(await finishTest(memory.store, P1, "a1", null, T0 + 3 * DAY)).toEqual({ ok: true, id: "a1", finished: "now" });
    expect(memory.tests[0]).toMatchObject({ status: "completed", completedAt: T0 + 3 * DAY, route: "up", help: null, placement: { route: "up" } });
  });

  it("refuses a help answer that is not one of the answers as invalid, and stores nothing; a finished test is still ok", async () => {
    const memory = family(stored(open("a1", T0), { answered: 42 }));
    const before = structuredClone(memory.tests);
    expect(await finishTest(memory.store, P1, "a1", "invalid", T0 + HOUR)).toEqual({ ok: false, error: "invalid" });
    expect(memory.tests).toEqual(before);
    await finishTest(memory.store, P1, "a1", "no", T0 + HOUR);
    expect(await finishTest(memory.store, P1, "a1", "invalid", T0 + 2 * HOUR)).toEqual({ ok: true, id: "a1", finished: "already" });
    expect(memory.tests[0]).toMatchObject({ completedAt: T0 + HOUR, help: "no" });
  });

  it("is not found for another family's test, and changes nothing", async () => {
    const memory = memoryAttemptStore({ tests: [stored(open("a1", T0), { parent: "parent-2", answered: 42 })] });
    const before = structuredClone(memory.tests);
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + HOUR)).toEqual({ ok: false, error: "not_found" });
    expect(await finishTest(memory.store, P1, "no-such-test", "no", T0 + HOUR)).toEqual({ ok: false, error: "not_found" });
    expect(memory.tests).toEqual(before);
  });
});

// #189 (spec #181): more than 30% very fast answers, and the report offers a new test at once, without the 30-day wait.
describe("a new test after a rushed one", () => {
  it("opens at once after a test with 14 of 42 answers very fast, and the start screen offers it", async () => {
    const memory = family(stored(open("a1", T0)));
    const last = await takeWholeTest(memory, allRight, { timeMs: (n) => (n % 3 === 0 ? 1_000 : 20_000) });
    expect(await finishTest(memory.store, P1, "a1", "no", last + 60_000)).toMatchObject({ ok: true });
    expect(memory.tests[0].placement?.pace).toMatchObject({ veryFast: 14, answers: 42, unreliable: true });
    expect(stateFor(await startStates(memory.store, P1, last + 2 * 60_000), C1)).toEqual({ kind: "start", retake: true });
    expect(await start(memory.store, last + 3 * 60_000, { restart: false, newSeed: seeds(8) })).toEqual({ ok: true, id: "a2", resumed: false });
  });

  it("still waits 30 days after a test with 12 of 42 answers very fast", async () => {
    const memory = family(stored(open("a1", T0)));
    const last = await takeWholeTest(memory, allRight, { timeMs: (n) => (n % 3 === 0 && n < 36 ? 1_000 : 20_000) });
    expect(await finishTest(memory.store, P1, "a1", "no", last + 60_000)).toMatchObject({ ok: true });
    expect(memory.tests[0].placement?.pace).toMatchObject({ veryFast: 12, answers: 42, unreliable: false });
    expect(await start(memory.store, last + 3 * 60_000, { restart: false, newSeed: seeds(8) })).toMatchObject({ ok: false, error: "retake_closed" });
  });
});

// #189, D-108: the report page's retake state. On a read failure it is unknown (null): the report then shows no button
// and names no time, never "no 30-day wait".
describe("the retake state the report page reads", () => {
  const rushedDone = (id: string, at: number): MemoryTest => ({
    ...stored(done(id, at), { seed: at === T0 ? 7 : 8 }),
    placement: { ...takeTest(ASHA, 7, allRight).placement, pace: { veryFast: 12, answers: 36, leftOut: [], unreliable: true } },
  });

  it("is open after one unreliable test, and waits after a second one within 30 days", async () => {
    expect(await retakeState(family(rushedDone("a1", T0)).store, P1, C1, T0 + 2 * HOUR)).toEqual({ kind: "open", resume: false });
    const twice = family(rushedDone("a1", T0), rushedDone("a2", T0 + 2 * HOUR));
    expect(await retakeState(twice.store, P1, C1, T0 + 4 * HOUR)).toEqual({ kind: "opens", at: T0 + 3 * HOUR + 30 * DAY });
  });

  it("is unknown when the tests cannot be read, though the start screen would offer Start test", async () => {
    logs();
    const twice = family(rushedDone("a1", T0), rushedDone("a2", T0 + 2 * HOUR));
    twice.fail.attempts = new StoreError("attempts load failed", "timeout");
    expect(stateFor(await startStates(twice.store, P1, T0 + 4 * HOUR, C1), C1).kind).toBe("start");
    expect(await retakeState(twice.store, P1, C1, T0 + 4 * HOUR)).toBeNull();
  });
});

describe("when finishing fails in the store", () => {
  /** Asha's test with every answer in, and her facts section started at T0 + 1 hour. */
  const complete = async () => {
    const memory = family(stored(open("a1", T0), { answered: 42 }));
    await startFacts(memory.store, P1, "a1", T0 + HOUR);
    return memory;
  };

  it("a failed write is store_failed, logged as before, and the test stays in progress to finish again", async () => {
    const log = logs();
    const memory = await complete();
    memory.fail.complete = new StoreError("finish failed", "timeout");
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual([["[test] finish failed", "timeout"]]);
    expect(memory.tests[0]).toMatchObject({ status: "in_progress", completedAt: null });
    delete memory.fail.complete;
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + 3 * HOUR)).toEqual({ ok: true, id: "a1", finished: "now" });
  });

  it("a failed read of the test is store_failed, logged as before", async () => {
    const log = logs();
    const memory = await complete();
    memory.fail.load = new StoreError("answers load failed", "timeout");
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual([["[test] answers load failed", "timeout"]]);
    expect(memory.tests[0].status).toBe("in_progress");
  });

  it("a failed read of the facts section is store_failed, logged as before, and nothing is scored", async () => {
    const log = logs();
    const memory = await complete();
    memory.fail.loadFacts = new StoreError("load failed", "timeout");
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual([["[facts] load failed", "timeout"]]);
    expect(memory.tests[0]).toMatchObject({ status: "in_progress", completedAt: null });
  });

  it("a stored test or facts section the assessment core cannot rebuild is store_failed, as unreadable, and nothing is scored", async () => {
    const log = logs();
    const memory = await complete();
    memory.facts[0].answers.push({ position: 0, factId: "f5", response: "1", correct: false, atMs: 900 });
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed", unreadable: true });
    const broken = family(stored(open("a1", T0), { answered: 42 }));
    broken.tests[0].answers[3].questionId = "not-this-test";
    expect(await finishTest(broken.store, P1, "a1", "no", T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed", unreadable: true });
    expect(log.mock.calls).toEqual([["[facts] restore failed", "a1", "Expected an answer to f0, got f5"], ["[test] restore failed", "a1", "Expected an answer to s1-3, got not-this-test"]]);
    expect([memory.tests[0].status, broken.tests[0].status]).toEqual(["in_progress", "in_progress"]);
  });
});

describe("selection changes preserve stored tests (#188)", () => {
  it("resumes and completes stored questions with their original length and break", async () => {
    const row = stored(open("legacy", T0));
    // A stored form is authoritative, even when today's selector would draw different questions and lengths.
    row.test.stage1 = row.test.stage1.slice(0, 16);
    row.test.stage2.up = row.test.stage2.up.slice(0, 18);
    row.test.stage2.up[0] = { ...row.test.stage2.up[0], prompt: "A question saved before the selection change" };
    row.answers = answersOf(row.test, 16);
    const original = structuredClone(row.test);
    const { store } = family(row);
    expect(await start(store, T0 + HOUR, { restart: false, newSeed: () => { throw new Error("A resume must not draw a seed"); } })).toEqual({ ok: true, id: "legacy", resumed: true });
    const resumed = await nextStep(store, P1, "legacy", T0 + HOUR);
    expect(resumed).toMatchObject({ ok: true, step: { status: "question", number: 17, total: 34, breakAfter: 16, question: { id: original.stage2.up[0].id, prompt: "A question saved before the selection change" } } });
    for (const question of original.stage2.up) {
      const result = await answerQuestion(store, P1, "legacy", {
        questionId: question.id, response: question.answer, timeMs: 20000,
        work: { text: question.showWork ? "Saved working" : "", png: null },
      }, T0 + HOUR);
      expect(result.ok).toBe(true);
    }
    expect(await nextStep(store, P1, "legacy", T0 + HOUR)).toEqual({ ok: true, step: { status: "complete", total: 34 } });
  });
});
