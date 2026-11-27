// A bar model of equal groups: a bar for each group with its size in it, a bracket below all of them with a question mark,
// and "Total =" with an answer area. The space is at most 5 counts of bars by 98 sizes, so a count or a choice sums one
// range of sizes for each count of bars and keeps nothing.
import type { FigureFace, Step } from "../contract";
import { pick } from "../hash";
import { emptyProblem, readLimitFields, wholeNumber, type Item, type Range, type Shape } from "./shape";

export interface FigureBarLimits {
  /** How many bars, one for each group. */
  groups: Range;
  /** The number in each bar. */
  size: Range;
  /** The total of all bars. */
  product: Range;
}
export interface FigureBarQuestion { groups: number; size: number }

const RANGES = { groups: { min: 2, max: 6 }, size: { min: 2, max: 99 }, product: { min: 4, max: 594 } };
const PROMPT = "Total =";
const TOTAL_LABEL = "?";

/** The sizes that a count of bars allows: from `low` to `high`, none when `low` is more. */
function sizesOf({ size, product }: FigureBarLimits, groups: number): { low: number; high: number } {
  return { low: Math.max(size.min, Math.ceil(product.min / groups)), high: Math.min(size.max, Math.floor(product.max / groups)) };
}

/** Each count of bars that has a question, with its sizes, from the fewest bars. */
function countsOf(limits: FigureBarLimits): { groups: number; low: number; high: number }[] {
  const out: { groups: number; low: number; high: number }[] = [];
  for (let groups = limits.groups.min; groups <= limits.groups.max; groups++) {
    const { low, high } = sizesOf(limits, groups);
    if (low <= high) out.push({ groups, low, high });
  }
  return out;
}

const count = (limits: FigureBarLimits): number => countsOf(limits).reduce((sum, { low, high }) => sum + high - low + 1, 0);
const answer = ({ groups, size }: FigureBarQuestion) => wholeNumber(groups * size);
const item = (question: FigureBarQuestion): Item<FigureBarQuestion> => ({ question, answer: answer(question) });

/**
 * More bars are harder, then a larger size, which at one count of bars is also a larger total. So 3 bars of 99 are easier
 * than 4 bars of 2 (more groups), 4 bars of 12 are easier than 4 bars of 13 (a larger size and a larger total), and
 * 2 bars of 50 (a total of 100) are easier than 3 bars of 20 (a total of 60): the count of bars comes first.
 */
const difficulty = ({ groups, size }: FigureBarQuestion): number => groups * 100 + size;

function readLimits(raw: unknown): { ok: true; limits: FigureBarLimits } | { ok: false; problem: string } {
  const fields = readLimitFields(raw, RANGES, {});
  if (typeof fields === "string") return { ok: false, problem: fields };
  const limits = fields as unknown as FigureBarLimits;
  if (count(limits) > 0) return { ok: true, limits };
  return { ok: false, problem: emptyProblem(fields, RANGES, {}, (l) => count(l as unknown as FigureBarLimits)) };
}

function steps({ groups, size }: FigureBarQuestion): Step[] {
  const total = groups * size;
  const parts = Array.from({ length: groups }, () => String(size));
  return [`${parts.join(" + ")} = ${total}`, `${groups} × ${size} = ${total}`, String(total)].map((text) => ({ text, marks: [] }));
}

function itemAt(counts: readonly { groups: number; low: number; high: number }[], index: number): Item<FigureBarQuestion> {
  let at = index;
  for (const { groups, low, high } of counts) {
    if (at <= high - low) return item({ groups, size: low + at });
    at -= high - low + 1;
  }
  throw new Error("no question meets these limits");
}

export const figureBar: Shape<FigureBarLimits, FigureBarQuestion> = {
  id: "figure.bar",
  version: 1,
  answerKind: "whole-number",
  readLimits,
  generate(limits, seed) {
    const counts = countsOf(limits);
    const total = counts.reduce((sum, { low, high }) => sum + high - low + 1, 0);
    return itemAt(counts, pick(seed, total));
  },
  space(limits) {
    const counts = countsOf(limits);
    const total = counts.reduce((sum, { low, high }) => sum + high - low + 1, 0);
    return { count: total, at: (index) => itemAt(counts, index) };
  },
  answer,
  solveAgain(rows) {
    const [bars, total, ...more] = rows;
    if (more.length > 0 || total !== `${TOTAL_LABEL} | ${PROMPT} | □` || bars === undefined) return null;
    const parts = bars.split(" | ");
    const [first] = parts;
    if (parts.length < RANGES.groups.min || parts.length > RANGES.groups.max || !/^[1-9]\d?$/.test(first) || Number(first) < RANGES.size.min || parts.some((p) => p !== first)) return null;
    // The parts are added one by one, as the bars are read: the first computation multiplies.
    let sum = 0;
    for (const part of parts) sum += Number(part);
    return { question: { groups: parts.length, size: Number(first) }, answer: wholeNumber(sum) };
  },
  steps,
  difficulty,
  difficultyRange(limits) {
    const counts = countsOf(limits);
    const [first, last] = [counts[0], counts[counts.length - 1]];
    return { easiest: difficulty({ groups: first.groups, size: first.low }), hardest: difficulty({ groups: last.groups, size: last.high }) };
  },
  /** The most bars, each with the largest size that they allow. */
  worstCase(limits) {
    const last = countsOf(limits).at(-1);
    if (!last) throw new Error("no question meets these limits");
    return item({ groups: last.groups, size: last.high });
  },
  count,
  /** Each count of bars is a form: the bars of 2 are wider than those of 6, so each count is fitted with its largest size. */
  forms: (limits) => countsOf(limits).map(({ groups, high }) => item({ groups, size: high })),
  face: ({ groups, size }): FigureFace => ({ kind: "figure", figure: { kind: "bar-model", parts: Array.from({ length: groups }, () => String(size)), totalLabel: TOTAL_LABEL }, prompt: PROMPT, blank: "answer" }),
};
