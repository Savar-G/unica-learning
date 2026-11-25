// Column subtraction: a top number of 1 to 4 digits, and a lower one that is not more. A place that cannot subtract gets
// ten from the nearest place above it that has something to give. Over zeros the ten is handed down place by place, so
// each place gives one time at most and 4 digits have 3 borrows at most. No zero in front of the answer is written.
import { pick } from "../hash";
import type { Answer, Step, StepMark } from "../contract";
import {
  chooseQuestion, countQuestions, NOT_ONLY, NUMBER_RANGES, numberRules, readColumnLimits, scoreOf, scoreRange, widestQuestion, WORD, ZERO_WORDS,
  type ColumnQuestion, type ColumnRules, type NumberLimits, type Word,
} from "./column-count";
import type { Item, Range, Shape } from "./shape";

export interface SubColumnLimits extends NumberLimits {
  difference: Range;
  /** How many places give a ten. */
  borrows: Range;
  borrowFromTens: Range;
  borrowFromHundreds: Range;
  borrowFromThousands: Range;
  /** A borrow that a zero of the top number must get first from the place above (302 - 147), and one over two zeros. */
  acrossZero: Word;
  acrossTwoZeros: Word;
  /** A column with the same printed digit twice. */
  equalDigits: Word;
  /** The answer 0. */
  zeroAnswer: Word;
  /** An answer with fewer digits than the top number. */
  shorterAnswer: Word;
}
export type SubColumnQuestion = ColumnQuestion;

const ONE = { min: 0, max: 1 };
const RANGES = { ...NUMBER_RANGES, difference: { min: 0, max: 9998 }, borrows: { min: 0, max: 3 }, borrowFromTens: ONE, borrowFromHundreds: ONE, borrowFromThousands: ONE };
const WORDS = { acrossZero: WORD, acrossTwoZeros: WORD, equalDigits: WORD, zeroAnswer: NOT_ONLY, shorterAnswer: WORD, ...ZERO_WORDS };

export const subColumnRules = (l: SubColumnLimits): ColumnRules => ({
  ...numberRules(l), sign: "-", passes: l.borrows, passAt: [l.borrowFromTens, l.borrowFromHundreds, l.borrowFromThousands],
  result: l.zeroAnswer === "never" ? { ...l.difference, min: Math.max(1, l.difference.min) } : l.difference,
  acrossZero: l.acrossZero, acrossTwoZeros: l.acrossTwoZeros, equalDigits: l.equalDigits, shorter: l.shorterAnswer,
});

const UNITS = ["one", "ten", "hundred", "thousand"];
const count = (n: number, place: number): string => `${n} ${UNITS[place]}${n === 1 ? "" : "s"}`;
const onTop = (mark: "cross-out" | "borrow", place: number, n: number): StepMark => ({ mark, row: "top", place, digit: String(n) });

/** The top number of a place and the place that gives to it, after a borrow from `from`. It changes the numbers. */
function borrow(top: number[], from: number): Step {
  const [shown, given] = [top[from], top[from] - 1];
  top[from] = given;
  top[from - 1] += 10;
  return {
    text: `borrow 1 ${UNITS[from]}, ${count(shown, from)} ${shown === 1 ? "becomes" : "become"} ${count(given, from)}`,
    marks: [onTop("cross-out", from, shown), onTop("borrow", from, given), onTop("borrow", from - 1, top[from - 1])],
  };
}

/** One column: the borrows before it, what the top place shows then, and its own step. */
interface Column { borrows: Step[]; top: number; low: number | undefined; value: number }

function columns({ a, b }: SubColumnQuestion): Column[] {
  const [top, lows] = [a, b].map((n) => [...String(n)].reverse().map(Number));
  return top.map((_, place) => {
    const low = lows.at(place);
    const borrows: Step[] = [];
    if (top[place] < (low ?? 0)) {
      const giver = top.findIndex((n, i) => i > place && n > 0);
      for (let from = giver; from > place; from--) borrows.push(borrow(top, from));
    }
    return { borrows, top: top[place], low, value: top[place] - (low ?? 0) };
  });
}

/** The answer is what the columns leave, with no zero in front. */
const valueOf = (all: readonly Column[]): string => all.map(({ value }) => value).reverse().join("").replace(/^0+(?=\d)/, "");
const answer = (q: SubColumnQuestion): Answer => ({ kind: "whole-number", value: valueOf(columns(q)) });
const item = (question: SubColumnQuestion): Item<SubColumnQuestion> => ({ question, answer: answer(question) });

/** Reads the two printed rows as whole numbers and subtracts these, with no look at a column. */
function solveAgain(rows: readonly string[]): Item<SubColumnQuestion> | null {
  const [top, low, ...more] = rows;
  if (more.length > 0 || !/^[1-9][0-9]{0,3}$/.test(top ?? "") || !/^-[1-9][0-9]{0,3}$/.test(low ?? "")) return null;
  const left = BigInt(top) - BigInt(low.slice(1));
  return left < 0 ? null : { question: { a: Number(top), b: Number(low.slice(1)) }, answer: { kind: "whole-number", value: String(left) } };
}

function steps(q: SubColumnQuestion): Step[] {
  const all = columns(q);
  const value = valueOf(all);
  const working = all.flatMap(({ borrows, top, low, value: left }, place): Step[] => {
    const isWritten = place < value.length;
    // A first digit that became 0 has nothing below it and nothing to write.
    if (!isWritten && low === undefined) return borrows;
    const line = low === undefined ? String(top) : `${top} - ${low} = ${left}`;
    const isBare = isWritten && low !== undefined && place === all.length - 1;
    const text = isBare ? line : `${line}, write ${isWritten ? left : "nothing"}`;
    return [...borrows, { text, marks: isWritten ? [{ mark: "write", place, digit: String(left) }] : [] }];
  });
  return [...working, { text: value, marks: [] }];
}

function difficulty(q: SubColumnQuestion): number {
  const [tops, lows] = [q.a, q.b].map((n) => [...String(n)].reverse().map(Number));
  let [gave, passes, chain, run, zerosCrossed] = [false, 0, false, 0, 0];
  tops.forEach((top, place) => {
    const low = lows.at(place) ?? 0;
    const gets = top - low - (gave ? 1 : 0) < 0;
    run = gave && top === 0 ? run + 1 : 0;
    zerosCrossed = Math.max(zerosCrossed, run);
    chain ||= gave && gets && (top === 0 || top === low);
    passes += gets ? 1 : 0;
    gave = gets;
  });
  return scoreOf({ digits: tops.length, passes, chain, zerosCrossed }, q);
}

export const subColumn: Shape<SubColumnLimits, SubColumnQuestion> = {
  id: "sub.column",
  version: 1,
  answerKind: "whole-number",
  readLimits: (raw) => readColumnLimits(raw, RANGES, WORDS, subColumnRules),
  generate: (limits, seed) => item(chooseQuestion(subColumnRules(limits), (n) => pick(seed, n))),
  answer,
  solveAgain,
  steps,
  difficulty,
  difficultyRange: (limits) => scoreRange(subColumnRules(limits)),
  worstCase: (limits) => item(widestQuestion(subColumnRules(limits))),
  count: (limits) => countQuestions(subColumnRules(limits)),
  face: ({ a, b }) => ({ kind: "column", top: String(a), sign: "-", bottom: String(b) }),
};
