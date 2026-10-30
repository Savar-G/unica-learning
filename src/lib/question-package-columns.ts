// Written numbers and the column methods of the question package (#298, #306, #307): a whole or decimal number as its
// digits and decimal places, column addition and subtraction lined up on the point, long multiplication, and the
// shared operand checks. The operation kinds (question-package-math.ts, question-package-measures.ts) work on these.
// Pure TypeScript: no Next.js, React, network, database or clock.
import type { Place, WorkedStep } from "@/lib/question-package";

/** The columns of the written method, from the smallest place. */
export const PLACE_ORDER: readonly Place[] = [
  "thousandths", "hundredths", "tenths", "ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands", "millions",
];

/** The place of a column: 0 is the ones, 1 the tens, -1 the tenths. */
export const placeAt = (column: number): Place => PLACE_ORDER[column + 3];

export const digitAt = (n: number, i: number) => Math.floor(n / 10 ** i) % 10;
export const digitCount = (n: number) => String(n).length;

// ---------- Written numbers ----------

/** A number as written in a column: its digits without the point, and its count of decimal places (3.45 is 345, 2). */
export interface Written {
  scaled: number;
  places: number;
}

/** A whole or decimal number as written, or null when it has more than `maxPlaces` decimal places or is negative. */
export function written(x: unknown, maxPlaces: number): Written | null {
  if (typeof x !== "number" || !Number.isFinite(x) || x < 0) return null;
  // String() gives the shortest digits that read back as the same number: the number as written.
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(x));
  if (!m) return null;
  const decimals = m[2] ?? "";
  if (decimals.length > maxPlaces) return null;
  return { scaled: Number(m[1] + decimals), places: decimals.length };
}

/** The number written by digits and a count of decimal places: (325, 2) is 3.25. */
export function fromWritten(scaled: number, places: number): number {
  if (places === 0) return scaled;
  const digits = String(scaled).padStart(places + 1, "0");
  return Number(`${digits.slice(0, -places)}.${digits.slice(-places)}`);
}

export const whole = (n: number): Written => ({ scaled: n, places: 0 });
/** Digits left of the point; 0.5 has one, its 0. */
export const wholeDigits = (w: Written) => digitCount(Math.floor(w.scaled / 10 ** w.places));
export const hasDigit = (w: Written, column: number) => column >= -w.places && column < wholeDigits(w);
export const digitOf = (w: Written, column: number) => digitAt(w.scaled, column + w.places);

// ---------- Column methods ----------

/** Column addition, lined up on the point, from the smallest place; `prefix` names the steps ("sum-"). */
export function addColumns(numbers: Written[], prefix = ""): WorkedStep[] {
  const steps: WorkedStep[] = [];
  const top = Math.max(...numbers.map(wholeDigits));
  let carry = 0;
  for (let column = -Math.max(...numbers.map((n) => n.places)); column < top || carry > 0; column++) {
    const digits = numbers.filter((n) => hasDigit(n, column)).map((n) => digitOf(n, column));
    const total = digits.reduce((s, d) => s + d, 0) + carry;
    const place = placeAt(column);
    steps.push({ id: prefix + place, kind: "add-column", place, digits, carryIn: carry, total, write: total % 10, carryOut: Math.floor(total / 10) });
    carry = Math.floor(total / 10);
  }
  return steps;
}

/** Column subtraction, lined up on the point. A top number with fewer decimal places gets a 0 written in. */
export function subtractColumns(a: Written, b: Written): WorkedStep[] {
  const places = Math.max(a.places, b.places);
  const difference = a.scaled * 10 ** (places - a.places) - b.scaled * 10 ** (places - b.places);
  const steps: WorkedStep[] = [];
  let lent = false;
  for (let column = -places; column < wholeDigits(a); column++) {
    const addedZero = !hasDigit(a, column);
    const top = addedZero ? 0 : digitOf(a, column);
    const bottom = hasDigit(b, column) ? digitOf(b, column) : null;
    const regrouped: boolean = top - (lent ? 1 : 0) < (bottom ?? 0);
    const write = top - (lent ? 1 : 0) + (regrouped ? 10 : 0) - (bottom ?? 0);
    // The columns left of the ones that are 0 on the left of the result are not written.
    const leading = column > 0 && Math.floor(difference / 10 ** (column + places)) === 0;
    const place = placeAt(column);
    steps.push({ id: place, kind: "subtract-column", place, top, bottom, lent, regrouped, write: leading ? null : write, ...(addedZero ? { addedZero: true as const } : {}) });
    lent = regrouped;
  }
  return steps;
}

/**
 * Long multiplication of whole numbers: one row for each digit of the multiplier (a 0 digit of a longer multiplier
 * has no row), each row digit by digit with its carries, then the rows added in columns.
 */
export function multiplyRows(a: number, b: number): WorkedStep[] {
  const steps: WorkedStep[] = [];
  const rows: number[] = [];
  const multiplierDigits = digitCount(b);
  for (let j = 0; j < multiplierDigits; j++) {
    const multiplier = digitAt(b, j);
    if (multiplier === 0 && multiplierDigits > 1) continue;
    const row = placeAt(j);
    const value = a * multiplier;
    let carry = 0;
    for (let i = 0; i < digitCount(a) || carry > 0; i++) {
      const top = i < digitCount(a) ? digitAt(a, i) : null;
      const total = (top ?? 0) * multiplier + carry;
      // A row of 0s from a 0 multiplier writes one 0, not one for each digit.
      const leading = i > 0 && Math.floor(value / 10 ** i) === 0;
      steps.push({ id: `r${j + 1}-${placeAt(i)}`, kind: "multiply-digit", row, place: placeAt(i), top, multiplier, carryIn: carry, total, write: leading ? null : total % 10, carryOut: Math.floor(total / 10) });
      carry = Math.floor(total / 10);
    }
    rows.push(value * 10 ** j);
    if (multiplierDigits > 1) steps.push({ id: `r${j + 1}`, kind: "partial-product", row, multiplier, zeros: j, value: value * 10 ** j });
  }
  if (rows.length > 1) steps.push(...addColumns(rows.map(whole), "sum-"));
  return steps;
}

// ---------- Operand checks ----------

/**
 * Why code does not trust an operation: "failed" when the operation is wrong (a fraction over 0, a subtraction below
 * zero), "unsupported" when it is well formed but beyond what code computes (a multiplier of 1000).
 */
export interface OperationProblem {
  status: "failed" | "unsupported";
  reason: string;
}
export const fail = (reason: string): OperationProblem => ({ status: "failed", reason });
export const beyond = (reason: string): OperationProblem => ({ status: "unsupported", reason });

export const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
// Every position must be present: Array.every skips a missing one ([, 1]), so the operand checks would pass it.
export const isTwo = (operands: unknown): operands is [unknown, unknown] => Array.isArray(operands) && operands.length === 2 && 0 in operands && 1 in operands;
export const isOne = (operands: unknown): operands is [unknown] => Array.isArray(operands) && operands.length === 1 && 0 in operands;
