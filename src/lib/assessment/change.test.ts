import { describe, expect, it } from "vitest";
import { checked } from "@/lib/assessment/scripted-child";
import {
  QUESTION_TIME_CAP_MS,
  TOO_FAST_MS,
  changeAnswer,
  createSession,
  finish,
  nextQuestion,
  openSection,
  restoreSession,
  storedTest,
  submitAnswer,
  type Question,
  type Session,
} from "@/lib/assessment";

// Back and change an answer (#249, #250), in the assessment core: the child can change an answered question of the
// open section; the change marks the answer again, its time is the total of every visit, and a question outside the
// open section never changes. Asha, grade 4 in BC, seed 7: stage 1 has 18 questions.
const ASHA = { grade: 4, province: "BC" } as const;

/** Asha's session with the first `count` questions answered: right, in 20 seconds each. */
function answered(count: number): Session {
  let session = createSession(ASHA, 7);
  for (let i = 0; i < count; i++) {
    const q = nextQuestion(session)!;
    session = checked(submitAnswer(session, { questionId: q.id, response: q.answer, timeMs: 20_000 }));
  }
  return session;
}

/** The refusal of a change to a question that is not answered, or not in the open section. */
const NOT_OPEN = /is not an answered question of the open section/;

/** A wrong response to a question: another choice, or another number. */
const wrongFor = (q: Question) => (q.format === "choice" ? q.choices!.find((c) => c !== q.answer)! : String(Number(q.answer) + 1));

/** The question at a place of the session's route. */
const at = (session: Session, position: number): Question =>
  [...session.stage1, ...(session.route ? session.stage2[session.route] : [])][position];

describe("changing an answer (#249)", () => {
  it("a right answer changed to a coded wrong one is wrong, with its misconception", () => {
    const session = answered(4);
    const q = at(session, 1);
    const changed = changeAnswer(session, { questionId: q.id, response: q.wrong[0].value, timeMs: 5_000 });
    expect(changed.answers[1]).toMatchObject({ questionId: q.id, response: q.wrong[0].value, correct: false, misconception: q.wrong[0].misconception });
    // The other answers and the place in the test do not move.
    expect(changed.answers.map((a) => a.response)).toEqual([at(session, 0).answer, q.wrong[0].value, at(session, 2).answer, at(session, 3).answer]);
    expect(nextQuestion(changed)?.id).toBe(at(session, 4).id);
  });

  it("a wrong answer changed to the right one is right, with no misconception", () => {
    const q = at(answered(0), 2);
    let session = answered(2);
    session = submitAnswer(session, { questionId: q.id, response: q.wrong[1].value, timeMs: 20_000 });
    session = submitAnswer(session, { questionId: at(session, 3).id, response: at(session, 3).answer, timeMs: 20_000 });
    expect(session.answers[2]).toMatchObject({ correct: false, misconception: q.wrong[1].misconception });
    const changed = changeAnswer(session, { questionId: q.id, response: q.answer, timeMs: 5_000 });
    expect(changed.answers[2]).toMatchObject({ response: q.answer, correct: true, misconception: null });
  });

  it("a change from one coded wrong answer to another takes the new misconception", () => {
    const session = answered(3);
    const q = at(session, 1);
    const first = changeAnswer(session, { questionId: q.id, response: q.wrong[0].value, timeMs: 1_000 });
    const second = changeAnswer(first, { questionId: q.id, response: q.wrong[2].value, timeMs: 1_000 });
    expect(q.wrong[0].misconception).not.toBe(q.wrong[2].misconception);
    expect(second.answers[1]).toMatchObject({ correct: false, misconception: q.wrong[2].misconception });
  });

  it("the answer's time is the total of every visit, up to the time cap of one question", () => {
    const session = answered(3);
    const q = at(session, 0);
    const twice = changeAnswer(session, { questionId: q.id, response: q.answer, timeMs: 1_500 });
    expect(twice.answers[0].timeMs).toBe(21_500);
    const long = changeAnswer(twice, { questionId: q.id, response: q.answer, timeMs: 2 * QUESTION_TIME_CAP_MS });
    expect(long.answers[0].timeMs).toBe(QUESTION_TIME_CAP_MS);
  });

  it("refuses a change to the question the child has not answered yet", () => {
    const session = answered(3);
    expect(() => changeAnswer(session, { questionId: at(session, 3).id, response: at(session, 3).answer, timeMs: 1_000 })).toThrow(NOT_OPEN);
  });

  it("refuses a change to a question that is not in the test", () => {
    expect(() => changeAnswer(answered(3), { questionId: "s1-99", response: "1", timeMs: 1_000 })).toThrow(NOT_OPEN);
  });

  it("refuses a change to stage 1 once the test is routed: stage 1 is closed", () => {
    const session = answered(19);
    expect(session.route).not.toBeNull();
    const q = at(session, 4);
    expect(() => changeAnswer(session, { questionId: q.id, response: q.wrong[0].value, timeMs: 1_000 })).toThrow(NOT_OPEN);
    // Stage 2 is the open section now: its first answer can change.
    const s2 = at(session, 18);
    expect(changeAnswer(session, { questionId: s2.id, response: wrongFor(s2), timeMs: 1_000 }).answers[18].correct).toBe(false);
  });

  it("a negative or broken time is refused", () => {
    const session = answered(2);
    const q = at(session, 0);
    for (const timeMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => changeAnswer(session, { questionId: q.id, response: q.answer, timeMs })).toThrow("timeMs must be a time in milliseconds");
    }
  });
});

describe("the open section (#249)", () => {
  it("before routing: stage 1, with its answered questions in order", () => {
    const session = answered(3);
    const open = openSection(session);
    expect(open).toMatchObject({ name: "stage1", first: 0, end: 18 });
    expect(open.answered.map((a) => [a.position, a.question.id, a.answer.response])).toEqual(
      [0, 1, 2].map((p) => [p, at(session, p).id, at(session, p).answer]),
    );
  });

  it("after routing: stage 2 on the routed form, with only its own answers", () => {
    const session = answered(20);
    const open = openSection(session);
    expect(open).toMatchObject({ name: "stage2", first: 18, end: 18 + session.stage2[session.route!].length });
    expect(open.answered.map((a) => a.position)).toEqual([18, 19]);
  });

  it("a restored session has the same open section and the final answers", () => {
    const session = answered(5);
    const q = at(session, 3);
    const changed = changeAnswer(session, { questionId: q.id, response: q.wrong[0].value, timeMs: 1_000 });
    const restored = restoreSession(storedTest(changed), changed.answers);
    expect(restored.answers).toEqual(changed.answers);
    expect(openSection(restored).answered.map((a) => a.answer.correct)).toEqual([true, true, true, false, true]);
  });
});

describe("the score reads the final answers and the total time (#249)", () => {
  /** Asha's whole test, every answer right in 20 seconds. */
  const whole = () => {
    let session = createSession(ASHA, 7);
    for (let q = nextQuestion(session); q; q = nextQuestion(session)) session = checked(submitAnswer(session, { questionId: q.id, response: q.answer, timeMs: 20_000 }));
    return session;
  };

  it("a changed stage 2 answer counts as the child's final answer", () => {
    const session = whole();
    const last = session.answers.length - 1;
    const q = at(session, last);
    const changed = changeAnswer(session, { questionId: q.id, response: wrongFor(q), timeMs: 4_000 });
    const before = finish(session).levels.reduce((n, l) => n + l.correct, 0);
    expect(finish(changed).levels.reduce((n, l) => n + l.correct, 0)).toBe(before - 1);
  });

  it("a fast second visit after a long first one is not very fast: rushing and help flags read the total", () => {
    const session = whole();
    let changed = session;
    // Three quick looks back in a row, each under the very fast time on its own.
    for (const p of [session.answers.length - 3, session.answers.length - 2, session.answers.length - 1]) {
      const q = at(session, p);
      changed = changeAnswer(changed, { questionId: q.id, response: wrongFor(q), timeMs: TOO_FAST_MS - 1_000 });
    }
    const placement = finish(changed);
    expect(placement.pace).toMatchObject({ veryFast: 0, leftOut: [] });
    expect(placement.flags.some((f) => f.kind === "too-fast")).toBe(false);
  });
});
