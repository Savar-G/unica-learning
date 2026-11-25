// The facts of sub.column. The shape works on the digits of the paper; this file takes each borrow from the last digits of
// both numbers: a place gives a ten when the digits below it are less than the same digits of the lower number.
import type { Step } from "../../contract";
import { absentMeet, endsOf, inside, meets, zeroAt, zerosMeet, type SumRules } from "../column-facts";
import { neverLimit, oftenWide, onlyLimit, rangeLimit, step, type LimitRule, type Limits, type Printed, type Rows, type ShapeRegistration } from "../shape-registration";

const digitAt = (n: number, place: number) => Math.floor(n / 10 ** place) % 10;

/** `gives` says of each place whether it gives a ten, and `crossed` whether it is a 0 that gets one first. */
interface Facts { columns: number; gives: readonly boolean[]; crossed: readonly boolean[]; borrows: number; left: number }

function factsOf(a: number, b: number): Facts {
  const columns = String(a).length;
  const gives = [0, 1, 2, 3].map((place) => a % 10 ** place < b % 10 ** place);
  const crossed = gives.map((gave, place) => gave && digitAt(a, place) === 0);
  let left = a;
  for (const [place, digit] of [...String(b)].reverse().entries()) left -= Number(digit) * 10 ** place;
  return { columns, gives, crossed, borrows: gives.filter(Boolean).length, left };
}

const NAMES = [["one", "ones"], ["ten", "tens"], ["hundred", "hundreds"], ["thousand", "thousands"]];

/** The steps: what each place shows when a step reads it follows from its printed digit and from who borrows. */
function readSteps(a: number, b: number, { columns, gives, crossed, left }: Facts): Step[] {
  const answer = String(left);
  const lowDigits = String(b).length;
  /** What a place shows after it gave a ten, and before it gets one for its own column. */
  const after = (place: number) => (crossed[place] ? 9 : digitAt(a, place) - (gives[place] ? 1 : 0));
  const lines: Step[] = [];
  for (let place = 0; place < columns; place++) {
    const borrows = gives[place + 1] && !crossed[place];
    const shown = after(place) + (borrows ? 10 : 0);
    if (borrows) {
      let giver = place + 1;
      while (crossed[giver]) giver++;
      for (let from = giver; from > place; from--) {
        const had = from === giver ? digitAt(a, from) : 10;
        lines.push(step(
          `borrow 1 ${NAMES[from][0]}, ${had} ${NAMES[from][had === 1 ? 0 : 1]} ${had === 1 ? "becomes" : "become"} ${had - 1} ${NAMES[from][had === 2 ? 0 : 1]}`,
          `x${had}@${from} b${had - 1}@${from} b${from - 1 === place ? shown : 10}@${from - 1}`,
        ));
      }
    }
    const digit = place < answer.length ? answer[answer.length - 1 - place] : null;
    const below = place < lowDigits ? digitAt(b, place) : null;
    if (digit === null && below === null) continue;
    const line = below === null ? String(shown) : `${shown} - ${below} = ${digit ?? 0}`;
    lines.push(step(place === columns - 1 && below !== null && digit !== null ? line : `${line}, write ${digit ?? "nothing"}`, digit === null ? "" : `w${digit}@${place}`));
  }
  return [...lines, step(answer)];
}

/** One feature for each limit. */
export function subColumnFeatures(a: number, b: number): Printed["features"] {
  const { columns, gives, crossed, borrows, left } = factsOf(a, b);
  return {
    aDigits: columns, bDigits: String(b).length, a, b, difference: left, borrows,
    borrowFromTens: Number(gives[1]), borrowFromHundreds: Number(gives[2]), borrowFromThousands: Number(gives[3]),
    acrossZero: crossed.includes(true), acrossTwoZeros: crossed[1] && crossed[2],
    equalDigits: [...String(b)].reverse().some((digit, place) => digit === String(digitAt(a, place))),
    zeroAnswer: left === 0, shorterAnswer: String(left).length < columns,
    aZeroInOnes: zeroAt(a, 0), aZeroInTens: zeroAt(a, 1), aZeroInHundreds: zeroAt(a, 2), bZeroInOnes: zeroAt(b, 0), bZeroInTens: zeroAt(b, 1), bZeroInHundreds: zeroAt(b, 2),
  };
}

function read(rows: Rows): Printed | null {
  const found = rows.length === 2 ? /^([1-9]\d{0,3})\n-([1-9]\d{0,3})$/.exec(rows.join("\n")) : null;
  if (!found || Number(found[2]) > Number(found[1])) return null;
  const [a, b] = [Number(found[1]), Number(found[2])];
  const facts = factsOf(a, b);
  const { columns, left } = facts;
  return {
    answer: { kind: "whole-number", value: String(left) },
    features: subColumnFeatures(a, b),
    widths: { places: Math.max(columns, 1 + found[2].length) },
    steps: readSteps(a, b, facts),
  };
}

const FROM = ["borrowFromTens", "borrowFromHundreds", "borrowFromThousands"];

const rulesOf = (limits: Limits): SumRules => {
  const l = limits as Record<string, { min: number; max: number }>;
  return {
    sign: "-", columns: l.aDigits, lowDigits: l.bDigits, low: l.b, total: l.a,
    first: { min: Math.max(l.difference.min, limits.zeroAnswer === "never" ? 1 : 0), max: l.difference.max },
    column: (c, columns, lowDigits) => zerosMeet(limits, c, c.total, lowDigits) && (c.place === 0 || inside(Number(c.gets), limits[FROM[c.place - 1]]))
      && !(c.isFirst && !meets(limits.shorterAnswer, columns > 1 && c.first === 0)),
    kind: (k) => inside(k.carries, l.borrows) && meets(limits.acrossZero, k.zeros > 0) && meets(limits.acrossTwoZeros, k.zeros > 1) && meets(limits.equalDigits, k.equal) && absentMeet(limits, k.columns, FROM),
  };
};
export const subColumnEnds = endsOf(rulesOf);

const r = (min: number, max: number) => ({ min, max });
const range = (min: number, max: number) => oftenWide(rangeLimit(min, max), r(min, max));
const word = (rule: LimitRule) => oftenWide(rule, "allowed");
export const SUB_WIDE: Limits = {
  aDigits: r(1, 4), bDigits: r(1, 4), a: r(1, 9999), b: r(1, 9999), difference: r(0, 9998), borrows: r(0, 3), borrowFromTens: r(0, 1), borrowFromHundreds: r(0, 1), borrowFromThousands: r(0, 1),
  acrossZero: "allowed", acrossTwoZeros: "allowed", equalDigits: "allowed", zeroAnswer: "allowed", shorterAnswer: "allowed",
  aZeroInOnes: "allowed", aZeroInTens: "allowed", aZeroInHundreds: "allowed", bZeroInOnes: "allowed", bZeroInTens: "allowed", bZeroInHundreds: "allowed",
};
const WIDE = SUB_WIDE;
const digits = (a: number, b: number) => ({ aDigits: r(a, a), bDigits: r(b, b) });
const [ONE, TWO, THREE, FOUR]: Limits[] = [1, 2, 3, 4].map((n) => ({ ...WIDE, ...digits(n, n) }));
const NO_BORROW = { borrows: r(0, 0), borrowFromTens: r(0, 0), borrowFromHundreds: r(0, 0), borrowFromThousands: r(0, 0) };
const SIX: Limits = { ...TWO, a: r(52, 53), b: r(17, 19) };
/** The questions with one lower number, by their top numbers. */
const less = (b: number, tops: string): Rows[] => tops.split(" ").map((top) => [top, `-${b}`]);
const q = (text: string): Rows => text.split(" ");
/** 1 digit by 1 digit, 2 digits by 1 digit, and 2 digits by 2 digits for the tops 45 and 50. */
const LISTED: Rows[] = Array.from({ length: 99 }, (_, i) => i + 1).flatMap((a) =>
  Array.from({ length: a }, (_, i) => i + 1).filter((b) => b < 10 || a === 45 || a === 50).map((b): Rows => [String(a), `-${b}`]));

export const subColumnRegistration: ShapeRegistration = {
  id: "sub.column",
  limits: {
    aDigits: range(1, 4), bDigits: range(1, 4), a: range(1, 9999), b: range(1, 9999), difference: range(0, 9998), borrows: range(0, 3),
    borrowFromTens: range(0, 1), borrowFromHundreds: range(0, 1), borrowFromThousands: range(0, 1),
    acrossZero: word(onlyLimit()), acrossTwoZeros: word(onlyLimit()), equalDigits: word(onlyLimit()), zeroAnswer: word(neverLimit()), shorterAnswer: word(onlyLimit()),
    aZeroInOnes: word(onlyLimit()), aZeroInTens: word(onlyLimit()), aZeroInHundreds: word(onlyLimit()),
    bZeroInOnes: word(onlyLimit()), bZeroInTens: word(onlyLimit()), bZeroInHundreds: word(onlyLimit()),
  },
  read,
  space: {
    count: (l) => subColumnEnds(l).count, easiest: (l) => subColumnEnds(l).easiest, hardest: (l) => subColumnEnds(l).hardest, widest: (l) => subColumnEnds(l).widest,
    listed: LISTED,
  },
  cases: [
    { name: "every question", limits: WIDE },
    { name: "2 digits with no borrow", limits: { ...TWO, ...NO_BORROW, zeroAnswer: "never", shorterAnswer: "never" } },
    { name: "2 digits with a borrow", limits: { ...TWO, borrows: r(1, 1), shorterAnswer: "never" } },
    { name: "2 digits and 1 digit with a borrow", limits: { ...WIDE, ...digits(2, 1), borrows: r(1, 1) } },
    { name: "2 digits with an answer of 1 digit", limits: { ...TWO, shorterAnswer: "only", zeroAnswer: "never" } },
    { name: "3 digits with one borrow from the hundreds", limits: { ...THREE, borrows: r(1, 1), borrowFromTens: r(0, 0), zeroAnswer: "never" } },
    { name: "3 digits with two borrows and no zero on top", limits: { ...THREE, borrows: r(2, 2), aZeroInOnes: "never", aZeroInTens: "never", equalDigits: "never" } },
    { name: "3 digits across a zero", limits: { ...WIDE, aDigits: r(3, 3), acrossZero: "only" } },
    { name: "4 digits", limits: FOUR },
    { name: "4 digits across a zero and not across two", limits: { ...FOUR, acrossZero: "only", acrossTwoZeros: "never" } },
    { name: "4 digits across two zeros", limits: { ...WIDE, aDigits: r(4, 4), acrossTwoZeros: "only", zeroAnswer: "never" } },
  ],
  smallSpaces: [
    { name: "one question", limits: { ...TWO, a: r(42, 42), b: r(17, 17) }, questions: [q("42 -17")] },
    { name: "six questions", limits: SIX, questions: [...less(17, "52 53"), ...less(18, "52 53"), ...less(19, "52 53")] },
    { name: "1 digit with the answer 0", limits: { ...ONE, difference: r(0, 0) }, questions: ["1 -1", "2 -2", "3 -3", "4 -4", "5 -5", "6 -6", "7 -7", "8 -8", "9 -9"].map(q) },
    { name: "fewer digits below", limits: { ...WIDE, a: r(99, 100), b: r(98, 100) }, questions: ["99 -98", "99 -99", "100 -98", "100 -99", "100 -100"].map(q) },
    { name: "never the answer 0", limits: { ...TWO, a: r(30, 31), b: r(30, 31), zeroAnswer: "never" }, questions: [q("31 -30")] },
    { name: "a borrow across a zero", limits: { ...THREE, a: r(199, 204), b: r(127, 128), acrossZero: "only" }, questions: [...less(127, "200 201 202 203 204"), ...less(128, "200 201 202 203 204")] },
    { name: "a borrow across two zeros", limits: { ...WIDE, aDigits: r(4, 4), a: r(2998, 3003), b: r(2, 2), acrossTwoZeros: "only" }, questions: less(2, "3000 3001") },
    { name: "an answer with fewer digits", limits: { ...TWO, a: r(50, 51), b: r(41, 43), shorterAnswer: "only" }, questions: ["50 -41", "50 -42", "50 -43", "51 -42", "51 -43"].map(q) },
    { name: "no equal digits and no borrow", limits: { ...TWO, ...NO_BORROW, a: r(45, 46), b: r(34, 45), equalDigits: "never" }, questions: ["45 -34", "46 -34", "46 -35"].map(q) },
  ],
  witnesses: [
    { limit: "aDigits", limits: { ...WIDE, aDigits: r(2, 3) }, inside: q("999 -9"), outside: q("1000 -9") },
    { limit: "aDigits", limits: { ...WIDE, aDigits: r(2, 3) }, inside: q("10 -9"), outside: q("9 -9") },
    { limit: "bDigits", limits: { ...WIDE, bDigits: r(2, 3) }, inside: q("1234 -999"), outside: q("1234 -1000") },
    { limit: "bDigits", limits: { ...WIDE, bDigits: r(2, 3) }, inside: q("1234 -10"), outside: q("1234 -9") },
    { limit: "a", limits: { ...WIDE, a: r(23, 345) }, inside: q("345 -67"), outside: q("346 -67") },
    { limit: "a", limits: { ...WIDE, a: r(23, 345) }, inside: q("23 -11"), outside: q("22 -11") },
    { limit: "b", limits: { ...WIDE, b: r(19, 190) }, inside: q("345 -190"), outside: q("345 -191") },
    { limit: "b", limits: { ...WIDE, b: r(19, 190) }, inside: q("345 -19"), outside: q("345 -18") },
    { limit: "difference", limits: { ...WIDE, difference: r(10, 99) }, inside: q("120 -21"), outside: q("120 -20") },
    { limit: "difference", limits: { ...WIDE, difference: r(10, 99) }, inside: q("30 -20"), outside: q("30 -21") },
    { limit: "borrows", limits: { ...WIDE, borrows: r(0, 1) }, inside: q("325 -117"), outside: q("325 -158") },
    { limit: "borrows", limits: { ...WIDE, borrows: r(2, 2) }, inside: q("325 -158"), outside: q("325 -117") },
    { limit: "borrows", limits: { ...WIDE, borrows: r(2, 3) }, inside: q("302 -147"), outside: q("312 -107") },
    { limit: "borrowFromTens", limits: { ...WIDE, borrowFromTens: r(0, 0) }, inside: q("42 -12"), outside: q("42 -13") },
    { limit: "borrowFromTens", limits: { ...WIDE, borrowFromTens: r(1, 1) }, inside: q("42 -13"), outside: q("42 -12") },
    { limit: "borrowFromHundreds", limits: { ...WIDE, borrowFromHundreds: r(0, 0) }, inside: q("325 -117"), outside: q("325 -133") },
    { limit: "borrowFromHundreds", limits: { ...WIDE, borrowFromHundreds: r(1, 1) }, inside: q("325 -133"), outside: q("325 -117") },
    { limit: "borrowFromThousands", limits: { ...WIDE, borrowFromThousands: r(0, 0) }, inside: q("3250 -1130"), outside: q("3250 -1330") },
    { limit: "borrowFromThousands", limits: { ...WIDE, borrowFromThousands: r(1, 1) }, inside: q("3250 -1330"), outside: q("3250 -1130") },
    { limit: "acrossZero", limits: { ...WIDE, acrossZero: "never" }, inside: q("307 -104"), outside: q("307 -108") },
    { limit: "acrossZero", limits: { ...WIDE, acrossZero: "only" }, inside: q("307 -108"), outside: q("307 -147") },
    { limit: "acrossTwoZeros", limits: { ...WIDE, acrossTwoZeros: "never" }, inside: q("4012 -7"), outside: q("4002 -7") },
    { limit: "acrossTwoZeros", limits: { ...WIDE, acrossTwoZeros: "never" }, inside: q("4002 -60"), outside: q("4002 -67") },
    { limit: "acrossTwoZeros", limits: { ...WIDE, acrossTwoZeros: "only" }, inside: q("4002 -1567"), outside: q("4012 -1567") },
    { limit: "equalDigits", limits: { ...WIDE, equalDigits: "never" }, inside: q("345 -132"), outside: q("345 -142") },
    { limit: "equalDigits", limits: { ...WIDE, equalDigits: "only" }, inside: q("345 -142"), outside: q("345 -13") },
    { limit: "zeroAnswer", limits: { ...WIDE, zeroAnswer: "never" }, inside: q("46 -45"), outside: q("45 -45") },
    { limit: "zeroAnswer", limits: { ...WIDE, zeroAnswer: "never", shorterAnswer: "never" }, inside: q("5 -4"), outside: q("5 -5") },
    { limit: "shorterAnswer", limits: { ...WIDE, shorterAnswer: "never" }, inside: q("5 -5"), outside: q("45 -45") },
    { limit: "shorterAnswer", limits: { ...WIDE, shorterAnswer: "never" }, inside: q("42 -32"), outside: q("42 -33") },
    { limit: "shorterAnswer", limits: { ...WIDE, shorterAnswer: "only" }, inside: q("12 -7"), outside: q("12 -2") },
    { limit: "aZeroInOnes", limits: { ...WIDE, aZeroInOnes: "never" }, inside: q("21 -10"), outside: q("20 -10") },
    { limit: "aZeroInOnes", limits: { ...WIDE, aZeroInOnes: "only" }, inside: q("20 -13"), outside: q("21 -10") },
    { limit: "aZeroInTens", limits: { ...WIDE, aZeroInTens: "never" }, inside: q("310 -101"), outside: q("301 -110") },
    { limit: "aZeroInTens", limits: { ...WIDE, aZeroInTens: "only" }, inside: q("301 -110"), outside: q("30 -10") },
    { limit: "aZeroInHundreds", limits: { ...WIDE, aZeroInHundreds: "never" }, inside: q("3100 -1000"), outside: q("3011 -1100") },
    { limit: "aZeroInHundreds", limits: { ...WIDE, aZeroInHundreds: "only" }, inside: q("3011 -1100"), outside: q("300 -100") },
    { limit: "bZeroInOnes", limits: { ...WIDE, bZeroInOnes: "never" }, inside: q("20 -11"), outside: q("21 -10") },
    { limit: "bZeroInOnes", limits: { ...WIDE, bZeroInOnes: "only" }, inside: q("21 -10"), outside: q("20 -1") },
    { limit: "bZeroInTens", limits: { ...WIDE, bZeroInTens: "never" }, inside: q("301 -110"), outside: q("310 -101") },
    { limit: "bZeroInTens", limits: { ...WIDE, bZeroInTens: "only" }, inside: q("310 -101"), outside: q("310 -10") },
    { limit: "bZeroInHundreds", limits: { ...WIDE, bZeroInHundreds: "never" }, inside: q("3011 -1100"), outside: q("3100 -1011") },
    { limit: "bZeroInHundreds", limits: { ...WIDE, bZeroInHundreds: "only" }, inside: q("3100 -1011"), outside: q("3100 -100") },
  ],
  harder: [
    { name: "a digit more in the top number than the hardest with fewer", easier: q("9 -9"), harder: q("10 -1") },
    { name: "a borrow with 1 digit below more than none with 2", easier: q("99 -88"), harder: q("12 -7") },
    { name: "a digit more below, with no borrow", easier: q("45 -3"), harder: q("45 -13") },
    { name: "3 digits more than the hardest of 2", easier: q("98 -89"), harder: q("101 -1") },
    { name: "4 digits more than the hardest of 3", easier: q("908 -899"), harder: q("1001 -1") },
    { name: "a borrow", easier: q("99 -88"), harder: q("21 -12") },
    { name: "two borrows", easier: q("991 -989"), harder: q("311 -122") },
    { name: "three borrows", easier: q("9919 -8922"), harder: q("2111 -1222") },
    { name: "a borrow that makes the next one", easier: q("981 -892"), harder: q("311 -112") },
    { name: "a borrow across a zero more than one that makes the next", easier: q("981 -882"), harder: q("301 -102") },
    { name: "a borrow across two zeros more than across one", easier: q("9908 -8999"), harder: q("2001 -1002") },
    { name: "two borrows that make no other, more than one borrow", easier: q("995 -989"), harder: q("321 -132") },
    { name: "larger numbers", easier: q("42 -17"), harder: q("52 -17") },
    { name: "larger numbers with no borrow", easier: q("35 -12"), harder: q("78 -45") },
  ],
  examples: ([
    ["one borrow", "42 -17", ["borrow 1 ten, 4 tens become 3 tens", "12 - 7 = 5, write 5", "3 - 1 = 2", "25"], ["x4@1 b3@1 b12@0", "w5@0", "w2@1"]],
    ["no borrow", "58 -23", ["8 - 3 = 5, write 5", "5 - 2 = 3", "35"], ["w5@0", "w3@1"]],
    ["the smallest question", "1 -1", ["1 - 1 = 0", "0"], ["w0@0"]],
    ["1 digit", "9 -4", ["9 - 4 = 5", "5"], ["w5@0"]],
    ["1 ten that becomes 0 tens", "12 -7", ["borrow 1 ten, 1 ten becomes 0 tens", "12 - 7 = 5, write 5", "5"], ["x1@1 b0@1 b12@0", "w5@0"]],
    ["no digit below", "345 -7", ["borrow 1 ten, 4 tens become 3 tens", "15 - 7 = 8, write 8", "3, write 3", "3, write 3", "338"], ["x4@1 b3@1 b15@0", "w8@0", "w3@1", "w3@2"]],
    ["no digit below and no borrow", "45 -3", ["5 - 3 = 2, write 2", "4, write 4", "42"], ["w2@0", "w4@1"]],
    ["two borrows", "534 -267", ["borrow 1 ten, 3 tens become 2 tens", "14 - 7 = 7, write 7", "borrow 1 hundred, 5 hundreds become 4 hundreds", "12 - 6 = 6, write 6", "4 - 2 = 2", "267"], ["x3@1 b2@1 b14@0", "w7@0", "x5@2 b4@2 b12@1", "w6@1", "w2@2"]],
    ["a borrow that makes the next one", "321 -124", ["borrow 1 ten, 2 tens become 1 ten", "11 - 4 = 7, write 7", "borrow 1 hundred, 3 hundreds become 2 hundreds", "11 - 2 = 9, write 9", "2 - 1 = 1", "197"], ["x2@1 b1@1 b11@0", "w7@0", "x3@2 b2@2 b11@1", "w9@1", "w1@2"]],
    ["a borrow across a zero", "302 -147", ["borrow 1 hundred, 3 hundreds become 2 hundreds", "borrow 1 ten, 10 tens become 9 tens", "12 - 7 = 5, write 5", "9 - 4 = 5, write 5", "2 - 1 = 1", "155"], ["x3@2 b2@2 b10@1", "x10@1 b9@1 b12@0", "w5@0", "w5@1", "w1@2"]],
    ["a borrow across two zeros", "4002 -1567", ["borrow 1 thousand, 4 thousands become 3 thousands", "borrow 1 hundred, 10 hundreds become 9 hundreds", "borrow 1 ten, 10 tens become 9 tens", "12 - 7 = 5, write 5", "9 - 6 = 3, write 3", "9 - 5 = 4, write 4", "3 - 1 = 2", "2435"], ["x4@3 b3@3 b10@2", "x10@2 b9@2 b10@1", "x10@1 b9@1 b12@0", "w5@0", "w3@1", "w4@2", "w2@3"]],
    ["a zero that is not crossed and then is", "4050 -1267", ["borrow 1 ten, 5 tens become 4 tens", "10 - 7 = 3, write 3", "borrow 1 thousand, 4 thousands become 3 thousands", "borrow 1 hundred, 10 hundreds become 9 hundreds", "14 - 6 = 8, write 8", "9 - 2 = 7, write 7", "3 - 1 = 2", "2783"], ["x5@1 b4@1 b10@0", "w3@0", "x4@3 b3@3 b10@2", "x10@2 b9@2 b14@1", "w8@1", "w7@2", "w2@3"]],
    ["a first digit that becomes 0 over zeros", "1000 -7", ["borrow 1 thousand, 1 thousand becomes 0 thousands", "borrow 1 hundred, 10 hundreds become 9 hundreds", "borrow 1 ten, 10 tens become 9 tens", "10 - 7 = 3, write 3", "9, write 9", "9, write 9", "993"], ["x1@3 b0@3 b10@2", "x10@2 b9@2 b10@1", "x10@1 b9@1 b10@0", "w3@0", "w9@1", "w9@2"]],
    ["zeros in front of the answer", "325 -318", ["borrow 1 ten, 2 tens become 1 ten", "15 - 8 = 7, write 7", "1 - 1 = 0, write nothing", "3 - 3 = 0, write nothing", "7"], ["x2@1 b1@1 b15@0", "w7@0"]],
    ["the answer 0", "45 -45", ["5 - 5 = 0, write 0", "4 - 4 = 0, write nothing", "0"], ["w0@0"]],
    ["a zero in the middle of the answer", "512 -308", ["borrow 1 ten, 1 ten becomes 0 tens", "12 - 8 = 4, write 4", "0 - 0 = 0, write 0", "5 - 3 = 2", "204"], ["x1@1 b0@1 b12@0", "w4@0", "w0@1", "w2@2"]],
    ["the widest question", "9999 -9999", ["9 - 9 = 0, write 0", "9 - 9 = 0, write nothing", "9 - 9 = 0, write nothing", "9 - 9 = 0, write nothing", "0"], ["w0@0"]],
  ] as const).map(([name, rows, texts, marks]) => ({
    name, rows: q(rows), answer: { kind: "whole-number" as const, value: texts[texts.length - 1] }, steps: texts.map((text, i) => step(text, marks.at(i))),
  })),
  refusedLimits: [
    { name: "not an object", raw: "wide", problem: "the limits must be an object" },
    { name: "a missing limit", raw: { ...SIX, difference: undefined }, problem: "difference must have min and max" },
    { name: "a wrong type", raw: { ...SIX, a: { min: "52", max: 53 } }, problem: "a.min must be a whole number" },
    { name: "a turned range", raw: { ...SIX, a: r(53, 52) }, problem: "a.min is more than a.max" },
    { name: "a number with 5 digits", raw: { ...SIX, a: r(52, 10_000) }, problem: "a must be from 1 to 9999" },
    { name: "a zero", raw: { ...SIX, b: r(0, 19) }, problem: "b must be from 1 to 9999" },
    { name: "5 digits", raw: { ...SIX, aDigits: r(2, 5) }, problem: "aDigits must be from 1 to 4" },
    { name: "a difference below 0", raw: { ...SIX, difference: r(-1, 10) }, problem: "difference must be from 0 to 9998" },
    { name: "four borrows", raw: { ...SIX, borrows: r(0, 4) }, problem: "borrows must be from 0 to 3" },
    { name: "two tens from one place", raw: { ...SIX, borrowFromTens: r(0, 2) }, problem: "borrowFromTens must be from 0 to 1" },
    { name: "an unknown word", raw: { ...SIX, zeroAnswer: "only" }, problem: 'zeroAnswer must be "never" or "allowed"' },
    { name: "another unknown word", raw: { ...SIX, acrossZero: "sometimes" }, problem: 'acrossZero must be "never" or "allowed" or "only"' },
    { name: "an unknown limit", raw: { ...SIX, carries: r(0, 1) }, problem: 'unknown limit "carries"' },
    { name: "a borrow that the numbers cannot have", raw: { ...TWO, a: r(59, 59), borrows: r(1, 1) }, problem: "no question meets these limits (a wider a or borrows has some)" },
    { name: "a difference that no borrow leaves", raw: { ...ONE, borrows: r(1, 1) }, problem: "no question meets these limits (a wider aDigits or borrows has some)" },
    { name: "a top number that is less", raw: { ...TWO, a: r(10, 20), b: r(30, 40) }, problem: "no question meets these limits (a wider a or b has some)" },
    { name: "across two zeros and never across one", raw: { ...FOUR, acrossZero: "never", acrossTwoZeros: "only" }, problem: "no question meets these limits (a wider acrossZero or acrossTwoZeros has some)" },
    { name: "only the answer 0 and never", raw: { ...TWO, difference: r(0, 0), zeroAnswer: "never" }, problem: "no question meets these limits (a wider difference or zeroAnswer has some)" },
    { name: "limits that no one change can mend", raw: { ...TWO, a: r(50, 59), acrossZero: "only", borrows: r(3, 3) }, problem: "no question meets these limits (together they are too narrow: aDigits, bDigits, a, borrows, acrossZero)" },
  ],
  refusedRows: ([
    ["nothing", []], ["one row", ["24"]], ["three rows", ["24", "-3", "21"]], ["turned rows", ["-3", "24"]], ["another sign", ["24", "+3"]], ["a long dash", ["24", "–3"]], ["no sign", ["24", "3"]],
    ["the sign after the number", ["24", "3-"]], ["the sign in the top row", ["-24", "3"]], ["more below than on top", ["24", "-25"]], ["more digits below", ["24", "-100"]], ["five digits on top", ["12345", "-3"]],
    ["a zero in front", ["04", "-3"]], ["a zero in front below", ["24", "-03"]], ["a zero below", ["24", "-0"]], ["a zero on top", ["0", "-0"]], ["an empty row", ["", "-3"]], ["no number below", ["24", "-"]],
    ["a space", ["2 4", "-3"]], ["a comma", ["1,234", "-3"]], ["digits of another script", ["٢٤", "-3"]],
  ] as const).map(([name, rows]) => ({ name, rows })),
};
