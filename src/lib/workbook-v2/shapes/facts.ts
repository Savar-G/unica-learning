// Facts on one line: 7 + 5 =, 12 - 5 = and 5 × 7 =. One operation makes one shape. `tables` is the set of first numbers.
// An ordered row prints one table in order, one second number after the other.
import type { Face, Step } from "../contract";
import { readLimitFields, readLimitsThat, wholeNumber, within, type Item, type Range, type Shape } from "./shape";
import { smallSpace } from "./small-space";

export type FactOrder = "mixed" | "up" | "down";
export interface FactLimits { tables: number[]; second: Range; result: Range; order: FactOrder }
export interface FactQuestion { a: number; b: number }

interface Operation {
  id: string;
  sign: string;
  /** The largest first and second number, and the largest result. */
  most: { a: number; b: number; result: number };
  result(q: FactQuestion): number;
  /** The same result by counting, so that the second computation shares nothing with the first. */
  count(a: number, b: number): number;
  /** Whether the numbers may change places. */
  swaps: boolean;
  score(q: FactQuestion): number;
}

function counted(from: number, times: number, step: number): number {
  let at = from;
  for (let i = 0; i < times; i++) at += step;
  return at;
}

/** Whether the ones of the two numbers pass a ten. */
const passesTen = ({ a, b }: FactQuestion) => (a % 10) + (b % 10) > 10;
/** Whether the first number has fewer ones than go away. */
const breaksTen = ({ a, b }: FactQuestion) => a % 10 < b % 10;

/** The order in which tables get harder: 0, 1, 2, 10 and 5 first, then by size. */
const TABLES = [0, 1, 2, 10, 5, 3, 4, 6, 7, 8, 9];
export const tableRank = (n: number): number => TABLES.indexOf(n);
/** The easier of the two tables decides, then the other one. */
export const timesScore = (a: number, b: number): number => Math.min(tableRank(a), tableRank(b)) * TABLES.length + Math.max(tableRank(a), tableRank(b));

const ADD: Operation = {
  id: "fact.add", sign: "+", most: { a: 20, b: 20, result: 20 }, swaps: true,
  result: ({ a, b }) => a + b, count: (a, b) => counted(a, b, 1),
  // From the first difference on: passing a ten, then the larger sum, then the larger of the two smaller numbers.
  score: (q) => (passesTen(q) ? 1000 : 0) + (q.a + q.b) * 21 + Math.min(q.a, q.b),
};
const SUBTRACT: Operation = {
  id: "fact.sub", sign: "-", most: { a: 20, b: 20, result: 20 }, swaps: false,
  result: ({ a, b }) => a - b, count: (a, b) => counted(a, b, -1),
  // From the first difference on: breaking a ten, then the larger first number, then how far the second one is from both ends.
  score: (q) => (breaksTen(q) ? 1000 : 0) + q.a * 21 + Math.min(q.b, q.a - q.b),
};
const MULTIPLY: Operation = {
  id: "fact.mul", sign: "×", most: { a: 10, b: 10, result: 100 }, swaps: true,
  result: ({ a, b }) => a * b, count: (a, b) => counted(0, a, b),
  score: ({ a, b }) => timesScore(a, b),
};

const upTo = (max: number): Range => ({ min: 0, max });

/** Every row in order: the parts of one table when a table is long enough, and otherwise of the tables one after the other. */
export function tableRuns<Q>(tables: readonly Q[][], order: FactOrder, items: number): Q[][] | null {
  if (order === "mixed") return null;
  const long = tables.filter((t) => t.length >= items);
  const runs = (long.length > 0 ? long : [tables.flat()]).flatMap((all) => Array.from({ length: Math.max(0, all.length - items + 1) }, (_, start) => all.slice(start, start + items)));
  return order === "up" ? runs : runs.map((run) => run.reverse());
}

function factShape({ id, sign, most, result, count, swaps, score }: Operation): Shape<FactLimits, FactQuestion> {
  const answer = (q: FactQuestion) => wholeNumber(result(q));
  const item = (question: FactQuestion): Item<FactQuestion> => ({ question, answer: answer(question) });
  const inSpace = ({ a, b }: FactQuestion) => a <= most.a && b <= most.b && within(result({ a, b }), upTo(most.result));
  const isInside = (q: FactQuestion, { tables, second, result: results }: FactLimits) => tables.includes(q.a) && within(q.b, second) && within(result(q), results);

  /** The questions of one table, the second number rising. */
  function table(a: number, limits: FactLimits): FactQuestion[] {
    const out: FactQuestion[] = [];
    for (let b = limits.second.min; b <= limits.second.max; b++) if (inSpace({ a, b }) && isInside({ a, b }, limits)) out.push({ a, b });
    return out;
  }
  const list = (limits: FactLimits) => limits.tables.flatMap((a) => table(a, limits));

  return {
    id,
    version: 1,
    answerKind: "whole-number",
    readLimits: (raw) => readLimitsThat<FactLimits>(readLimitFields(raw, { second: upTo(most.b), result: upTo(most.result) }, { order: ["mixed", "up", "down"] }, { tables: upTo(most.a) }), (l) => list(l).length),
    ...smallSpace({ list, item, difficulty: score, width: (q) => Math.max(...[q.a, q.b, result(q)].map((n) => String(n).length)) }),
    answer,
    solveAgain(rows) {
      const [row, ...more] = rows;
      const [, first, printedSign, second] = /^(0|[1-9]\d?)([-+×])(0|[1-9]\d?)=□$/.exec(row ?? "") ?? [];
      if (more.length > 0 || printedSign !== sign) return null;
      const [a, b] = [Number(first), Number(second)];
      const counts = count(a, b);
      return a <= most.a && b <= most.b && counts >= 0 && counts <= most.result ? { question: { a, b }, answer: wholeNumber(counts) } : null;
    },
    steps: (q): Step[] => [{ text: `${q.a} ${sign} ${q.b} = ${result(q)}`, marks: [] }, { text: String(result(q)), marks: [] }],
    face: ({ a, b }): Face => ({ kind: "equation", tokens: [{ text: String(a) }, { text: sign }, { text: String(b) }, { text: "=" }, { blank: "answer" }] }),
    orderedRuns: (limits, items) => tableRuns(limits.tables.map((a) => table(a, limits)), limits.order, items),
    ...(swaps ? { swapped: (q: FactQuestion, limits: FactLimits) => {
      const turned = { a: q.b, b: q.a };
      return q.a === q.b ? null : { question: turned, inLimits: isInside(turned, limits) };
    } } : {}),
  };
}

export const factAdd = factShape(ADD);
export const factSub = factShape(SUBTRACT);
export const factMul = factShape(MULTIPLY);
