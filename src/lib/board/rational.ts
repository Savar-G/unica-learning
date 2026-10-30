// Exact numbers for the board (#317): a number line places values by exact fractions, never by floating-point sums, so
// 1/3 and 2/6 land on one tick and 0.1 + 0.2 is 0.3. Values stay small (6 digits, denominators up to 1000), so safe
// integers hold every product. Signed, unlike the question package's fraction parts, whose `gcd` this reuses.
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

const SIGN = "([+\\-−]?)";
const WHOLE = "(0|[1-9]\\d{0,3})";
const SMALL = "(0|[1-9]\\d{0,2})";
/** A fraction's numerator: up to 6 digits, so every value's name reads back ("2001/2" is 1000.5). */
const NUMERATOR = "(0|[1-9]\\d{0,5})";
const FORMS: { form: WrittenForm; re: RegExp }[] = [
  { form: "whole", re: new RegExp(`^${SIGN}${WHOLE}$`) },
  { form: "decimal", re: new RegExp(`^${SIGN}${WHOLE}\\.(\\d{1,3})$`) },
  { form: "fraction", re: new RegExp(`^${SIGN}${NUMERATOR}/${SMALL}$`) },
  { form: "mixed", re: new RegExp(`^${SIGN}([1-9]\\d{0,2}) ${SMALL}/${SMALL}$`) },
];

/**
 * Reads an exact number: a whole number ("-12"), a decimal with up to 3 places ("0.25"), a fraction ("2/6") or a mixed
 * number ("1 1/2"). Refuses text it cannot read, a 0 denominator, and a mixed number whose fraction part is not between
 * 0 and 1.
 */
export function readNumber(text: string): ReadNumber | RefusalBody {
  for (const { form, re } of FORMS) {
    const m = re.exec(text);
    if (!m) continue;
    const sign = m[1] === "+" ? "+" : m[1] === "" ? "" : "-";
    const s = sign === "-" ? -1 : 1;
    const n = m.slice(2).map(Number);
    if (form === "whole") return { value: rational(s * n[0]), form, sign };
    if (form === "decimal") return { value: rational(s * Number(m[2] + m[3]), 10 ** m[3].length), form, sign };
    const [whole, num, den] = form === "fraction" ? [0, n[0], n[1]] : n;
    if (den === 0) return refuse("not_allowed", `${text} has 0 as its denominator: a whole cannot be cut into 0 equal parts.`);
    if (form === "mixed" && (num === 0 || num >= den)) return refuse("not_allowed", `In the mixed number ${text} the fraction part must be more than 0 and less than 1.`);
    return { value: rational(s * (whole * den + num), den), form, sign };
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
