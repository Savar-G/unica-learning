// Exact numbers for the board (#317): a number line places values by exact fractions, never by floating-point sums, so
// 1/3 and 2/6 land on one tick and 0.1 + 0.2 is 0.3. Values stay small (see the bounds below), so safe integers hold
// every product. Signed, unlike the question package's fraction parts, whose `gcd` this reuses.
import { refuse, type RefusalBody } from "@/lib/board/representation";
import { gcd } from "@/lib/question-package-math";

/** A fraction in lowest terms with a positive denominator. Make one with `rational`. */
export interface Rational {
  readonly num: number;
  readonly den: number;
}

export function rational(num: number, den = 1): Rational {
  if (den === 0) throw new RangeError("A fraction cannot have 0 as its denominator.");
  const g = gcd(Math.abs(num), Math.abs(den));
  const s = den < 0 ? -1 : 1;
  // `+ 0` turns -0 into 0.
  return { num: (s * num) / g + 0, den: (s * den) / g };
}

export const add = (a: Rational, b: Rational) => rational(a.num * b.den + b.num * a.den, a.den * b.den);
export const sub = (a: Rational, b: Rational) => rational(a.num * b.den - b.num * a.den, a.den * b.den);
export const div = (a: Rational, b: Rational) => rational(a.num * b.den, a.den * b.num);
export const mul = (a: Rational, b: Rational) => rational(a.num * b.num, a.den * b.den);
/** k times r, for a whole number k. */
export const times = (r: Rational, k: number) => rational(r.num * k, r.den);
export const max = (a: Rational, b: Rational) => (compare(a, b) >= 0 ? a : b);
/** The smallest whole number at least r, with whole-number arithmetic only. */
export function ceil(r: Rational): number {
  const rest = ((r.num % r.den) + r.den) % r.den;
  return (r.num - rest) / r.den + (rest > 0 ? 1 : 0);
}
/** The value as a float, for drawing coordinates only: one rounding, at the end. */
export const toNumber = (r: Rational) => r.num / r.den;
/** Negative when a < b, 0 when equal, positive when a > b. */
export const compare = (a: Rational, b: Rational) => a.num * b.den - b.num * a.den;
export const equal = (a: Rational, b: Rational) => a.num === b.num && a.den === b.den;
export const isWhole = (r: Rational) => r.den === 1;

/** The one name of a value: lowest terms, ASCII minus. "2/6" and "1/3" are both "1/3"; "0.5" is "1/2". */
export const valueKey = (r: Rational) => (r.den === 1 ? String(r.num) : `${r.num}/${r.den}`);

/** How a number was written. */
export type WrittenForm = "whole" | "decimal" | "fraction" | "mixed";

export interface ReadNumber {
  value: Rational;
  form: WrittenForm;
  /** The sign as written: "+" only when the text had one. */
  sign: "" | "+" | "-";
}

// ---------- bounds ----------
// The grammar is derived from the bounds, so every name the board gives a value (its lowest terms) reads back: a line's
// ticks lie within LINE_LIMIT and have denominators up to MAX_DENOMINATOR, and a jump's size is at most twice LINE_LIMIT.

/** A number line goes from -LINE_LIMIT to LINE_LIMIT. */
export const LINE_LIMIT = 10_000;
/** The largest denominator the board reads: thousandths. */
export const MAX_DENOMINATOR = 1000;
/** The largest number the board reads: a jump from one end of the widest line to the other. */
const MAX_VALUE = 2 * LINE_LIMIT;
const MAX_PLACES = 3;
const digitsOf = (n: number) => String(n).length;
const WHOLE_DIGITS = digitsOf(MAX_VALUE);
const NUMERATOR_DIGITS = digitsOf(MAX_VALUE * MAX_DENOMINATOR);
const DENOMINATOR_DIGITS = digitsOf(MAX_DENOMINATOR);
/** The longest number text the board reads: a sign and the longest form ("-20000 999/1000"). */
export const MAX_NUMBER_TEXT =
  1 + Math.max(WHOLE_DIGITS + 1 + MAX_PLACES, NUMERATOR_DIGITS + 1 + DENOMINATOR_DIGITS, WHOLE_DIGITS + 1 + (DENOMINATOR_DIGITS - 1) + 1 + DENOMINATOR_DIGITS);

/** Digits without a leading zero, up to `max` of them. */
const digits = (max: number) => `(0|[1-9]\\d{0,${max - 1}})`;
const SIGN = "([+\\-−]?)";
const FORMS: { form: WrittenForm; re: RegExp }[] = [
  { form: "whole", re: new RegExp(`^${SIGN}${digits(WHOLE_DIGITS)}$`) },
  { form: "decimal", re: new RegExp(`^${SIGN}${digits(WHOLE_DIGITS)}\\.(\\d{1,${MAX_PLACES}})$`) },
  { form: "fraction", re: new RegExp(`^${SIGN}${digits(NUMERATOR_DIGITS)}/${digits(DENOMINATOR_DIGITS)}$`) },
  { form: "mixed", re: new RegExp(`^${SIGN}([1-9]\\d{0,${WHOLE_DIGITS - 1}}) ${digits(DENOMINATOR_DIGITS)}/${digits(DENOMINATOR_DIGITS)}$`) },
];

/**
 * Reads an exact number: a whole number ("-12"), a decimal with up to 3 places ("0.25"), a fraction ("2/6") or a mixed
 * number ("1 1/2"). Refuses text it cannot read, a 0 denominator, a denominator over MAX_DENOMINATOR, a mixed number
 * whose fraction part is not between 0 and 1, and a number beyond MAX_VALUE.
 */
export function readNumber(text: string): ReadNumber | RefusalBody {
  for (const { form, re } of FORMS) {
    const m = re.exec(text);
    if (!m) continue;
    const sign = m[1] === "+" ? "+" : m[1] === "" ? "" : "-";
    const s = sign === "-" ? -1 : 1;
    const n = m.slice(2).map(Number);
    let value: Rational;
    if (form === "whole") value = rational(s * n[0]);
    else if (form === "decimal") value = rational(s * Number(m[2] + m[3]), 10 ** m[3].length);
    else {
      const [whole, num, den] = form === "fraction" ? [0, n[0], n[1]] : n;
      if (den === 0) return refuse("not_allowed", `${text} has 0 as its denominator: a whole cannot be cut into 0 equal parts.`);
      if (den > MAX_DENOMINATOR) return refuse("not_allowed", `${text}: the board writes denominators up to ${MAX_DENOMINATOR}.`);
      if (form === "mixed" && (num === 0 || num >= den)) return refuse("not_allowed", `In the mixed number ${text} the fraction part must be more than 0 and less than 1.`);
      value = rational(s * (whole * den + num), den);
    }
    if (Math.abs(value.num) > MAX_VALUE * value.den) return refuse("not_allowed", `${text}: the board writes numbers from -${MAX_VALUE} to ${MAX_VALUE}.`);
    return { value, form, sign };
  }
  return refuse("invalid_command", `"${text}" is not a number the board can read: write a whole number (-3), a decimal (0.25), a fraction (2/6) or a mixed number (1 1/2).`);
}

/** The name of a value written as text ("2/6" is "1/3"), or why it cannot be read. */
export function valueName(text: string): string | RefusalBody {
  const read = readNumber(text);
  return "code" in read ? read : valueKey(read.value);
}

/** The value as a decimal ("0.25", "-1.5"), or null when it has no exact decimal with up to 3 places (1/3). */
export function toDecimal(r: Rational): string | null {
  for (let places = 0; places <= 3; places++) {
    const scaled = (r.num * 10 ** places) / r.den;
    if (!Number.isInteger(scaled)) continue;
    const abs = String(Math.abs(scaled)).padStart(places + 1, "0");
    const text = places === 0 ? abs : `${abs.slice(0, -places)}.${abs.slice(-places)}`;
    return (r.num < 0 ? "-" : "") + text;
  }
  return null;
}
