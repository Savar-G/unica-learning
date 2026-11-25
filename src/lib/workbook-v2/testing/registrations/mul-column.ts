// The facts of mul.column. The shape works column by column and counts by place; this file takes each carry from the
// product of the last digits, and counts with a table of every question.
import type { Step } from "../../contract";
import { neverLimit, oftenWide, onlyLimit, rangeLimit, step, wholeAnswer, type LargeSpace, type Limits, type Printed, type Rows, type ShapeRegistration } from "../shape-registration";

interface Facts { digits: number; carry: readonly [tens: number, hundreds: number, thousands: number]; carries: number; product: number; zero: boolean; wholeTens: boolean }

/** The carry into a place: what the product of the digits below it has at that place and above. */
function carryInto(a: number, b: number, place: number): number {
  const below = a % 10 ** place;
  return below === a ? 0 : Math.floor((below * b) / 10 ** place);
}

/** A zero between the first digit and the ones. */
const hasZeroInside = (n: number): boolean => {
  for (let rest = Math.floor(n / 10); rest >= 10; rest = Math.floor(rest / 10)) if (rest % 10 === 0) return true;
  return false;
};

function factsOf(a: number, b: number): Facts {
  const [tens, hundreds, thousands] = [carryInto(a, b, 1), carryInto(a, b, 2), carryInto(a, b, 3)];
  let product = 0;
  for (let i = 0; i < b; i++) product += a;
  return {
    digits: a < 100 ? 2 : a < 1000 ? 3 : 4, carry: [tens, hundreds, thousands], carries: Math.sign(tens) + Math.sign(hundreds) + Math.sign(thousands),
    product, zero: hasZeroInside(product), wholeTens: a % 10 === 0,
  };
}

const times = (n: number, b: number) => Array.from({ length: b }, () => n).reduce((sum, x) => sum + x, 0);

/** The line of each column: its product, the carry that it adds, the digit of the product that it writes, its carry. */
function readSteps(top: string, b: number, { digits, carry, product }: Facts): Step[] {
  const answer = String(product);
  const columns = [...top].reverse().map((digit, place): Step => {
    const [added, made] = [place === 0 ? 0 : carry[place - 1], place + 1 < digits ? carry[place] : 0];
    const value = times(Number(digit), b);
    const line = `${b} × ${digit} = ${value}${added > 0 ? `, plus ${added} is ${value + added}` : ""}`;
    if (place + 1 === digits) return step(line, [...answer.slice(0, answer.length - place)].reverse().map((d, i) => `w${d}@${place + i}`).join(" "));
    const ones = answer.at(-1 - place) ?? "";
    return step(`${line}, write ${ones}${made > 0 ? `, carry ${made}` : ""}`, `w${ones}@${place}${made > 0 ? ` c${made}@${place + 1}` : ""}`);
  });
  return [...columns, step(answer)];
}

function read(rows: Rows): Printed | null {
  const found = rows.length === 2 ? /^([1-9][0-9]{1,3})\n×([2-9])$/.exec(rows.join("\n")) : null;
  if (!found) return null;
  const [top, b] = [found[1], Number(found[2])];
  const facts = factsOf(Number(top), b);
  const [carryIntoTens, carryIntoHundreds, carryIntoThousands] = facts.carry;
  return {
    answer: wholeAnswer(String(facts.product)),
    features: { digits: top.length, a: Number(top), b, carries: facts.carries, carryIntoTens, carryIntoHundreds, carryIntoThousands, product: facts.product, zeroInProduct: facts.zero, wholeTens: facts.wholeTens },
    widths: { product: facts.product },
    steps: readSteps(top, b, facts),
  };
}

const BY = [2, 3, 4, 5, 6, 7, 8, 9];
const [FIRST, LAST] = [10, 9999];
const rowsOf = (a: number, b: number): Rows => [String(a), `×${b}`];

/** How hard a question is: the digits, the digits that the product has more, the carries, a zero in the product, the multiplier. */
const hardness = ({ digits, carries, product, zero, b }: Entry): number =>
  (((digits * 10 + (product >= 10 ** digits ? 1 : 0)) * 10 + carries) * 10 + (zero ? 1 : 0)) * 10 + b;

interface Entry extends Facts { a: number; b: number }
let entries: readonly Entry[] | null = null;
/** Every question, made one time. */
function table(): readonly Entry[] {
  if (entries) return entries;
  const all: Entry[] = [];
  for (let a = FIRST; a <= LAST; a++) {
    for (const b of BY) {
      const { digits, carry, carries, product, zero, wholeTens } = factsOf(a, b);
      all.push({ digits, carry, carries, product, zero, wholeTens, a, b });
    }
  }
  return entries = all;
}

interface Ranges { [name: string]: { min: number; max: number } }
interface Ends { count: number; easiest: Rows; hardest: Rows; widest: Rows }
const known = new Map<string, Ends>();

/** The questions inside some limits, in order of the first number and then of the multiplier. */
export function mulColumnQuestions(limits: Limits): Entry[] {
  const { digits, a, b, carries, carryIntoTens, carryIntoHundreds, carryIntoThousands, product } = limits as unknown as Ranges;
  const { zeroInProduct, wholeTens } = limits;
  const inside = (n: number, range: { min: number; max: number }) => n >= range.min && n <= range.max;
  return table().filter((q) => inside(q.product, product) && inside(q.a, a) && inside(q.b, b) && inside(q.digits, digits) && inside(q.carries, carries)
    && inside(q.carry[0], carryIntoTens) && inside(q.carry[1], carryIntoHundreds) && inside(q.carry[2], carryIntoThousands)
    && !(q.zero && zeroInProduct === "never") && !(q.wholeTens ? wholeTens === "never" : wholeTens === "only"));
}

function endsOf(limits: Limits): Ends {
  const key = JSON.stringify(limits);
  const found = known.get(key);
  if (found) return found;
  const all = mulColumnQuestions(limits);
  let [easiest, hardest, widest] = [all[0], all[0], all[0]];
  let [low, high] = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const q of all) {
    const hard = hardness(q);
    if (hard < low) [low, easiest] = [hard, q];
    if (hard > high) [high, hardest] = [hard, q];
    if (q.product > widest.product) widest = q;
  }
  const rows = (q: Entry | undefined): Rows => (q ? rowsOf(q.a, q.b) : []);
  const ends = { count: all.length, easiest: rows(easiest), hardest: rows(hardest), widest: rows(widest) };
  known.set(key, ends);
  return ends;
}

const space: LargeSpace = {
  count: (limits) => endsOf(limits).count, easiest: (limits) => endsOf(limits).easiest, hardest: (limits) => endsOf(limits).hardest, widest: (limits) => endsOf(limits).widest,
  listed: Array.from({ length: 990 }, (_, i) => BY.map((b) => rowsOf(FIRST + i, b))).flat(),
};

const r = (min: number, max: number) => ({ min, max });
const range = (min: number, max: number) => oftenWide(rangeLimit(min, max), r(min, max));
const NO_CARRY = { carries: r(0, 0), carryIntoTens: r(0, 0), carryIntoHundreds: r(0, 0), carryIntoThousands: r(0, 0) };
const WIDE: Limits = {
  digits: r(2, 4), a: r(10, 9999), b: r(2, 9), carries: r(0, 3), carryIntoTens: r(0, 8), carryIntoHundreds: r(0, 8), carryIntoThousands: r(0, 8),
  product: r(10, 99_999), zeroInProduct: "allowed", wholeTens: "allowed",
};
/** 2 digits by 1 digit. */
const TWO: Limits = { ...WIDE, digits: r(2, 2), a: r(10, 99), carries: r(0, 1), carryIntoHundreds: r(0, 0), carryIntoThousands: r(0, 0), product: r(10, 999) };
const UNDER_100: Limits = { ...TWO, product: r(10, 99), zeroInProduct: "never" };
const ONE_CARRY: Limits = { ...UNDER_100, a: r(13, 39), b: r(2, 3), carries: r(1, 1) };
const THREE: Limits = { ...WIDE, digits: r(3, 3), a: r(100, 999), carries: r(0, 2), carryIntoThousands: r(0, 0), product: r(200, 8999) };
const FOUR: Limits = { ...WIDE, digits: r(4, 4), a: r(1000, 9999), product: r(2000, 99_999) };
const SIX: Limits = { ...TWO, a: r(11, 13), b: r(2, 3), ...NO_CARRY };
const ONE: Limits = { ...TWO, a: r(14, 14), b: r(2, 2) };
/** The questions with one multiplier, by their top numbers. */
const by = (b: number, tops: string): Rows[] => tops.split(" ").map((top) => [top, `×${b}`]);
const q = (text: string): Rows => text.split(" ");

export const mulColumnRegistration: ShapeRegistration = {
  id: "mul.column",
  working: "columns",
  limits: {
    digits: range(2, 4), a: range(10, 9999), b: range(2, 9), carries: range(0, 3),
    carryIntoTens: range(0, 8), carryIntoHundreds: range(0, 8), carryIntoThousands: range(0, 8),
    product: range(10, 99_999), zeroInProduct: neverLimit(), wholeTens: onlyLimit(),
  },
  read,
  space,
  cases: [
    { name: "every question", limits: WIDE },
    { name: "2 digits", limits: TWO },
    { name: "no carry", limits: { ...UNDER_100, a: r(11, 43), b: r(2, 4), ...NO_CARRY } },
    { name: "one carry", limits: { ...UNDER_100, a: r(12, 49), b: r(2, 4), carries: r(1, 1) } },
    { name: "one carry with a larger multiplier", limits: { ...UNDER_100, a: r(12, 49), b: r(2, 8), carries: r(1, 1) } },
    { name: "a carry of 2", limits: { ...UNDER_100, carries: r(1, 1), carryIntoTens: r(2, 2) } },
    { name: "past one hundred", limits: { ...TWO, a: r(21, 98), b: r(3, 9), product: r(100, 999) } },
    { name: "tens by 1 digit", limits: { ...TWO, a: r(20, 90), product: r(100, 999), wholeTens: "only" } },
    { name: "3 digits", limits: THREE },
    { name: "3 digits with one carry into the tens", limits: { ...THREE, carries: r(1, 1), carryIntoTens: r(1, 8), carryIntoHundreds: r(0, 0), product: r(200, 999) } },
    { name: "3 digits with one carry into the hundreds", limits: { ...THREE, carries: r(1, 1), carryIntoTens: r(0, 0), carryIntoHundreds: r(1, 8) } },
    { name: "4 digits", limits: FOUR },
    { name: "4 digits with no carry", limits: { ...FOUR, b: r(2, 4), ...NO_CARRY, product: r(2000, 9999) } },
    { name: "4 digits with three carries and 5 digits in the product", limits: { ...FOUR, carries: r(3, 3), product: r(10_000, 99_999), zeroInProduct: "never", wholeTens: "never" } },
  ],
  smallSpaces: [
    { name: "one question", limits: ONE, questions: [q("14 ×2")] },
    { name: "six questions with no carry", limits: SIX, questions: [...by(2, "11 12 13"), ...by(3, "11 12 13")] },
    {
      name: "one carry under 100", limits: ONE_CARRY,
      questions: [...by(2, "15 16 17 18 19 25 26 27 28 29 35 36 37 38 39"), ...by(3, "14 15 16 17 18 19 24 25 26 27 28 29")],
    },
    { name: "whole tens", limits: { ...TWO, wholeTens: "only", b: r(7, 8) }, questions: [...by(7, "10 20 30 40 50 60 70 80 90"), ...by(8, "10 20 30 40 50 60 70 80 90")] },
    { name: "2 and 3 digits", limits: { ...WIDE, digits: r(2, 3), a: r(98, 101), b: r(4, 4) }, questions: by(4, "98 99 100 101") },
    { name: "3 and 4 digits with no zero inside", limits: { ...WIDE, digits: r(3, 4), a: r(997, 1002), b: r(3, 3), zeroInProduct: "never" }, questions: by(3, "997 998 999") },
    { name: "a carry into the hundreds and no other", limits: { ...FOUR, b: r(3, 3), a: r(2140, 2162), ...NO_CARRY, carries: r(1, 1), carryIntoHundreds: r(1, 1) }, questions: by(3, "2140 2141 2142 2143 2150 2151 2152 2153 2160 2161 2162") },
  ],
  witnesses: [
    { limit: "digits", limits: { ...WIDE, digits: r(2, 3) }, inside: q("999 ×9"), outside: q("1000 ×9") },
    { limit: "digits", limits: { ...WIDE, digits: r(4, 4) }, inside: q("1000 ×2"), outside: q("999 ×2") },
    { limit: "a", limits: SIX, inside: q("13 ×2"), outside: q("14 ×2") },
    { limit: "a", limits: SIX, inside: q("11 ×2"), outside: q("10 ×2") },
    { limit: "a", limits: { ...WIDE, a: r(999, 4005) }, inside: q("4005 ×7"), outside: q("4006 ×7") },
    { limit: "b", limits: SIX, inside: q("11 ×3"), outside: q("11 ×4") },
    { limit: "b", limits: { ...WIDE, b: r(3, 9) }, inside: q("11 ×3"), outside: q("11 ×2") },
    { limit: "carries", limits: { ...WIDE, carries: r(0, 0) }, inside: q("32 ×3"), outside: q("24 ×3") },
    { limit: "carries", limits: { ...WIDE, carries: r(1, 1) }, inside: q("24 ×3"), outside: q("32 ×3") },
    { limit: "carries", limits: { ...WIDE, carries: r(2, 2) }, inside: q("246 ×3"), outside: q("1246 ×5") },
    { limit: "carryIntoTens", limits: { ...WIDE, carryIntoTens: r(0, 0) }, inside: q("241 ×3"), outside: q("214 ×3") },
    { limit: "carryIntoTens", limits: { ...WIDE, carryIntoTens: r(2, 2) }, inside: q("27 ×3"), outside: q("24 ×3") },
    { limit: "carryIntoHundreds", limits: { ...WIDE, carryIntoHundreds: r(0, 0) }, inside: q("41 ×3"), outside: q("141 ×3") },
    { limit: "carryIntoHundreds", limits: { ...WIDE, carryIntoHundreds: r(1, 8) }, inside: q("141 ×3"), outside: q("41 ×3") },
    { limit: "carryIntoThousands", limits: { ...WIDE, carryIntoThousands: r(0, 0) }, inside: q("411 ×3"), outside: q("1411 ×3") },
    { limit: "carryIntoThousands", limits: { ...WIDE, carryIntoThousands: r(1, 1) }, inside: q("1411 ×3"), outside: q("1711 ×3") },
    { limit: "product", limits: { ...WIDE, product: r(10, 99) }, inside: q("33 ×3"), outside: q("34 ×3") },
    { limit: "product", limits: { ...WIDE, product: r(100, 999) }, inside: q("50 ×2"), outside: q("33 ×3") },
    { limit: "product", limits: { ...WIDE, product: r(10, 9999) }, inside: q("1111 ×9"), outside: q("1112 ×9") },
    { limit: "zeroInProduct", limits: { ...WIDE, zeroInProduct: "never" }, inside: q("28 ×4"), outside: q("26 ×4") },
    { limit: "zeroInProduct", limits: { ...WIDE, zeroInProduct: "never" }, inside: q("15 ×2"), outside: q("1015 ×2") },
    { limit: "wholeTens", limits: { ...WIDE, wholeTens: "never" }, inside: q("41 ×7"), outside: q("40 ×7") },
    { limit: "wholeTens", limits: { ...WIDE, wholeTens: "only" }, inside: q("40 ×7"), outside: q("41 ×7") },
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
    { name: "3 digits more than the hardest of 2", easier: q("89 ×9"), harder: q("111 ×2") },
    { name: "4 digits more than the hardest of 3", easier: q("889 ×9"), harder: q("1111 ×2") },
    { name: "a carry in 3 digits", easier: q("123 ×3"), harder: q("124 ×3") },
    { name: "two carries in 3 digits", easier: q("124 ×3"), harder: q("247 ×3") },
    { name: "a product of 1,000 more than two carries", easier: q("247 ×3"), harder: q("411 ×3") },
    { name: "a zero in the product of 3 digits", easier: q("124 ×4"), harder: q("126 ×4") },
    { name: "a larger multiplier in 3 digits", easier: q("111 ×2"), harder: q("111 ×3") },
    { name: "a carry in 4 digits", easier: q("1111 ×5"), harder: q("1112 ×5") },
    { name: "two carries in 4 digits", easier: q("1112 ×5"), harder: q("1122 ×5") },
    { name: "three carries in 4 digits", easier: q("1122 ×5"), harder: q("1222 ×5") },
    { name: "a product of 10,000 more than three carries", easier: q("1222 ×5"), harder: q("4111 ×3") },
    { name: "a carry past 10,000", easier: q("4111 ×3"), harder: q("4114 ×3") },
    { name: "a zero in the product of 4 digits", easier: q("1234 ×3"), harder: q("1234 ×5") },
    { name: "a larger multiplier in 4 digits", easier: q("2111 ×2"), harder: q("1111 ×3") },
  ],
  examples: ([
    ["a carry", "24 ×3", ["3 × 4 = 12, write 2, carry 1", "3 × 2 = 6, plus 1 is 7", "72"], ["w2@0 c1@1", "w7@1"]],
    ["no carry", "32 ×3", ["3 × 2 = 6, write 6", "3 × 3 = 9", "96"], ["w6@0", "w9@1"]],
    ["the smallest question", "10 ×2", ["2 × 0 = 0, write 0", "2 × 1 = 2", "20"], ["w0@0", "w2@1"]],
    ["tens by 1 digit", "40 ×7", ["7 × 0 = 0, write 0", "7 × 4 = 28", "280"], ["w0@0", "w8@1 w2@2"]],
    ["a carry of 2", "47 ×4", ["4 × 7 = 28, write 8, carry 2", "4 × 4 = 16, plus 2 is 18", "188"], ["w8@0 c2@1", "w8@1 w1@2"]],
    ["a carry that makes a zero", "26 ×4", ["4 × 6 = 24, write 4, carry 2", "4 × 2 = 8, plus 2 is 10", "104"], ["w4@0 c2@1", "w0@1 w1@2"]],
    ["ones that make 10", "25 ×2", ["2 × 5 = 10, write 0, carry 1", "2 × 2 = 4, plus 1 is 5", "50"], ["w0@0 c1@1", "w5@1"]],
    ["the largest question of 2 digits", "99 ×9", ["9 × 9 = 81, write 1, carry 8", "9 × 9 = 81, plus 8 is 89", "891"], ["w1@0 c8@1", "w9@1 w8@2"]],
    ["3 digits with no carry", "213 ×3", ["3 × 3 = 9, write 9", "3 × 1 = 3, write 3", "3 × 2 = 6", "639"], ["w9@0", "w3@1", "w6@2"]],
    ["3 digits with two carries", "247 ×3", ["3 × 7 = 21, write 1, carry 2", "3 × 4 = 12, plus 2 is 14, write 4, carry 1", "3 × 2 = 6, plus 1 is 7", "741"], ["w1@0 c2@1", "w4@1 c1@2", "w7@2"]],
    ["a zero in the middle that gets a carry", "304 ×6", ["6 × 4 = 24, write 4, carry 2", "6 × 0 = 0, plus 2 is 2, write 2", "6 × 3 = 18", "1824"], ["w4@0 c2@1", "w2@1", "w8@2 w1@3"]],
    ["two zeros in the middle", "4005 ×7", ["7 × 5 = 35, write 5, carry 3", "7 × 0 = 0, plus 3 is 3, write 3", "7 × 0 = 0, write 0", "7 × 4 = 28", "28035"], ["w5@0 c3@1", "w3@1", "w0@2", "w8@3 w2@4"]],
    ["a carry that makes the next carry", "1667 ×6", ["6 × 7 = 42, write 2, carry 4", "6 × 6 = 36, plus 4 is 40, write 0, carry 4", "6 × 6 = 36, plus 4 is 40, write 0, carry 4", "6 × 1 = 6, plus 4 is 10", "10002"], ["w2@0 c4@1", "w0@1 c4@2", "w0@2 c4@3", "w0@3 w1@4"]],
    ["the largest question", "9999 ×9", ["9 × 9 = 81, write 1, carry 8", "9 × 9 = 81, plus 8 is 89, write 9, carry 8", "9 × 9 = 81, plus 8 is 89, write 9, carry 8", "9 × 9 = 81, plus 8 is 89", "89991"], ["w1@0 c8@1", "w9@1 c8@2", "w9@2 c8@3", "w9@3 w8@4"]],
  ] as const).map(([name, rows, texts, marks]) => ({
    name, rows: q(rows), answer: wholeAnswer(texts[texts.length - 1]), steps: texts.map((text, i) => step(text, marks[i])),
  })),
  refusedLimits: [
    { name: "not an object", raw: "wide", problem: "the limits must be an object" },
    { name: "a missing limit", raw: { ...ONE_CARRY, product: undefined }, problem: "product must have min and max" },
    { name: "the limits of version 1", raw: { a: r(13, 39), b: r(2, 3), carries: r(1, 1), product: r(10, 99), zeroInTens: "never" }, problem: 'unknown limit "zeroInTens"' },
    { name: "a wrong type", raw: { ...ONE_CARRY, a: { min: "13", max: 39 } }, problem: "a.min must be a whole number" },
    { name: "a fraction", raw: { ...ONE_CARRY, a: r(13.5, 39) }, problem: "a.min must be a whole number" },
    { name: "a turned range", raw: { ...ONE_CARRY, a: r(39, 13) }, problem: "a.min is more than a.max" },
    { name: "a number with 5 digits", raw: { ...ONE_CARRY, a: r(13, 10_000) }, problem: "a must be from 10 to 9999" },
    { name: "one digit", raw: { ...ONE_CARRY, digits: r(1, 2) }, problem: "digits must be from 2 to 4" },
    { name: "a multiplier with 2 digits", raw: { ...ONE_CARRY, b: r(2, 10) }, problem: "b must be from 2 to 9" },
    { name: "four carries", raw: { ...ONE_CARRY, carries: r(0, 4) }, problem: "carries must be from 0 to 3" },
    { name: "a carry of 9", raw: { ...ONE_CARRY, carryIntoTens: r(0, 9) }, problem: "carryIntoTens must be from 0 to 8" },
    { name: "a product that is too large", raw: { ...ONE_CARRY, product: r(10, 100_000) }, problem: "product must be from 10 to 99999" },
    { name: "an unknown word", raw: { ...ONE_CARRY, zeroInProduct: "sometimes" }, problem: 'zeroInProduct must be "never" or "allowed"' },
    { name: "another unknown word", raw: { ...ONE_CARRY, wholeTens: "sometimes" }, problem: 'wholeTens must be "never" or "allowed" or "only"' },
    { name: "an unknown limit", raw: { ...ONE_CARRY, carrys: r(0, 0) }, problem: 'unknown limit "carrys"' },
    { name: "limits that no question meets", raw: { ...ONE_CARRY, a: r(11, 12) }, problem: "no question meets these limits (a wider a or b or carries has some)" },
    { name: "a carry into a column that is not there", raw: { ...ONE_CARRY, carryIntoHundreds: r(1, 8) }, problem: "no question meets these limits (a wider carryIntoHundreds has some)" },
    { name: "limits that no one change can mend", raw: { ...ONE_CARRY, b: r(2, 2), a: r(11, 12), carryIntoTens: r(8, 8) }, problem: "no question meets these limits (together they are too narrow: digits, a, b, carries, carryIntoTens, carryIntoHundreds, carryIntoThousands, product, zeroInProduct)" },
    { name: "digits that the range of the first number does not have", raw: { ...ONE_CARRY, digits: r(3, 3) }, problem: "no question meets these limits (a wider digits has some)" },
  ],
  refusedRows: ([
    ["nothing", []], ["one row", ["24"]], ["three rows", ["24", "×3", "72"]], ["turned rows", ["×3", "24"]], ["another sign", ["24", "+3"]], ["no sign", ["24", "3"]],
    ["the sign after the number", ["24", "3×"]], ["the sign in the top row", ["×24", "3"]], ["one digit on top", ["4", "×3"]], ["five digits on top", ["12345", "×3"]],
    ["a zero in front", ["04", "×3"]], ["two digits below", ["24", "×13"]], ["times 1", ["24", "×1"]], ["times 0", ["24", "×0"]], ["an empty row", ["", "×3"]],
    ["a space", ["2 4", "×3"]], ["a comma", ["1,234", "×3"]], ["a letter x", ["24", "x3"]], ["digits of another script", ["٢٤", "×3"]],
  ] as const).map(([name, rows]) => ({ name, rows })),
};
