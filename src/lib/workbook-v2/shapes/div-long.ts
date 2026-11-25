// Long division: 2 and 3 digits by 2 to 9, one digit of the quotient at a time: 437 ÷ 6 = 72 R5. There are 7,920 pairs of
// numbers. The facts that the limits ask of each pair are one whole number of bits, made one time, so that each call
// finds the pairs of its limits quickly: it makes a temporary list of their places, and the seed picks one of them.
import { answerLine } from "../contract";
import { pick } from "../hash";
import { answerOf, divisionSteps, faceOf, FORMS, identity, partsOf, placesOf, readDivisionLimits, readRemainder, remainderRange, workLinesOf, type DivisionForm, type DivisionQuestion, type RemainderLimit } from "./division";
import { solveDivision } from "./division-rows";
import { tableRank } from "./facts";
import { readLimitFields, within, type Item, type Range, type Shape } from "./shape";

type Word = "never" | "allowed" | "only";
const WORD: readonly Word[] = ["never", "allowed", "only"];

export interface DivLongLimits {
  dividendDigits: Range;
  dividend: Range;
  divisor: Range;
  quotient: Range;
  quotientDigits: Range;
  remainder: RemainderLimit;
  /** Whether the first digit is enough, or the first two are used together. */
  start: "one" | "two" | "either";
  /** A digit 0 of the dividend that comes down. */
  bringDownZero: Word;
  /** A 0 of the quotient between its first and last digit, and one at its end. */
  zeroInside: Word;
  zeroAtEnd: Word;
  /** How many digits of the quotient, before the last one, leave something. */
  leftOver: Range;
  form: DivisionForm;
}

const DIVIDENDS: Range = { min: 10, max: 999 };
const DIVISORS: Range = { min: 2, max: 9 };
const RANGES = { dividendDigits: { min: 2, max: 3 }, dividend: DIVIDENDS, divisor: DIVISORS, quotient: { min: 1, max: 499 }, quotientDigits: { min: 1, max: 3 }, leftOver: { min: 0, max: 2 } };
const WIDEST: Omit<DivLongLimits, "form"> = { ...RANGES, remainder: "any", start: "either", bringDownZero: "allowed", zeroInside: "allowed", zeroAtEnd: "allowed" };

/** The pairs of one divisor: one for each dividend. */
const DIVIDEND_COUNT = DIVIDENDS.max - DIVIDENDS.min + 1;
const PAIRS = Array.from({ length: DIVIDEND_COUNT * (DIVISORS.max - DIVISORS.min + 1) }, (_, index) => ({ dividend: DIVIDENDS.min + (index % DIVIDEND_COUNT), divisor: DIVISORS.min + Math.floor(index / DIVIDEND_COUNT) }));

/** What the limits ask of a pair, next to its two numbers and its quotient. */
interface Facts { dividendDigits: number; quotientDigits: number; remainder: number; leftOver: number; start: "one" | "two"; bringDownZero: boolean; zeroInside: boolean; zeroAtEnd: boolean; zeros: number }

function factsOf(dividend: number, divisor: number): Facts {
  const places = placesOf(dividend, divisor);
  const last = places.length - 1;
  const dividendDigits = String(dividend).length;
  const isZero = places.map((p) => p.times === 0);
  return {
    dividendDigits, quotientDigits: places.length, remainder: places[last].rest, start: places.length === dividendDigits ? "one" : "two",
    leftOver: places.slice(0, last).filter((p) => p.rest > 0).length, bringDownZero: places.some((p) => p.next === 0),
    zeroInside: isZero.slice(1, last).includes(true), zeroAtEnd: isZero[last], zeros: isZero.filter(Boolean).length,
  };
}

/** The facts that limits ask for, with their values. */
type Asked = Exclude<keyof Facts, "zeros">;
const YES_NO = [false, true];
const ASKED: { [N in Asked]: readonly Facts[N][] } = {
  dividendDigits: [2, 3], quotientDigits: [1, 2, 3], remainder: [0, 1, 2, 3, 4, 5, 6, 7, 8], leftOver: [0, 1, 2], start: ["one", "two"],
  bringDownZero: YES_NO, zeroInside: YES_NO, zeroAtEnd: YES_NO,
};
/** Each value of each fact has one bit. A pair has one bit of each fact, and limits have the bits that they refuse. */
const VALUES = (Object.keys(ASKED) as Asked[]).flatMap((name) => ASKED[name].map((value) => ({ name, value })));

const FACTS = PAIRS.map(({ dividend, divisor }) => factsOf(dividend, divisor));
const BITS = Int32Array.from(FACTS, (facts) => VALUES.reduce((bits, { name, value }, i) => (facts[name] === value ? bits | (1 << i) : bits), 0));

function allows(limits: DivLongLimits, name: Asked, value: Facts[Asked]): boolean {
  const limit = name === "remainder" ? remainderRange(limits.remainder) : limits[name];
  if (typeof limit !== "string") return within(Number(value), limit);
  if (typeof value === "string") return limit === "either" || limit === value;
  return limit === "allowed" || (limit === "only") === value;
}

/** The pairs inside the limits, in the order of the divisors and then of the dividends. */
function pairsOf(limits: DivLongLimits): number[] {
  const refused = VALUES.reduce((bits, { name, value }, i) => (allows(limits, name, value) ? bits : bits | (1 << i)), 0);
  const { dividend: dividends, divisor: divisors, quotient: quotients } = limits;
  const found: number[] = [];
  for (let divisor = divisors.min; divisor <= divisors.max; divisor++) {
    const start = (divisor - DIVISORS.min) * DIVIDEND_COUNT - DIVIDENDS.min;
    const first = Math.max(dividends.min, quotients.min * divisor);
    const last = Math.min(dividends.max, quotients.max * divisor + divisor - 1);
    for (let dividend = first; dividend <= last; dividend++) if ((BITS[start + dividend] & refused) === 0) found.push(start + dividend);
  }
  return found;
}

/**
 * From the first difference on: more digits in the quotient, more zeros in it, more digits in the dividend, more digits
 * that leave something, a zero that comes down, something left at the end, the harder table, then the larger dividend.
 */
function scoreOf(dividend: number, divisor: number, facts: Facts): number {
  const { quotientDigits, zeros, dividendDigits, leftOver, bringDownZero, remainder } = facts;
  return [[zeros, 3], [dividendDigits, 4], [leftOver, 3], [bringDownZero ? 1 : 0, 2], [remainder > 0 ? 1 : 0, 2], [tableRank(divisor), 11], [dividend, 1000]]
    .reduce((score, [value, size]) => score * size + value, quotientDigits);
}

const SCORES = Float64Array.from(PAIRS, ({ dividend, divisor }, index) => scoreOf(dividend, divisor, FACTS[index]));

const item = (index: number, { form, remainder }: DivLongLimits): Item<DivisionQuestion> => {
  const question: DivisionQuestion = { ...PAIRS[index], form, parts: partsOf(remainder) };
  return { question, answer: answerOf(question) };
};

/** The most digits inside, then the most in the quotient: the widest in both, because 3 digits have 2 or 3 in the quotient. */
const widthOf = (index: number): number => FACTS[index].dividendDigits * 4 + FACTS[index].quotientDigits;

export const divLong: Shape<DivLongLimits, DivisionQuestion> = {
  id: "div.long",
  version: 1,
  answerKind: "whole-number",
  readLimits: (raw) => readDivisionLimits<DivLongLimits>(
    readLimitFields(raw, RANGES, { start: ["one", "two", "either"], bringDownZero: WORD, zeroInside: WORD, zeroAtEnd: WORD, form: FORMS }, {}, { remainder: readRemainder }),
    WIDEST, (l) => pairsOf(l).length,
  ),
  generate(limits, seed) {
    const all = pairsOf(limits);
    return item(all[pick(seed, all.length)], limits);
  },
  count: (limits) => pairsOf(limits).length,
  difficulty: ({ dividend, divisor }) => scoreOf(dividend, divisor, factsOf(dividend, divisor)),
  difficultyRange(limits) {
    const scores = pairsOf(limits).map((index) => SCORES[index]);
    return { easiest: scores.reduce((least, n) => Math.min(least, n)), hardest: scores.reduce((most, n) => Math.max(most, n)) };
  },
  worstCase(limits) {
    const widest = pairsOf(limits).reduce((most, index) => (widthOf(index) > widthOf(most) ? index : most));
    return item(widest, limits);
  },
  answer: answerOf,
  solveAgain: (rows) => solveDivision(rows, ({ dividend, divisor }) => within(dividend, DIVIDENDS) && within(divisor, DIVISORS)),
  steps: (q) => divisionSteps(q, answerLine(answerOf(q))),
  face: (q) => faceOf(q, workLinesOf(q)),
  identity,
};
