import { afterEach, describe, expect, it, vi } from "vitest";
import { createFacts, createSession, nextQuestion, restoreSession, startAttempt, storedFacts, storedTest, submitAnswer, type StoredTest, type Submission } from "@/lib/assessment";
import type { AnswerEvents } from "@/lib/answer-events";
import { answerQuestion, nextStep, startFacts, StoreError, type AnswerInput } from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";

// The answer timeline (#184) through the test attempt module, against the in-memory store with the clock passed in:
// the server records when it serves each question and when it receives each answer, and each answer keeps what the
// child did before Next (answer changes, read-aloud, time away).
const SECOND = 1000;
const HOUR = 60 * 60_000;
const T0 = Date.UTC(2026, 9, 16, 18, 0);
const P1 = "parent-1";
const C1 = "child-1";
const ASHA = { grade: 4, province: "BC" } as const;

/** The right answers to the first `count` questions of a stored test. */
function answersOf(test: StoredTest, count: number): Submission[] {
  let session = restoreSession(test, []);
  const answers: Submission[] = [];
  for (let q = nextQuestion(session); q && answers.length < count; q = nextQuestion(session)) {
    const answer = { questionId: q.id, response: q.answer, timeMs: 20_000 };
    session = submitAnswer(session, answer);
    answers.push(answer);
  }
  return answers;
}

/** Asha's open test (grade 4, seed 7), started at T0, with the first `answered` answers in. */
function openTest(answered = 0): MemoryTest {
  const test = storedTest(createSession(ASHA, 7));
  return { ...startAttempt("a1", T0), parentId: P1, childId: C1, seed: 7, test, answers: answersOf(test, answered) };
}

/** The question the child answers next on a stored test. */
const current = (row: MemoryTest) => nextQuestion(restoreSession(row.test, row.answers))!;
/** The right answer to the current question in 20 seconds, with an empty board, and `events` when given. */
const sent = (row: MemoryTest, events?: AnswerEvents | null): AnswerInput =>
  ({ questionId: current(row).id, response: current(row).answer, timeMs: 20_000, work: { png: null, text: "" }, ...(events === undefined ? {} : { events }) });

const family = (test: MemoryTest) => memoryAttemptStore({ children: [{ id: C1, parentId: P1, ...ASHA }], tests: [test] });

afterEach(() => vi.restoreAllMocks());

describe("when the server serves a question (#184)", () => {
  it("records the time it first sends the question; a reload later does not move it", async () => {
    const memory = family(openTest(5));
    const sixth = memory.tests[0].test.stage1[5];
    expect(await nextStep(memory.store, P1, "a1", T0 + HOUR)).toMatchObject({ ok: true, step: { number: 6, question: { id: sixth.id } } });
    expect(await nextStep(memory.store, P1, "a1", T0 + HOUR + 40 * SECOND)).toMatchObject({ ok: true, step: { number: 6 } });
    expect(memory.shows).toEqual([{ assessmentId: "a1", position: 5, questionId: sixth.id, at: T0 + HOUR }]);
  });
});

// Asha's test drawn from seed 7: question 3 (place 2) is a choice question that needs no shown work.
describe("when the server receives an answer (#184)", () => {
  it("stores it with the time its question was served, the time it arrived, and what the child did before Next", async () => {
    const memory = family(openTest(2));
    const third = current(memory.tests[0]);
    const fourth = memory.tests[0].test.stage1[3];
    await nextStep(memory.store, P1, "a1", T0 + HOUR);
    const events: AnswerEvents = {
      changes: [{ value: third.choices![0] === third.answer ? third.choices![1] : third.choices![0], atMs: 4_000 }, { value: third.answer, atMs: 9_500 }],
      readAloud: { count: 2, atMs: [500, 7_000] },
      away: { count: 1, ms: 3_000 },
    };
    const at = T0 + HOUR + 21 * SECOND;
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0], events), at)).toMatchObject({ ok: true, step: { number: 4, question: { id: fourth.id } } });
    expect(memory.tests[0].answers[2]).toMatchObject({ questionId: third.id, response: third.answer, timeMs: 20_000, timeline: { shownAt: T0 + HOUR, answeredAt: at, events } });
    // The next question is served in the same response: its serve time is the answer's arrival.
    expect(memory.shows).toEqual([
      { assessmentId: "a1", position: 2, questionId: third.id, at: T0 + HOUR },
      { assessmentId: "a1", position: 3, questionId: fourth.id, at },
    ]);
  });
});

describe("the first question after halfway (#184)", () => {
  /** A small PNG drawing: the PNG signature and one byte. */
  const DRAWING = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

  it("counts as served only once the quick facts are done: the break and the facts come first", async () => {
    // Asha's test has 18 questions before the break: 17 are in, and question 18 is the last before it.
    const memory = family(openTest(17));
    const last = current(memory.tests[0]);
    const A = T0 + HOUR;
    const answered = await answerQuestion(memory.store, P1, "a1", { questionId: last.id, response: last.answer, timeMs: 20_000, work: { png: DRAWING, text: "" } }, A);
    expect(answered).toMatchObject({ ok: true, step: { status: "question", number: 19, breakAfter: 18 } });
    const first = answered.ok && answered.step.status === "question" ? answered.step.question.id : "";
    // The break screen, then the facts: a reload asks for the step before the facts start, and while they run.
    await nextStep(memory.store, P1, "a1", A + 30 * SECOND);
    expect(await startFacts(memory.store, P1, "a1", A + 60 * SECOND)).toMatchObject({ ok: true, step: { status: "running" } });
    await nextStep(memory.store, P1, "a1", A + 90 * SECOND);
    expect(memory.shows.filter((s) => s.position === 18)).toEqual([]);
    // "Keep going" after the 60 seconds of facts asks for the step again: that serve counts.
    await nextStep(memory.store, P1, "a1", A + 125 * SECOND);
    await nextStep(memory.store, P1, "a1", A + 150 * SECOND);
    expect(memory.shows.filter((s) => s.position === 18)).toEqual([{ assessmentId: "a1", position: 18, questionId: first, at: A + 125 * SECOND }]);
  });

  it("is served at once on a resume after the facts were done", async () => {
    const memory = family(openTest(18));
    memory.facts.push({ assessmentId: "a1", startedAt: T0 + HOUR, test: storedFacts(createFacts(ASHA, 7)), answers: [] });
    await nextStep(memory.store, P1, "a1", T0 + 3 * HOUR);
    expect(memory.shows).toMatchObject([{ position: 18, at: T0 + 3 * HOUR }]);
  });
});

describe("a question sent with a conflict (#184)", () => {
  it("counts as served: the screen shows the step that comes with the conflict", async () => {
    // Another tab answered question 3 already: this tab's answer to it gets a conflict with question 4.
    const memory = family(openTest(3));
    const third = memory.tests[0].test.stage1[2];
    const fourth = memory.tests[0].test.stage1[3];
    const stale = { questionId: third.id, response: third.answer, timeMs: 20_000, work: { png: null, text: "" } };
    expect(await answerQuestion(memory.store, P1, "a1", stale, T0 + HOUR)).toMatchObject({ ok: false, error: "conflict", step: { number: 4 } });
    expect(memory.shows).toEqual([{ assessmentId: "a1", position: 3, questionId: fourth.id, at: T0 + HOUR }]);
  });
});

describe("when the serve times cannot be stored (#184)", () => {
  it("still sends the step and stores the answer, without a serve time, and logs each failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const memory = family(openTest(2));
    memory.fail.recordShown = new StoreError("shown time save failed", "down");
    expect(await nextStep(memory.store, P1, "a1", T0 + HOUR)).toMatchObject({ ok: true, step: { number: 3 } });
    memory.fail.shownAt = new StoreError("shown time load failed", "down");
    const at = T0 + HOUR + 30 * SECOND;
    expect(await answerQuestion(memory.store, P1, "a1", sent(memory.tests[0]), at)).toMatchObject({ ok: true, step: { number: 4 } });
    expect(memory.tests[0].answers[2]).toMatchObject({ timeline: { shownAt: null, answeredAt: at, events: null } });
    expect(log.mock.calls).toEqual([
      ["[test] shown time save failed", "down"],
      ["[test] shown time load failed", "down"],
      ["[test] shown time save failed", "down"],
    ]);
  });
});
