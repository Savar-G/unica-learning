// Shape-specific tests for mul.column that stay beside the shape. All general property, small-space, layout
// round-trip, refused-input, difficulty-order, worst-case and fingerprint checks run in shapes.test.ts via the harness.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mulColumn, type MulColumnLimits, type MulColumnQuestion } from "./mul-column";

const WIDE: MulColumnLimits = { a: { min: 10, max: 99 }, b: { min: 2, max: 9 }, carries: { min: 0, max: 1 }, product: { min: 10, max: 999 }, zeroInTens: "allowed" };

// Independent facts about a question, read from its printed digits. Shares no code with mul-column.ts.
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

const range = (min: number, max: number) =>
  fc.tuple(fc.integer({ min, max }), fc.integer({ min, max })).map(([x, y]) => ({ min: Math.min(x, y), max: Math.max(x, y) }));
const limits = fc.record({
  a: range(10, 99),
  b: range(2, 9),
  carries: range(0, 1),
  product: range(10, 999),
  zeroInTens: fc.constantFrom("never" as const, "allowed" as const),
}).filter((l) => every(l).length > 0);

describe("mul.column limit boundaries", () => {
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

describe("mul.column exhaustive worked steps", () => {
  it("have worked steps in which every number is right, for all 720 questions", () => {
    const times = (n: number, b: number) => Array.from({ length: b }, () => n).reduce((sum, x) => sum + x, 0);
    for (const q of every(WIDE)) {
      const [tens, ones] = [...String(q.a)].map(Number);
      const [first, second, last, ...more] = mulColumn.steps(q);
      const [carry, written] = [...String(times(ones, q.b)).padStart(2, "0")].map(Number);
      const tail = carry === 0 ? "" : `, carry ${carry}`;
      expect(first).toBe(`${q.b} × ${ones} = ${times(ones, q.b)}, write ${written}${tail}`);
      expect(second).toBe(`${q.b} × ${tens} = ${times(tens, q.b)}${carry === 0 ? "" : `, plus ${carry} is ${times(tens, q.b) + carry}`}`);
      expect([last, more]).toEqual([`${times(tens, q.b) + carry}${written}`, []]);
      expect(last).toBe(String(facts(q).product));
    }
    expect(every(WIDE)).toHaveLength(720);
  });
});

describe("mul.column difficulty bands", () => {
  it.each<[string, MulColumnLimits, MulColumnQuestion, MulColumnQuestion]>([
    ["no carry and no 100", { ...WIDE, b: { min: 2, max: 4 }, carries: { min: 0, max: 0 }, product: { min: 10, max: 99 } }, { a: 10, b: 2 }, { a: 12, b: 4 }],
    ["one carry and no 100", { ...WIDE, b: { min: 2, max: 4 }, carries: { min: 1, max: 1 }, product: { min: 10, max: 99 } }, { a: 15, b: 2 }, { a: 13, b: 4 }],
    ["past 100", { ...WIDE, product: { min: 100, max: 999 } }, { a: 60, b: 2 }, { a: 89, b: 9 }],
  ])("has the named easiest and hardest question of these limits: %s", (_name, l, easiest, hardest) => {
    expect(mulColumn.difficultyRange(l)).toEqual({ easiest: mulColumn.difficulty(easiest), hardest: mulColumn.difficulty(hardest) });
  });

  it("places every one-carry question under 100 above every no-carry question under 100", () => {
    fc.assert(fc.property(limits, (one) => {
      const carry = { ...one, carries: { min: 1, max: 1 }, product: { min: 10, max: 99 } };
      const plain = { ...one, carries: { min: 0, max: 0 }, product: { min: 10, max: 99 } };
      if (every(carry).length > 0 && every(plain).length > 0) {
        expect(mulColumn.difficultyRange(carry).easiest).toBeGreaterThan(mulColumn.difficultyRange(plain).hardest);
      }
    }), { numRuns: 1000 });
  });
});
