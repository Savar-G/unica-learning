// What the three division shapes register in the same way. It counts groups and takes each step from the numbers that the
// first digits of the dividend make; the shapes work with one digit after the other.
import fc from "fast-check";
import type { Answer, Step } from "../contract";
import { rangeLimit, step, type LimitRule, type Rows } from "./shape-registration";

export const r = (min: number, max: number) => ({ min, max });
export const span = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => min + i);

export interface PrintedDivision { dividend: number; divisor: number; form: "line" | "bracket"; parts: 1 | 2 }

/** "37÷4" and "4)37" ask for the quotient only; "37÷4 R" and "4)37 R" for both parts. */
export function q(text: string): Rows {
  const [numbers, rest] = text.split(" ");
  const blanks = rest ? "□R□" : "□";
  return numbers.includes(")") ? [blanks, numbers] : [`${numbers}=${blanks}`];
}
/** One question for each text between commas. */
export const each = (texts: string): Rows[] => texts.split(",").map((text) => q(text.trim()));

export const rowsOf = ({ dividend, divisor, form, parts }: PrintedDivision): Rows => q(`${form === "line" ? `${dividend}÷${divisor}` : `${divisor})${dividend}`}${parts === 2 ? " R" : ""}`);

const isNumber = (text: string | undefined): text is string => text !== undefined && /^\d+$/.test(text) && String(Number(text)) === text;

/** The numbers of printed rows, or null when they print no division. */
export function numbersOf(rows: Rows): PrintedDivision | null {
  const isLine = rows.length === 1;
  const blanks = isLine ? rows[0].split("=")[1] : rows[0];
  const numbers = isLine ? rows[0].split("=")[0].split("÷") : (rows[1]?.split(")") ?? []).reverse();
  const parts = blanks === "□" ? 1 : blanks === "□R□" ? 2 : null;
  if (rows.length > 2 || parts === null || numbers.length !== 2 || (isLine && rows[0].split("=").length !== 2)) return null;
  const [dividend, divisor] = numbers;
  return isNumber(dividend) && isNumber(divisor) ? { dividend: Number(dividend), divisor: Number(divisor), form: isLine ? "line" : "bracket", parts } : null;
}

/** How many whole groups there are, and what is left: one group after the other is taken away. */
export function groupsOf(things: number, size: number): [groups: number, left: number] {
  let [groups, left] = [0, things];
  for (; left >= size; left -= size) groups++;
  return [groups, left];
}

export function answerOf({ parts }: PrintedDivision, quotient: number, left: number): Answer {
  const part = (name: string, value: number) => ({ name, kind: "whole-number" as const, value: String(value) });
  return { parts: parts === 1 ? [part("answer", quotient)] : [part("quotient", quotient), part("remainder", left)] };
}

/** The line that ends the steps. */
const endOf = ({ parts }: PrintedDivision, quotient: number, left: number): Step => step(parts === 1 ? String(quotient) : `${quotient} R${left}`);

/** What the first digits of a dividend give: one line for each digit of the quotient. */
export function prefixesOf(dividend: number, divisor: number): { part: number; digit: number; left: number; next: string | undefined }[] {
  const text = String(dividend);
  const lengths = span(1, text.length);
  const first = lengths.find((n) => Number(text.slice(0, n)) >= divisor) ?? text.length;
  return lengths.slice(first - 1).map((n) => {
    const [whole, left] = groupsOf(Number(text.slice(0, n)), divisor);
    const before = n === first ? 0 : groupsOf(Number(text.slice(0, n - 1)), divisor)[0];
    return { part: Number(text.slice(0, n)) - before * 10 * divisor, digit: whole - before * 10, left, next: text[n] };
  });
}

/** Every step of a division that is worked below its bracket. */
export function divisionLines(numbers: PrintedDivision, quotient: number, left: number): Step[] {
  const { dividend, divisor } = numbers;
  const prefixes = prefixesOf(dividend, divisor);
  const text = String(dividend);
  const lines: Step[] = prefixes.length < text.length && prefixes.length > 1 ? [step(`${text[0]} is less than ${divisor}, use ${text.slice(0, 2)}`)] : [];
  let row = 0;
  prefixes.forEach(({ part, digit, left: rest, next }, i) => {
    const place = prefixes.length - 1 - i;
    const down = next === undefined ? "" : `, bring down ${next}, now ${Number(`${rest}${next}`)}`;
    const downMark = (at: number) => (next === undefined ? "" : ` d${next}@${place - 1}#${at}`);
    if (digit === 0) return void lines.push(step(`${part} is less than ${divisor}, write 0${down}`, `q0@${place}${downMark(row)}`));
    const product = String(part - rest);
    lines.push(step(`${divisor} × ${digit} = ${product}, ${divisor} × ${digit + 1} = ${part - rest + divisor} is too much, write ${digit}`, `q${digit}@${place} ${[...product].map((d, at) => `p${d}@${place + product.length - 1 - at}#${row + 1}`).join(" ")}`));
    lines.push(step(`${part} - ${product} = ${rest}${down}`, `r${rest}@${place}#${row + 2}${downMark(row + 2)}`));
    row += 2;
  });
  return [...lines, endOf(numbers, quotient, left)];
}

/** Steps written by hand, as "text | marks", with the line that ends them. */
export const withEnd = (numbers: PrintedDivision, ...lines: string[]): Step[] => {
  const [quotient, left] = groupsOf(numbers.dividend, numbers.divisor);
  return [...lines.map((line) => step(...(line.split(" | ") as [string, string?]))), endOf(numbers, quotient, left)];
};

/** The order of the tables from the easiest: 2, 10 and 5, then by size. */
const TABLES = [2, 10, 5, 3, 4, 6, 7, 8, 9];
export const tableOrder = (divisor: number): number => TABLES.indexOf(divisor);

const WORDS: Readonly<Record<string, { min: number; max: number }>> = { none: r(0, 0), any: r(0, 8), some: r(1, 8) };
type Remainder = string | { min: number; max: number };
const toRange = (limit: Remainder) => (typeof limit === "string" ? WORDS[limit] : limit);
const toLimit = ({ min, max }: { min: number; max: number }): Remainder => Object.keys(WORDS).find((w) => WORDS[w].min === min && WORDS[w].max === max) ?? { min, max };

/** "none" prints no area for it; a word or a range prints one for each question. The feature is the remainder and the number of areas. No limit permits one area and two: a wider one than "none" and another has two. */
export function remainderLimit(): LimitRule {
  const ranges = rangeLimit(0, 8);
  return {
    values: ranges.values.map((range) => toLimit(range as { min: number; max: number }), (limit) => toRange(limit as Remainder)),
    allows: (feature, limit) => {
      const { left, parts } = feature as { left: number; parts: number };
      return parts === (limit === "none" ? 1 : 2) && ranges.allows(left, toRange(limit as Remainder));
    },
    widen: (one, other) => toLimit(ranges.widen(toRange(one as Remainder), toRange(other as Remainder)) as { min: number; max: number }),
    bad: [...ranges.bad, "", "None", "any ", "never", ["any"], 0, r(0, 8), r(1, 8), r(0, 0)],
  };
}

/** The form of a row. No limit permits both, so a wider one keeps the first. */
export const formLimit = (): LimitRule => ({
  values: fc.constantFrom("line", "bracket"), allows: (feature, limit) => feature === limit, widen: (one) => one,
  bad: [undefined, null, true, "", "either", "Line", "line ", ["line"]],
});
