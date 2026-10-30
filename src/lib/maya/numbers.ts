// The numbers in a spoken or written turn (#321): what the child said, as speech-to-text writes it ("66", "sixty-six",
// "two hundred and five", "0.85", ".85", "point eight five", "-66", "minus 66", "3/4", "26 R 1", "26 remainder 1"),
// and the equations Maya says or writes ("seven plus nine is sixteen", "7 + 9 = 16"), which code checks exactly. A
// number form code cannot read ("three quarters", "a half") is flagged, so the session confirms it instead of
// guessing. Pure TypeScript.
import type { AnswerValue } from "@/lib/question-package";

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
};
const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
/** Fraction and place words after a number ("three quarters", "six tenths"): a form code does not read yet. */
const UNREAD = /^(?:halfs?|halves|thirds?|quarters?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?|hundredths?|thousandths?)$/;

type Kind = "unit" | "teen" | "ten" | "hundred" | "thousand";

const KINDS: Record<string, Kind> = {
  ...Object.fromEntries(Object.keys(UNITS).map((w) => [w, "unit"])),
  ...Object.fromEntries(Object.keys(TEENS).map((w) => [w, "teen"])),
  ...Object.fromEntries(Object.keys(TENS).map((w) => [w, "ten"])),
  hundred: "hundred",
  thousand: "thousand",
};
const kindOf = (word: string): Kind | null => KINDS[word] ?? null;
const valueOf = (word: string) => UNITS[word] ?? TEENS[word] ?? TENS[word];

/** A token: a written number ("1,234", "0.85", ".85"), a word, a fraction bar, or a minus sign. */
const TOKEN = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+|\/|-|[a-z]+/g;

/** Every minus sign as "-": the true minus and the dashes speech-to-text may write. */
const plainMinus = (text: string) => text.replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D]/g, "-");

export interface NumbersRead {
  values: AnswerValue[];
  /** The text has a number form code does not read ("three quarters"): confirm it, do not guess. */
  unreadable: boolean;
}

/**
 * The numbers, fractions and remainder answers in a text, in order. Number words join into one number ("sixty six" is
 * 66); a new number starts where the words cannot continue one ("sixty... no, sixty-six" is 60 and 66). A minus sign or
 * "negative" before a number makes it negative; "minus" or "-" after a number is a subtraction.
 */
export function readNumbers(text: string): NumbersRead {
  // A hyphen between words joins a number ("sixty-six"); elsewhere it is a minus sign.
  const tokens = plainMinus(text).toLowerCase().replace(/([a-z])-(?=[a-z])/g, "$1 ").match(TOKEN) ?? [];
  // First the numbers, with a fraction bar or a remainder mark where one was said; then each "number bar number" becomes
  // a fraction and each "number R number" a remainder answer.
  const items: (number | "bar" | "rem")[] = [];
  let total = 0;
  let current = 0;
  let last: Kind | null = null;
  let decimals = "";
  let negative = false;
  let afterNumber = false;
  let unreadable = false;
  const push = (n: number) => {
    items.push(negative ? -n : n);
    negative = false;
    afterNumber = true;
  };
  const flush = () => {
    if (last === null && decimals === "") return;
    const whole = total + current;
    push(decimals ? Number(`${whole}.${decimals}`) : whole);
    total = current = 0;
    last = null;
    decimals = "";
  };
  const mark = (m: "bar" | "rem") => {
    flush();
    items.push(m);
    afterNumber = false;
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^[\d.]/.test(token)) {
      flush();
      push(Number(token.replace(/,/g, "")));
      continue;
    }
    if (token === "-" || token === "minus" || token === "negative") {
      flush();
      negative = token === "negative" || !afterNumber;
      afterNumber = false;
      continue;
    }
    if (token === "/" || token === "over") {
      mark("bar");
      continue;
    }
    if ((token === "r" || token === "remainder") && (afterNumber || last !== null)) {
      mark("rem");
      continue;
    }
    if (token === "point" && kindOf(tokens[i + 1] ?? "") === "unit") {
      // "point eight five": the digits after the point, one word each.
      last ??= "unit";
      while (kindOf(tokens[i + 1] ?? "") === "unit") decimals += String(valueOf(tokens[++i]));
      flush();
      continue;
    }
    if (token === "and" && last !== null && kindOf(tokens[i + 1] ?? "") !== null) continue;
    if (UNREAD.test(token) && (afterNumber || last !== null || tokens[i - 1] === "a")) unreadable = true;
    const kind = kindOf(token);
    if (kind === null) {
      flush();
      afterNumber = false;
      negative = false;
      continue;
    }
    switch (kind) {
      case "unit":
        if (last === "unit" || last === "teen") flush();
        current += valueOf(token);
        break;
      case "teen":
      case "ten":
        if (last === "unit" || last === "teen" || last === "ten") flush();
        current += valueOf(token);
        break;
      case "hundred":
        current = (last === null ? 1 : current) * 100;
        break;
      case "thousand":
        total += (last === null ? 1 : current) * 1000;
        current = 0;
        break;
    }
    last = kind;
  }
  flush();

  const values: AnswerValue[] = [];
  const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item !== "number") continue;
    const [between, after] = [items[i + 1], items[i + 2]];
    if (between === "bar" && whole(item) && whole(after) && after > 0) {
      values.push({ type: "fraction", numerator: item, denominator: after });
      i += 2;
    } else if (between === "rem" && whole(item) && whole(after) && item >= 0 && after >= 0) {
      values.push({ type: "remainder", quotient: item, remainder: after });
      i += 2;
    } else {
      values.push({ type: "number", value: item });
    }
  }
  return { values, unreadable };
}

/** The numbers, fractions and remainder answers in a text, in order (readNumbers). */
export const valuesIn = (text: string): AnswerValue[] => readNumbers(text).values;

/** Words a child uses to take back what they just said: "sixty-six... no, sixty", "66... no, I don't know". */
const CORRECTION = /\b(?:no|wait|i mean|actually|oops)\b/i;

/**
 * The child's committed words: what follows the last word that takes something back ("sixty... no, sixty-six" commits
 * to "sixty-six"; "66... no, I don't know" commits to no number). The whole text when nothing was taken back.
 */
export function committedText(text: string): string {
  const parts = text.split(CORRECTION);
  return parts[parts.length - 1];
}

/** The text offers numbers as a choice ("is it 66 or 56?"): none of them is the child's answer yet. */
export const offersChoice = (text: string) => text.split(/\bor\b/i).filter((p) => valuesIn(p).length > 0).length > 1;

// ---------- Equations ----------

type Op = "+" | "-" | "×" | "÷";

/** An equation found in a text: numbers joined by operations, said to equal a result. */
export interface Equation {
  text: string;
  terms: number[];
  ops: Op[];
  result: number;
  /** The left side equals the result, by exact arithmetic. */
  holds: boolean;
}

const OPERATOR = /^(?:\+|-|×|x|\*|÷|plus|add|minus|subtract|times|multiplied by|divided by|take away)$/;
const EQUALS = /^(?:=|is|are|equals|makes?|gives)$/;
/** Operators and "equals" words, kept as separators when the text is split. */
const SEPARATOR = /(\+|(?<=\d\s*)-(?=\s*[\d.])|×|(?<=\d\s*)[x*](?=\s*\d)|÷|=|\bplus\b|\badd\b|\bminus\b|\bsubtract\b|\btimes\b|\bmultiplied by\b|\bdivided by\b|\btake away\b|\bequals\b|\bis\b|\bare\b|\bmakes?\b|\bgives\b)/i;

function opOf(word: string): Op {
  const w = word.toLowerCase();
  if (w === "+" || w === "plus" || w === "add") return "+";
  if (w === "-" || w === "minus" || w === "subtract" || w === "take away") return "-";
  if (w === "÷" || w === "divided by") return "÷";
  return "×";
}

/**
 * The equations in a text: a chain of numbers and operations ("2 + 3 + 1", "seven plus nine") followed by an "equals"
 * word and one number. A question ("What is seven plus nine?") states no result, so it is no equation.
 */
export function equationsIn(text: string): Equation[] {
  // parts: piece, separator, piece, separator, ...
  const parts = plainMinus(text).split(SEPARATOR);
  const found: Equation[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const first = valuesIn(parts[i]).at(-1);
    if (first?.type !== "number") continue;
    const terms = [first.value];
    const ops: Op[] = [];
    let j = i;
    // Each operation needs a piece with exactly one number after it.
    while (j + 2 < parts.length && OPERATOR.test(parts[j + 1].trim().toLowerCase())) {
      const next = valuesIn(parts[j + 2]);
      if (next.length !== 1 || next[0].type !== "number") break;
      ops.push(opOf(parts[j + 1].trim()));
      terms.push(next[0].value);
      j += 2;
    }
    if (ops.length === 0 || j + 2 >= parts.length || !EQUALS.test(parts[j + 1].trim().toLowerCase())) continue;
    const result = valuesIn(parts[j + 2])[0];
    if (result?.type !== "number") continue;
    const value = evaluate(terms, ops);
    found.push({ text: parts.slice(i, j + 3).join("").trim().replace(/[.,;:!?]+$/, ""), terms, ops, result: result.value, holds: value !== null && equal(value, ratio(result.value)) });
    i = j;
  }
  return found;
}

/** An exact rational [numerator, denominator], denominator above 0. */
type Ratio = [bigint, bigint];

/** A decimal as written, exactly (0.1 is 1/10). */
function ratio(n: number): Ratio {
  const [whole, frac = ""] = String(Math.abs(n)).split(".");
  return [(n < 0 ? BigInt(-1) : BigInt(1)) * BigInt(whole + frac), BigInt(10) ** BigInt(frac.length)];
}

const equal = (a: Ratio, b: Ratio) => a[0] * b[1] === b[0] * a[1];

/** A chain's value, × and ÷ before + and -, or null for a division by zero or a number written with an exponent. */
function evaluate(terms: number[], ops: Op[]): Ratio | null {
  if (terms.some((t) => /e/i.test(String(t)))) return null;
  const sums: Ratio[] = [ratio(terms[0])];
  const signs: Op[] = [];
  for (let k = 0; k < ops.length; k++) {
    const t = ratio(terms[k + 1]);
    if (ops[k] === "×" || ops[k] === "÷") {
      const [n, d] = sums[sums.length - 1];
      if (ops[k] === "÷" && t[0] === BigInt(0)) return null;
      sums[sums.length - 1] = ops[k] === "×" ? [n * t[0], d * t[1]] : [n * t[1], d * t[0]];
    } else {
      signs.push(ops[k]);
      sums.push(t);
    }
  }
  let [n, d] = sums[0];
  for (let k = 0; k < signs.length; k++) {
    const [m, e] = sums[k + 1];
    n = signs[k] === "+" ? n * e + m * d : n * e - m * d;
    d = d * e;
  }
  return d < BigInt(0) ? [-n, -d] : [n, d];
}
