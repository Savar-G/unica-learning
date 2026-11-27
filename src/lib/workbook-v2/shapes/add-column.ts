// Column addition: two numbers of 1 to 4 digits, the top one with at least as many digits as the other. A carry goes into
// the next written column, so 4 digits have 3 carries at most. What the last column makes is written whole: its carry is
// written, not carried. `zeroInSum` is a zero between the first digit and the ones of the sum (58 + 47 = 105).
import { pick } from "../hash";
import type { Answer, Step, StepMark } from "../contract";
import {
  chooseQuestion, columnSpace, countQuestions, NOT_ONLY, NUMBER_RANGES, numberRules, readColumnLimits, scoreOf, scoreRange, widestQuestion, WORD, ZERO_WORDS,
  type ColumnQuestion, type ColumnRules, type NumberLimits, type Word,
} from "./column-count";
import { wholeNumber, type Item, type Range, type Shape } from "./shape";

export interface AddColumnLimits extends NumberLimits {
  sum: Range;
  /** How many columns get a carry. */
  carries: Range;
  carryIntoTens: Range;
  carryIntoHundreds: Range;
  carryIntoThousands: Range;
  /** A carry that a column makes only because it gets one (195 + 8). */
  carryChain: Word;
  zeroInSum: Word;
}
export type AddColumnQuestion = ColumnQuestion;

const ONE = { min: 0, max: 1 };
const RANGES = { ...NUMBER_RANGES, sum: { min: 2, max: 19_998 }, carries: { min: 0, max: 3 }, carryIntoTens: ONE, carryIntoHundreds: ONE, carryIntoThousands: ONE };
const WORDS = { carryChain: WORD, ...ZERO_WORDS, zeroInSum: NOT_ONLY };

export const addColumnRules = (l: AddColumnLimits): ColumnRules => ({
  ...numberRules(l), sign: "+", result: l.sum, passes: l.carries, passAt: [l.carryIntoTens, l.carryIntoHundreds, l.carryIntoThousands], chain: l.carryChain, zeroInside: l.zeroInSum,
});

/** One column: its digits (the lower number may have none there), the carry that it gets and what it makes. */
interface Column { top: number; low: number | undefined; carry: number; value: number; isLast: boolean }

function columns({ a, b }: AddColumnQuestion): Column[] {
  const [tops, lows] = [a, b].map((n) => [...String(n)].reverse().map(Number));
  let carry = 0;
  return tops.map((top, place) => {
    const low = lows.at(place);
    const column = { top, low, carry, value: top + (low ?? 0) + carry, isLast: place === tops.length - 1 };
    carry = column.value >= 10 ? 1 : 0;
    return column;
  });
}

/** The answer is what the columns write. */
const valueOf = (q: AddColumnQuestion): string => columns(q).map(({ value, isLast }) => String(isLast ? value : value % 10)).reverse().join("");
const answer = (q: AddColumnQuestion): Answer => wholeNumber(valueOf(q));
const item = (question: AddColumnQuestion): Item<AddColumnQuestion> => ({ question, answer: answer(question) });

/** Reads the two printed rows as whole numbers and adds these, with no look at a column. */
function solveAgain(rows: readonly string[]): Item<AddColumnQuestion> | null {
  const [top, low, ...more] = rows;
  if (more.length > 0 || !/^[1-9][0-9]{0,3}$/.test(top ?? "") || !/^\+[1-9][0-9]{0,3}$/.test(low ?? "") || low.length - 1 > top.length) return null;
  return { question: { a: Number(top), b: Number(low.slice(1)) }, answer: wholeNumber(String(BigInt(top) + BigInt(low.slice(1)))) };
}

function columnStep({ top, low, carry, value, isLast }: Column, place: number): Step {
  const first = low === undefined ? String(top) : `${top} + ${low} = ${top + low}`;
  const line = carry > 0 ? `${first}, plus ${carry} is ${value}` : first;
  const write = (digit: string, at: number): StepMark => ({ mark: "write", place: at, digit });
  // A last column that only has its top digit says what it writes: a line with one number is the answer.
  if (isLast) return { text: line === String(top) ? `${line}, write ${top}` : line, marks: [...String(value)].reverse().map((digit, i) => write(digit, place + i)) };
  const ones = value % 10;
  return {
    text: `${line}, write ${ones}${value >= 10 ? ", carry 1" : ""}`,
    marks: [write(String(ones), place), ...(value >= 10 ? [{ mark: "carry" as const, place: place + 1, digit: "1" }] : [])],
  };
}

const steps = (q: AddColumnQuestion): Step[] => [...columns(q).map(columnStep), { text: valueOf(q), marks: [] }];

/** Two questions that differ only by the order of their numbers are equally hard: the longer number goes on top. */
function difficulty(q: AddColumnQuestion): number {
  const all = columns({ a: Math.max(q.a, q.b), b: Math.min(q.a, q.b) });
  const carrying = all.filter(({ carry }) => carry > 0);
  const chain = carrying.some(({ top, low, isLast }) => !isLast && top + (low ?? 0) === 9);
  return scoreOf({ digits: all.length, passes: carrying.length, chain, zerosCrossed: 0 }, q);
}

export const addColumn: Shape<AddColumnLimits, AddColumnQuestion> = {
  id: "add.column",
  version: 1,
  answerKind: "whole-number",
  readLimits: (raw) => readColumnLimits(raw, RANGES, WORDS, addColumnRules),
  generate: (limits, seed) => item(chooseQuestion(addColumnRules(limits), (count) => pick(seed, count))),
  answer,
  solveAgain,
  steps,
  difficulty,
  difficultyRange: (limits) => scoreRange(addColumnRules(limits)),
  worstCase: (limits) => item(widestQuestion(addColumnRules(limits))),
  count: (limits) => countQuestions(addColumnRules(limits)),
  space(limits) {
    const space = columnSpace(addColumnRules(limits));
    return { count: space.count, at: (index) => item(space.at(index)) };
  },
  face: ({ a, b }) => ({ kind: "column", top: String(a), sign: "+", bottom: String(b) }),
};
