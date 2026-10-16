import { describe, expect, it } from "vitest";
import { createSession, finish, helpLikely, isHelpAnswer, nextQuestion, submitAnswer, type ChildProfile, type HelpAnswer, type Question } from "@/lib/assessment";

/** One answer of a scripted child: right or wrong, and the seconds it took. */
type Step = { right: boolean; seconds: number };
type Script = (q: Question, index: number) => Step;

const GRADE_4: ChildProfile = { grade: 4, province: "BC" };

/** A child who takes the whole routed test (42 questions on the grade 4 up route) with the given rights and times. */
function takeTest(script: Script, help: HelpAnswer | null = null) {
  let session = createSession(GRADE_4, 1);
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    const { right, seconds } = script(q, session.answers.length);
    session = submitAnswer(session, { questionId: q.id, response: right ? q.answer : "no idea", timeMs: seconds * 1000 });
  }
  return finish(session, null, help);
}

/** Twenty seconds on every question; right on the first 25, wrong after. */
const clean: Script = (_, i) => ({ right: i < 25, seconds: 20 });

describe("help flags (#71)", () => {
  it("a clean run raises no flag", () => {
    expect(takeTest(clean, "no").flags).toEqual([]);
  });

  describe("too fast", () => {
    it("flags each answer under 3 seconds, and counts the ones that were right", () => {
      const placement = takeTest((q, i) => (i === 3 || i === 7 || i === 20 ? { right: i !== 20, seconds: 2.9 } : clean(q, i)));
      expect(placement.flags).toEqual([{ kind: "too-fast", questionIds: ["s1-3", "s1-7", "up-2"], right: 2 }]);
    });
    it("3 seconds exactly is not too fast", () => {
      expect(takeTest((q, i) => ({ ...clean(q, i), seconds: i === 3 ? 3 : 20 })).flags).toEqual([]);
    });
  });

  describe("a long pause, then perfect answers", () => {
    /** Wrong on questions 10-13, a pause of `seconds` on question 14, right on the rest of stage 1 (then 20 seconds each). */
    const pauseAt14 = (seconds: number, override: (i: number) => boolean | undefined = () => undefined): Script => (q, i) => ({
      right: override(i) ?? (i < 10 || i >= 14),
      seconds: i === 14 ? seconds : 20,
    });

    it("flags a pause of 3 minutes or more, right after it and on the 3 answers after, when the 4 answers before had under 70% right", () => {
      expect(takeTest(pauseAt14(180)).flags).toEqual([{ kind: "pause-then-perfect", questionId: "s1-14", pauseMs: 180_000, rightBefore: 0 }]);
    });
    it("2 of 4 right before the pause is under 70%; 3 of 4 is not, so a child who did well before is not flagged", () => {
      expect(takeTest(pauseAt14(240, (i) => (i === 10 || i === 11 ? true : undefined))).flags).toEqual([
        { kind: "pause-then-perfect", questionId: "s1-14", pauseMs: 240_000, rightBefore: 2 },
      ]);
      expect(takeTest(pauseAt14(240, (i) => (i >= 10 && i <= 12 ? true : undefined))).flags).toEqual([]);
    });
    it("no flag when the pause is under 3 minutes", () => {
      expect(takeTest(pauseAt14(179.999)).flags).toEqual([]);
    });
    it("no flag when an answer in the 4 from the pause on is wrong", () => {
      expect(takeTest(pauseAt14(600, (i) => (i === 14 ? false : undefined))).flags).toEqual([]);
      expect(takeTest(pauseAt14(600, (i) => (i === 17 ? false : undefined))).flags).toEqual([]);
    });
    it("no flag for a pause without 4 answers on each side", () => {
      const early: Script = (q, i) => ({ right: i >= 3, seconds: i === 3 ? 600 : 20 });
      expect(takeTest(early).flags).toEqual([]);
      const late: Script = (q, i) => ({ right: i < 36 || i >= 39, seconds: i === 39 ? 600 : 20 });
      expect(takeTest(late).flags).toEqual([]);
    });
  });

  describe("help likely", () => {
    const fastOn = (indexes: number[], right = true): Script => (q, i) => (indexes.includes(i) ? { right, seconds: 1.5 } : clean(q, i));

    it("is false for a clean run", () => {
      expect(helpLikely(takeTest(clean, "no").flags)).toBe(false);
    });
    it("is true when the child says \"Yes\" or \"A little\"", () => {
      expect(helpLikely(takeTest(clean, "yes").flags)).toBe(true);
      expect(helpLikely(takeTest(clean, "a-little").flags)).toBe(true);
    });
    it("is true with 3 right answers under 3 seconds, false with 2", () => {
      expect(helpLikely(takeTest(fastOn([2, 9, 15])).flags)).toBe(true);
      expect(helpLikely(takeTest(fastOn([2, 9])).flags)).toBe(false);
    });
    it("is false when the fast answers were wrong: fast guesses make the level lower, not higher", () => {
      expect(helpLikely(takeTest(fastOn([26, 28, 30, 32], false)).flags)).toBe(false);
    });
    it("is true after a long pause, then perfect answers", () => {
      const pause: Script = (q, i) => ({ right: i < 10 || i >= 14, seconds: i === 14 ? 300 : 20 });
      expect(helpLikely(takeTest(pause).flags)).toBe(true);
    });
  });

  describe("the answer to \"Did anyone help?\"", () => {
    it("\"Yes\" and \"A little\" raise a flag with the answer", () => {
      expect(takeTest(clean, "yes").flags).toEqual([{ kind: "helped", answer: "yes" }]);
      expect(takeTest(clean, "a-little").flags).toEqual([{ kind: "helped", answer: "a-little" }]);
    });
    it("accepts only the three answers from a request", () => {
      expect(["yes", "a-little", "no"].every(isHelpAnswer)).toBe(true);
      expect([undefined, null, "", "Yes", "a little", "maybe", 1, {}].some(isHelpAnswer)).toBe(false);
    });
    it("\"No\", or no answer, raises none", () => {
      expect(takeTest(clean, "no").flags).toEqual([]);
      expect(takeTest(clean, null).flags).toEqual([]);
    });
  });
});
