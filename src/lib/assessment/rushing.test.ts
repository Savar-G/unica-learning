import { describe, expect, it } from "vitest";
import { paceOf, takeYourTime, type Answer } from "@/lib/assessment";
import { takeTest } from "./scripted-child";

// #189 (spec #181): a very fast answer takes under 3 seconds. A very fast wrong answer inside a run of 3 or more very
// fast answers is left out of the score; very fast right answers count. Over 30% very fast: the result may not be reliable.
const answer = (i: number, timeMs: number, correct: boolean): Answer => ({ questionId: `q${i}`, response: "1", timeMs, correct, misconception: null });
const answers = (spec: string) =>
  // "F" fast wrong, "f" fast right, "S" slow wrong, "s" slow right
  [...spec].map((c, i) => answer(i, c === "F" || c === "f" ? 1_500 : 20_000, c === "f" || c === "s"));

describe("rushed wrong answers", () => {
  it("leaves out the fast wrong answers of a run of 3 fast answers", () => {
    expect(paceOf(answers("sFFfs")).leftOut).toEqual(["q1", "q2"]);
  });

  it("counts fast wrong answers as wrong when the run is shorter than 3", () => {
    expect(paceOf(answers("sFFsFFs")).leftOut).toEqual([]);
  });

  it("leaves out every fast wrong answer of a longer run, and none outside it", () => {
    expect(paceOf(answers("FsFFFFfs")).leftOut).toEqual(["q2", "q3", "q4", "q5"]);
  });

  it("a test where 3 fast wrong answers start the test scores without them", () => {
    const fast = (_: unknown, i: number) => (i < 3 ? 1_000 : 20_000);
    const { asked, placement } = takeTest({ grade: 4, province: "BC" }, 1, (_, i) => i >= 3, undefined, fast);
    const scored = asked.filter((q) => q.level <= 4).length - 3;
    expect(placement.strands.reduce((sum, s) => sum + s.total, 0)).toBe(scored);
    expect(placement.strands.every((s) => s.correct === s.total)).toBe(true);
    expect(placement.pace?.leftOut).toEqual(asked.slice(0, 3).map((q) => q.id));
  });

  it("a test where only 2 fast wrong answers start the test counts them as wrong", () => {
    const fast = (_: unknown, i: number) => (i < 2 ? 1_000 : 20_000);
    const { placement } = takeTest({ grade: 4, province: "BC" }, 1, (_, i) => i >= 2, undefined, fast);
    expect(placement.strands.reduce((sum, s) => sum + (s.total - s.correct), 0)).toBe(2);
  });
});

describe("the reliability note: more than 30% very fast answers", () => {
  it("3 of 10 very fast (30%) is reliable", () => {
    expect(paceOf(answers("ffssfsssss")).unreliable).toBe(false);
  });

  it("4 of 10 very fast (40%) is not", () => {
    expect(paceOf(answers("ffssfsssfs"))).toMatchObject({ veryFast: 4, answers: 10, unreliable: true });
  });

  it("a finished up-route test with 13 of 42 answers very fast carries the note; 12 of 42 does not", () => {
    const fastFor = (n: number) => (_: unknown, i: number) => (i % 3 === 0 && i / 3 < n ? 1_000 : 20_000);
    expect(takeTest({ grade: 4, province: "BC" }, 1, () => true, undefined, fastFor(13)).placement.pace?.unreliable).toBe(true);
    expect(takeTest({ grade: 4, province: "BC" }, 1, () => true, undefined, fastFor(12)).placement.pace?.unreliable).toBe(false);
  });
});

describe("Take your time", () => {
  it("shows after the third very fast answer in a row, and not before", () => {
    expect(takeYourTime(answers("sff"))).toBe(false);
    expect(takeYourTime(answers("sfFf"))).toBe(true);
    expect(takeYourTime(answers("sfFfF"))).toBe(true);
    expect(takeYourTime(answers("fFfs"))).toBe(false);
  });
});
