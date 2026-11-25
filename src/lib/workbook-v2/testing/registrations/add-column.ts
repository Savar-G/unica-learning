// The facts of add.column. The shape works column by column; this file takes each carry from the sum of the last digits.
import type { Step } from "../../contract";
import { absentMeet, endsOf, inside, meets, zeroAt, zerosMeet, type SumRules } from "../column-facts";
import { neverLimit, oftenWide, onlyLimit, rangeLimit, step, type LimitRule, type Limits, type Printed, type Rows, type ShapeRegistration } from "../shape-registration";

/** The carry into a place, from the digits below it. */
const carriesInto = (a: number, b: number, place: number): boolean => (a % 10 ** place) + (b % 10 ** place) >= 10 ** place;

interface Facts { columns: number; into: readonly boolean[]; carries: number; chain: boolean; sum: number; zero: boolean }

function factsOf(a: number, b: number): Facts {
  const columns = String(a).length;
  const into = [1, 2, 3].map((place) => place < columns && carriesInto(a, b, place));
  const isNine = (place: number) => (Math.floor(a / 10 ** place) % 10) + (Math.floor(b / 10 ** place) % 10) === 9;
  return {
    columns, into, carries: into.filter(Boolean).length, chain: [1, 2].some((place) => into[place - 1] && into[place] && isNine(place)),
    sum: b + a, zero: String(a + b).slice(1, -1).includes("0"),
  };
}

/** The line of each column: the digits, the carry that it adds, the digit of the sum that it writes, its carry. */
function readSteps(top: string, low: string, { columns, into, sum }: Facts): Step[] {
  const answer = String(sum);
  const lines = [...top].reverse().map((digit, place): Step => {
    const below = place < low.length ? low[low.length - 1 - place] : null;
    const [gets, two] = [place > 0 && into[place - 1], Number(digit) + Number(below ?? 0)];
    const line = `${below === null ? digit : `${digit} + ${below} = ${two}`}${gets ? `, plus 1 is ${two + 1}` : ""}`;
    if (place === columns - 1) {
      const all = [...answer.slice(0, answer.length - place)].reverse();
      return step(below === null && !gets ? `${digit}, write ${digit}` : line, all.map((d, i) => `w${d}@${place + i}`).join(" "));
    }
    const ones = answer[answer.length - 1 - place];
    return step(`${line}, write ${ones}${into[place] ? ", carry 1" : ""}`, `w${ones}@${place}${into[place] ? ` c1@${place + 1}` : ""}`);
  });
  return [...lines, step(answer)];
}

/** One feature for each limit. */
export function addColumnFeatures(a: number, b: number): Printed["features"] {
  const { columns, into, carries, chain, sum, zero } = factsOf(a, b);
  return {
    aDigits: columns, bDigits: String(b).length, a, b, sum, carries, carryIntoTens: Number(into[0]), carryIntoHundreds: Number(into[1]), carryIntoThousands: Number(into[2]), carryChain: chain,
    aZeroInOnes: zeroAt(a, 0), aZeroInTens: zeroAt(a, 1), aZeroInHundreds: zeroAt(a, 2), bZeroInOnes: zeroAt(b, 0), bZeroInTens: zeroAt(b, 1), bZeroInHundreds: zeroAt(b, 2),
    zeroInSum: zero,
  };
}

function read(rows: Rows): Printed | null {
  const found = rows.length === 2 ? /^([1-9]\d{0,3})\n\+([1-9]\d{0,3})$/.exec(rows.join("\n")) : null;
  if (!found || found[2].length > found[1].length) return null;
  const [a, b] = [Number(found[1]), Number(found[2])];
  const facts = factsOf(a, b);
  const answer = String(facts.sum);
  return {
    answer: { kind: "whole-number", value: answer },
    features: addColumnFeatures(a, b),
    widths: { places: Math.max(found[1].length, 1 + found[2].length, answer.length) },
    steps: readSteps(found[1], found[2], facts),
  };
}

const INTO = ["carryIntoTens", "carryIntoHundreds", "carryIntoThousands"];

const rulesOf = (limits: Limits): SumRules => {
  const l = limits as Record<string, { min: number; max: number }>;
  return {
    sign: "+", columns: l.aDigits, lowDigits: l.bDigits, first: l.a, low: l.b, total: l.sum,
    column: (c, _columns, lowDigits) => zerosMeet(limits, c, c.first, lowDigits) && (c.place === 0 || inside(Number(c.gets), limits[INTO[c.place - 1]]))
      && !(limits.zeroInSum === "never" && c.place > 0 && c.total % 10 === 0 && (!c.isFirst || c.total === 10)),
    kind: (k) => inside(k.carries, l.carries) && meets(limits.carryChain, k.chain) && absentMeet(limits, k.columns, INTO),
  };
};
export const addColumnEnds = endsOf(rulesOf);

const r = (min: number, max: number) => ({ min, max });
const range = (min: number, max: number) => oftenWide(rangeLimit(min, max), r(min, max));
const word = (rule: LimitRule) => oftenWide(rule, "allowed");
export const ADD_WIDE: Limits = {
  aDigits: r(1, 4), bDigits: r(1, 4), a: r(1, 9999), b: r(1, 9999), sum: r(2, 19_998), carries: r(0, 3), carryIntoTens: r(0, 1), carryIntoHundreds: r(0, 1), carryIntoThousands: r(0, 1),
  carryChain: "allowed", aZeroInOnes: "allowed", aZeroInTens: "allowed", aZeroInHundreds: "allowed", bZeroInOnes: "allowed", bZeroInTens: "allowed", bZeroInHundreds: "allowed", zeroInSum: "allowed",
};
const WIDE = ADD_WIDE;
const digits = (a: number, b: number) => ({ aDigits: r(a, a), bDigits: r(b, b) });
const [ONE, TWO, THREE, FOUR]: Limits[] = [1, 2, 3, 4].map((n) => ({ ...WIDE, ...digits(n, n) }));
const NO_CARRY = { carries: r(0, 0), carryIntoTens: r(0, 0), carryIntoHundreds: r(0, 0), carryIntoThousands: r(0, 0) };
const SIX: Limits = { ...TWO, a: r(21, 22), b: r(14, 16) };
/** The questions with one lower number, by their top numbers. */
const plus = (b: number, tops: string): Rows[] => tops.split(" ").map((top) => [top, `+${b}`]);
const q = (text: string): Rows => text.split(" ");
/** 1 digit by 1 digit, 2 digits by 1 digit, and 2 digits by 2 digits for the tops 45 and 50. */
const LISTED: Rows[] = Array.from({ length: 99 }, (_, i) => i + 1).flatMap((a) =>
  Array.from({ length: a < 10 ? 9 : 99 }, (_, i) => i + 1).filter((b) => b < 10 || a === 45 || a === 50).map((b): Rows => [String(a), `+${b}`]));

export const addColumnRegistration: ShapeRegistration = {
  id: "add.column",
  limits: {
    aDigits: range(1, 4), bDigits: range(1, 4), a: range(1, 9999), b: range(1, 9999), sum: range(2, 19_998), carries: range(0, 3),
    carryIntoTens: range(0, 1), carryIntoHundreds: range(0, 1), carryIntoThousands: range(0, 1), carryChain: word(onlyLimit()),
    aZeroInOnes: word(onlyLimit()), aZeroInTens: word(onlyLimit()), aZeroInHundreds: word(onlyLimit()),
    bZeroInOnes: word(onlyLimit()), bZeroInTens: word(onlyLimit()), bZeroInHundreds: word(onlyLimit()), zeroInSum: word(neverLimit()),
  },
  read,
  space: {
    count: (l) => addColumnEnds(l).count, easiest: (l) => addColumnEnds(l).easiest, hardest: (l) => addColumnEnds(l).hardest, widest: (l) => addColumnEnds(l).widest,
    listed: LISTED,
  },
  cases: [
    { name: "every question", limits: WIDE },
    { name: "2 digits with no carry", limits: { ...TWO, ...NO_CARRY, sum: r(20, 99) } },
    { name: "2 digits with a carry", limits: { ...TWO, carries: r(1, 1), sum: r(20, 99) } },
    { name: "2 digits past one hundred", limits: { ...TWO, sum: r(100, 198) } },
    { name: "2 digits and 1 digit with a carry", limits: { ...WIDE, ...digits(2, 1), carries: r(1, 1) } },
    { name: "3 digits with one carry into the hundreds", limits: { ...THREE, carries: r(1, 1), carryIntoTens: r(0, 0), sum: r(200, 999) } },
    { name: "3 digits with a carry that makes the next one", limits: { ...THREE, carryChain: "only" } },
    { name: "3 digits and fewer with a zero in the tens", limits: { ...WIDE, aDigits: r(3, 3), bDigits: r(1, 2), aZeroInTens: "only" } },
    { name: "4 digits", limits: FOUR },
    { name: "4 digits with no zero", limits: { ...FOUR, aZeroInOnes: "never", aZeroInTens: "never", aZeroInHundreds: "never", bZeroInOnes: "never", bZeroInTens: "never", bZeroInHundreds: "never", zeroInSum: "never" } },
    { name: "4 digits and 3 digits with three carries", limits: { ...WIDE, ...digits(4, 3), carries: r(3, 3) } },
  ],
  smallSpaces: [
    { name: "one question", limits: { ...TWO, a: r(27, 27), b: r(45, 45) }, questions: [q("27 +45")] },
    { name: "six questions", limits: SIX, questions: [...plus(14, "21 22"), ...plus(15, "21 22"), ...plus(16, "21 22")] },
    { name: "1 digit to the sum 11", limits: { ...ONE, sum: r(11, 11) }, questions: ["2 +9", "3 +8", "4 +7", "5 +6", "6 +5", "7 +4", "8 +3", "9 +2"].map(q) },
    { name: "fewer digits below", limits: { ...WIDE, a: r(9, 10), b: r(9, 10) }, questions: ["9 +9", "10 +9", "10 +10"].map(q) },
    { name: "a zero in the tens", limits: { ...THREE, a: r(198, 203), b: r(101, 101), aZeroInTens: "only" }, questions: plus(101, "200 201 202 203") },
    { name: "a carry that makes the next one", limits: { ...WIDE, aDigits: r(3, 3), b: r(8, 8), a: r(188, 199), carryChain: "only" }, questions: plus(8, "192 193 194 195 196 197 198 199") },
    { name: "no zero inside the sum", limits: { ...THREE, a: r(250, 253), b: r(148, 150), zeroInSum: "never" }, questions: ["250 +148", "250 +149", "251 +148"].map(q) },
    { name: "4 digits with a carry into the thousands and no other", limits: { ...WIDE, ...digits(4, 3), a: r(1298, 1302), b: r(700, 701), ...NO_CARRY, carries: r(1, 1), carryIntoThousands: r(1, 1) }, questions: [...plus(700, "1300 1301 1302"), ...plus(701, "1300 1301 1302")] },
  ],
  witnesses: [
    { limit: "aDigits", limits: { ...WIDE, aDigits: r(2, 3) }, inside: q("999 +9"), outside: q("1000 +9") },
    { limit: "aDigits", limits: { ...WIDE, aDigits: r(2, 3) }, inside: q("10 +9"), outside: q("9 +9") },
    { limit: "bDigits", limits: { ...WIDE, bDigits: r(2, 3) }, inside: q("1234 +999"), outside: q("1234 +1000") },
    { limit: "bDigits", limits: { ...WIDE, bDigits: r(2, 3) }, inside: q("1234 +10"), outside: q("1234 +9") },
    { limit: "a", limits: { ...WIDE, a: r(23, 345) }, inside: q("345 +67"), outside: q("346 +67") },
    { limit: "a", limits: { ...WIDE, a: r(23, 345) }, inside: q("23 +11"), outside: q("22 +11") },
    { limit: "b", limits: { ...WIDE, b: r(19, 190) }, inside: q("345 +190"), outside: q("345 +191") },
    { limit: "b", limits: { ...WIDE, b: r(19, 190) }, inside: q("345 +19"), outside: q("345 +18") },
    { limit: "sum", limits: { ...WIDE, sum: r(100, 999) }, inside: q("500 +499"), outside: q("500 +500") },
    { limit: "sum", limits: { ...WIDE, sum: r(100, 999) }, inside: q("50 +50"), outside: q("50 +49") },
    { limit: "carries", limits: { ...WIDE, carries: r(0, 1) }, inside: q("27 +95"), outside: q("127 +95") },
    { limit: "carries", limits: { ...WIDE, carries: r(2, 2) }, inside: q("127 +95"), outside: q("27 +95") },
    { limit: "carryIntoTens", limits: { ...WIDE, carryIntoTens: r(0, 0) }, inside: q("152 +67"), outside: q("152 +68") },
    { limit: "carryIntoTens", limits: { ...WIDE, carryIntoTens: r(1, 1) }, inside: q("15 +5"), outside: q("15 +4") },
    { limit: "carryIntoHundreds", limits: { ...WIDE, carryIntoHundreds: r(0, 0) }, inside: q("64 +72"), outside: q("164 +72") },
    { limit: "carryIntoHundreds", limits: { ...WIDE, carryIntoHundreds: r(1, 1) }, inside: q("164 +72"), outside: q("64 +72") },
    { limit: "carryIntoThousands", limits: { ...WIDE, carryIntoThousands: r(0, 0) }, inside: q("640 +720"), outside: q("1640 +720") },
    { limit: "carryIntoThousands", limits: { ...WIDE, carryIntoThousands: r(1, 1) }, inside: q("1640 +720"), outside: q("640 +720") },
    { limit: "carryChain", limits: { ...WIDE, carryChain: "never" }, inside: q("185 +38"), outside: q("165 +38") },
    { limit: "carryChain", limits: { ...WIDE, carryChain: "never" }, inside: q("95 +8"), outside: q("195 +8") },
    { limit: "carryChain", limits: { ...WIDE, carryChain: "only" }, inside: q("195 +8"), outside: q("95 +8") },
    { limit: "aZeroInOnes", limits: { ...WIDE, aZeroInOnes: "never" }, inside: q("21 +10"), outside: q("20 +10") },
    { limit: "aZeroInOnes", limits: { ...WIDE, aZeroInOnes: "only" }, inside: q("20 +13"), outside: q("21 +10") },
    { limit: "aZeroInTens", limits: { ...WIDE, aZeroInTens: "never" }, inside: q("310 +101"), outside: q("301 +110") },
    { limit: "aZeroInTens", limits: { ...WIDE, aZeroInTens: "only" }, inside: q("301 +110"), outside: q("30 +10") },
    { limit: "aZeroInHundreds", limits: { ...WIDE, aZeroInHundreds: "never" }, inside: q("3100 +1000"), outside: q("3011 +1100") },
    { limit: "aZeroInHundreds", limits: { ...WIDE, aZeroInHundreds: "only" }, inside: q("3011 +1100"), outside: q("300 +100") },
    { limit: "bZeroInOnes", limits: { ...WIDE, bZeroInOnes: "never" }, inside: q("20 +11"), outside: q("21 +10") },
    { limit: "bZeroInOnes", limits: { ...WIDE, bZeroInOnes: "only" }, inside: q("21 +10"), outside: q("20 +1") },
    { limit: "bZeroInTens", limits: { ...WIDE, bZeroInTens: "never" }, inside: q("301 +110"), outside: q("310 +101") },
    { limit: "bZeroInTens", limits: { ...WIDE, bZeroInTens: "only" }, inside: q("310 +101"), outside: q("310 +10") },
    { limit: "bZeroInHundreds", limits: { ...WIDE, bZeroInHundreds: "never" }, inside: q("3011 +1100"), outside: q("3100 +1011") },
    { limit: "bZeroInHundreds", limits: { ...WIDE, bZeroInHundreds: "only" }, inside: q("3100 +1011"), outside: q("3100 +100") },
    { limit: "zeroInSum", limits: { ...WIDE, zeroInSum: "never" }, inside: q("58 +57"), outside: q("58 +47") },
    { limit: "zeroInSum", limits: { ...WIDE, zeroInSum: "never" }, inside: q("15 +15"), outside: q("1015 +15") },
  ],
  harder: [
    { name: "a digit more in the top number than the hardest with fewer", easier: q("9 +9"), harder: q("10 +1") },
    { name: "a carry with 1 digit below more than none with 2", easier: q("98 +91"), harder: q("15 +6") },
    { name: "a digit more below, with no carry", easier: q("15 +4"), harder: q("15 +14") },
    { name: "3 digits more than the hardest of 2", easier: q("99 +99"), harder: q("100 +1") },
    { name: "4 digits more than the hardest of 3", easier: q("999 +999"), harder: q("1000 +1") },
    { name: "a carry", easier: q("45 +34"), harder: q("15 +16") },
    { name: "a carry more than a sum past one hundred", easier: q("83 +96"), harder: q("15 +16") },
    { name: "two carries", easier: q("947 +948"), harder: q("158 +167") },
    { name: "three carries", easier: q("9927 +9958"), harder: q("1158 +1967") },
    { name: "a carry that makes the next one", easier: q("989 +988"), harder: q("157 +145") },
    { name: "two carries that make no other, more than one carry", easier: q("191 +191"), harder: q("185 +127") },
    { name: "larger numbers", easier: q("15 +16"), harder: q("16 +16") },
    { name: "larger numbers with no carry", easier: q("12 +23"), harder: q("41 +23") },
  ],
  examples: ([
    ["a carry", "27 +45", ["7 + 5 = 12, write 2, carry 1", "2 + 4 = 6, plus 1 is 7", "72"], ["w2@0 c1@1", "w7@1"]],
    ["no carry", "32 +15", ["2 + 5 = 7, write 7", "3 + 1 = 4", "47"], ["w7@0", "w4@1"]],
    ["the smallest question", "1 +1", ["1 + 1 = 2", "2"], ["w2@0"]],
    ["1 digit past ten", "7 +8", ["7 + 8 = 15", "15"], ["w5@0 w1@1"]],
    ["no digit below, with no carry", "45 +3", ["5 + 3 = 8, write 8", "4, write 4", "48"], ["w8@0", "w4@1"]],
    ["no digit below, with a carry", "47 +8", ["7 + 8 = 15, write 5, carry 1", "4, plus 1 is 5", "55"], ["w5@0 c1@1", "w5@1"]],
    ["a carry that makes the next one with no digit below", "195 +8", ["5 + 8 = 13, write 3, carry 1", "9, plus 1 is 10, write 0, carry 1", "1, plus 1 is 2", "203"], ["w3@0 c1@1", "w0@1 c1@2", "w2@2"]],
    ["a carry that is written", "95 +8", ["5 + 8 = 13, write 3, carry 1", "9, plus 1 is 10", "103"], ["w3@0 c1@1", "w0@1 w1@2"]],
    ["columns with no digit below and no carry", "3214 +5", ["4 + 5 = 9, write 9", "1, write 1", "2, write 2", "3, write 3", "3219"], ["w9@0", "w1@1", "w2@2", "w3@3"]],
    ["a carry that stops", "1258 +67", ["8 + 7 = 15, write 5, carry 1", "5 + 6 = 11, plus 1 is 12, write 2, carry 1", "2, plus 1 is 3, write 3", "1, write 1", "1325"], ["w5@0 c1@1", "w2@1 c1@2", "w3@2", "w1@3"]],
    ["zeros in both numbers", "300 +200", ["0 + 0 = 0, write 0", "0 + 0 = 0, write 0", "3 + 2 = 5", "500"], ["w0@0", "w0@1", "w5@2"]],
    ["the widest question", "9999 +9999", ["9 + 9 = 18, write 8, carry 1", "9 + 9 = 18, plus 1 is 19, write 9, carry 1", "9 + 9 = 18, plus 1 is 19, write 9, carry 1", "9 + 9 = 18, plus 1 is 19", "19998"], ["w8@0 c1@1", "w9@1 c1@2", "w9@2 c1@3", "w9@3 w1@4"]],
  ] as const).map(([name, rows, texts, marks]) => ({
    name, rows: q(rows), answer: { kind: "whole-number" as const, value: texts[texts.length - 1] }, steps: texts.map((text, i) => step(text, marks[i])),
  })),
  refusedLimits: [
    { name: "not an object", raw: "wide", problem: "the limits must be an object" },
    { name: "a missing limit", raw: { ...SIX, sum: undefined }, problem: "sum must have min and max" },
    { name: "a wrong type", raw: { ...SIX, a: { min: "21", max: 22 } }, problem: "a.min must be a whole number" },
    { name: "a fraction", raw: { ...SIX, b: r(14.5, 16) }, problem: "b.min must be a whole number" },
    { name: "a turned range", raw: { ...SIX, a: r(22, 21) }, problem: "a.min is more than a.max" },
    { name: "a number with 5 digits", raw: { ...SIX, b: r(14, 10_000) }, problem: "b must be from 1 to 9999" },
    { name: "a zero", raw: { ...SIX, b: r(0, 16) }, problem: "b must be from 1 to 9999" },
    { name: "5 digits", raw: { ...SIX, aDigits: r(2, 5) }, problem: "aDigits must be from 1 to 4" },
    { name: "four carries", raw: { ...SIX, carries: r(0, 4) }, problem: "carries must be from 0 to 3" },
    { name: "a carry of 2", raw: { ...SIX, carryIntoTens: r(0, 2) }, problem: "carryIntoTens must be from 0 to 1" },
    { name: "a sum that is too large", raw: { ...SIX, sum: r(2, 19_999) }, problem: "sum must be from 2 to 19998" },
    { name: "an unknown word", raw: { ...SIX, zeroInSum: "only" }, problem: 'zeroInSum must be "never" or "allowed"' },
    { name: "another unknown word", raw: { ...SIX, carryChain: "sometimes" }, problem: 'carryChain must be "never" or "allowed" or "only"' },
    { name: "an unknown limit", raw: { ...SIX, zeroInTens: "never" }, problem: 'unknown limit "zeroInTens"' },
    { name: "a carry that the sum cannot have", raw: { ...TWO, sum: r(20, 22), carries: r(1, 1) }, problem: "no question meets these limits (a wider bDigits or sum or carries has some)" },
    { name: "a carry into a column that is not there", raw: { ...TWO, carryIntoHundreds: r(1, 1) }, problem: "no question meets these limits (a wider aDigits or carryIntoHundreds has some)" },
    { name: "more digits below than on top", raw: { ...WIDE, ...digits(2, 3) }, problem: "no question meets these limits (a wider aDigits or bDigits has some)" },
    { name: "digits that the range of the number does not have", raw: { ...WIDE, bDigits: r(3, 3), b: r(10, 99) }, problem: "no question meets these limits (a wider bDigits or b has some)" },
    { name: "limits that no one change can mend", raw: { ...ONE, sum: r(150, 160), carries: r(3, 3) }, problem: "no question meets these limits" },
    { name: "a zero in a place that the number does not have", raw: { ...TWO, aZeroInTens: "only" }, problem: "no question meets these limits (a wider aDigits or aZeroInTens has some)" },
  ],
  refusedRows: ([
    ["nothing", []], ["one row", ["24"]], ["three rows", ["24", "+3", "27"]], ["turned rows", ["+3", "24"]], ["another sign", ["24", "-3"]], ["a times sign", ["24", "×3"]], ["no sign", ["24", "3"]],
    ["the sign after the number", ["24", "3+"]], ["the sign in the top row", ["+24", "3"]], ["more digits below", ["24", "+100"]], ["five digits on top", ["12345", "+3"]], ["five digits below", ["12345", "+12345"]],
    ["a zero in front", ["04", "+3"]], ["a zero in front below", ["24", "+03"]], ["a zero below", ["24", "+0"]], ["a zero on top", ["0", "+3"]], ["an empty row", ["", "+3"]], ["no number below", ["24", "+"]],
    ["a space", ["2 4", "+3"]], ["a comma", ["1,234", "+3"]], ["digits of another script", ["٢٤", "+3"]],
  ] as const).map(([name, rows]) => ({ name, rows })),
};
