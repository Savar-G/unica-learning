// Column multiplication: 2, 3 or 4 digits by 1 digit. A carry goes into the next written column, so a first number of 4
// digits has 3 carries at most; what the last column makes is written whole and carries nothing. `zeroInProduct` is a
// zero between the first digit and the ones of the product (26 × 4 = 104), not the zero of 15 × 2 = 30.
import { pick } from "../hash";
import type { Answer, Step, StepMark } from "../contract";
import { chooseQuestion, countQuestions, mulColumnHas, mulColumnSpace, scoreRange, widestQuestion, type Kind, type MulColumnLimits, type MulColumnQuestion } from "./mul-column-count";
import { emptyProblem, readLimitFields, wholeNumber, type Item, type Shape } from "./shape";

export type { MulColumnLimits, MulColumnQuestion } from "./mul-column-count";

const CARRY = { min: 0, max: 8 };
const RANGES = {
  digits: { min: 2, max: 4 }, a: { min: 10, max: 9999 }, b: { min: 2, max: 9 },
  carries: { min: 0, max: 3 }, carryIntoTens: CARRY, carryIntoHundreds: CARRY, carryIntoThousands: CARRY,
  product: { min: 10, max: 99_999 },
};
const WORDS = { zeroInProduct: ["never", "allowed"], wholeTens: ["never", "allowed", "only"] };

const product = ({ a, b }: MulColumnQuestion) => a * b;
const answer = (q: MulColumnQuestion): Answer => wholeNumber(product(q));
const item = (question: MulColumnQuestion): Item<MulColumnQuestion> => ({ question, answer: answer(question) });

/**
 * Reads the two printed rows and works the column method, one written digit at a time. It adds; it never multiplies, so
 * it shares nothing with `answer`, and it knows nothing of the question but its print.
 */
function solveAgain(rows: readonly string[]): Item<MulColumnQuestion> | null {
  const [top, low, ...more] = rows;
  if (more.length > 0 || !/^[1-9][0-9]{1,3}$/.test(top ?? "") || !/^×[2-9]$/.test(low ?? "")) return null;
  const times = Number(low.slice(1));
  let carry = 0;
  let written = "";
  for (const digit of [...top].reverse()) {
    let column = carry;
    for (let i = 0; i < times; i++) column += Number(digit);
    const text = String(column);
    written = text.slice(-1) + written;
    carry = Number(text.slice(0, -1));
  }
  return { question: { a: Number(top), b: times }, answer: wholeNumber(carry > 0 ? String(carry) + written : written) };
}

/** One column: what it multiplies, the carry that it adds, what it writes and what it carries. */
interface Column { digit: number; carry: number; value: number; isLast: boolean }

function columns({ a, b }: MulColumnQuestion): Column[] {
  const digits = [...String(a)].reverse().map(Number);
  let carry = 0;
  return digits.map((digit, place) => {
    const column = { digit, carry, value: b * digit + carry, isLast: place === digits.length - 1 };
    carry = Math.floor(column.value / 10);
    return column;
  });
}

const written = (value: number, place: number): StepMark[] => [...String(value)].reverse().map((digit, i) => ({ mark: "write", place: place + i, digit }));

function columnStep({ digit, carry, value, isLast }: Column, place: number, b: number): Step {
  const product = `${b} × ${digit} = ${b * digit}${carry > 0 ? `, plus ${carry} is ${value}` : ""}`;
  if (isLast) return { text: product, marks: written(value, place) };
  const [ones, next] = [value % 10, Math.floor(value / 10)];
  return {
    text: `${product}, write ${ones}${next > 0 ? `, carry ${next}` : ""}`,
    marks: [...written(ones, place), ...(next > 0 ? [{ mark: "carry" as const, place: place + 1, digit: String(next) }] : [])],
  };
}

const steps = (q: MulColumnQuestion): Step[] => [...columns(q).map((column, place) => columnStep(column, place, q.b)), { text: String(product(q)), marks: [] }];

/**
 * From the first difference on: more digits, then a larger product (one that has a digit more than the first number),
 * then more carries, then a zero in the product, then a larger multiplier. Other numbers of one kind are equally hard.
 */
const score = ({ digits, passes, carries, zero, b }: Kind): number =>
  digits * 2000 + (passes ? 1000 : 0) + carries * 200 + (zero ? 100 : 0) + b * 10;

function difficulty(q: MulColumnQuestion): number {
  const value = String(product(q));
  const all = columns(q);
  return score({ digits: all.length, passes: value.length > all.length, carries: all.filter((c) => c.carry > 0).length, zero: value.slice(1, -1).includes("0"), b: q.b });
}

function readLimits(raw: unknown): { ok: true; limits: MulColumnLimits } | { ok: false; problem: string } {
  const read = readLimitFields(raw, RANGES, WORDS);
  if (typeof read === "string") return { ok: false, problem: read };
  const limits = read as unknown as MulColumnLimits;
  if (countQuestions(limits) > 0) return { ok: true, limits };
  return { ok: false, problem: emptyProblem(read, RANGES, WORDS, (wider) => countQuestions(wider as unknown as MulColumnLimits)) };
}

export const mulColumn: Shape<MulColumnLimits, MulColumnQuestion> = {
  id: "mul.column",
  version: 2,
  answerKind: "whole-number",
  readLimits,
  generate: (limits, seed) => item(chooseQuestion(limits, (count) => pick(seed, count))),
  answer,
  solveAgain,
  steps,
  difficulty,
  difficultyRange: (limits) => scoreRange(limits, score),
  worstCase: (limits) => item(widestQuestion(limits)),
  count: countQuestions,
  space(limits) {
    const space = mulColumnSpace(limits);
    return { count: space.count, at: (index) => item(space.at(index)) };
  },
  contains: (question, limits) => mulColumnHas(limits, question),
  face: ({ a, b }) => ({ kind: "column", top: String(a), sign: "×", bottom: String(b) }),
};
