// Every shape in shapes/index.ts registers its independent property-test spec here.
// Adding a new shape means: one shape file, one line in shapes/index.ts, and one registration here.
import fc from "fast-check";
import type { MulColumnLimits, MulColumnQuestion } from "../shapes/mul-column";
import type { ShapeHarnessSpec } from "./shape-harness";

// Independent facts about a mul.column question, read from its printed digits (shares no code with mul-column.ts).
function mulFacts({ a, b }: MulColumnQuestion) {
  let product = 0;
  for (let i = 0; i < b; i++) product += a;
  const ones = String(a).at(-1)!;
  const onesProduct = String(Number(ones) * b);
  return { product, carries: onesProduct.length - 1, zeroInTens: String(product).at(-2) === "0" };
}

function mulObeys(q: MulColumnQuestion, l: MulColumnLimits): boolean {
  const f = mulFacts(q);
  return q.a >= l.a.min && q.a <= l.a.max && q.b >= l.b.min && q.b <= l.b.max
    && f.carries >= l.carries.min && f.carries <= l.carries.max
    && f.product >= l.product.min && f.product <= l.product.max
    && (l.zeroInTens === "allowed" || !f.zeroInTens);
}

function mulEvery(l: MulColumnLimits): MulColumnQuestion[] {
  const out: MulColumnQuestion[] = [];
  for (let a = 10; a <= 99; a++) for (let b = 2; b <= 9; b++) if (mulObeys({ a, b }, l)) out.push({ a, b });
  return out;
}

const range = (min: number, max: number) =>
  fc.tuple(fc.integer({ min, max }), fc.integer({ min, max })).map(([x, y]) => ({ min: Math.min(x, y), max: Math.max(x, y) }));

const anyMulLimits: fc.Arbitrary<MulColumnLimits> = fc.record({
  a: range(10, 99),
  b: range(2, 9),
  carries: range(0, 1),
  product: range(10, 999),
  zeroInTens: fc.constantFrom("never" as const, "allowed" as const),
});

const ONE_CARRY: MulColumnLimits = {
  a: { min: 13, max: 39 }, b: { min: 2, max: 3 }, carries: { min: 1, max: 1 }, product: { min: 10, max: 99 }, zeroInTens: "never",
};
const WIDE: MulColumnLimits = {
  a: { min: 10, max: 99 }, b: { min: 2, max: 9 }, carries: { min: 0, max: 1 }, product: { min: 10, max: 999 }, zeroInTens: "allowed",
};
const SIX_NO_CARRY: MulColumnLimits = {
  ...WIDE, a: { min: 11, max: 13 }, b: { min: 2, max: 3 }, carries: { min: 0, max: 0 },
};

const mulColumnSpec: ShapeHarnessSpec<MulColumnLimits, MulColumnQuestion> = {
  id: "mul.column",
  arbitraryLimits: anyMulLimits.filter((l) => mulEvery(l).length > 0),
  anyLimits: anyMulLimits,
  widenLimits: (one, other) => ({
    a: { min: Math.min(one.a.min, other.a.min), max: Math.max(one.a.max, other.a.max) },
    b: { min: Math.min(one.b.min, other.b.min), max: Math.max(one.b.max, other.b.max) },
    carries: { min: Math.min(one.carries.min, other.carries.min), max: Math.max(one.carries.max, other.carries.max) },
    product: { min: Math.min(one.product.min, other.product.min), max: Math.max(one.product.max, other.product.max) },
    zeroInTens: one.zeroInTens === "allowed" || other.zeroInTens === "allowed" ? "allowed" : "never",
  }),
  isInside: mulObeys,
  enumerate: mulEvery,
  smallSpaces: [
    { name: "six no-carry products", limits: SIX_NO_CARRY, expectedCount: 6 },
    { name: "one carry under 100", limits: ONE_CARRY, expectedCount: 27 },
  ],
  widthMeasures: [
    { name: "top digits", measure: (q) => String(q.a).length },
    { name: "bottom digits", measure: (q) => String(q.b).length },
    { name: "product digits", measure: (q) => String(mulFacts(q).product).length },
    { name: "product value", measure: (q) => mulFacts(q).product },
  ],
  easierHarderPairs: [
    { name: "a carry", easier: { a: 23, b: 3 }, harder: { a: 24, b: 3 } },
    { name: "a product of 100 or more", easier: { a: 24, b: 4 }, harder: { a: 31, b: 4 } },
    { name: "a carry past 100", easier: { a: 31, b: 4 }, harder: { a: 38, b: 4 } },
    { name: "a zero in the tens of the product", easier: { a: 28, b: 4 }, harder: { a: 26, b: 4 } },
    { name: "a larger multiplier", easier: { a: 11, b: 2 }, harder: { a: 11, b: 3 } },
    { name: "a larger multiplier in the place of a larger number on top", easier: { a: 44, b: 2 }, harder: { a: 11, b: 4 } },
    { name: "a carry more than with a larger multiplier", easier: { a: 11, b: 9 }, harder: { a: 15, b: 2 } },
    { name: "a product past 100 more than with a carry", easier: { a: 12, b: 8 }, harder: { a: 51, b: 2 } },
    { name: "a carry past 100 more than with a zero in the tens", easier: { a: 51, b: 2 }, harder: { a: 58, b: 2 } },
    { name: "a zero in the tens more than with a larger multiplier", easier: { a: 81, b: 9 }, harder: { a: 34, b: 3 } },
  ],
  workedExamples: [
    { name: "a carry", question: { a: 24, b: 3 }, answer: { kind: "whole-number", value: "72" }, steps: ["3 × 4 = 12, write 2, carry 1", "3 × 2 = 6, plus 1 is 7", "72"] },
    { name: "no carry", question: { a: 32, b: 3 }, answer: { kind: "whole-number", value: "96" }, steps: ["3 × 2 = 6, write 6", "3 × 3 = 9", "96"] },
    { name: "the smallest question", question: { a: 10, b: 2 }, answer: { kind: "whole-number", value: "20" }, steps: ["2 × 0 = 0, write 0", "2 × 1 = 2", "20"] },
    { name: "a zero in the ones", question: { a: 40, b: 7 }, answer: { kind: "whole-number", value: "280" }, steps: ["7 × 0 = 0, write 0", "7 × 4 = 28", "280"] },
    { name: "a carry of 2", question: { a: 47, b: 4 }, answer: { kind: "whole-number", value: "188" }, steps: ["4 × 7 = 28, write 8, carry 2", "4 × 4 = 16, plus 2 is 18", "188"] },
    { name: "a carry that makes a zero", question: { a: 26, b: 4 }, answer: { kind: "whole-number", value: "104" }, steps: ["4 × 6 = 24, write 4, carry 2", "4 × 2 = 8, plus 2 is 10", "104"] },
    { name: "ones that make 10", question: { a: 25, b: 2 }, answer: { kind: "whole-number", value: "50" }, steps: ["2 × 5 = 10, write 0, carry 1", "2 × 2 = 4, plus 1 is 5", "50"] },
    { name: "the largest question", question: { a: 99, b: 9 }, answer: { kind: "whole-number", value: "891" }, steps: ["9 × 9 = 81, write 1, carry 8", "9 × 9 = 81, plus 8 is 89", "891"] },
  ],
  refusedLimits: [
    { name: "not an object", raw: "wide", problem: "the limits must be an object" },
    { name: "a missing limit", raw: { ...ONE_CARRY, product: undefined }, problem: "product must have min and max" },
    { name: "a wrong type", raw: { ...ONE_CARRY, a: { min: "13", max: 39 } }, problem: "a.min must be a whole number" },
    { name: "a fraction", raw: { ...ONE_CARRY, a: { min: 13.5, max: 39 } }, problem: "a.min must be a whole number" },
    { name: "a turned range", raw: { ...ONE_CARRY, a: { min: 39, max: 13 } }, problem: "a.min is more than a.max" },
    { name: "a number with 3 digits", raw: { ...ONE_CARRY, a: { min: 13, max: 139 } }, problem: "a must be from 10 to 99" },
    { name: "a multiplier with 2 digits", raw: { ...ONE_CARRY, b: { min: 2, max: 10 } }, problem: "b must be from 2 to 9" },
    { name: "two carries", raw: { ...ONE_CARRY, carries: { min: 0, max: 2 } }, problem: "carries must be from 0 to 1" },
    { name: "a product that is too large", raw: { ...ONE_CARRY, product: { min: 10, max: 1000 } }, problem: "product must be from 10 to 999" },
    { name: "an unknown word", raw: { ...ONE_CARRY, zeroInTens: "sometimes" }, problem: 'zeroInTens must be "never" or "allowed"' },
    { name: "an unknown limit", raw: { ...ONE_CARRY, carrys: { min: 0, max: 0 } }, problem: 'unknown limit "carrys"' },
    { name: "limits that no question meets", raw: { ...ONE_CARRY, a: { min: 11, max: 12 } }, problem: "no question meets these limits" },
  ],
  refusedRows: [
    { name: "nothing", rows: [] },
    { name: "one row", rows: ["24"] },
    { name: "three rows", rows: ["24", "×3", "72"] },
    { name: "turned rows", rows: ["×3", "24"] },
    { name: "another sign", rows: ["24", "+3"] },
    { name: "no sign", rows: ["24", "3"] },
    { name: "the sign after the number", rows: ["24", "3×"] },
    { name: "the sign in the top row", rows: ["×24", "3"] },
    { name: "one digit on top", rows: ["4", "×3"] },
    { name: "three digits on top", rows: ["124", "×3"] },
    { name: "a zero in front", rows: ["04", "×3"] },
    { name: "two digits below", rows: ["24", "×13"] },
    { name: "times 1", rows: ["24", "×1"] },
    { name: "times 0", rows: ["24", "×0"] },
    { name: "an empty row", rows: ["", "×3"] },
    { name: "a space", rows: ["2 4", "×3"] },
    { name: "a letter x", rows: ["24", "x3"] },
    { name: "digits of another script", rows: ["٢٤", "×3"] },
  ],
  fingerprintLimits: [SIX_NO_CARRY, ONE_CARRY, WIDE],
  fingerprintSeeds: [
    "fp-seed-0", "fp-seed-1", "fp-seed-2", "fp-seed-3", "fp-seed-4",
    "fp-seed-5", "fp-seed-6", "fp-seed-7", "fp-seed-8", "fp-seed-9",
  ],
};

export const SHAPE_SPECS: readonly ShapeHarnessSpec[] = [mulColumnSpec];
