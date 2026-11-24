// How hard mul.column says that whole kinds of questions are. The harness checks all else (testing/shape-harness.ts).
import { describe, expect, it } from "vitest";
import { mulColumn, type MulColumnLimits, type MulColumnQuestion } from "./mul-column";

const WIDE: MulColumnLimits = { a: { min: 10, max: 99 }, b: { min: 2, max: 9 }, carries: { min: 0, max: 1 }, product: { min: 10, max: 999 }, zeroInTens: "allowed" };
const NO_CARRY = { ...WIDE, carries: { min: 0, max: 0 }, product: { min: 10, max: 99 } };
const ONE_CARRY = { ...WIDE, carries: { min: 1, max: 1 }, product: { min: 10, max: 99 } };
const PAST_100 = { ...WIDE, product: { min: 100, max: 999 } };

describe("the difficulty of mul.column", () => {
  it.each<[string, MulColumnLimits, MulColumnQuestion, MulColumnQuestion]>([
    ["no carry and no 100", { ...NO_CARRY, b: { min: 2, max: 4 } }, { a: 10, b: 2 }, { a: 12, b: 4 }],
    ["one carry and no 100", { ...ONE_CARRY, b: { min: 2, max: 4 } }, { a: 15, b: 2 }, { a: 13, b: 4 }],
    ["past 100", PAST_100, { a: 60, b: 2 }, { a: 89, b: 9 }],
  ])("has the named easiest and hardest question: %s", (_name, limits, easiest, hardest) => {
    expect(mulColumn.difficultyRange(limits)).toEqual({ easiest: mulColumn.difficulty(easiest), hardest: mulColumn.difficulty(hardest) });
  });

  // Each range holds all questions of its kind, so this says it of any limits inside them.
  it("puts every question with a carry above every question with none, and every product past 100 above both", () => {
    const [plain, carry, past] = [NO_CARRY, ONE_CARRY, PAST_100].map((limits) => mulColumn.difficultyRange(limits));
    expect(carry.easiest).toBeGreaterThan(plain.hardest);
    expect(past.easiest).toBeGreaterThan(carry.hardest);
  });
});
