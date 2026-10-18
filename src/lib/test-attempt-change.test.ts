import { afterEach, describe, expect, it, vi } from "vitest";
import {
  QUESTION_TIME_CAP_MS,
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
import { ANSWER_CHANGES_MAX, type AnswerEvents } from "@/lib/answer-events";
import { answerQuestion, changeAnswer, finishTest, nextStep, StoreError, takeExtraRound, type AnswerInput, type AttemptStore, type ChangeInput } from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryAnswer, type MemoryTest } from "@/lib/test-attempt-memory";
import { answerLines, type AnswerRecord } from "@/lib/admin-view";
import { storedBoard } from "@/lib/strokes";
import { openMode } from "@/lib/whiteboard";

// Back and change an answer (#249, #250) through the test attempt module, against the in-memory store with the clock
// passed in. The child can change an answered question of the open section (stage 1 until its last answer routes the
// test, then stage 2 until the test moves on). The change overwrites the answer: the report scores the final answer.
// Asha, grade 4 in BC: stage 1 has 18 questions, and seed 7 gives a test of 42 questions when every answer is right.
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 17, 18, 0);
const P1 = "parent-1";
const C1 = "child-1";
const ASHA = { grade: 4, province: "BC" } as const;

type Script = (q: Question, index: number) => boolean;
const allRight: Script = () => true;

/** A wrong answer the module takes for the question: another choice, or a number. */
const wrongTo = (q: Question) => (q.format === "choice" ? q.choices!.find((c) => c !== q.answer)! : "9999");

/** The answers a scripted child gives to the first `count` questions of a stored test, 20 seconds each. */
function answersOf(test: StoredTest, count: number, script: Script = allRight): Submission[] {
  let session = restoreSession(test, []);
  const answers: Submission[] = [];
  for (let q = nextQuestion(session); q && answers.length < count; q = nextQuestion(session)) {
    const answer = { questionId: q.id, response: script(q, answers.length) ? q.answer : wrongTo(q), timeMs: 20_000 };
    session = submitAnswer(session, answer);
    answers.push(answer);
  }
  return answers;
}

/** Asha's open test (seed 7 unless given), started at T0, with the first `answered` answers in; the last one at T0 + 1 hour. */
function openTest(answered: number, { seed = 7, script = allRight }: { seed?: number; script?: Script } = {}): MemoryTest {
  const test = storedTest(createSession(ASHA, seed));
  const at = answered ? { lastAnswerAt: T0 + HOUR, resumeUntil: T0 + HOUR + DAY } : {};
  return { ...startAttempt("a1", T0), ...at, parentId: P1, childId: C1, seed, test, answers: answersOf(test, answered, script) };
}

const family = (test: MemoryTest) => memoryAttemptStore({ children: [{ id: C1, parentId: P1, ...ASHA }], tests: [test] });

/** The question at a place of the stored test, on its route. */
const at = (row: MemoryTest, position: number): Question => {
  const session = restoreSession(row.test, row.answers);
  return [...session.stage1, ...(session.route ? session.stage2[session.route] : [])][position];
};
/** The question the child answers next. */
const current = (row: MemoryTest) => nextQuestion(restoreSession(row.test, row.answers))!;

/** A revisit of the question at `position` that sends `response` after `timeMs`, with an unchanged board. */
const revisit = (row: MemoryTest, position: number, response: string, more: Partial<ChangeInput> = {}): ChangeInput =>
  ({ questionId: at(row, position).id, response, timeMs: 4 * SECOND, work: { png: null, text: "" }, workChanged: false, ...more });

/** What the child did in one visit: answer changes, read-aloud uses, time away. */
const events = (changes: [string, number][], read: number[] = [], away = { count: 0, ms: 0 }): AnswerEvents =>
  ({ changes: changes.map(([value, atMs]) => ({ value, atMs })), readAloud: { count: read.length, atMs: read }, away });

/** A small PNG drawing: the PNG signature and one byte. */
const DRAWING = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
const OTHER_DRAWING = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x02]);
const STROKES = JSON.stringify({ v: 1, w: 400, h: 300, ms: 900, events: [] });

const logs = () => vi.spyOn(console, "error").mockImplementation(() => {});
afterEach(() => vi.restoreAllMocks());

describe("changing an answer in the open section", () => {
  it("overwrites the answer at its place with the new response, marked again", async () => {
    const memory = family(openTest(5));
    const q = at(memory.tests[0], 2);
    const result = await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, wrongTo(q)), T0 + 2 * HOUR);
    expect(result).toMatchObject({ ok: true, step: { status: "question", number: 6 } });
    expect(memory.tests[0].answers).toHaveLength(5);
    expect(memory.tests[0].answers[2]).toMatchObject({ questionId: q.id, response: wrongTo(q), correct: false, timeMs: 24 * SECOND });
    // The test goes on where it was: the next question is still the sixth.
    expect(await nextStep(memory.store, P1, "a1", T0 + 2 * HOUR)).toMatchObject({ ok: true, step: { number: 6, question: { id: at(memory.tests[0], 5).id } } });
  });

  it("a wrong answer changed to the right one is right; the finish scores the final answers", async () => {
    // Every main answer right except stage 2's last one: no area is an early sign, so no extra round is offered and
    // stage 2 stays open until the finish.
    const row = openTest(42, { script: (_, i) => i !== 41 });
    const memory = family(row);
    const q = at(row, 41);
    expect(memory.tests[0].answers[41]).toMatchObject({ response: wrongTo(q) });
    expect(await changeAnswer(memory.store, P1, "a1", revisit(row, 41, q.answer), T0 + 2 * HOUR)).toMatchObject({ ok: true, step: { status: "complete" } });
    expect(memory.tests[0].answers[41]).toMatchObject({ response: q.answer, correct: true, misconception: null });
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + 3 * HOUR)).toMatchObject({ ok: true, finished: "now" });
    const placement = memory.tests[0].placement!;
    expect(placement.levels.reduce((n, l) => n + l.correct, 0)).toBe(42);
  });

  it("takes the same answer again with only the visit time added", async () => {
    const memory = family(openTest(3));
    const q = at(memory.tests[0], 0);
    expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 0, q.answer, { timeMs: 1_500 }), T0 + 2 * HOUR)).toMatchObject({ ok: true });
    expect(memory.tests[0].answers[0]).toMatchObject({ response: q.answer, correct: true, timeMs: 21_500 });
  });

  it("moves the deadline to 24 hours after the change and records the last answer time, while main answers remain", async () => {
    const memory = family(openTest(3));
    const now = T0 + 20 * HOUR;
    await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 1, at(memory.tests[0], 1).answer), now);
    expect(memory.tests[0]).toMatchObject({ status: "in_progress", resumeUntil: now + DAY, lastAnswerAt: now });
  });

  it("once every main answer is in: no deadline check and no deadline move", async () => {
    const row = openTest(42);
    const memory = family(row);
    const q = at(row, 30);
    // Three days after the last answer: a test with every main answer in never runs out of time.
    const now = T0 + 3 * DAY;
    expect(await changeAnswer(memory.store, P1, "a1", revisit(row, 30, wrongTo(q)), now)).toMatchObject({ ok: true });
    expect(memory.tests[0]).toMatchObject({ status: "in_progress", resumeUntil: T0 + HOUR + DAY });
    expect(memory.tests[0].answers[30]).toMatchObject({ response: wrongTo(q), correct: false });
  });
});

describe("a change the module refuses", () => {
  it("on a finished test", async () => {
    const row = openTest(42);
    const memory = family(row);
    expect(await finishTest(memory.store, P1, "a1", "no", T0 + 2 * HOUR)).toMatchObject({ ok: true });
    const result = await changeAnswer(memory.store, P1, "a1", revisit(row, 30, wrongTo(at(row, 30))), T0 + 3 * HOUR);
    expect(result).toMatchObject({ ok: false, error: "conflict" });
    expect(memory.tests[0].answers[30]).toMatchObject({ response: at(row, 30).answer });
  });

  it("after the deadline, while main answers remain: the test ran out of time", async () => {
    const memory = family(openTest(5));
    const result = await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 1, wrongTo(at(memory.tests[0], 1))), T0 + HOUR + DAY + 1);
    expect(result).toEqual({ ok: false, error: "expired" });
    expect(memory.tests[0].answers[1]).toMatchObject({ response: at(memory.tests[0], 1).answer });
  });

  it("for the question the child has not answered yet, and for a question that is not in the test", async () => {
    const memory = family(openTest(5));
    const q = current(memory.tests[0]);
    const unanswered = await changeAnswer(memory.store, P1, "a1", { ...revisit(memory.tests[0], 0, q.answer), questionId: q.id }, T0 + 2 * HOUR);
    expect(unanswered).toMatchObject({ ok: false, error: "conflict", step: { number: 6 } });
    const unknown = await changeAnswer(memory.store, P1, "a1", { ...revisit(memory.tests[0], 0, "1"), questionId: "s1-99" }, T0 + 2 * HOUR);
    expect(unknown).toMatchObject({ ok: false, error: "conflict" });
    expect(memory.tests[0].answers).toHaveLength(5);
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + HOUR + DAY });
  });

  it("for a stage 1 question once the last stage 1 answer routed the test: stage 1 is closed", async () => {
    const memory = family(openTest(20));
    const q = at(memory.tests[0], 4);
    expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 4, wrongTo(q)), T0 + 2 * HOUR)).toMatchObject({ ok: false, error: "conflict" });
    expect(memory.tests[0].answers[4]).toMatchObject({ response: q.answer });
    // Stage 2 is the open section: its answers change.
    expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 19, wrongTo(at(memory.tests[0], 19))), T0 + 2 * HOUR)).toMatchObject({ ok: true });
  });

  it("for a stage 2 question once the extra round was offered: the test moved on", async () => {
    // Seed 1, first answer wrong: an area is an early sign, so the step after the last main answer offers the round.
    const row = openTest(42, { seed: 1, script: (_, i) => i !== 0 });
    const memory = family(row);
    expect(await nextStep(memory.store, P1, "a1", T0 + 2 * HOUR)).toMatchObject({ ok: true, step: { status: "complete", extraRound: {} } });
    const q = at(row, 30);
    expect(await changeAnswer(memory.store, P1, "a1", revisit(row, 30, wrongTo(q)), T0 + 3 * HOUR)).toMatchObject({ ok: false, error: "conflict" });
    expect(memory.tests[0].answers[30]).toMatchObject({ response: q.answer });
  });

  it("in the extra round, which takes no change yet (#254)", async () => {
    const row = openTest(42, { seed: 1, script: (_, i) => i !== 0 });
    const memory = family(row);
    await takeExtraRound(memory.store, P1, "a1", T0 + 2 * HOUR);
    const first = current(memory.tests[0]);
    await answerQuestion(memory.store, P1, "a1", { questionId: first.id, response: first.answer, timeMs: 20_000, work: { png: null, text: "" } }, T0 + 2 * HOUR + MINUTE);
    const result = await changeAnswer(memory.store, P1, "a1", { ...revisit(row, 0, wrongTo(first)), questionId: first.id }, T0 + 2 * HOUR + 2 * MINUTE);
    expect(result).toMatchObject({ ok: false, error: "conflict" });
  });

  it("a response that does not fit the question is invalid, and stores nothing", async () => {
    const memory = family(openTest(5));
    // Question 3 is a choice question.
    for (const response of ["not a choice", ""]) {
      expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, response), T0 + 2 * HOUR)).toEqual({ ok: false, error: "invalid" });
    }
    expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, at(memory.tests[0], 2).answer, { timeMs: -1 }), T0 + 2 * HOUR)).toEqual({ ok: false, error: "invalid" });
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + HOUR + DAY, lastAnswerAt: T0 + HOUR });
  });

  it("when the store fails: store_failed, and the deadline goes back", async () => {
    logs();
    const memory = family(openTest(5));
    memory.fail.changeAnswer = new StoreError("answer change failed", "boom");
    const result = await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 1, wrongTo(at(memory.tests[0], 1))), T0 + 2 * HOUR);
    expect(result).toEqual({ ok: false, error: "store_failed" });
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + HOUR + DAY, lastAnswerAt: T0 + HOUR });
    expect(memory.tests[0].answers[1]).toMatchObject({ response: at(memory.tests[0], 1).answer });
  });
});

describe("the step carries the open section's answered questions, for Back (#249)", () => {
  it("each with its number and the child's response, and never the right answer or the coded wrong answers", async () => {
    const memory = family(openTest(3, { script: (_, i) => i !== 1 }));
    const result = await nextStep(memory.store, P1, "a1", T0 + 2 * HOUR);
    if (!result.ok || result.step.status !== "question") throw new Error("expected a question");
    const row = memory.tests[0];
    expect(result.step.answered?.map((a) => [a.number, a.question.id, a.response])).toEqual([
      [1, at(row, 0).id, at(row, 0).answer],
      [2, at(row, 1).id, wrongTo(at(row, 1))],
      [3, at(row, 2).id, at(row, 2).answer],
    ]);
    for (const a of result.step.answered!) {
      expect(Object.keys(a.question)).not.toContain("answer");
      expect(Object.keys(a.question)).not.toContain("wrong");
      expect(Object.keys(a.question)).not.toContain("values");
    }
    expect(JSON.stringify(result.step)).not.toContain("misconception");
  });

  it("after routing: only stage 2's answers; none on the first question of a section", async () => {
    const routed = family(openTest(20));
    expect(await nextStep(routed.store, P1, "a1", T0 + 2 * HOUR)).toMatchObject({ ok: true, step: { number: 21, answered: [{ number: 19 }, { number: 20 }] } });
    for (const answered of [0, 18]) {
      const memory = family(openTest(answered));
      const result = await nextStep(memory.store, P1, "a1", T0 + 2 * HOUR);
      expect(result.ok && result.step.status === "question" && result.step.answered).toBeFalsy();
    }
  });

  it("the response to an answer and to a change carries them too, with the changed response", async () => {
    const memory = family(openTest(2));
    const q = current(memory.tests[0]);
    const answered = await answerQuestion(memory.store, P1, "a1", { questionId: q.id, response: q.answer, timeMs: 20_000, work: { png: null, text: "" } }, T0 + 2 * HOUR);
    expect(answered).toMatchObject({ ok: true, step: { number: 4, answered: [{ number: 1 }, { number: 2 }, { number: 3, response: q.answer }] } });
    const changed = await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, wrongTo(q)), T0 + 2 * HOUR + MINUTE);
    expect(changed).toMatchObject({ ok: true, step: { number: 4, answered: [{ number: 1 }, { number: 2 }, { number: 3, response: wrongTo(q) }] } });
  });
});

describe("the step carries the work of the open section's answered questions, so the board shows it at once (#252)", () => {
  const recording = { v: 1, width: 812, height: 640, events: [{ kind: "stroke", erase: false, w: 3.2, pts: [[0.1, 0.2, 400], [0.15, 0.25, 480]] }] };
  const other = { v: 1, width: 600, height: 400, events: [{ kind: "stroke", erase: false, w: 3.2, pts: [[0.5, 0.5, 100]] }] };

  /** Asha's test with 2 answers in, then question 3 answered with `work`. */
  async function answered(work: AnswerInput["work"]) {
    const memory = family(openTest(2));
    const q = current(memory.tests[0]);
    expect(await answerQuestion(memory.store, P1, "a1", { questionId: q.id, response: q.answer, timeMs: 20_000, work }, T0 + HOUR + MINUTE)).toMatchObject({ ok: true });
    return { memory, q };
  }
  const stepAt = async (memory: ReturnType<typeof family>, now: number) => {
    const result = await nextStep(memory.store, P1, "a1", now);
    if (!result.ok || result.step.status !== "question") throw new Error("expected a question");
    return result.step;
  };

  it("the strokes and the typed working, as stored; an answer with no work carries none", async () => {
    const { memory } = await answered({ png: DRAWING, text: "3 + 4", strokes: JSON.stringify(recording) });
    const step = await stepAt(memory, T0 + 2 * HOUR);
    expect(step.answered?.map((a) => a.work)).toEqual([undefined, undefined, { strokes: recording, text: "3 + 4" }]);
  });

  it("the answer request's step carries the work of the answer it just stored", async () => {
    const memory = family(openTest(2));
    const q = current(memory.tests[0]);
    const result = await answerQuestion(memory.store, P1, "a1", { questionId: q.id, response: q.answer, timeMs: 20_000, work: { png: null, text: "7", strokes: JSON.stringify(recording) } }, T0 + HOUR + MINUTE);
    expect(result).toMatchObject({ ok: true, step: { answered: [{ number: 1 }, { number: 2 }, { number: 3, work: { strokes: recording, text: "7" } }] } });
  });

  it("after a change with new work, the new work; after an erased board, none", async () => {
    const { memory, q } = await answered({ png: DRAWING, text: "3 + 4", strokes: JSON.stringify(recording) });
    const work = { png: OTHER_DRAWING, text: "4 + 3", strokes: JSON.stringify(other) };
    expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, q.answer, { work, workChanged: true }), T0 + 2 * HOUR))
      .toMatchObject({ ok: true, step: { answered: [{}, {}, { work: { strokes: other, text: "4 + 3" } }] } });
    expect((await stepAt(memory, T0 + 2 * HOUR + MINUTE)).answered?.[2].work).toEqual({ strokes: other, text: "4 + 3" });
    const erased = { png: null, text: "", strokes: JSON.stringify(other) };
    await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, q.answer, { work: erased, workChanged: true }), T0 + 3 * HOUR);
    expect((await stepAt(memory, T0 + 3 * HOUR + MINUTE)).answered?.[2].work).toBeUndefined();
  });

  it("a drawing stored with no strokes (before #186) carries no strokes: its board opens empty", async () => {
    const { memory } = await answered({ png: DRAWING, text: "" });
    expect((await stepAt(memory, T0 + 2 * HOUR)).answered?.[2].work).toBeUndefined();
  });

  it("board mode (Savar, 2026-10-18): Type when the work has typed working and nothing drawable on the board, also with a drawing stored with no strokes; else Draw", async () => {
    const modeOf = async (work: AnswerInput["work"]) => {
      const { memory } = await answered(work);
      const stored = (await stepAt(memory, T0 + 2 * HOUR)).answered?.[2].work;
      return openMode(storedBoard(stored ?? {}, 0), true);
    };
    // A drawing with no strokes cannot be shown, so its board would be empty in Draw: Type shows the typed working.
    expect(await modeOf({ png: DRAWING, text: "3 + 4" })).toBe("type");
    expect(await modeOf({ png: null, text: "3 + 4" })).toBe("type");
    expect(await modeOf({ png: DRAWING, text: "3 + 4", strokes: JSON.stringify(recording) })).toBe("draw");
    expect(await modeOf({ png: DRAWING, text: "" })).toBe("draw");
  });

  it("when the work cannot be read, the step still goes, with the answers and no work", async () => {
    logs();
    const { memory, q } = await answered({ png: DRAWING, text: "3 + 4", strokes: JSON.stringify(recording) });
    memory.fail.answerWork = new StoreError("answer work load failed", "boom");
    const step = await stepAt(memory, T0 + 2 * HOUR);
    expect(step.answered?.map((a) => [a.response, a.work])).toEqual([[at(memory.tests[0], 0).answer, undefined], [at(memory.tests[0], 1).answer, undefined], [q.answer, undefined]]);
  });
});

describe("a typed-only change on a board that opened empty keeps the stored drawing (#252)", () => {
  it("a drawing stored with no strokes (before #186) stays when the child only types; the typed working changes", async () => {
    const memory = family(openTest(2));
    const q = current(memory.tests[0]);
    await answerQuestion(memory.store, P1, "a1", { questionId: q.id, response: q.answer, timeMs: 20_000, work: { png: DRAWING, text: "" } }, T0 + HOUR + MINUTE);
    const { workPath } = memory.tests[0].answers[2];
    const typed = revisit(memory.tests[0], 2, q.answer, { work: { png: null, text: "3 + 4" }, workChanged: true });
    expect(await changeAnswer(memory.store, P1, "a1", typed, T0 + 2 * HOUR)).toMatchObject({ ok: true });
    expect(memory.tests[0].answers[2]).toMatchObject({ workPath, workText: "3 + 4" });
    expect([...memory.drawings.keys()]).toEqual([workPath]);
  });

  it("a failed update keeps the stored drawing and its file", async () => {
    logs();
    const memory = family(openTest(2));
    const q = current(memory.tests[0]);
    await answerQuestion(memory.store, P1, "a1", { questionId: q.id, response: q.answer, timeMs: 20_000, work: { png: DRAWING, text: "" } }, T0 + HOUR + MINUTE);
    const { workPath } = memory.tests[0].answers[2];
    memory.fail.changeAnswer = new StoreError("answer change failed", "boom");
    const typed = revisit(memory.tests[0], 2, q.answer, { work: { png: null, text: "3 + 4" }, workChanged: true });
    expect(await changeAnswer(memory.store, P1, "a1", typed, T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(memory.tests[0].answers[2].workPath).toBe(workPath);
    expect([...memory.drawings.keys()]).toEqual([workPath]);
  });

  it("a drawing with strokes stays too when the child drew nothing (the strokes could not be read, so the board opened empty)", async () => {
    const memory = family(openTest(2));
    const q = current(memory.tests[0]);
    await answerQuestion(memory.store, P1, "a1", { questionId: q.id, response: q.answer, timeMs: 20_000, work: { png: DRAWING, text: "", strokes: STROKES } }, T0 + HOUR + MINUTE);
    const { workPath, strokesPath } = memory.tests[0].answers[2];
    const typed = revisit(memory.tests[0], 2, q.answer, { work: { png: null, text: "3 + 4" }, workChanged: true });
    expect(await changeAnswer(memory.store, P1, "a1", typed, T0 + 2 * HOUR)).toMatchObject({ ok: true });
    expect(memory.tests[0].answers[2]).toMatchObject({ workPath, strokesPath, workText: "3 + 4" });
    expect([...memory.drawings.keys()]).toEqual([workPath]);
    expect([...memory.strokes.keys()]).toEqual([strokesPath]);
  });

  it("a typed-only change and a new drawing at once: the final row points to files that exist, with the typed working", async () => {
    const memory = family(openTest(2));
    const q = current(memory.tests[0]);
    await answerQuestion(memory.store, P1, "a1", { questionId: q.id, response: q.answer, timeMs: 20_000, work: { png: DRAWING, text: "" } }, T0 + HOUR + MINUTE);
    // The typed-only change waits at its guarded update while the other tab stores a new drawing and removes the old one.
    let reached!: () => void;
    const atWrite = new Promise<void>((r) => { reached = r; });
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const paused: AttemptStore = { ...memory.store, changeAnswer: async (...args) => { reached(); await gate; return memory.store.changeAnswer(...args); } };
    const typing = changeAnswer(paused, P1, "a1", revisit(memory.tests[0], 2, q.answer, { work: { png: null, text: "typed" }, workChanged: true }), T0 + 2 * HOUR);
    await atWrite;
    const drawing = await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, q.answer, { work: { png: OTHER_DRAWING, text: "drawn", strokes: STROKES }, workChanged: true }), T0 + 2 * HOUR);
    release();
    expect([drawing, await typing]).toMatchObject([{ ok: true }, { ok: true }]);
    const final = memory.tests[0].answers[2];
    expect(final.workText).toBe("typed");
    expect([...memory.drawings]).toEqual([[final.workPath, OTHER_DRAWING]]);
    expect([...memory.strokes.keys()]).toEqual([final.strokesPath]);
  });

  it("a drawing the child draws over replaces it", async () => {
    const memory = family(openTest(2));
    const q = current(memory.tests[0]);
    await answerQuestion(memory.store, P1, "a1", { questionId: q.id, response: q.answer, timeMs: 20_000, work: { png: DRAWING, text: "" } }, T0 + HOUR + MINUTE);
    const drawn = revisit(memory.tests[0], 2, q.answer, { work: { png: OTHER_DRAWING, text: "" }, workChanged: true });
    expect(await changeAnswer(memory.store, P1, "a1", drawn, T0 + 2 * HOUR)).toMatchObject({ ok: true });
    expect([...memory.drawings]).toEqual([[memory.tests[0].answers[2].workPath, OTHER_DRAWING]]);
  });
});

describe("the admin test page shows the final work of a changed answer (#252)", () => {
  /** An answer as the admin page reads its row of public.answers: the columns the Supabase adapter writes. */
  const record = (a: MemoryAnswer, position: number): AnswerRecord => ({
    position, question_id: a.questionId, response: a.response, correct: a.correct ?? false, misconception: a.misconception ?? null,
    time_ms: a.timeMs, work_required: a.workRequired ?? false, work_path: a.workPath ?? null, work_text: a.workText ?? null,
  });
  /** The answer lines the admin test page shows (src/app/(product)/admin/assessments/[id]/page.tsx). */
  const adminLines = (row: MemoryTest) => answerLines(row.test, row.answers.map(record), []);

  it("a change with new work shows the new drawing and typed working; an erase shows none", async () => {
    const memory = family(openTest(2));
    const q = current(memory.tests[0]);
    await answerQuestion(memory.store, P1, "a1", { questionId: q.id, response: q.answer, timeMs: 20_000, work: { png: DRAWING, text: "3 + 4", strokes: STROKES } }, T0 + HOUR + MINUTE);
    const first = memory.tests[0].answers[2].workPath!;
    expect(adminLines(memory.tests[0])[2].work).toMatchObject({ image: first, text: "3 + 4" });

    const work = { png: OTHER_DRAWING, text: "4 + 3", strokes: STROKES };
    await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, wrongTo(q), { work, workChanged: true }), T0 + 2 * HOUR);
    const line = adminLines(memory.tests[0])[2];
    expect(line).toMatchObject({ number: 3, response: wrongTo(q), correct: false, work: { text: "4 + 3" } });
    expect(line.work.image).not.toBe(first);
    expect(memory.drawings.get(line.work.image!)).toEqual(OTHER_DRAWING);

    const erased = { png: null, text: "", strokes: STROKES };
    await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, wrongTo(q), { work: erased, workChanged: true }), T0 + 3 * HOUR);
    expect(adminLines(memory.tests[0])[2].work).toMatchObject({ image: null, text: null });
  });
});

describe("the timeline of a changed answer (#184)", () => {
  /** Asha's test with 2 answers in, then question 3 answered through the module with `first` as its events. */
  async function withThird(first: AnswerEvents, timeMs = 20_000) {
    const memory = family(openTest(2));
    const q = current(memory.tests[0]);
    await memory.store.recordShown("a1", { position: 2, questionId: q.id, at: T0 + HOUR + MINUTE });
    const input: AnswerInput = { questionId: q.id, response: wrongTo(q), timeMs, work: { png: null, text: "" }, events: first };
    expect(await answerQuestion(memory.store, P1, "a1", input, T0 + HOUR + 2 * MINUTE)).toMatchObject({ ok: true });
    return { memory, q };
  }

  it("adds the visit's changes at the end, timed from the first visit; adds the counts; keeps the serve time", async () => {
    const third = current(openTest(2));
    const { memory, q } = await withThird(events([[wrongTo(third), 5_000]], [1_000], { count: 1, ms: 2_000 }));
    const later = events([[q.answer, 3_000]], [500, 2_500], { count: 2, ms: 1_000 });
    const now = T0 + 2 * HOUR;
    expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, q.answer, { timeMs: 6_000, events: later }), now)).toMatchObject({ ok: true });
    expect(memory.tests[0].answers[2]).toMatchObject({
      timeMs: 26_000,
      timeline: {
        shownAt: T0 + HOUR + MINUTE,
        answeredAt: now,
        events: {
          changes: [{ value: wrongTo(q), atMs: 5_000 }, { value: q.answer, atMs: 23_000 }],
          readAloud: { count: 3, atMs: [1_000, 20_500, 22_500] },
          away: { count: 3, ms: 3_000 },
        },
      },
    });
  });

  it("a visit with no change adds only its time, read-aloud uses and time away", async () => {
    const { memory, q } = await withThird(events([["7", 5_000]]));
    const look = events([], [1_000], { count: 1, ms: 500 });
    await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, wrongTo(q), { timeMs: 2_000, events: look }), T0 + 2 * HOUR);
    expect(memory.tests[0].answers[2]).toMatchObject({
      response: wrongTo(q),
      timeMs: 22_000,
      timeline: { events: { changes: [{ value: "7", atMs: 5_000 }], readAloud: { count: 1, atMs: [21_000] }, away: { count: 1, ms: 500 } } },
    });
  });

  it("keeps the caps: the first 50 changes, each time and the total time within the time cap of one question", async () => {
    const many = events(Array.from({ length: 48 }, (_, i): [string, number] => [String(i), i * 100]));
    const { memory, q } = await withThird(many, QUESTION_TIME_CAP_MS - 10 * SECOND);
    const later = events([["a", 1_000], ["b", 20_000], ["c", 30_000]]);
    await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, q.answer, { timeMs: 40 * SECOND, events: later }), T0 + 2 * HOUR);
    const answer = memory.tests[0].answers[2];
    expect(answer.timeMs).toBe(QUESTION_TIME_CAP_MS);
    const changes = answer.timeline!.events!.changes;
    expect(changes).toHaveLength(ANSWER_CHANGES_MAX);
    expect(changes.slice(-2)).toEqual([{ value: "a", atMs: QUESTION_TIME_CAP_MS - 9 * SECOND }, { value: "b", atMs: QUESTION_TIME_CAP_MS }]);
  });
});

describe("the work on a revisit", () => {
  /** Asha's test with 2 answers in, then question 3 answered with a drawing, typed working and strokes. */
  async function withWork() {
    const memory = family(openTest(2));
    const q = current(memory.tests[0]);
    const input: AnswerInput = { questionId: q.id, response: q.answer, timeMs: 20_000, work: { png: DRAWING, text: "3 + 4", strokes: STROKES } };
    expect(await answerQuestion(memory.store, P1, "a1", input, T0 + HOUR + MINUTE)).toMatchObject({ ok: true });
    const { workPath, strokesPath } = memory.tests[0].answers[2];
    return { memory, q, workPath: workPath!, strokesPath: strokesPath! };
  }

  it("unchanged keeps the stored drawing, strokes and typed working, also when the response changes", async () => {
    const { memory, q, workPath, strokesPath } = await withWork();
    expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, wrongTo(q)), T0 + 2 * HOUR)).toMatchObject({ ok: true });
    expect(memory.tests[0].answers[2]).toMatchObject({ response: wrongTo(q), workPath, workText: "3 + 4", strokesPath });
    expect([...memory.drawings.keys()]).toEqual([workPath]);
    expect([...memory.strokes.keys()]).toEqual([strokesPath]);
  });

  it("changed work replaces the stored work, and the old files are removed", async () => {
    const { memory, q, workPath, strokesPath } = await withWork();
    const work = { png: OTHER_DRAWING, text: "4 + 3", strokes: STROKES };
    expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, q.answer, { work, workChanged: true }), T0 + 2 * HOUR)).toMatchObject({ ok: true });
    const answer = memory.tests[0].answers[2];
    expect(answer).toMatchObject({ workText: "4 + 3" });
    expect(answer.workPath).not.toBe(workPath);
    expect(answer.strokesPath).not.toBe(strokesPath);
    expect([...memory.drawings]).toEqual([[answer.workPath, OTHER_DRAWING]]);
    expect([...memory.strokes.keys()]).toEqual([answer.strokesPath]);
  });

  it("an erased board is changed work with no drawing: the row's work is empty and the old files are removed", async () => {
    const { memory, q } = await withWork();
    // #252: the board opens with the stored strokes, so an erased board sends them (with the erase) and no drawing.
    const erased = revisit(memory.tests[0], 2, q.answer, { work: { png: null, text: "", strokes: STROKES }, workChanged: true });
    expect(await changeAnswer(memory.store, P1, "a1", erased, T0 + 2 * HOUR)).toMatchObject({ ok: true });
    expect(memory.tests[0].answers[2]).toMatchObject({ workPath: null, workText: null });
    expect(memory.tests[0].answers[2].strokesPath ?? null).toBeNull();
    expect(memory.drawings.size).toBe(0);
    expect(memory.strokes.size).toBe(0);
  });

  it("a board cleared in the visit sends its strokes (the stroke, then Clear): the row's drawing and strokes still become empty", async () => {
    const { memory, q } = await withWork();
    const cleared = revisit(memory.tests[0], 2, q.answer, { work: { png: null, text: "", strokes: STROKES }, workChanged: true });
    expect(await changeAnswer(memory.store, P1, "a1", cleared, T0 + 2 * HOUR)).toMatchObject({ ok: true });
    expect(memory.tests[0].answers[2]).toMatchObject({ workPath: null, workText: null });
    expect(memory.tests[0].answers[2].strokesPath ?? null).toBeNull();
    expect(memory.drawings.size).toBe(0);
    expect(memory.strokes.size).toBe(0);
  });

  it("changed work after every main answer is in is stored: the work rules read the question being changed", async () => {
    const row = openTest(42);
    const memory = family(row);
    const q = at(row, 30);
    const result = await changeAnswer(memory.store, P1, "a1", revisit(row, 30, q.answer, { work: { png: DRAWING, text: "4 + 3" }, workChanged: true }), T0 + 2 * HOUR);
    expect(result).toMatchObject({ ok: true });
    expect(memory.tests[0].answers[30]).toMatchObject({ workText: "4 + 3", workPath: [...memory.drawings.keys()][0] });
  });

  it("refuses typed working in grades 1 and 2 on a change too, and changes nothing", async () => {
    const ben = { grade: 2, province: "BC" } as const;
    const test = storedTest(createSession(ben, 7));
    const memory = memoryAttemptStore({
      children: [{ id: C1, parentId: P1, ...ben }],
      tests: [{ ...startAttempt("a1", T0), lastAnswerAt: T0 + HOUR, resumeUntil: T0 + HOUR + DAY, parentId: P1, childId: C1, seed: 7, test, answers: answersOf(test, 3) }],
    });
    const q = at(memory.tests[0], 1);
    const result = await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 1, q.answer, { work: { png: null, text: "5" }, workChanged: true }), T0 + 2 * HOUR);
    expect(result).toEqual({ ok: false, error: "typing_off" });
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + HOUR + DAY });
  });

  it("a failed update keeps the old work, and the new files are removed", async () => {
    logs();
    const { memory, q, workPath, strokesPath } = await withWork();
    memory.fail.changeAnswer = new StoreError("answer change failed", "boom");
    const work = { png: OTHER_DRAWING, text: "4 + 3", strokes: STROKES };
    expect(await changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 2, q.answer, { work, workChanged: true }), T0 + 2 * HOUR)).toEqual({ ok: false, error: "store_failed" });
    expect(memory.tests[0].answers[2]).toMatchObject({ workPath, workText: "3 + 4", strokesPath });
    expect([...memory.drawings.keys()]).toEqual([workPath]);
    expect([...memory.strokes.keys()]).toEqual([strokesPath]);
  });
});

describe("two requests at once", () => {
  it("two changes to one answer leave one whole answer, and only its drawing", async () => {
    const memory = family(openTest(2));
    const q = current(memory.tests[0]);
    await answerQuestion(memory.store, P1, "a1", { questionId: q.id, response: q.answer, timeMs: 20_000, work: { png: DRAWING, text: "" } }, T0 + HOUR + MINUTE);
    const one = revisit(memory.tests[0], 2, wrongTo(q), { work: { png: OTHER_DRAWING, text: "tab one" }, workChanged: true, timeMs: 1_000 });
    const two = revisit(memory.tests[0], 2, q.answer, { work: { png: DRAWING, text: "tab two" }, workChanged: true, timeMs: 2_000 });
    const results = await Promise.all([changeAnswer(memory.store, P1, "a1", one, T0 + 2 * HOUR), changeAnswer(memory.store, P1, "a1", two, T0 + 2 * HOUR)]);
    expect(results).toMatchObject([{ ok: true }, { ok: true }]);
    const answer = memory.tests[0].answers[2];
    const whole = [
      { response: wrongTo(q), correct: false, workText: "tab one", timeMs: 21_000 },
      { response: q.answer, correct: true, workText: "tab two", timeMs: 22_000 },
    ];
    expect(whole).toContainEqual({ response: answer.response, correct: answer.correct, workText: answer.workText, timeMs: answer.timeMs });
    expect([...memory.drawings.keys()]).toEqual([answer.workPath]);
    expect(memory.drawings.get(answer.workPath!)).toEqual(answer.workText === "tab one" ? OTHER_DRAWING : DRAWING);
  });

  it("a change that lands while the finish scores the test: the placement scores the answer stored at the finish's write", async () => {
    const row = openTest(42);
    const memory = family(row);
    // The finish stops just before its write, until the change is stored.
    let reached!: () => void;
    const atWrite = new Promise<void>((resolve) => (reached = resolve));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const paused: AttemptStore = {
      ...memory.store,
      complete: async (...args: Parameters<AttemptStore["complete"]>) => {
        reached();
        await gate;
        return memory.store.complete(...args);
      },
    };
    const finishing = finishTest(paused, P1, "a1", "no", T0 + 2 * HOUR);
    await atWrite;
    const q = at(row, 30);
    expect(await changeAnswer(memory.store, P1, "a1", revisit(row, 30, wrongTo(q)), T0 + 2 * HOUR)).toMatchObject({ ok: true });
    release();
    expect(await finishing).toMatchObject({ ok: true, finished: "now" });
    expect(memory.tests[0]).toMatchObject({ status: "completed" });
    expect(memory.tests[0].answers[30]).toMatchObject({ response: wrongTo(q), correct: false });
    expect(memory.tests[0].placement!.levels.reduce((n, l) => n + l.correct, 0)).toBe(41);
  });

  it("a change and the finish at once: whichever wins, the placement scores the stored answers", async () => {
    const row = openTest(42);
    const memory = family(row);
    const q = at(row, 30);
    const [changed, finished] = await Promise.all([
      changeAnswer(memory.store, P1, "a1", revisit(row, 30, wrongTo(q)), T0 + 2 * HOUR),
      finishTest(memory.store, P1, "a1", "no", T0 + 2 * HOUR),
    ]);
    expect(finished).toMatchObject({ ok: true });
    const stored = restoreSession(memory.tests[0].test, memory.tests[0].answers as Submission[]);
    expect(changed.ok).toBe(memory.tests[0].answers[30].response === wrongTo(q));
    expect(memory.tests[0].placement!.levels.reduce((n, l) => n + l.correct, 0)).toBe(stored.answers.filter((a) => a.correct).length);
  });

  it("a change and the last stage 1 answer at once: the test stays whole and goes on", async () => {
    const memory = family(openTest(17));
    const last = current(memory.tests[0]);
    const results = await Promise.all([
      changeAnswer(memory.store, P1, "a1", revisit(memory.tests[0], 0, wrongTo(at(memory.tests[0], 0))), T0 + 2 * HOUR),
      answerQuestion(memory.store, P1, "a1", { questionId: last.id, response: last.answer, timeMs: 20_000, work: { png: null, text: "" } }, T0 + 2 * HOUR),
    ]);
    expect(results[1]).toMatchObject({ ok: true });
    expect(memory.tests[0].answers).toHaveLength(18);
    expect(await nextStep(memory.store, P1, "a1", T0 + 3 * HOUR)).toMatchObject({ ok: true, step: { status: "question", number: 19 } });
  });
});
