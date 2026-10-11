// Helpers for the grades 6-7 bank (#76): how numbers look on screen and how a browser voice should say them.
// The screen shows math symbols (− for negative, 3/4, 25%, 3:5, x²); the read-aloud text says them in words
// ("negative 3", "3 over 4", "25 percent", "3 to 5", "x squared"), because a voice reads the symbols badly.
import type { Rng } from "../../rng";
import type { Template } from "../../types";

/** A negative number on screen uses the minus sign (U+2212), as the core's number parser expects. */
export const num = (n: number) => (n < 0 ? `−${fmt(-n)}` : fmt(n));
/** A number in words for a voice: "negative 3". */
export const sayNum = (n: number) => (n < 0 ? `negative ${fmt(-n)}` : fmt(n));

/** A number with no floating-point noise: 0.1 + 0.2 shows as 0.3. Thousands get commas from 10,000 up. */
export function fmt(n: number): string {
  const clean = Number(n.toFixed(6));
  if (!Number.isInteger(clean) || Math.abs(clean) < 10_000) return String(clean);
  return clean.toLocaleString("en-US");
}

/** A decimal as the child types it: no commas, no floating-point noise. */
export const typed = (n: number) => String(Number(n.toFixed(6)));

/** Money on screen: $4.50, $12. */
export const money = (n: number) => (Number.isInteger(n) ? `$${fmt(n)}` : `$${n.toFixed(2)}`);
/** Money in words: "4 dollars and 50 cents", "12 dollars". */
export function sayMoney(n: number): string {
  const dollars = Math.floor(n + 1e-9);
  const cents = Math.round((n - dollars) * 100);
  const d = dollars === 1 ? "1 dollar" : `${fmt(dollars)} dollars`;
  if (cents === 0) return d;
  const c = cents === 1 ? "1 cent" : `${cents} cents`;
  return dollars === 0 ? c : `${d} and ${c}`;
}

/** A fraction on screen: "3/4". */
export const frac = (n: number, d: number) => `${n}/${d}`;
/** A fraction in words: "3 over 4". */
export const sayFrac = (n: number, d: number) => `${n} over ${d}`;
/** A mixed number on screen: "2 1/3", with a space that does not break. */
export const mixed = (w: number, n: number, d: number) => `${w} ${n}/${d}`;
/** A mixed number in words: "2 and 1 over 3". */
export const sayMixed = (w: number, n: number, d: number) => `${w} and ${n} over ${d}`;

export const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
export const lcm = (a: number, b: number) => (a * b) / gcd(a, b);

/** A fraction in lowest terms, as [numerator, denominator]. */
export function simplest(n: number, d: number): [number, number] {
  const g = gcd(n, d);
  return [n / g, d / g];
}
/** A fraction in lowest terms on screen, as a whole number when it is one: 6/8 is "3/4", 8/4 is "2". */
export function fracText(n: number, d: number): string {
  const [a, b] = simplest(n, d);
  return b === 1 ? String(a) : frac(a, b);
}
/** fracText in words. */
export function sayFracText(n: number, d: number): string {
  const [a, b] = simplest(n, d);
  return b === 1 ? String(a) : sayFrac(a, b);
}

/** True when no two values share a key: a template draws again until its answer and wrong answers all differ. */
export function distinct<T>(values: readonly T[], key: (v: T) => string = String): boolean {
  return new Set(values.map(key)).size === values.length;
}

/** True when no two numbers are equal (to 6 decimal places). */
export const distinctNumbers = (values: readonly number[]) => distinct(values, (v) => v.toFixed(6));

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
/** 0 to 999 in words: 402 is "four hundred two", 35 is "thirty-five". */
export function words(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${words(n % 100)}` : ""}`;
}

/** Keeps a sum or an equation on one line: the spaces around + − × ÷ and = do not break. */
const keepTogether = (text: string) => text.replace(/ ([+−×÷=<>]) /g, " $1 ");

/** The template, with every expression in its prompt and choices kept on one line. */
export function keepMathTogether<T extends Template>(template: T): T {
  return {
    ...template,
    fill(rng: Rng) {
      const f = template.fill(rng);
      return {
        ...f,
        prompt: keepTogether(f.prompt),
        answer: keepTogether(f.answer),
        wrong: f.wrong.map((w) => ({ ...w, value: keepTogether(w.value) })),
      };
    },
  };
}
