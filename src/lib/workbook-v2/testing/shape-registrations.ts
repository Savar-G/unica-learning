// The registration of every shape in shapes/index.ts (docs/workbook-v2-engine.md, "Adding a shape").
import { neverLimit, rangeLimit, type Limits, type Printed, type Rows, type ShapeRegistration } from "./shape-registration";

const times = (n: number, b: number) => Array.from({ length: b }, () => n).reduce((sum, x) => sum + x, 0);

/** Reads the two rows of a column multiplication. It adds and looks at digits; the shape multiplies. */
function readMulColumn(rows: Rows): Printed | null {
  const [, tens, ones, b] = (rows.length === 2 && /^([1-9])([0-9])\n×([2-9])$/.exec(rows.join("\n")) || []).map(Number);
  if (b === undefined) return null;
  const [carry, written] = [...String(times(ones, b)).padStart(2, "0")].map(Number);
  const product = times(Number(rows[0]), b);
  const hasCarry = carry !== 0;
  return {
    answer: { kind: "whole-number", value: String(product) },
    features: { a: Number(rows[0]), b, carries: hasCarry ? 1 : 0, product, zeroInTens: String(product).at(-2) === "0" },
    widths: { product },
    steps: [
      `${b} × ${ones} = ${times(ones, b)}, write ${written}${hasCarry ? `, carry ${carry}` : ""}`,
      `${b} × ${tens} = ${times(tens, b)}${hasCarry ? `, plus ${carry} is ${times(tens, b) + carry}` : ""}`,
      `${times(tens, b) + carry}${written}`,
    ],
  };
}

const r = (min: number, max: number) => ({ min, max });
const WIDE: Limits = { a: r(10, 99), b: r(2, 9), carries: r(0, 1), product: r(10, 999), zeroInTens: "allowed" };
const ONE_CARRY: Limits = { a: r(13, 39), b: r(2, 3), carries: r(1, 1), product: r(10, 99), zeroInTens: "never" };
const SIX: Limits = { ...WIDE, a: r(11, 13), b: r(2, 3), carries: r(0, 0) };
const ONE: Limits = { ...WIDE, a: r(14, 14), b: r(2, 2) };
/** The questions with one multiplier, by their top numbers. */
const by = (b: number, tops: string): Rows[] => tops.split(" ").map((top) => [top, `×${b}`]);
const q = (text: string): Rows => text.split(" ");

const mulColumn: ShapeRegistration = {
  id: "mul.column",
  limits: { a: rangeLimit(10, 99), b: rangeLimit(2, 9), carries: rangeLimit(0, 1), product: rangeLimit(10, 999), zeroInTens: neverLimit() },
  read: readMulColumn,
  space: Array.from({ length: 720 }, (_, i) => [String(10 + Math.floor(i / 8)), `×${2 + (i % 8)}`]),
  cases: [
    { name: "every question", limits: WIDE },
    { name: "no carry", limits: { a: r(11, 43), b: r(2, 4), carries: r(0, 0), product: r(10, 99), zeroInTens: "never" } },
    { name: "one carry", limits: { a: r(12, 49), b: r(2, 4), carries: r(1, 1), product: r(10, 99), zeroInTens: "never" } },
    { name: "one carry with a larger multiplier", limits: { a: r(12, 49), b: r(2, 8), carries: r(1, 1), product: r(10, 99), zeroInTens: "never" } },
    { name: "no zero in the tens", limits: { ...WIDE, zeroInTens: "never" } },
    { name: "past one hundred", limits: { a: r(21, 98), b: r(3, 9), carries: r(0, 1), product: r(100, 999), zeroInTens: "allowed" } },
  ],
  smallSpaces: [
    { name: "one question", limits: ONE, questions: [q("14 ×2")] },
    { name: "six questions with no carry", limits: SIX, questions: [...by(2, "11 12 13"), ...by(3, "11 12 13")] },
    {
      name: "one carry under 100", limits: ONE_CARRY,
      questions: [...by(2, "15 16 17 18 19 25 26 27 28 29 35 36 37 38 39"), ...by(3, "14 15 16 17 18 19 24 25 26 27 28 29")],
    },
  ],
  witnesses: [
    { limit: "a", limits: SIX, inside: q("13 ×2"), outside: q("14 ×2") },
    { limit: "a", limits: SIX, inside: q("11 ×2"), outside: q("10 ×2") },
    { limit: "b", limits: SIX, inside: q("11 ×3"), outside: q("11 ×4") },
    { limit: "b", limits: { ...WIDE, b: r(3, 9) }, inside: q("11 ×3"), outside: q("11 ×2") },
    { limit: "carries", limits: { ...WIDE, carries: r(0, 0) }, inside: q("32 ×3"), outside: q("24 ×3") },
    { limit: "carries", limits: { ...WIDE, carries: r(1, 1) }, inside: q("24 ×3"), outside: q("32 ×3") },
    { limit: "product", limits: { ...WIDE, product: r(10, 99) }, inside: q("33 ×3"), outside: q("34 ×3") },
    { limit: "product", limits: { ...WIDE, product: r(100, 999) }, inside: q("50 ×2"), outside: q("33 ×3") },
    { limit: "zeroInTens", limits: { ...WIDE, zeroInTens: "never" }, inside: q("28 ×4"), outside: q("26 ×4") },
  ],
  harder: [
    { name: "a carry", easier: q("23 ×3"), harder: q("24 ×3") },
    { name: "a product of 100 or more", easier: q("24 ×4"), harder: q("31 ×4") },
    { name: "a carry past 100", easier: q("31 ×4"), harder: q("38 ×4") },
    { name: "a zero in the tens of the product", easier: q("28 ×4"), harder: q("26 ×4") },
    { name: "a larger multiplier", easier: q("11 ×2"), harder: q("11 ×3") },
    { name: "a larger multiplier in the place of a larger number on top", easier: q("44 ×2"), harder: q("11 ×4") },
    { name: "a carry more than with a larger multiplier", easier: q("11 ×9"), harder: q("15 ×2") },
    { name: "a product past 100 more than with a carry", easier: q("12 ×8"), harder: q("51 ×2") },
    { name: "a carry past 100 more than with a zero in the tens", easier: q("51 ×2"), harder: q("58 ×2") },
    { name: "a zero in the tens more than with a larger multiplier", easier: q("81 ×9"), harder: q("34 ×3") },
  ],
  examples: ([
    ["a carry", "24 ×3", ["3 × 4 = 12, write 2, carry 1", "3 × 2 = 6, plus 1 is 7", "72"]],
    ["no carry", "32 ×3", ["3 × 2 = 6, write 6", "3 × 3 = 9", "96"]],
    ["the smallest question", "10 ×2", ["2 × 0 = 0, write 0", "2 × 1 = 2", "20"]],
    ["a zero in the ones", "40 ×7", ["7 × 0 = 0, write 0", "7 × 4 = 28", "280"]],
    ["a carry of 2", "47 ×4", ["4 × 7 = 28, write 8, carry 2", "4 × 4 = 16, plus 2 is 18", "188"]],
    ["a carry that makes a zero", "26 ×4", ["4 × 6 = 24, write 4, carry 2", "4 × 2 = 8, plus 2 is 10", "104"]],
    ["ones that make 10", "25 ×2", ["2 × 5 = 10, write 0, carry 1", "2 × 2 = 4, plus 1 is 5", "50"]],
    ["the largest question", "99 ×9", ["9 × 9 = 81, write 1, carry 8", "9 × 9 = 81, plus 8 is 89", "891"]],
  ] as const).map(([name, rows, steps]) => ({ name, rows: q(rows), answer: { kind: "whole-number", value: steps[2] }, steps })),
  refusedLimits: [
    { name: "not an object", raw: "wide", problem: "the limits must be an object" },
    { name: "a missing limit", raw: { ...ONE_CARRY, product: undefined }, problem: "product must have min and max" },
    { name: "a wrong type", raw: { ...ONE_CARRY, a: { min: "13", max: 39 } }, problem: "a.min must be a whole number" },
    { name: "a fraction", raw: { ...ONE_CARRY, a: r(13.5, 39) }, problem: "a.min must be a whole number" },
    { name: "a turned range", raw: { ...ONE_CARRY, a: r(39, 13) }, problem: "a.min is more than a.max" },
    { name: "a number with 3 digits", raw: { ...ONE_CARRY, a: r(13, 139) }, problem: "a must be from 10 to 99" },
    { name: "a multiplier with 2 digits", raw: { ...ONE_CARRY, b: r(2, 10) }, problem: "b must be from 2 to 9" },
    { name: "two carries", raw: { ...ONE_CARRY, carries: r(0, 2) }, problem: "carries must be from 0 to 1" },
    { name: "a product that is too large", raw: { ...ONE_CARRY, product: r(10, 1000) }, problem: "product must be from 10 to 999" },
    { name: "an unknown word", raw: { ...ONE_CARRY, zeroInTens: "sometimes" }, problem: 'zeroInTens must be "never" or "allowed"' },
    { name: "an unknown limit", raw: { ...ONE_CARRY, carrys: r(0, 0) }, problem: 'unknown limit "carrys"' },
    { name: "limits that no question meets", raw: { ...ONE_CARRY, a: r(11, 12) }, problem: "no question meets these limits" },
  ],
  refusedRows: ([
    ["nothing", []], ["one row", ["24"]], ["three rows", ["24", "×3", "72"]], ["turned rows", ["×3", "24"]], ["another sign", ["24", "+3"]], ["no sign", ["24", "3"]],
    ["the sign after the number", ["24", "3×"]], ["the sign in the top row", ["×24", "3"]], ["one digit on top", ["4", "×3"]], ["three digits on top", ["124", "×3"]],
    ["a zero in front", ["04", "×3"]], ["two digits below", ["24", "×13"]], ["times 1", ["24", "×1"]], ["times 0", ["24", "×0"]], ["an empty row", ["", "×3"]],
    ["a space", ["2 4", "×3"]], ["a letter x", ["24", "x3"]], ["digits of another script", ["٢٤", "×3"]],
  ] as const).map(([name, rows]) => ({ name, rows })),
};

export const SHAPE_REGISTRATIONS: readonly ShapeRegistration[] = [mulColumn];
