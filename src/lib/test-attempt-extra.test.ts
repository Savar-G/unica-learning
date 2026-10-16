import { afterEach, describe, expect, it, vi } from "vitest";
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
import { answerQuestion, extraRoundState, finishTest, nextStep, skipExtraRound, StoreError, takeExtraRound, type AnswerInput } from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";

// The optional extra round (#190, spec #181) through the test attempt module, against the in-memory store with the
// clock passed in. After the last main question, only when an area is an early sign, the child can take up to 8 more
// questions or skip them, before "Did anyone help?". A skipped round is offered again from the report while the test
// is the child's latest; a round finished from the report scores the test again, and the report job builds the report
// again.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 16, 18, 0);
const P1 = "parent-1";
const C1 = "child-1";
const ASHA = { grade: 4, province: "BC" } as const;
/** Asha's test is drawn from seed 1: with the first answer wrong she is routed up, and that area is 5 of 6 (an early sign). */
const SEED = 1;

type Script = (q: Question, index: number) => boolean;
const firstWrong: Script = (_, i) => i !== 0;
const allRight: Script = () => true;

/** A wrong answer the module takes for the question: another choice, or a number. */
const wrongTo = (q: Question) => (q.format === "choice" ? q.choices!.find((c) => c !== q.answer)! : "9999");

/** The answers a scripted child gives to every main question of a stored test, 20 seconds each. */
function mainAnswers(test: StoredTest, script: Script): Submission[] {
  let session = restoreSession(test, []);
  const answers: Submission[] = [];
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    const answer = { questionId: q.id, response: script(q, answers.length) ? q.answer : wrongTo(q), timeMs: 20_000 };
    session = submitAnswer(session, answer);
    answers.push(answer);
  }
  return answers;
}

/** Asha's open test, started at T0, with every main answer in by the script, the last one an hour later. */
function mainDone(script: Script, id = "a1"): MemoryTest {
  const test = storedTest(createSession(ASHA, SEED));
  return { ...startAttempt(id, T0), lastAnswerAt: T0 + HOUR, resumeUntil: T0 + HOUR + DAY, parentId: P1, childId: C1, seed: SEED, test, answers: mainAnswers(test, script) };
}

const family = (...tests: MemoryTest[]) => memoryAttemptStore({ children: [{ id: C1, parentId: P1, ...ASHA }], tests });

/** The area of Asha's first question: the one her wrong answer made an early sign. */
const earlyArea = (row: MemoryTest) => REPORTED_STRAND[row.test.stage1[0].strand];

/** The question the child answers next on a stored test. */
const current = (row: MemoryTest) => nextQuestion(restoreSession(row.test, row.answers))!;
/** The answer to the current question in 20 seconds, with an empty board: right, unless `right` is false. */
const sent = (row: MemoryTest, right = true): AnswerInput => {
  const q = current(row);
  return { questionId: q.id, response: right ? q.answer : wrongTo(q), timeMs: 20_000, work: { png: null, text: "" } };
};

afterEach(() => vi.restoreAllMocks());

describe("the offer after the last main question", () => {
  it("comes with the step when an area is an early sign, and the store records when it was first offered", async () => {
    const memory = family(mainDone(firstWrong));
    const step = { status: "complete", total: 42, extraRound: { questions: 8, strands: [earlyArea(memory.tests[0])] } };
    expect(await nextStep(memory.store, P1, "a1", T0 + 2 * HOUR)).toEqual({ ok: true, step });
    expect(await nextStep(memory.store, P1, "a1", T0 + 3 * HOUR)).toEqual({ ok: true, step });
    expect(memory.tests[0].extraRound).toMatchObject({ offeredAt: T0 + 2 * HOUR, skippedAt: null, startedAt: null, finishedAt: null });
  });

  it("comes with the response to the last main answer", async () => {
    const row = mainDone(firstWrong);
    const last = row.answers.pop()!;
    const memory = family(row);
    const result = await answerQuestion(memory.store, P1, "a1", { questionId: last.questionId, response: last.response, timeMs: 20_000, work: { png: null, text: "" } }, T0 + 2 * HOUR);
    expect(result).toEqual({ ok: true, step: { status: "complete", total: 42, extraRound: { questions: 8, strands: [earlyArea(row)] } } });
  });

  it("is not made when every area is clear: the step goes on to Did anyone help?", async () => {
    const memory = family(mainDone(allRight));
    expect(await nextStep(memory.store, P1, "a1", T0 + 2 * HOUR)).toEqual({ ok: true, step: { status: "complete", total: 42 } });
    expect(memory.tests[0].extraRound?.offeredAt ?? null).toBeNull();
  });
});

/** The child answers every question of the round that is still open, one minute apart from `at`: right unless `right` says no. */
async function answerRound(memory: ReturnType<typeof family>, at: number, right: (n: number) => boolean = () => true): Promise<number> {
  for (let n = 0; nextQuestion(restoreSession(memory.tests[0].test, memory.tests[0].answers)); n++) {
    const result = await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], right(n)), (at += MINUTE));
    if (!result.ok) throw new Error(`round answer ${n + 1}: ${result.error}`);
  }
  return at;
}

describe("taking the round during the test", () => {
  it("stores its questions with the test and its start time, and sends its first question", async () => {
    const memory = family(mainDone(firstWrong));
    const at = T0 + 2 * HOUR;
    const result = await takeExtraRound(memory.store, P1, "a1", at);
    expect(result).toMatchObject({ ok: true, step: { status: "question", number: 43, total: 50, extra: { number: 1, total: 8 }, question: { id: "x-0" } } });
    expect(memory.tests[0].test.extra).toHaveLength(8);
    expect(memory.tests[0].extraRound).toMatchObject({ startedAt: at, skippedAt: null, finishedAt: null });
    expect(memory.shows).toContainEqual({ assessmentId: "a1", position: 42, questionId: "x-0", at });
  });

  it("starts once when it is taken twice at once: both requests get its first question", async () => {
    const memory = family(mainDone(firstWrong));
    const both = await Promise.all([takeExtraRound(memory.store, P1, "a1", T0 + 2 * HOUR), takeExtraRound(memory.store, P1, "a1", T0 + 2 * HOUR + 1)]);
    expect(both).toMatchObject([{ ok: true, step: { number: 43, question: { id: "x-0" } } }, { ok: true, step: { number: 43, question: { id: "x-0" } } }]);
    expect(memory.tests[0].extraRound?.startedAt).toBe(T0 + 2 * HOUR);
  });

  it("stores each answer like a main answer, with the extra-round mark; the test never runs out of time while it lasts", async () => {
    const memory = family(mainDone(firstWrong));
    await takeExtraRound(memory.store, P1, "a1", T0 + 2 * HOUR);
    const first = memory.tests[0].test.extra![0];
    // Three days later: past the main test's 24 hours, which only main answers move.
    const at = T0 + 3 * DAY;
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), at)).toMatchObject({ ok: true, step: { number: 44, extra: { number: 2, total: 8 } } });
    expect(memory.tests[0].answers[42]).toMatchObject({
      position: 42, questionId: "x-0", templateId: first.templateId, values: first.values, response: first.answer, correct: true, round: "extra",
      timeline: { shownAt: T0 + 2 * HOUR, answeredAt: at },
    });
    expect(memory.tests[0]).toMatchObject({ status: "in_progress", resumeUntil: T0 + HOUR + DAY, lastAnswerAt: at });
  });

  it("goes on to Did anyone help? after its last question, and the finish scores the main test and the round together", async () => {
    const memory = family(mainDone(firstWrong));
    await takeExtraRound(memory.store, P1, "a1", T0 + 2 * HOUR);
    const last = await answerRound(memory, T0 + 2 * HOUR);
    expect(await nextStep(memory.store, P1, "a1", last)).toEqual({ ok: true, step: { status: "complete", total: 50 } });
    expect(await finishTest(memory.store, P1, "a1", "no", last + MINUTE)).toEqual({ ok: true, id: "a1", finished: "now" });
    const early = earlyArea(memory.tests[0]);
    expect(memory.tests[0]).toMatchObject({ status: "completed", completedAt: last + MINUTE, help: "no", extraRound: { startedAt: T0 + 2 * HOUR, finishedAt: last + MINUTE } });
    expect(memory.tests[0].placement?.extraRound).toEqual({ questions: 8, strands: [early] });
    expect(memory.tests[0].placement?.strands.find((s) => s.strand === early)).toMatchObject({ correct: 13, total: 14, certainty: "clear" });
  });

  it("cannot finish before the round's last answer", async () => {
    const memory = family(mainDone(firstWrong));
    await takeExtraRound(memory.store, P1, "a1", T0 + 2 * HOUR);
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + 3 * HOUR)).toEqual({ ok: false, error: "incomplete" });
  });

  it("is refused on a test that ran out of time", async () => {
    const row = mainDone(firstWrong);
    row.answers.pop();
    const memory = family(row);
    expect(await takeExtraRound(memory.store, P1, "a1", T0 + 3 * DAY)).toEqual({ ok: false, error: "expired" });
  });

  it("is refused when no area is an early sign, with the step, and nothing is stored", async () => {
    const memory = family(mainDone(allRight));
    expect(await takeExtraRound(memory.store, P1, "a1", T0 + 2 * HOUR)).toEqual({ ok: false, error: "conflict", step: { status: "complete", total: 42 } });
    expect(memory.tests[0].test.extra).toBeUndefined();
  });
});

describe("skipping the round", () => {
  it("records the skip, and the step goes on to Did anyone help? without the offer, also after a reload", async () => {
    const memory = family(mainDone(firstWrong));
    await nextStep(memory.store, P1, "a1", T0 + 2 * HOUR);
    expect(await skipExtraRound(memory.store, P1, "a1", T0 + 2 * HOUR + MINUTE)).toEqual({ ok: true, step: { status: "complete", total: 42 } });
    expect(await nextStep(memory.store, P1, "a1", T0 + 3 * HOUR)).toEqual({ ok: true, step: { status: "complete", total: 42 } });
    expect(memory.tests[0].extraRound).toEqual({ offeredAt: T0 + 2 * HOUR, skippedAt: T0 + 2 * HOUR + MINUTE, startedAt: null, finishedAt: null });
  });

  it("a second skip changes nothing", async () => {
    const memory = family(mainDone(firstWrong));
    await skipExtraRound(memory.store, P1, "a1", T0 + 2 * HOUR);
    expect(await skipExtraRound(memory.store, P1, "a1", T0 + 3 * HOUR)).toEqual({ ok: true, step: { status: "complete", total: 42 } });
    expect(memory.tests[0].extraRound?.skippedAt).toBe(T0 + 2 * HOUR);
  });

  it("then the finish scores the main test only", async () => {
    const memory = family(mainDone(firstWrong));
    await skipExtraRound(memory.store, P1, "a1", T0 + 2 * HOUR);
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + 3 * HOUR)).toEqual({ ok: true, id: "a1", finished: "now" });
    expect(memory.tests[0].placement).not.toHaveProperty("extraRound");
    expect(memory.tests[0].placement?.strands.find((s) => s.strand === earlyArea(memory.tests[0]))).toMatchObject({ correct: 5, total: 6, certainty: "early-sign" });
    expect(memory.tests[0].extraRound).toMatchObject({ skippedAt: T0 + 2 * HOUR, finishedAt: null });
  });

  it("is refused when no round is due, or once the round has started, with the step, and records nothing", async () => {
    const clear = family(mainDone(allRight));
    expect(await skipExtraRound(clear.store, P1, "a1", T0 + 2 * HOUR)).toEqual({ ok: false, error: "conflict", step: { status: "complete", total: 42 } });
    expect(clear.tests[0].extraRound?.skippedAt ?? null).toBeNull();
    const taken = family(mainDone(firstWrong));
    await takeExtraRound(taken.store, P1, "a1", T0 + 2 * HOUR);
    expect(await skipExtraRound(taken.store, P1, "a1", T0 + 3 * HOUR)).toMatchObject({ ok: false, error: "conflict", step: { number: 43, extra: { number: 1 } } });
    expect(taken.tests[0].extraRound?.skippedAt).toBeNull();
  });
});

// The report offers a skipped round again while the test is the child's latest (#190). The round then runs on the
// completed test, and its finish scores the test again; the finish route then runs the report job.
describe("the round from the report", () => {
  /** Asha skipped the round at T0 + 2 hours, said someone helped, and the test was finished at T0 + 3 hours. */
  const skippedAndFinished = async () => {
    const memory = family(mainDone(firstWrong));
    await skipExtraRound(memory.store, P1, "a1", T0 + 2 * HOUR);
    await finishTest(memory.store, P1, "a1", "yes", T0 + 3 * HOUR);
    return memory;
  };
  const LATER = T0 + 2 * DAY;

  it("is offered on the report after a skip", async () => {
    const memory = await skippedAndFinished();
    expect(await extraRoundState(memory.store, P1, "a1")).toEqual({ kind: "offer", offer: { questions: 8, strands: [earlyArea(memory.tests[0])] } });
  });

  it("starts on the completed test, takes its answers with the extra-round mark, and the test stays completed", async () => {
    const memory = await skippedAndFinished();
    expect(await takeExtraRound(memory.store, P1, "a1", LATER)).toMatchObject({ ok: true, step: { number: 43, total: 50, extra: { number: 1, total: 8 } } });
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), LATER + MINUTE)).toMatchObject({ ok: true, step: { number: 44 } });
    expect(memory.tests[0]).toMatchObject({ status: "completed", completedAt: T0 + 3 * HOUR, lastAnswerAt: LATER + MINUTE, extraRound: { skippedAt: T0 + 2 * HOUR, startedAt: LATER, finishedAt: null } });
    expect(memory.tests[0].answers[42]).toMatchObject({ position: 42, questionId: "x-0", round: "extra" });
    // Stopped part way: the report says it can go on.
    expect(await extraRoundState(memory.store, P1, "a1")).toEqual({ kind: "continue", offer: { questions: 8, strands: [earlyArea(memory.tests[0])] }, answered: 1 });
  });

  it("its finish scores the test again with the round, keeps the help answer, and says it finished now; a second finish changes nothing", async () => {
    const memory = await skippedAndFinished();
    const before = structuredClone(memory.tests[0].placement!);
    await takeExtraRound(memory.store, P1, "a1", LATER);
    const last = await answerRound(memory, LATER);
    expect(await nextStep(memory.store, P1, "a1", last)).toEqual({ ok: true, step: { status: "complete", total: 50 } });
    expect(await finishTest(memory.store, P1, "a1", null, last + MINUTE)).toEqual({ ok: true, id: "a1", finished: "now" });
    const early = earlyArea(memory.tests[0]);
    const placement = memory.tests[0].placement!;
    expect(placement.strands.find((s) => s.strand === early)).toMatchObject({ correct: 13, total: 14, certainty: "clear" });
    expect(placement.extraRound).toEqual({ questions: 8, strands: [early] });
    expect(placement.flags).toEqual(before.flags);
    expect(before.flags).toContainEqual({ kind: "helped", answer: "yes" });
    expect(memory.tests[0]).toMatchObject({ status: "completed", completedAt: T0 + 3 * HOUR, help: "yes", extraRound: { finishedAt: last + MINUTE } });
    const scored = structuredClone(memory.tests[0]);
    expect(await finishTest(memory.store, P1, "a1", null, last + 2 * MINUTE)).toEqual({ ok: true, id: "a1", finished: "already" });
    expect(memory.tests[0]).toEqual(scored);
    // Done: the report offers nothing more.
    expect(await extraRoundState(memory.store, P1, "a1")).toBeNull();
  });

  it("cannot finish before the round's last answer, and the stored result stays as it was", async () => {
    const memory = await skippedAndFinished();
    const before = structuredClone(memory.tests[0].placement);
    await takeExtraRound(memory.store, P1, "a1", LATER);
    expect(await finishTest(memory.store, P1, "a1", null, LATER + HOUR)).toEqual({ ok: false, error: "incomplete" });
    expect(memory.tests[0].placement).toEqual(before);
  });

  it("is not offered, and cannot start, once a newer test of the child exists", async () => {
    const memory = await skippedAndFinished();
    memory.tests.push({ ...mainDone(allRight, "a2"), ...startAttempt("a2", T0 + 31 * DAY) });
    expect(await extraRoundState(memory.store, P1, "a1")).toBeNull();
    expect(await takeExtraRound(memory.store, P1, "a1", T0 + 31 * DAY)).toMatchObject({ ok: false, error: "conflict" });
    expect(memory.tests[0].test.extra).toBeUndefined();
  });

  it("is not offered when every area was clear, nor for another family's test", async () => {
    const clear = family(mainDone(allRight));
    await finishTest(clear.store, P1, "a1", "no", T0 + 3 * HOUR);
    expect(await extraRoundState(clear.store, P1, "a1")).toBeNull();
    const memory = await skippedAndFinished();
    expect(await extraRoundState(memory.store, "parent-2", "a1")).toBeNull();
    expect(await takeExtraRound(memory.store, "parent-2", "a1", LATER)).toEqual({ ok: false, error: "not_found" });
  });

  it("is not offered for a round taken and finished during the test", async () => {
    const memory = family(mainDone(firstWrong));
    await takeExtraRound(memory.store, P1, "a1", T0 + 2 * HOUR);
    const last = await answerRound(memory, T0 + 2 * HOUR);
    await finishTest(memory.store, P1, "a1", "no", last + MINUTE);
    expect(await extraRoundState(memory.store, P1, "a1")).toBeNull();
    expect(await finishTest(memory.store, P1, "a1", null, last + 2 * MINUTE)).toEqual({ ok: true, id: "a1", finished: "already" });
  });
});

describe("when the store fails", () => {
  it("a failed round start is store_failed, logged, and the round has not started; a second try starts it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const memory = family(mainDone(firstWrong));
    memory.fail.startExtraRound = new StoreError("extra round start failed", "timeout");
    expect(await takeExtraRound(memory.store, P1, "a1", T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(log.mock.calls).toEqual([["[test] extra round start failed", "timeout"]]);
    expect(memory.tests[0].test.extra).toBeUndefined();
    delete memory.fail.startExtraRound;
    expect(await takeExtraRound(memory.store, P1, "a1", T0 + 3 * HOUR)).toMatchObject({ ok: true, step: { extra: { number: 1 } } });
  });

  it("an offer that cannot be recorded is logged, and the step still offers the round", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const memory = family(mainDone(firstWrong));
    memory.fail.recordExtraOffer = new StoreError("extra round offer save failed", "timeout");
    expect(await nextStep(memory.store, P1, "a1", T0 + 2 * HOUR)).toMatchObject({ ok: true, step: { status: "complete", extraRound: { questions: 8 } } });
    expect(log.mock.calls).toEqual([["[test] extra round offer save failed", "timeout"]]);
  });

  it("a failed skip is store_failed, and the offer stays", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const memory = family(mainDone(firstWrong));
    memory.fail.skipExtraRound = new StoreError("extra round skip failed", "timeout");
    expect(await skipExtraRound(memory.store, P1, "a1", T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    delete memory.fail.skipExtraRound;
    expect(await nextStep(memory.store, P1, "a1", T0 + 3 * HOUR)).toMatchObject({ ok: true, step: { extraRound: { questions: 8 } } });
  });

  it("a failed finish of a round from the report is store_failed, and the stored result stays as it was", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const memory = family(mainDone(firstWrong));
    await skipExtraRound(memory.store, P1, "a1", T0 + 2 * HOUR);
    await finishTest(memory.store, P1, "a1", "no", T0 + 3 * HOUR);
    const before = structuredClone(memory.tests[0].placement);
    await takeExtraRound(memory.store, P1, "a1", T0 + DAY);
    const last = await answerRound(memory, T0 + DAY);
    memory.fail.finishExtraRound = new StoreError("extra round finish failed", "timeout");
    expect(await finishTest(memory.store, P1, "a1", null, last + MINUTE)).toEqual({ ok: false, error: "store_failed" });
    expect(memory.tests[0].placement).toEqual(before);
    expect(memory.tests[0].extraRound?.finishedAt).toBeNull();
  });
});
