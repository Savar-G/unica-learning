// Two invented shapes that no book uses: one with a listed space and limits that interact, and one with a space that is
// too large to list. They show how a shape registers, and the tests of the harness break them.
import { pick } from "../hash";
import type { Item, Shape } from "../shapes";
import { isRecord, readRange, type Range } from "../shapes/shape";
import { neverLimit, rangeLimit, type Limits, type Rows, type ShapeRegistration } from "./shape-registration";

const r = (min: number, max: number): Range => ({ min, max });
const within = (n: number, range: Range) => n >= range.min && n <= range.max;
const whole = (value: number) => ({ kind: "whole-number" as const, value: String(value) });

/** Reads limits that are ranges, and "never" or "allowed" for the rest. */
function readAll(raw: unknown, bounds: Record<string, Range>, words: readonly string[], count: (limits: never) => number): ReturnType<Shape["readLimits"]> {
  const bad = (problem: string) => ({ ok: false as const, problem });
  if (!isRecord(raw)) return bad("the limits must be an object");
  const unknown = Object.keys(raw).find((k) => !(k in bounds) && !words.includes(k));
  if (unknown !== undefined) return bad(`unknown limit "${unknown}"`);
  const limits: Record<string, unknown> = {};
  for (const [name, bound] of Object.entries(bounds)) {
    const range = readRange(raw, name, bound);
    if (typeof range === "string") return bad(range);
    limits[name] = range;
  }
  for (const word of words) {
    if (raw[word] !== "never" && raw[word] !== "allowed") return bad(`${word} must be "never" or "allowed"`);
    limits[word] = raw[word];
  }
  return count(limits as never) > 0 ? { ok: true, limits } : bad("no question meets these limits");
}

// A 1-digit or 2-digit number plus a 1-digit number. `sum` and `a` limit the same questions.

export interface AddLimits { a: Range; b: Range; sum: Range; carry: Range; roundSum: "never" | "allowed" }
export interface AddQuestion { a: number; b: number }

const ADD_BOUNDS = { a: r(1, 30), b: r(1, 9), sum: r(2, 39), carry: r(0, 1) };
const carries = ({ a, b }: AddQuestion) => (a % 10) + b >= 10;
export const addItem = ({ a, b }: AddQuestion): Item<AddQuestion> => ({ question: { a, b }, answer: whole(a + b) });

export function addQuestions(l: AddLimits): AddQuestion[] {
  const out: AddQuestion[] = [];
  for (let a = l.a.min; a <= l.a.max; a++) {
    for (let b = l.b.min; b <= l.b.max; b++) {
      if (within(a + b, l.sum) && within(carries({ a, b }) ? 1 : 0, l.carry) && (l.roundSum === "allowed" || (a + b) % 10 !== 0)) out.push({ a, b });
    }
  }
  return out;
}

const addScore = (q: AddQuestion) => (carries(q) ? 100 : 0) + q.b;

export const addShape: Shape<AddLimits, AddQuestion> = {
  id: "test.add",
  version: 1,
  answerKind: "whole-number",
  readLimits: (raw) => readAll(raw, ADD_BOUNDS, ["roundSum"], (l: AddLimits) => addQuestions(l).length) as ReturnType<Shape<AddLimits>["readLimits"]>,
  generate(limits, seed) {
    const all = addQuestions(limits);
    return addItem(all[pick(seed, all.length)]);
  },
  answer: (q) => addItem(q).answer,
  solveAgain(rows) {
    const [top, low, ...more] = rows;
    if (more.length > 0 || !/^([1-9]|[12][0-9]|30)$/.test(top ?? "") || !/^\+[1-9]$/.test(low ?? "")) return null;
    const [a, b] = [Number(top), Number(low.slice(1))];
    return { question: { a, b }, answer: whole(a - -b) };
  },
  steps({ a, b }) {
    const [tens, ones] = [a - (a % 10), a % 10];
    return [`${ones} + ${b} = ${ones + b}`, ones + b >= 10 ? `${tens} + ${ones + b} = ${a + b}` : `The tens stay ${tens / 10}.`, String(a + b)];
  },
  difficulty: addScore,
  difficultyRange(limits) {
    const scores = addQuestions(limits).map(addScore);
    return { easiest: Math.min(...scores), hardest: Math.max(...scores) };
  },
  worstCase: (limits) => addItem(addQuestions(limits).reduce((worst, q) => (q.a + q.b > worst.a + worst.b ? q : worst))),
  count: (limits) => addQuestions(limits).length,
  face: ({ a, b }) => ({ kind: "column", top: String(a), sign: "+", bottom: String(b) }),
};

const q = (text: string): Rows => text.split(" ");
export const ADD_WIDE = { a: r(1, 30), b: r(1, 9), sum: r(2, 39), carry: r(0, 1), roundSum: "allowed" } as const;
export const ADD_SIX: Limits = { ...ADD_WIDE, a: r(21, 22), b: r(2, 4) };
export const ADD_ONE: Limits = { ...ADD_WIDE, a: r(7, 7), b: r(8, 8) };

/** Counts up, one at a time. */
function countUp(from: number, steps: number): number {
  let at = from;
  for (let i = 0; i < steps; i++) at += 1;
  return at;
}

export const addRegistration: ShapeRegistration = {
  id: "test.add",
  limits: { a: rangeLimit(1, 30), b: rangeLimit(1, 9), sum: rangeLimit(2, 39), carry: rangeLimit(0, 1), roundSum: neverLimit() },
  read(rows) {
    const found = rows.length === 2 ? /^([1-9]|[12][0-9]|30)\n\+([1-9])$/.exec(rows.join("\n")) : null;
    if (!found) return null;
    const [a, b] = [Number(found[1]), Number(found[2])];
    const sum = String(countUp(a, b));
    return {
      answer: { kind: "whole-number", value: sum },
      features: { a, b, sum: Number(sum), carry: String(countUp(Number(found[1].slice(-1)), b)).length - 1, roundSum: sum.endsWith("0") },
      widths: { sum: Number(sum) },
    };
  },
  space: Array.from({ length: 270 }, (_, i) => [String(1 + Math.floor(i / 9)), `+${1 + (i % 9)}`]),
  cases: [{ name: "every question", limits: ADD_WIDE }, { name: "a carry", limits: { ...ADD_WIDE, carry: r(1, 1), roundSum: "never" } }],
  smallSpaces: [
    { name: "one question", limits: ADD_ONE, questions: [q("7 +8")] },
    { name: "six questions", limits: ADD_SIX, questions: ["21 +2", "21 +3", "21 +4", "22 +2", "22 +3", "22 +4"].map(q) },
  ],
  witnesses: [
    { limit: "a", limits: ADD_SIX, inside: q("22 +2"), outside: q("23 +2") },
    { limit: "b", limits: ADD_SIX, inside: q("22 +4"), outside: q("22 +5") },
    { limit: "sum", limits: { ...ADD_WIDE, sum: r(10, 20) }, inside: q("11 +9"), outside: q("12 +9") },
    { limit: "carry", limits: { ...ADD_WIDE, carry: r(0, 0) }, inside: q("12 +7"), outside: q("12 +8") },
    { limit: "roundSum", limits: { ...ADD_WIDE, roundSum: "never" }, inside: q("12 +9"), outside: q("12 +8") },
  ],
  harder: [{ name: "a carry", easier: q("12 +7"), harder: q("12 +8") }, { name: "a larger number", easier: q("12 +3"), harder: q("12 +4") }],
  examples: [
    { name: "a carry", rows: q("17 +6"), answer: { kind: "whole-number", value: "23" }, steps: ["7 + 6 = 13", "10 + 13 = 23", "23"] },
    { name: "no carry", rows: q("12 +3"), answer: { kind: "whole-number", value: "15" }, steps: ["2 + 3 = 5", "The tens stay 1.", "15"] },
  ],
  stepForms: [{
    name: "the tens stay", example: "The tens stay 1.", trueFor: q("12 +3"), falseFor: q("16 +6"),
    isTrue: (step, { features: { a, carry } }) => carry === 0 && step === `The tens stay ${String(a).padStart(2, "0").at(0)}.`,
  }],
  refusedLimits: [
    { name: "not an object", raw: "bad", problem: "the limits must be an object" },
    { name: "a number that is too small", raw: { ...ADD_WIDE, a: r(0, 5) }, problem: "a must be from 1 to 30" },
    { name: "no question", raw: { ...ADD_WIDE, sum: r(2, 3), carry: r(1, 1) }, problem: "no question meets these limits" },
  ],
  refusedRows: [{ name: "nothing", rows: [] }, { name: "another sign", rows: ["2", "×3"] }, { name: "a number that is too large", rows: ["31", "+3"] }],
};

// Subtraction from a 3-digit number: about 90,000 questions, so that nothing lists them.

export interface LessLimits { a: Range; b: Range; left: Range }
export interface LessQuestion { a: number; b: number }

export const LESS_WIDE = { a: r(100, 999), b: r(1, 99), left: r(1, 998) } as const;
export const LESS_SMALL = { a: r(500, 503), b: r(40, 60), left: r(440, 460) } as const;
const lessItem = (a: number, b: number): Item<LessQuestion> => ({ question: { a, b }, answer: whole(a - b) });
/** The top numbers that go with one lower number. */
const topsOf = (l: LessLimits, b: number): Range => r(Math.max(l.a.min, b + l.left.min), Math.min(l.a.max, b + l.left.max));
const lowersOf = (l: LessLimits) => Array.from({ length: l.b.max - l.b.min + 1 }, (_, i) => l.b.min + i).filter((b) => topsOf(l, b).max >= topsOf(l, b).min);
const sizeOf = ({ min, max }: Range) => max - min + 1;
const countLess = (l: LessLimits) => lowersOf(l).reduce((sum, b) => sum + sizeOf(topsOf(l, b)), 0);

export const lessShape: Shape<LessLimits, LessQuestion> = {
  id: "test.less",
  version: 1,
  answerKind: "whole-number",
  readLimits: (raw) => readAll(raw, LESS_WIDE, [], countLess) as ReturnType<Shape<LessLimits>["readLimits"]>,
  generate(limits, seed) {
    let place = pick(seed, countLess(limits));
    for (const b of lowersOf(limits)) {
      const tops = topsOf(limits, b);
      if (place < sizeOf(tops)) return lessItem(tops.min + place, b);
      place -= sizeOf(tops);
    }
    throw new Error("the count is wrong");
  },
  answer: ({ a, b }) => lessItem(a, b).answer,
  solveAgain(rows) {
    const [top, low, ...more] = rows;
    if (more.length > 0 || !/^[1-9][0-9]{2}$/.test(top ?? "") || !/^-[1-9][0-9]?$/.test(low ?? "")) return null;
    const [a, b] = [Number(top), Number(low.slice(1))];
    return { question: { a, b }, answer: whole(a + -b) };
  },
  steps: ({ a, b }) => [`${a} - ${b} = ${a - b}`, String(a - b)],
  difficulty: ({ b }) => b,
  difficultyRange: (limits) => ({ easiest: lowersOf(limits)[0], hardest: lowersOf(limits).at(-1) ?? 0 }),
  worstCase(limits) {
    const tops = lowersOf(limits).map((b) => lessItem(topsOf(limits, b).max, b));
    return tops.reduce((worst, item) => (Number(item.answer.value) > Number(worst.answer.value) ? item : worst));
  },
  count: countLess,
  face: ({ a, b }) => ({ kind: "column", top: String(a), sign: "-", bottom: String(b) }),
};

/** For each top number in turn: the lower numbers that go with it. The shape goes the other way. */
function pairsOf(l: Limits): { a: number; low: number; high: number }[] {
  const { a, b, left } = l as unknown as LessLimits;
  const pairs = [];
  for (let top = a.min; top <= a.max; top++) {
    const [low, high] = [Math.max(b.min, top - left.max), Math.min(b.max, top - left.min)];
    if (low <= high) pairs.push({ a: top, low, high });
  }
  return pairs;
}

export const lessRegistration: ShapeRegistration = {
  id: "test.less",
  limits: { a: rangeLimit(100, 999), b: rangeLimit(1, 99), left: rangeLimit(1, 998) },
  read(rows) {
    const found = rows.length === 2 ? /^([1-9][0-9]{2})\n-([1-9][0-9]?)$/.exec(rows.join("\n")) : null;
    if (!found) return null;
    let left = Number(found[1]);
    for (let i = 0; i < Number(found[2]); i++) left -= 1;
    return { answer: { kind: "whole-number", value: String(left) }, features: { a: Number(found[1]), b: Number(found[2]), left }, widths: { left }, steps: [`${found[1]} - ${found[2]} = ${left}`, String(left)] };
  },
  space: {
    count: (l) => pairsOf(l).reduce((sum, { low, high }) => sum + high - low + 1, 0),
    easiest: (l) => { const best = pairsOf(l).reduce((x, y) => (y.low < x.low ? y : x)); return [String(best.a), `-${best.low}`]; },
    hardest: (l) => { const best = pairsOf(l).reduce((x, y) => (y.high > x.high ? y : x)); return [String(best.a), `-${best.high}`]; },
    widest: (l) => { const best = pairsOf(l).reduce((x, y) => (y.a - y.low > x.a - x.low ? y : x)); return [String(best.a), `-${best.low}`]; },
  },
  cases: [{ name: "every question", limits: LESS_WIDE }, { name: "a middle part", limits: LESS_SMALL }],
  smallSpaces: [{ name: "four questions", limits: { a: r(200, 201), b: r(5, 6), left: r(1, 998) }, questions: ["200 -5", "200 -6", "201 -5", "201 -6"].map(q) }],
  witnesses: [
    { limit: "a", limits: { ...LESS_WIDE, a: r(100, 200) }, inside: q("200 -5"), outside: q("201 -5") },
    { limit: "b", limits: { ...LESS_WIDE, b: r(5, 9) }, inside: q("200 -5"), outside: q("200 -4") },
    { limit: "left", limits: { ...LESS_WIDE, left: r(1, 195) }, inside: q("200 -5"), outside: q("200 -4") },
  ],
  harder: [{ name: "a larger number", easier: q("200 -5"), harder: q("200 -6") }],
  examples: [{ name: "over a hundred", rows: q("200 -5"), answer: { kind: "whole-number", value: "195" }, steps: ["200 - 5 = 195", "195"] }],
  refusedLimits: [{ name: "a number that is too large", raw: { ...LESS_WIDE, a: r(100, 1000) }, problem: "a must be from 100 to 999" }],
  refusedRows: [{ name: "another sign", rows: ["200", "+5"] }],
};
