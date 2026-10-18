import { afterEach, describe, expect, it, vi } from "vitest";
import {
  breakDue,
  createSession,
  nextQuestion,
  restoreSession,
  startAttempt,
  storedTest,
  submitAnswer,
  type Question,
  type Route,
  type StoredTest,
  type Submission,
} from "@/lib/assessment";
import { checked } from "@/lib/assessment/scripted-child";
import { answerQuestion, changeAnswer, doneChecking, finishTest, nextStep, startStates, StoreError, type ChangeInput } from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";

// "Check your answers" and the locks (#249, #253) through the test attempt module, against the in-memory store with the
// clock passed in. Stage 1 waits on its grid after its last answer; "Done checking" locks it: the stored route is the
// lock record, set from the final stage 1 answers. Stage 2 waits on its grid after its last answer; "Done checking"
// records the extra round's offer when one is due (that is its lock), else leads to "Did anyone help?".
// Asha, grade 4 in BC: stage 1 has 18 questions; seed 7 gives 42 questions when every answer is right (no round due).
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 18, 18, 0);
const P1 = "parent-1";
const C1 = "child-1";
const ASHA = { grade: 4, province: "BC" } as const;
const STAGE1 = 18;

type Script = (q: Question, index: number) => boolean;
const allRight: Script = () => true;

/** A wrong answer the module takes for the question: another choice, or a number. */
const wrongTo = (q: Question) => (q.format === "choice" ? q.choices!.find((c) => c !== q.answer)! : "9999");

/** The answers a scripted child gives to the first `count` questions (stage 1 locked at once), 20 seconds each. */
function answersOf(test: StoredTest, count: number, script: Script): Submission[] {
  let session = restoreSession(test, []);
  const answers: Submission[] = [];
  for (let q = nextQuestion(session); q && answers.length < count; q = nextQuestion(session)) {
    const answer = { questionId: q.id, response: script(q, answers.length) ? q.answer : wrongTo(q), timeMs: 20_000 };
    session = checked(submitAnswer(session, answer));
    answers.push(answer);
  }
  return answers;
}

/** Asha's open test, started at T0, with the first `answered` answers in, the last one at T0 + 1 hour. `route`: the stored route. */
function openTest(answered: number, { seed = 7, script = allRight, route }: { seed?: number; script?: Script; route?: Route } = {}): MemoryTest {
  const test = storedTest(createSession(ASHA, seed));
  const at = answered ? { lastAnswerAt: T0 + HOUR, resumeUntil: T0 + HOUR + DAY } : {};
  return { ...startAttempt("a1", T0), ...at, parentId: P1, childId: C1, seed, test, answers: answersOf(test, answered, script), ...(route && { route }) };
}

const family = (test: MemoryTest) => memoryAttemptStore({ children: [{ id: C1, parentId: P1, ...ASHA }], tests: [test] });

/** The questions of the stored test on `route` (stage 1 alone when none). */
const onRoute = (row: MemoryTest, route: Route | null = null) => [...row.test.stage1, ...(route ? row.test.stage2[route] : [])];
/** The question the child answers next, with the stored route. */
const current = (row: MemoryTest) => nextQuestion(restoreSession(row.test, row.answers, row.route ?? null))!;

/** A revisit of the question at `position` (of `questions`) that sends `response`, with an unchanged board. */
const revisit = (q: Question, response: string): ChangeInput =>
  ({ questionId: q.id, response, timeMs: 4 * SECOND, work: { png: null, text: "" }, workChanged: false });

const logs = () => vi.spyOn(console, "error").mockImplementation(() => {});
afterEach(() => vi.restoreAllMocks());

describe("the stage 1 grid", () => {
  it("comes after the last stage 1 answer, with every stage 1 question and no route stored; a resume lands on it", async () => {
    const memory = family(openTest(17));
    const last = current(memory.tests[0]);
    const result = await answerQuestion(memory.store, P1, "a1", { questionId: last.id, response: last.answer, timeMs: 20_000, work: { png: null, text: "" } }, T0 + 2 * HOUR);
    expect(result).toMatchObject({ ok: true, step: { status: "check", section: "stage1", numbers: Array.from({ length: STAGE1 }, (_, i) => i + 1), breakAfter: STAGE1 } });
    if (!result.ok || result.step.status !== "check") throw new Error("expected the grid");
    // Each tile opens at once: the step brings every stage 1 question with the child's response, never the right answer.
    expect(result.step.answered?.map((a) => a.number)).toEqual(result.step.numbers);
    expect(JSON.stringify(result.step)).not.toMatch(/"answer"|"wrong"|misconception/);
    expect(memory.tests[0].route ?? null).toBeNull();
    expect(await nextStep(memory.store, P1, "a1", T0 + 3 * HOUR)).toMatchObject({ ok: true, step: { status: "check", section: "stage1" } });
  });

  it("takes changes to stage 1 answers: the test stays on the grid", async () => {
    const memory = family(openTest(STAGE1));
    const q = onRoute(memory.tests[0])[0];
    const result = await changeAnswer(memory.store, P1, "a1", revisit(q, wrongTo(q)), T0 + 2 * HOUR);
    expect(result).toMatchObject({ ok: true, step: { status: "check", section: "stage1" } });
    expect(memory.tests[0].answers[0]).toMatchObject({ response: wrongTo(q), correct: false });
  });
});

describe("Done checking on stage 1", () => {
  it("stores the route from the final stage 1 answers and opens the break: the first question after halfway", async () => {
    const memory = family(openTest(STAGE1));
    // Every answer right would go up. On the grid the child changes every stage 1 answer to a wrong one.
    for (const [i, q] of onRoute(memory.tests[0]).entries()) {
      expect(await changeAnswer(memory.store, P1, "a1", revisit(q, wrongTo(q)), T0 + 2 * HOUR + i * SECOND)).toMatchObject({ ok: true });
    }
    const result = await doneChecking(memory.store, P1, "a1", "stage1", T0 + 3 * HOUR);
    expect(memory.tests[0].route).toBe("down");
    expect(result).toMatchObject({ ok: true, step: { status: "question", number: STAGE1 + 1, question: { id: memory.tests[0].test.stage2.down[0].id } } });
    if (!result.ok) throw new Error(result.error);
    expect(breakDue(result.step)).toBe(true);
  });

  it("moves the deadline to 24 hours later and records the last answer time", async () => {
    const memory = family(openTest(STAGE1));
    const now = T0 + 20 * HOUR;
    expect(await doneChecking(memory.store, P1, "a1", "stage1", now)).toMatchObject({ ok: true });
    expect(memory.tests[0]).toMatchObject({ route: "up", resumeUntil: now + DAY, lastAnswerAt: now });
  });

  it("locks stage 1: a change to a stage 1 answer is refused after it, and stage 2 takes changes", async () => {
    const memory = family(openTest(STAGE1));
    await doneChecking(memory.store, P1, "a1", "stage1", T0 + 2 * HOUR);
    const first = current(memory.tests[0]);
    await answerQuestion(memory.store, P1, "a1", { questionId: first.id, response: first.answer, timeMs: 20_000, work: { png: null, text: "" } }, T0 + 3 * HOUR);
    const q = onRoute(memory.tests[0])[2];
    expect(await changeAnswer(memory.store, P1, "a1", revisit(q, wrongTo(q)), T0 + 4 * HOUR)).toMatchObject({ ok: false, error: "conflict" });
    expect(memory.tests[0].answers[2]).toMatchObject({ response: q.answer });
    expect(await changeAnswer(memory.store, P1, "a1", revisit(first, wrongTo(first)), T0 + 4 * HOUR)).toMatchObject({ ok: true });
  });

  it("a failed lock write keeps the child on the grid with store_failed and the deadline back; pressing again locks it", async () => {
    logs();
    const memory = family(openTest(STAGE1));
    memory.fail.lockStage1 = new StoreError("route save failed", "timeout");
    expect(await doneChecking(memory.store, P1, "a1", "stage1", T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + HOUR + DAY });
    expect(memory.tests[0].route ?? null).toBeNull();
    expect(await nextStep(memory.store, P1, "a1", T0 + 2 * HOUR)).toMatchObject({ ok: true, step: { status: "check", section: "stage1" } });
    delete memory.fail.lockStage1;
    expect(await doneChecking(memory.store, P1, "a1", "stage1", T0 + 2 * HOUR + MINUTE)).toMatchObject({ ok: true, step: { number: STAGE1 + 1 } });
    expect(memory.tests[0].route).toBe("up");
  });

  it("a retry after a lost response returns the stored route's step, and stores nothing new", async () => {
    const memory = family(openTest(STAGE1));
    const first = await doneChecking(memory.store, P1, "a1", "stage1", T0 + 2 * HOUR);
    const again = await doneChecking(memory.store, P1, "a1", "stage1", T0 + 2 * HOUR + MINUTE);
    expect(again).toEqual(first);
    expect(memory.tests[0].route).toBe("up");
  });

  it("two presses at once store one route, and both go on to the same question", async () => {
    const memory = family(openTest(STAGE1));
    const [one, two] = await Promise.all([
      doneChecking(memory.store, P1, "a1", "stage1", T0 + 2 * HOUR),
      doneChecking(memory.store, P1, "a1", "stage1", T0 + 2 * HOUR),
    ]);
    expect(one).toMatchObject({ ok: true, step: { number: STAGE1 + 1 } });
    expect(two).toEqual(one);
    expect(memory.tests[0].route).toBe("up");
  });

  it("a change and Done checking at once: the stored route is the route of the final stage 1 answers", async () => {
    // 15 of 18 right goes up (80% or more); one more wrong answer, 14 of 18, stays on grade.
    const script: Script = (_, i) => i >= 3;
    for (const changeFirst of [true, false]) {
      const memory = family(openTest(STAGE1, { script }));
      const q = onRoute(memory.tests[0])[10];
      const change = () => changeAnswer(memory.store, P1, "a1", revisit(q, wrongTo(q)), T0 + 2 * HOUR);
      const lock = () => doneChecking(memory.store, P1, "a1", "stage1", T0 + 2 * HOUR);
      let changed, locked;
      if (changeFirst) [changed, locked] = await Promise.all([change(), lock()]);
      else [locked, changed] = await Promise.all([lock(), change()]);
      expect(locked).toMatchObject({ ok: true });
      const final = memory.tests[0].answers[10].response === wrongTo(q);
      expect(memory.tests[0].route).toBe(final ? "stay" : "up");
      // The changed answer is either stored before the lock, or refused after it.
      expect(changed.ok).toBe(final);
    }
  });

  it("is refused before every stage 1 question is answered, and after the deadline", async () => {
    const early = family(openTest(STAGE1 - 1));
    expect(await doneChecking(early.store, P1, "a1", "stage1", T0 + 2 * HOUR)).toMatchObject({ ok: false, error: "conflict", step: { status: "question", number: STAGE1 } });
    expect(early.tests[0].route ?? null).toBeNull();
    const late = family(openTest(STAGE1));
    expect(await doneChecking(late.store, P1, "a1", "stage1", T0 + HOUR + DAY + 1)).toEqual({ ok: false, error: "expired" });
    expect(late.tests[0]).toMatchObject({ status: "expired" });
    expect(late.tests[0].route ?? null).toBeNull();
  });
});

describe("the stage 2 grid and Done checking", () => {
  it("with no extra round due: the grid after the last answer; Done checking writes nothing and leads to Did anyone help?", async () => {
    const memory = family(openTest(41));
    const last = current(memory.tests[0]);
    const grid = await answerQuestion(memory.store, P1, "a1", { questionId: last.id, response: last.answer, timeMs: 20_000, work: { png: null, text: "" } }, T0 + 2 * HOUR);
    expect(grid).toMatchObject({ ok: true, step: { status: "check", section: "stage2", numbers: Array.from({ length: 24 }, (_, i) => STAGE1 + 1 + i), total: 42 } });
    if (!grid.ok || grid.step.status !== "check") throw new Error("expected the grid");
    expect(grid.step.answered?.map((a) => a.number)).toEqual(grid.step.numbers);
    const before = structuredClone(memory.tests[0]);
    expect(await doneChecking(memory.store, P1, "a1", "stage2", T0 + 3 * HOUR)).toEqual({ ok: true, step: { status: "complete", total: 42 } });
    expect(memory.tests[0]).toEqual(before);
    // Nothing locks it until the finish: a resume shows the grid again, and a change is still taken.
    expect(await nextStep(memory.store, P1, "a1", T0 + 4 * HOUR)).toMatchObject({ ok: true, step: { status: "check", section: "stage2" } });
    const q = onRoute(memory.tests[0], "up")[30];
    expect(await changeAnswer(memory.store, P1, "a1", revisit(q, wrongTo(q)), T0 + 4 * HOUR)).toMatchObject({ ok: true });
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + 5 * HOUR)).toMatchObject({ ok: true, finished: "now" });
  });

  it("with an extra round due: Done checking records the offer (the lock) and offers the round; stage 2 then takes no change", async () => {
    // Seed 1, first answer wrong: an area is an early sign, so a round is due after the main test.
    const row = openTest(42, { seed: 1, script: (_, i) => i !== 0 });
    const memory = family(row);
    expect(await nextStep(memory.store, P1, "a1", T0 + 2 * HOUR)).toMatchObject({ ok: true, step: { status: "check", section: "stage2" } });
    // Serving the grid records nothing: the offer is recorded at "Done checking".
    expect(memory.tests[0].extraRound?.offeredAt ?? null).toBeNull();
    const result = await doneChecking(memory.store, P1, "a1", "stage2", T0 + 3 * HOUR);
    expect(result).toMatchObject({ ok: true, step: { status: "complete", extraRound: { questions: expect.any(Number) } } });
    expect(memory.tests[0].extraRound?.offeredAt).toBe(T0 + 3 * HOUR);
    // The deadline does not move: every main answer is in.
    expect(memory.tests[0].resumeUntil).toBe(T0 + HOUR + DAY);
    const q = onRoute(memory.tests[0], restoreSession(row.test, row.answers, row.route ?? null).route)[30];
    expect(await changeAnswer(memory.store, P1, "a1", revisit(q, wrongTo(q)), T0 + 4 * HOUR)).toMatchObject({ ok: false, error: "conflict" });
    // A retry after a lost response, and a resume, show the offer.
    expect(await doneChecking(memory.store, P1, "a1", "stage2", T0 + 4 * HOUR)).toEqual(result);
    expect(await nextStep(memory.store, P1, "a1", T0 + 4 * HOUR)).toMatchObject({ ok: true, step: { status: "complete", extraRound: {} } });
  });

  it("a failed offer write keeps the child on the grid with store_failed", async () => {
    logs();
    const memory = family(openTest(42, { seed: 1, script: (_, i) => i !== 0 }));
    memory.fail.recordExtraOffer = new StoreError("extra round offer save failed", "timeout");
    expect(await doneChecking(memory.store, P1, "a1", "stage2", T0 + 3 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(memory.tests[0].extraRound?.offeredAt ?? null).toBeNull();
    expect(await nextStep(memory.store, P1, "a1", T0 + 3 * HOUR)).toMatchObject({ ok: true, step: { status: "check", section: "stage2" } });
  });

  it("Done checking for a section that is not on its grid is a conflict with the step", async () => {
    const memory = family(openTest(STAGE1));
    expect(await doneChecking(memory.store, P1, "a1", "stage2", T0 + 2 * HOUR)).toMatchObject({ ok: false, error: "conflict", step: { status: "check", section: "stage1" } });
    expect(memory.tests[0].route ?? null).toBeNull();
  });
});

describe("tests in progress at deploy restore to the right section", () => {
  it("stage 2 answers present and no stored route: past stage 1, routed by the stage 1 answers", async () => {
    const memory = family(openTest(20));
    expect(await nextStep(memory.store, P1, "a1", T0 + 2 * HOUR)).toMatchObject({ ok: true, step: { status: "question", number: 21, answered: [{ number: 19 }, { number: 20 }] } });
    const q = onRoute(memory.tests[0])[4];
    expect(await changeAnswer(memory.store, P1, "a1", revisit(q, wrongTo(q)), T0 + 2 * HOUR)).toMatchObject({ ok: false, error: "conflict" });
  });

  it("all stage 1 answers and a stored route: stage 1 is locked, the stored route's first question", async () => {
    const memory = family(openTest(STAGE1, { route: "stay" }));
    expect(await nextStep(memory.store, P1, "a1", T0 + 2 * HOUR)).toMatchObject({ ok: true, step: { status: "question", number: STAGE1 + 1, question: { id: memory.tests[0].test.stage2.stay[0].id } } });
    const q = onRoute(memory.tests[0])[4];
    expect(await changeAnswer(memory.store, P1, "a1", revisit(q, wrongTo(q)), T0 + 2 * HOUR)).toMatchObject({ ok: false, error: "conflict" });
  });

  it("all stage 1 answers and no stored route: the stage 1 grid", async () => {
    const memory = family(openTest(STAGE1));
    expect(await nextStep(memory.store, P1, "a1", T0 + 2 * HOUR)).toMatchObject({ ok: true, step: { status: "check", section: "stage1" } });
  });
});

describe("the start screen on a resume (#253)", () => {
  it("says whether the test is past the break: stage 1 locked", async () => {
    for (const [row, afterBreak] of [[openTest(5), false], [openTest(STAGE1), false], [openTest(STAGE1, { route: "up" }), true], [openTest(20), true]] as const) {
      const memory = family(row);
      expect((await startStates(memory.store, P1, T0 + 2 * HOUR)).get(C1)).toMatchObject({ kind: "resume", afterBreak });
    }
  });
});
