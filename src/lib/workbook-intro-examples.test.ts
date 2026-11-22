import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { methodIntro, pairKey } from "./workbook-intro-examples";
import { twoWaysMethods, type MethodPair } from "./workbook-two-ways";

/** Every pair a question of U10 and up can be given, found by asking about one question of each kind. */
const QUESTIONS = [
  "47 + 28 = ?", "46 + 32 = ?", "74 − 38 = ?", "60 × 7 = ?", "19 × 6 = ?", "96 ÷ 4 = ?", "$17 × ? = $578", "What is the least common multiple of 14 and 21?",
];
const PATTERNS = [
  ["The first two numbers in a pattern are 270 and 295. How much is added each time?", "3.6-increasing-pattern#1.0"],
  ["The first two numbers in a pattern are 450 and 410. How much is taken away each time?", "3.6-decreasing-pattern#1.0"],
  ["A pattern adds 50 each time. Its second number is 98. What is its first number?", "3.6-increasing-pattern#2.0"],
  ["A pattern takes away 20 each time. Its second number is 300. What is its first number?", "3.6-decreasing-pattern#2.0"],
  ["A pattern starts at 120 and adds 15 each time. What is number 6?", "3.6-increasing-pattern#3.0"],
  ["A pattern starts at 500 and takes away 15 each time. What is number 6?", "3.6-decreasing-pattern#3.0"],
];
const pairs: MethodPair[] = [
  ...QUESTIONS.map((text) => twoWaysMethods({ text, level: 19, templateId: text.includes("multiple") ? "6.4-lcm#1.0" : null, operation: null })),
  ...PATTERNS.map(([text, templateId]) => twoWaysMethods({ text, level: 10, templateId, operation: null })),
  twoWaysMethods({ text: "73 + 19 = ?", level: 10, templateId: null, operation: null }),
].filter((p): p is MethodPair => !!p);

/** Every "a + b = c" style equation a line prints, true. */
function wrongEquation(line: string): string | null {
  for (const [whole, a, op, b, c] of line.matchAll(/(\d+) ([+−×÷]) (\d+) = \[?(\d+)\]?/g)) {
    const x = Number(a), y = Number(b);
    const value = op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : x / y;
    if (value !== Number(c)) return whole;
  }
  return null;
}

describe("a method pair's worked example", () => {
  it("exists for every pair a question can be given", () => {
    expect(pairs.length).toBeGreaterThanOrEqual(12);
    for (const pair of pairs) {
      const intro = methodIntro(pair, []);
      expect(intro, pairKey(pair)).not.toBeNull();
      expect(intro!.methods!.map((m) => m.label)).toEqual([...pair]);
      expect(intro!.ids).toEqual([pairKey(pair)]);
    }
  });

  it("is right, line by line, whichever numbers a question asks to keep out", () => {
    fc.assert(fc.property(fc.constantFrom(...pairs), fc.array(fc.integer({ min: 1, max: 600 }), { maxLength: 40 }), (pair, avoid) => {
      const intro = methodIntro(pair, avoid)!;
      expect(intro.methods!.map((m) => m.label)).toEqual([...pair]);
      for (const m of intro.methods!) for (const line of m.lines) expect(wrongEquation(line), `${pairKey(pair)}: ${line}`).toBeNull();
    }), { numRuns: 200 });
  });

  it("keeps a question's numbers out when it can", () => {
    const first = methodIntro(["add the tens, then the ones", "make a friendly number first"], [])!;
    const again = methodIntro(["add the tens, then the ones", "make a friendly number first"], [47, 28, 75])!;
    expect(first.question).toBe("47 + 28 = ?");
    expect(again.question).not.toBe(first.question);
  });
});
