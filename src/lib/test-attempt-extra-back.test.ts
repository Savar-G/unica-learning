import { afterEach, describe, expect, it, vi } from "vitest";
import { checked } from "@/lib/assessment/scripted-child";
import {
  REPORTED_STRAND,
  createSession,
  nextQuestion,
  restoreSession,
  startAttempt,
  storedTest,
  submitAnswer,
  type Question,
  type StoredTest,
  type Submission,
} from "@/lib/assessment";
import {
  answerQuestion,
  changeAnswer,
  doneChecking,
  finishTest,
  nextStep,
  skipExtraRound,
  startStates,
  stopExtraRound,
  takeExtraRound,
  type AnswerInput,
  type AttemptStore,
  type ChangeInput,
} from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";

// Back and "Check your answers" in the optional extra round (#249, ticket #254) through the test attempt module, against
// the in-memory store with the clock passed in, in the style of the extra round tests (test-attempt-extra.test.ts).
// The round gets the rules of the main test: the child can change an answered round question until the round is
// locked (stopped, or finished), and after its last question the step is the round's grid. During the test, "Done
// checking" leads to "Did anyone help?"; from the report, the finish request goes on "Done checking".
// Asha, grade 4 in BC, seed 1, first answer wrong: 42 main questions and a round of 8 (numbers 43 to 50).
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 18, 18, 0);
const P1 = "parent-1";
const C1 = "child-1";
const ASHA = { grade: 4, province: "BC" } as const;
const SEED = 1;
const ROUND = [43, 44, 45, 46, 47, 48, 49, 50];

type Script = (q: Question, index: number) => boolean;
const firstWrong: Script = (_, i) => i !== 0;

const wrongTo = (q: Question) => (q.format === "choice" ? q.choices!.find((c) => c !== q.answer)! : "9999");

function mainAnswers(test: StoredTest, script: Script): Submission[] {
  let session = restoreSession(test, []);
  const answers: Submission[] = [];
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    const answer = { questionId: q.id, response: script(q, answers.length) ? q.answer : wrongTo(q), timeMs: 20_000 };
    session = checked(submitAnswer(session, answer));
    answers.push(answer);
  }
  return answers;
}

/** Asha's open test, started at T0, with every main answer in (the last one an hour later). */
function mainDone(): MemoryTest {
  const test = storedTest(createSession(ASHA, SEED));
  return { ...startAttempt("a1", T0), lastAnswerAt: T0 + HOUR, resumeUntil: T0 + HOUR + DAY, parentId: P1, childId: C1, seed: SEED, test, answers: mainAnswers(test, firstWrong) };
}

const family = (row = mainDone()) => memoryAttemptStore({ children: [{ id: C1, parentId: P1, ...ASHA }], tests: [row] });
type Memory = ReturnType<typeof family>;

const session = (row: MemoryTest) => restoreSession(row.test, row.answers, row.route ?? null);
const current = (row: MemoryTest) => nextQuestion(session(row))!;
/** The round question at round number `n` (from 1). */
const roundQuestion = (row: MemoryTest, n: number) => row.test.extra![n - 1];
const earlyArea = (row: MemoryTest) => REPORTED_STRAND[row.test.stage1[0].strand];

const sent = (row: MemoryTest, work: AnswerInput["work"] = { png: null, text: "" }): AnswerInput => {
  const q = current(row);
  return { questionId: q.id, response: q.answer, timeMs: 20_000, work };
};

/** A revisit of round question `n` that sends `response` after 4 seconds, with an unchanged board. */
const revisit = (row: MemoryTest, n: number, response: string): ChangeInput =>
  ({ questionId: roundQuestion(row, n).id, response, timeMs: 4 * SECOND, work: { png: null, text: "" }, workChanged: false });

/** Answers the next `count` round questions right (all that are left by default), one minute apart from `at`. Returns the last time. */
async function answerRound(memory: Memory, at: number, count = Infinity): Promise<number> {
  for (let n = 0; n < count && nextQuestion(session(memory.tests[0])); n++) {
    const result = await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), (at += MINUTE));
    if (!result.ok) throw new Error(`round answer ${n + 1}: ${result.error}`);
  }
  return at;
}

const TAKEN = T0 + 2 * HOUR;
afterEach(() => vi.restoreAllMocks());

describe("Back in the round taken during the test", () => {
  it("a round answer changes, marked again, and moves no deadline, also three days later", async () => {
    const memory = family();
    await takeExtraRound(memory.store, P1, "a1", TAKEN);
    await answerRound(memory, TAKEN, 3);
    const q = roundQuestion(memory.tests[0], 2);
    const result = await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, wrongTo(q)), T0 + 3 * DAY);
    expect(result).toMatchObject({ ok: true, step: { status: "question", number: 46, extra: { number: 4 }, answered: [{ number: 43 }, { number: 44, response: wrongTo(q) }, { number: 45 }] } });
    expect(memory.tests[0].answers[43]).toMatchObject({ questionId: q.id, response: wrongTo(q), correct: false, timeMs: 24 * SECOND, round: "extra" });
    expect(memory.tests[0]).toMatchObject({ status: "in_progress", resumeUntil: T0 + HOUR + DAY });
  });

  it("each round question comes with the round's answered questions, so Back shows them at once", async () => {
    const memory = family();
    await takeExtraRound(memory.store, P1, "a1", TAKEN);
    await answerRound(memory, TAKEN, 2);
    expect(await nextStep(memory.store, P1, "a1", TAKEN + HOUR)).toMatchObject({ ok: true, step: { number: 45, answered: [{ number: 43 }, { number: 44 }] } });
  });

  it("after its last answer the step is the round's grid, a resume lands on it, and Done checking leads to Did anyone help?", async () => {
    const memory = family();
    await takeExtraRound(memory.store, P1, "a1", TAKEN);
    let at = await answerRound(memory, TAKEN, 7);
    const last = await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), (at += MINUTE));
    expect(last).toMatchObject({ ok: true, step: { status: "check", section: "extra", numbers: ROUND, total: 50 } });
    if (!last.ok || last.step.status !== "check") throw new Error("no grid");
    expect(last.step.answered?.map((a) => a.number)).toEqual(ROUND);
    // A resume: the start screen says to check, and the step is the grid again.
    expect((await startStates(memory.store, P1, at + HOUR, C1)).get(C1)).toMatchObject({ kind: "finish", checkGrid: true });
    expect(await nextStep(memory.store, P1, "a1", at + HOUR)).toMatchObject({ ok: true, step: { status: "check", section: "extra", numbers: ROUND } });
    expect(await doneChecking(memory.store, P1, "a1", "extra", at + HOUR)).toEqual({ ok: true, step: { status: "complete", total: 50 } });
  });

  it("the finish scores the final round answers; then the round is locked", async () => {
    const memory = family();
    await takeExtraRound(memory.store, P1, "a1", TAKEN);
    const at = await answerRound(memory, TAKEN);
    const q = roundQuestion(memory.tests[0], 1);
    expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 1, wrongTo(q)), at + MINUTE)).toMatchObject({ ok: true, step: { status: "check", section: "extra" } });
    await doneChecking(memory.store, P1, "a1", "extra", at + 2 * MINUTE);
    expect(await finishTest(memory.store, P1, "a1", "no", at + 3 * MINUTE)).toEqual({ ok: true, id: "a1", finished: "now" });
    // 5 of 6 in the main test, 7 of 8 in the round: the changed answer counts as wrong.
    expect(memory.tests[0].placement?.strands.find((s) => s.strand === earlyArea(memory.tests[0]))).toMatchObject({ correct: 12, total: 14 });
    // Finished: the round takes no change.
    const r = roundQuestion(memory.tests[0], 2);
    expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, wrongTo(r)), at + HOUR)).toMatchObject({ ok: false, error: "conflict" });
    expect(memory.tests[0].answers[43]).toMatchObject({ response: r.answer });
  });

  it("Stop here part way: no grid, and the round takes no change", async () => {
    const memory = family();
    await takeExtraRound(memory.store, P1, "a1", TAKEN);
    const at = await answerRound(memory, TAKEN, 3);
    expect(await stopExtraRound(memory.store, P1, "a1", at + MINUTE)).toEqual({ ok: true, step: { status: "complete", total: 42 } });
    expect(await nextStep(memory.store, P1, "a1", at + 2 * MINUTE)).toEqual({ ok: true, step: { status: "complete", total: 42 } });
    const q = roundQuestion(memory.tests[0], 1);
    expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 1, wrongTo(q)), at + 3 * MINUTE)).toMatchObject({ ok: false, error: "conflict" });
    expect(memory.tests[0].answers[42]).toMatchObject({ response: q.answer });
  });

  it("whiteboard work comes back on a revisit of a round question (#252)", async () => {
    const memory = family();
    await takeExtraRound(memory.store, P1, "a1", TAKEN);
    const recording = { v: 1, width: 812, height: 640, events: [{ kind: "stroke", erase: false, w: 3.2, pts: [[0.1, 0.2, 400], [0.15, 0.25, 480]] }] };
    await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], { png: null, text: "3 + 4", strokes: JSON.stringify(recording) }), TAKEN + MINUTE);
    expect(await nextStep(memory.store, P1, "a1", TAKEN + 2 * MINUTE)).toMatchObject({ ok: true, step: { answered: [{ number: 43, work: { strokes: recording, text: "3 + 4" } }] } });
  });
});

describe("Back in the round from the report", () => {
  const LATER = T0 + 2 * DAY;
  /** Asha skipped the round during the test, the test was finished, and two days later she took it from the report. */
  const fromReport = async () => {
    const memory = family();
    await skipExtraRound(memory.store, P1, "a1", TAKEN);
    await finishTest(memory.store, P1, "a1", "no", T0 + 3 * HOUR);
    await takeExtraRound(memory.store, P1, "a1", LATER);
    return memory;
  };

  it("a round answer changes on the completed test, and the test stays completed", async () => {
    const memory = await fromReport();
    await answerRound(memory, LATER, 3);
    const q = roundQuestion(memory.tests[0], 3);
    expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 3, wrongTo(q)), LATER + HOUR)).toMatchObject({ ok: true, step: { number: 46 } });
    expect(memory.tests[0].answers[44]).toMatchObject({ response: wrongTo(q), correct: false });
    expect(memory.tests[0]).toMatchObject({ status: "completed", completedAt: T0 + 3 * HOUR });
  });

  it("after its last answer the step is the grid, not the finish; the finish then scores the final answers, and locks the round", async () => {
    const memory = await fromReport();
    const at = await answerRound(memory, LATER);
    expect(memory.tests[0].extraRound?.finishedAt ?? null).toBeNull();
    expect(await nextStep(memory.store, P1, "a1", at + MINUTE)).toMatchObject({ ok: true, step: { status: "check", section: "extra", numbers: ROUND } });
    const q = roundQuestion(memory.tests[0], 8);
    await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 8, wrongTo(q)), at + 2 * MINUTE);
    // "Done checking" on the report's round sends the finish.
    expect(await finishTest(memory.store, P1, "a1", null, at + 3 * MINUTE)).toEqual({ ok: true, id: "a1", finished: "now" });
    expect(memory.tests[0].placement?.strands.find((s) => s.strand === earlyArea(memory.tests[0]))).toMatchObject({ correct: 12, total: 14 });
    expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 1, wrongTo(roundQuestion(memory.tests[0], 1))), at + HOUR)).toMatchObject({ ok: false, error: "conflict" });
  });

  it("a change that lands while the finish scores the round: the finish scores the final answers", async () => {
    const memory = await fromReport();
    const at = await answerRound(memory, LATER);
    const q = roundQuestion(memory.tests[0], 1);
    // The finish waits at its write while the change is stored.
    let reached!: () => void;
    const atWrite = new Promise<void>((r) => { reached = r; });
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let first = true;
    const paused: AttemptStore = {
      ...memory.store,
      finishExtraRound: async (...args) => {
        if (first) {
          first = false;
          reached();
          await gate;
        }
        return memory.store.finishExtraRound(...args);
      },
    };
    const finishing = finishTest(paused, P1, "a1", null, at + MINUTE);
    await atWrite;
    expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 1, wrongTo(q)), at + MINUTE)).toMatchObject({ ok: true });
    release();
    expect(await finishing).toEqual({ ok: true, id: "a1", finished: "now" });
    expect(memory.tests[0].placement?.strands.find((s) => s.strand === earlyArea(memory.tests[0]))).toMatchObject({ correct: 12, total: 14 });
  });

  it("a round from the report with every answer in before this change (not finished) resumes on its grid", async () => {
    const memory = await fromReport();
    const at = await answerRound(memory, LATER);
    expect(await takeExtraRound(memory.store, P1, "a1", at + DAY)).toMatchObject({ ok: true, step: { status: "check", section: "extra", numbers: ROUND } });
  });
});
