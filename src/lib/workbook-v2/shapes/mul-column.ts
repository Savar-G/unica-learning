// Column multiplication: 2 digits by 1 digit. A carry is a ones product of 10 or more; the tens of the product print in
// the hundreds without one. `zeroInTens` is about the product (26 × 4 = 104), because a 2-digit number has none.
import { pick } from "../hash";
import type { Answer } from "../contract";
import { isRecord, readRange, type Item, type Range, type Shape } from "./shape";

export interface MulColumnLimits {
  a: Range;
  b: Range;
  carries: Range;
  product: Range;
  zeroInTens: "never" | "allowed";
}
export interface MulColumnQuestion { a: number; b: number }

const BOUNDS = { a: { min: 10, max: 99 }, b: { min: 2, max: 9 }, carries: { min: 0, max: 1 }, product: { min: 10, max: 999 } };
const LIMIT_NAMES = ["a", "b", "carries", "product", "zeroInTens"];

const within = (n: number, r: Range) => n >= r.min && n <= r.max;
const tensDigit = (n: number) => Math.floor(n / 10) % 10;
const carried = ({ a, b }: MulColumnQuestion) => Math.floor(((a % 10) * b) / 10);
const product = ({ a, b }: MulColumnQuestion) => a * b;

function allowed(q: MulColumnQuestion, l: MulColumnLimits): boolean {
  return within(carried(q) > 0 ? 1 : 0, l.carries) && within(product(q), l.product)
    && (l.zeroInTens === "allowed" || tensDigit(product(q)) !== 0);
}

function questions(l: MulColumnLimits): MulColumnQuestion[] {
  const out: MulColumnQuestion[] = [];
  for (let a = l.a.min; a <= l.a.max; a++) {
    for (let b = l.b.min; b <= l.b.max; b++) if (allowed({ a, b }, l)) out.push({ a, b });
  }
  return out;
}

const answerOf = (value: number): Answer => ({ kind: "whole-number", value: String(value) });
const answer = (q: MulColumnQuestion): Answer => answerOf(product(q));
const item = (question: MulColumnQuestion): Item<MulColumnQuestion> => ({ question, answer: answer(question) });

/**
 * Reads the two printed rows and works the column method, one written digit at a time. It adds; it never multiplies, so
 * it shares nothing with `answer`, and it knows nothing of the question but its print.
 */
function solveAgain(rows: readonly string[]): Item<MulColumnQuestion> | null {
  const [top, low, ...more] = rows;
  if (more.length > 0 || !/^[1-9][0-9]$/.test(top ?? "") || !/^×[2-9]$/.test(low ?? "")) return null;
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
  return { question: { a: Number(top), b: times }, answer: { kind: "whole-number", value: carry > 0 ? String(carry) + written : written } };
}

function steps(q: MulColumnQuestion): string[] {
  const ones = q.a % 10;
  const tens = Math.floor(q.a / 10);
  const carry = carried(q);
  const first = `${q.b} × ${ones} = ${q.b * ones}, write ${(q.b * ones) % 10}`;
  const second = `${q.b} × ${tens} = ${q.b * tens}`;
  return carry > 0
    ? [`${first}, carry ${carry}`, `${second}, plus ${carry} is ${q.b * tens + carry}`, String(product(q))]
    : [first, second, String(product(q))];
}

/** Past 100, then a carry, then a zero in the product, then a larger multiplier. */
function difficulty(q: MulColumnQuestion): number {
  return (product(q) >= 100 ? 1000 : 0) + (carried(q) > 0 ? 500 : 0) + (tensDigit(product(q)) === 0 ? 100 : 0) + q.b * 10;
}

function readLimits(raw: unknown): { ok: true; limits: MulColumnLimits } | { ok: false; problem: string } {
  const bad = (problem: string) => ({ ok: false as const, problem });
  if (!isRecord(raw)) return bad("the limits must be an object");
  const unknown = Object.keys(raw).find((k) => !LIMIT_NAMES.includes(k));
  if (unknown !== undefined) return bad(`unknown limit "${unknown}"`);
  const a = readRange(raw, "a", BOUNDS.a);
  if (typeof a === "string") return bad(a);
  const b = readRange(raw, "b", BOUNDS.b);
  if (typeof b === "string") return bad(b);
  const carries = readRange(raw, "carries", BOUNDS.carries);
  if (typeof carries === "string") return bad(carries);
  const products = readRange(raw, "product", BOUNDS.product);
  if (typeof products === "string") return bad(products);
  const zeroInTens = raw.zeroInTens;
  if (zeroInTens !== "never" && zeroInTens !== "allowed") return bad('zeroInTens must be "never" or "allowed"');
  const limits: MulColumnLimits = { a, b, carries, product: products, zeroInTens };
  return questions(limits).length > 0 ? { ok: true, limits } : bad("no question meets these limits");
}

export const mulColumn: Shape<MulColumnLimits, MulColumnQuestion> = {
  id: "mul.column",
  version: 1,
  answerKind: "whole-number",
  readLimits,
  generate(limits, seed) {
    const all = questions(limits);
    return item(all[pick(seed, all.length)]);
  },
  answer,
  solveAgain,
  steps,
  difficulty,
  difficultyRange(limits) {
    const scores = questions(limits).map(difficulty);
    return { easiest: Math.min(...scores), hardest: Math.max(...scores) };
  },
  worstCase: (limits) => item(questions(limits).reduce((worst, q) => (product(q) > product(worst) ? q : worst))),
  count: (limits) => questions(limits).length,
  face: ({ a, b }) => ({ kind: "column", top: String(a), sign: "×", bottom: String(b) }),
};
