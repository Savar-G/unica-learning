// Repeated addition on one line: 4 + 4 + 4 =. Its steps are the running sums and the times sentence of the same sum.
import type { Step } from "../contract";
import { readLimitFields, readLimitsThat, wholeNumber, type Item, type Range, type Shape } from "./shape";
import { smallSpace } from "./small-space";

export interface RepeatedAddLimits { number: Range; count: Range }
export interface RepeatedAddQuestion { number: number; count: number }

const BOUNDS = { number: { min: 1, max: 10 }, count: { min: 2, max: 9 } };
const numbersOf = ({ number, count }: RepeatedAddQuestion): number[] => Array.from({ length: count }, () => number);
const answer = ({ number, count }: RepeatedAddQuestion) => wholeNumber(number * count);
const item = (question: RepeatedAddQuestion): Item<RepeatedAddQuestion> => ({ question, answer: answer(question) });

function list({ number, count }: RepeatedAddLimits): RepeatedAddQuestion[] {
  const out: RepeatedAddQuestion[] = [];
  for (let n = number.min; n <= number.max; n++) for (let c = count.min; c <= count.max; c++) out.push({ number: n, count: c });
  return out;
}

function steps({ number, count }: RepeatedAddQuestion): Step[] {
  const sums = Array.from({ length: count - 1 }, (_, i) => `${number * (i + 1)} + ${number} = ${number * (i + 2)}`);
  return [...sums, `${count} × ${number} = ${number * count}`, String(number * count)].map((text) => ({ text, marks: [] }));
}

export const repeatedAdd: Shape<RepeatedAddLimits, RepeatedAddQuestion> = {
  id: "add.repeated",
  version: 1,
  answerKind: "whole-number",
  readLimits: (raw) => readLimitsThat<RepeatedAddLimits>(readLimitFields(raw, BOUNDS, {}), (l) => list(l).length),
  // More numbers are harder, then a larger number. A longer line is wider than any number in a shorter one.
  ...smallSpace({ list, item, difficulty: ({ number, count }) => count * 11 + number, width: (q) => q.count * 10 + String(q.number * q.count).length }),
  answer,
  solveAgain(rows) {
    const [row, ...more] = rows;
    if (more.length > 0 || !/^\d+(\+\d+)+=□$/.test(row ?? "")) return null;
    const numbers = row.slice(0, -2).split("+");
    const [first] = numbers;
    if (numbers.length < 2 || numbers.length > 9 || !/^([1-9]|10)$/.test(first) || numbers.some((n) => n !== first)) return null;
    return { question: { number: Number(first), count: numbers.length }, answer: wholeNumber(numbers.reduce((sum, n) => sum + Number(n), 0)) };
  },
  steps,
  face: (q) => ({ kind: "equation", tokens: [...numbersOf(q).flatMap((n, i) => [...(i > 0 ? [{ text: "+" }] : []), { text: String(n) }]), { text: "=" }, { blank: "answer" }] }),
};
