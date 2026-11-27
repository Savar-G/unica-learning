// The formula of a defined question: a small tree of slots, whole numbers, printable fractions and the four operations.
// It is data, never code: nothing here runs a text. Each operation is one worked step, and each step must give a whole
// number of 0 or more, so that a child can write it.
import { isRecord } from "../shapes/shape";

export type Operation = "+" | "-" | "×" | "÷";
export type Expr =
  | { slot: string }
  | { number: number }
  | { fraction: [number, number] }
  | { op: Operation; left: Expr; right: Expr };

const OPERATIONS: readonly string[] = ["+", "-", "×", "÷"];
/** The fractions that every bundled font holds as one character. */
const FRACTIONS: Readonly<Record<string, string>> = { "1/2": "½", "1/4": "¼", "3/4": "¾" };
const MAX_NUMBER = 1000;
/** A word problem of a workbook takes few steps. */
const MAX_OPERATIONS = 4;

export type ReadExpr = { ok: true; expr: Expr } | { ok: false; problem: string };

const exactKeys = (raw: Record<string, unknown>, keys: readonly string[]) => Object.keys(raw).sort().join() === [...keys].sort().join();
const NOT_A_FORMULA = "a formula must be a slot, a number, a fraction or an operation";

function readNode(raw: unknown, slots: readonly string[], inProduct: boolean, count: { operations: number }): Expr | string {
  if (!isRecord(raw)) return NOT_A_FORMULA;
  if (exactKeys(raw, ["slot"])) return typeof raw.slot === "string" && slots.includes(raw.slot) ? { slot: raw.slot } : `the slot ${JSON.stringify(raw.slot)} is not a slot of the question`;
  if (exactKeys(raw, ["number"])) {
    const { number } = raw;
    return typeof number === "number" && Number.isSafeInteger(number) && number >= 0 && number <= MAX_NUMBER ? { number } : `a number must be a whole number from 0 to ${MAX_NUMBER}`;
  }
  if (exactKeys(raw, ["fraction"])) {
    const { fraction } = raw;
    const good = Array.isArray(fraction) && fraction.length === 2 && fraction.every((n) => typeof n === "number" && Number.isSafeInteger(n));
    const allowed = Object.keys(FRACTIONS).join(", ").replace(/, (?=[^,]*$)/, " or ");
    if (!good) return `a fraction must be a pair of whole numbers and cannot be printed: use ${allowed}`;
    const key = fraction.join("/");
    if (!Object.hasOwn(FRACTIONS, key)) return `the fraction ${key} cannot be printed: use ${allowed}`;
    const [n, d] = fraction as [number, number];
    return inProduct ? { fraction: [n, d] } : "a fraction may only be multiplied";
  }
  if (!exactKeys(raw, ["op", "left", "right"])) return NOT_A_FORMULA;
  if (typeof raw.op !== "string" || !OPERATIONS.includes(raw.op)) return `${JSON.stringify(raw.op)} is no operation: use +, -, × or ÷`;
  if (++count.operations > MAX_OPERATIONS) return `the formula has more than ${MAX_OPERATIONS} operations`;
  const op = raw.op as Operation;
  const [left, right] = [raw.left, raw.right].map((side) => readNode(side, slots, op === "×", count));
  if (typeof left === "string") return left;
  if (typeof right === "string") return right;
  if ("fraction" in left && "fraction" in right) return "a fraction may only be multiplied by a whole number";
  return { op, left, right };
}

/** The formula, or the first thing that is wrong with it. `slots` are the names of the slots of its question. */
export function readExpr(raw: unknown, slots: readonly string[]): ReadExpr {
  const expr = readNode(raw, slots, false, { operations: 0 });
  return typeof expr === "string" ? { ok: false, problem: expr } : { ok: true, expr };
}

export type Solved = { ok: true; value: number; lines: string[] } | { ok: false; problem: string };

/** A value while it is worked out: a whole number, or a fraction that is only ever multiplied. */
interface Value { n: number; d: number; text: string }

function work(expr: Expr, values: Readonly<Record<string, number>>, lines: string[]): Value | string {
  if ("slot" in expr) {
    const value = Object.hasOwn(values, expr.slot) ? values[expr.slot] : undefined;
    return typeof value === "number" && Number.isSafeInteger(value) ? { n: value, d: 1, text: String(value) } : `the slot "${expr.slot}" has no number`;
  }
  if ("number" in expr) return { n: expr.number, d: 1, text: String(expr.number) };
  if ("fraction" in expr) return { n: expr.fraction[0], d: expr.fraction[1], text: FRACTIONS[expr.fraction.join("/")] ?? "?" };
  const left = work(expr.left, values, lines);
  if (typeof left === "string") return left;
  const right = work(expr.right, values, lines);
  if (typeof right === "string") return right;
  const step = `${left.text} ${expr.op} ${right.text}`;
  const [n, d] = {
    "+": [left.n * right.d + right.n * left.d, left.d * right.d],
    "-": [left.n * right.d - right.n * left.d, left.d * right.d],
    "×": [left.n * right.n, left.d * right.d],
    "÷": [left.n * right.d, left.d * right.n],
  }[expr.op];
  if (d === 0) return `${step} divides by zero`;
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) return `${step} is too large`;
  if (n % d !== 0) return `${step} is not a whole number`;
  const value = n / d;
  if (value < 0) return `${step} is less than zero`;
  if (!Number.isSafeInteger(value)) return `${step} is too large`;
  lines.push(`${step} = ${value}`);
  return { n: value, d: 1, text: String(value) };
}

/** The printable fractions that a formula uses, in order. */
export function exprFractions(expr: Expr): string[] {
  if ("fraction" in expr) return [FRACTIONS[expr.fraction.join("/")] ?? "?"];
  return "op" in expr ? [...exprFractions(expr.left), ...exprFractions(expr.right)] : [];
}

/** Whether a formula reads at least one slot of its question. */
export function exprHasSlot(expr: Expr): boolean {
  return "slot" in expr || ("op" in expr && (exprHasSlot(expr.left) || exprHasSlot(expr.right)));
}

/** The answer of a formula for these numbers, with one line for each operation, or why a child could not work it. */
export function solve(expr: Expr, values: Readonly<Record<string, number>>): Solved {
  const lines: string[] = [];
  const result = work(expr, values, lines);
  if (typeof result === "string") return { ok: false, problem: result };
  return result.d === 1 ? { ok: true, value: result.n, lines } : { ok: false, problem: "the answer is not a whole number" };
}
