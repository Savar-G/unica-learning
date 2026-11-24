import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mulColumn, type MulColumnLimits, type MulColumnQuestion } from "./mul-column";

const RUNS = { numRuns: 1000 };
const ONE_CARRY: MulColumnLimits = { a: { min: 13, max: 39 }, b: { min: 2, max: 3 }, carries: { min: 1, max: 1 }, product: { min: 10, max: 99 }, zeroInTens: "never" };
const WIDE: MulColumnLimits = { a: { min: 10, max: 99 }, b: { min: 2, max: 9 }, carries: { min: 0, max: 1 }, product: { min: 10, max: 999 }, zeroInTens: "allowed" };

// The facts about a question, read from its printed digits. This is not how the shape computes them.
function facts({ a, b }: MulColumnQuestion) {
  let product = 0;
  for (let i = 0; i < b; i++) product += a;
  const ones = String(a).at(-1)!;
  const onesProduct = String(Number(ones) * b);
  return { product, carries: onesProduct.length - 1, zeroInTens: String(product).at(-2) === "0" };
}

function obeys(q: MulColumnQuestion, l: MulColumnLimits): boolean {
  const f = facts(q);
  return q.a >= l.a.min && q.a <= l.a.max && q.b >= l.b.min && q.b <= l.b.max
    && f.carries >= l.carries.min && f.carries <= l.carries.max
    && f.product >= l.product.min && f.product <= l.product.max
    && (l.zeroInTens === "allowed" || !f.zeroInTens);
}

function every(l: MulColumnLimits): MulColumnQuestion[] {
  const out: MulColumnQuestion[] = [];
  for (let a = 10; a <= 99; a++) for (let b = 2; b <= 9; b++) if (obeys({ a, b }, l)) out.push({ a, b });
  return out;
}

const range = (min: number, max: number) => fc.tuple(fc.integer({ min, max }), fc.integer({ min, max })).map(([x, y]) => ({ min: Math.min(x, y), max: Math.max(x, y) }));
const anyLimits: fc.Arbitrary<MulColumnLimits> = fc.record({
  a: range(10, 99), b: range(2, 9), carries: range(0, 1), product: range(10, 999), zeroInTens: fc.constantFrom("never" as const, "allowed" as const),
});
const limits = anyLimits.filter((l) => every(l).length > 0);

describe("numbers", () => {
  it("stay inside the limits for every seed, and one seed always gives the same question", () => {
    fc.assert(fc.property(limits, fc.string(), (l, seed) => {
      const item = mulColumn.generate(l, seed);
      expect(obeys(item.question, l)).toBe(true);
      expect(mulColumn.generate(l, seed)).toEqual(item);
    }), RUNS);
  });

  it("use every question that the limits allow", () => {
    const found = new Set(Array.from({ length: 1000 }, (_, i) => JSON.stringify(mulColumn.generate(ONE_CARRY, `seed-${i}`).question)));
    expect([...found].sort()).toEqual(every(ONE_CARRY).map((q) => JSON.stringify(q)).sort());
  });

  it.each([
    ["no carry", { ...WIDE, carries: { min: 0, max: 0 } }, 32, 3, true],
    ["no carry", { ...WIDE, carries: { min: 0, max: 0 } }, 24, 3, false],
    ["a carry", { ...WIDE, carries: { min: 1, max: 1 } }, 24, 3, true],
    ["a carry", { ...WIDE, carries: { min: 1, max: 1 } }, 32, 3, false],
    ["a product limit", { ...WIDE, product: { min: 10, max: 99 } }, 33, 3, true],
    ["a product limit", { ...WIDE, product: { min: 10, max: 99 } }, 34, 3, false],
    ["no zero in the tens", { ...WIDE, zeroInTens: "never" as const }, 26, 4, false],
    ["zero in the tens", { ...WIDE, zeroInTens: "allowed" as const }, 26, 4, true],
  ])("%s decides which questions are possible", (_name, l, a, b, allowed) => {
    const only = { ...l, a: { min: a, max: a }, b: { min: b, max: b } };
    expect(mulColumn.count(only)).toBe(allowed ? 1 : 0);
  });
});

describe("answers", () => {
  it.each([[24, 3, "72"], [26, 4, "104"], [99, 9, "891"], [10, 2, "20"], [40, 7, "280"]])("%i x %i is %s", (a, b, value) => {
    expect(mulColumn.answer({ a, b })).toEqual({ kind: "whole-number", value });
    expect(mulColumn.solveAgain({ a, b })).toEqual({ kind: "whole-number", value });
  });

  it("come out the same from both computations", () => {
    fc.assert(fc.property(limits, fc.string(), (l, seed) => {
      const { question, answer } = mulColumn.generate(l, seed);
      expect(answer.value).toBe(String(facts(question).product));
      expect(mulColumn.solveAgain(question)).toEqual(answer);
    }), RUNS);
  });

  it("have worked steps that end in the answer", () => {
    expect(mulColumn.steps({ a: 24, b: 3 })).toEqual(["3 × 4 = 12, write 2, carry 1", "3 × 2 = 6, plus 1 is 7", "72"]);
    expect(mulColumn.steps({ a: 32, b: 3 })).toEqual(["3 × 2 = 6, write 6", "3 × 3 = 9", "96"]);
    fc.assert(fc.property(limits, fc.string(), (l, seed) => {
      const { question, answer } = mulColumn.generate(l, seed);
      expect(mulColumn.steps(question).at(-1)).toBe(answer.value);
    }), RUNS);
  });
});

describe("difficulty", () => {
  it.each([
    ["a carry", { a: 23, b: 3 }, { a: 24, b: 3 }],
    ["a product of 100 or more", { a: 24, b: 4 }, { a: 31, b: 4 }],
    ["a carry past 100", { a: 31, b: 4 }, { a: 38, b: 4 }],
    ["a zero in the tens of the product", { a: 28, b: 4 }, { a: 26, b: 4 }],
    ["a larger multiplier", { a: 11, b: 2 }, { a: 11, b: 3 }],
  ])("rises with %s", (_name, easier, harder) => {
    expect(mulColumn.difficulty(harder)).toBeGreaterThan(mulColumn.difficulty(easier));
  });

  it("rises with the limits", () => {
    fc.assert(fc.property(limits, limits, (one, other) => {
      const wider: MulColumnLimits = {
        a: { min: Math.min(one.a.min, other.a.min), max: Math.max(one.a.max, other.a.max) },
        b: { min: one.b.min, max: Math.max(one.b.max, other.b.max) },
        carries: { min: one.carries.min, max: Math.max(one.carries.max, other.carries.max) },
        product: { min: one.product.min, max: Math.max(one.product.max, other.product.max) },
        zeroInTens: one.zeroInTens === "allowed" ? "allowed" : other.zeroInTens,
      };
      expect(mulColumn.difficultyRange(wider).hardest).toBeGreaterThanOrEqual(mulColumn.difficultyRange(one).hardest);
      const carry = { ...one, carries: { min: 1, max: 1 }, product: { min: 10, max: 99 } };
      const plain = { ...one, carries: { min: 0, max: 0 }, product: { min: 10, max: 99 } };
      if (every(carry).length > 0 && every(plain).length > 0) {
        expect(mulColumn.difficultyRange(carry).easiest).toBeGreaterThan(mulColumn.difficultyRange(plain).hardest);
      }
    }), RUNS);
  });

  it("has a range that holds every question, with both ends reached", () => {
    fc.assert(fc.property(limits, (l) => {
      const scores = every(l).map((q) => mulColumn.difficulty(q));
      expect(mulColumn.difficultyRange(l)).toEqual({ easiest: Math.min(...scores), hardest: Math.max(...scores) });
    }), RUNS);
  });
});

describe("worst case and count", () => {
  const widths = (q: MulColumnQuestion) => [String(q.a).length, String(q.b).length, String(facts(q).product).length];

  it("the worst case obeys the limits and no question is wider", () => {
    fc.assert(fc.property(limits, fc.string(), (l, seed) => {
      const worst = mulColumn.worstCase(l);
      expect(obeys(worst.question, l)).toBe(true);
      const other = widths(mulColumn.generate(l, seed).question);
      widths(worst.question).forEach((w, i) => expect(w).toBeGreaterThanOrEqual(other[i]));
      expect(facts(worst.question).product).toBe(Math.max(...every(l).map((q) => facts(q).product)));
    }), RUNS);
  });

  it("the count is the number of different questions", () => {
    expect(mulColumn.count({ ...WIDE, a: { min: 11, max: 13 }, b: { min: 2, max: 3 }, carries: { min: 0, max: 0 } })).toBe(6);
    fc.assert(fc.property(anyLimits, (l) => {
      expect(mulColumn.count(l)).toBe(every(l).length);
    }), RUNS);
  });
});

describe("reading limits from a bank file", () => {
  it("accepts good limits", () => {
    expect(mulColumn.readLimits(JSON.parse(JSON.stringify(ONE_CARRY)))).toEqual({ ok: true, limits: ONE_CARRY });
  });

  it.each<[string, unknown, string]>([
    ["not an object", "wide", "the limits must be an object"],
    ["a missing limit", { ...ONE_CARRY, product: undefined }, "product must have min and max"],
    ["a wrong type", { ...ONE_CARRY, a: { min: "13", max: 39 } }, "a.min must be a whole number"],
    ["a fraction", { ...ONE_CARRY, a: { min: 13.5, max: 39 } }, "a.min must be a whole number"],
    ["a turned range", { ...ONE_CARRY, a: { min: 39, max: 13 } }, "a.min is more than a.max"],
    ["a number with 3 digits", { ...ONE_CARRY, a: { min: 13, max: 139 } }, "a must be from 10 to 99"],
    ["a multiplier with 2 digits", { ...ONE_CARRY, b: { min: 2, max: 10 } }, "b must be from 2 to 9"],
    ["two carries", { ...ONE_CARRY, carries: { min: 0, max: 2 } }, "carries must be from 0 to 1"],
    ["a product that is too large", { ...ONE_CARRY, product: { min: 10, max: 1000 } }, "product must be from 10 to 999"],
    ["an unknown word", { ...ONE_CARRY, zeroInTens: "sometimes" }, 'zeroInTens must be "never" or "allowed"'],
    ["an unknown limit", { ...ONE_CARRY, carrys: { min: 0, max: 0 } }, 'unknown limit "carrys"'],
    ["limits that no question meets", { ...ONE_CARRY, a: { min: 11, max: 12 } }, "no question meets these limits"],
  ])("refuses %s", (_name, raw, problem) => {
    expect(mulColumn.readLimits(raw)).toEqual({ ok: false, problem });
  });
});
