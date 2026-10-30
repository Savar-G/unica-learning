// The numbers in a spoken or written turn (#321): what the child said, as speech-to-text writes it ("66", "sixty-six",
// "two hundred and five", "0.85", ".85", "point eight five", "-66", "minus 66", "3/4", "26 R 1", "26 remainder 1").
// A number form code cannot read ("three quarters", "a half", "66 squared") is flagged, so the session confirms it
// instead of guessing. Maya's own claims are checked in claims.ts. Pure TypeScript.
import type { AnswerValue } from "@/lib/question-package";

// Maps, not objects: a word such as "constructor" must never reach an inherited property.
const WORD_VALUES = new Map<string, number>([
  ["zero", 0], ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9],
  ["ten", 10], ["eleven", 11], ["twelve", 12], ["thirteen", 13], ["fourteen", 14], ["fifteen", 15], ["sixteen", 16], ["seventeen", 17], ["eighteen", 18], ["nineteen", 19],
  ["twenty", 20], ["thirty", 30], ["forty", 40], ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90],
]);
/**
 * Fraction words, scale words, and words and signs that change a number's value ("three quarters", "half of 66",
 * "66 million", "66 squared", "66%", "the square root of 66", "to the power"), next to a number or joined to one by
 * LINK words: a form code does not read yet, so the turn is confirmed and no number in it is scored. Away from a number
 * they are ordinary words ("I double checked, 66").
 */
const CHANGES = /^(?:halfs?|halves|thirds?|quarters?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?|hundredths?|thousandths?|millions?|billions?|trillions?|zillions?|gazillions?|lakhs?|crores?|dozens?|squared?|cubed?|roots?|sqrt|factorial|percent|power|twice|double|triple|decimal|dot|%|\^|[\u00B2\u00B3\u00B9\u2070-\u2079])$/;
/** Words that join a value-changing word to its number ("half of 66", "66 and a half", "square root of 66"). */
const LINK = /^(?:of|a|an|the|and)$/;
/** Place words right after a number ("66 tens"): they change its value, a form code does not read yet. */
const PLACE = /^(?:ones|tens|hundreds|thousands)$/;
/**
 * Operations between two numbers ("27 minus 66", "27 + 66", "27 take away 66"): the second number is part of the
 * operation, not an answer. "minus" and "-" are read with the signs below.
 */
const OPERATION = /^(?:plus|times|add|added|adding|subtract|subtracted|take|multiplied|divided|less|\+|×|\*|÷|x)$/;
/** Words a child says while thinking ("minus, uh, 66"): they keep a sign. */
const FILLER = /^(?:uh|um|umm|er|erm|hmm|like)$/;
/** Words that give a result ("is", "=", "got"): the number after one is no longer inside an operation. */
const RESULT = /^(?:is|are|was|equals?|makes?|gives?|gets?|got|=)$/;

/** The kind of a number word: it says which words can follow it in one number. */
export type NumberWord = "unit" | "teen" | "ten" | "hundred" | "thousand";

const KINDS = new Map<string, NumberWord>([
  ...[...WORD_VALUES].map(([w, n]): [string, NumberWord] => [w, n < 10 ? "unit" : n < 20 ? "teen" : "ten"]),
  ["hundred", "hundred"],
  ["thousand", "thousand"],
]);
/** The kind of a number word ("sixty" is a ten), or null for any other word. */
export const kindOf = (word: string): NumberWord | null => KINDS.get(word) ?? null;
/** The value of a unit, teen or ten word ("sixty" is 60), or null for any other word. */
export const wordValue = (word: string): number | null => WORD_VALUES.get(word) ?? null;
/** A number word of this kind cannot continue a number whose last word was `last` ("six sixty" is 6 and 60). */
export const startsNewNumber = (last: NumberWord | null, kind: NumberWord) =>
  kind === "unit" ? last === "unit" || last === "teen" : (kind === "teen" || kind === "ten") && (last === "unit" || last === "teen" || last === "ten");

/**
 * A token: a written number ("1,234", "0.85", ".85"), a word, a fraction bar, a minus sign, an operation or equals sign,
 * a sign that changes a value, or the end of a sentence or a turn (".", "!", "?", ";", a new line).
 */
const TOKEN = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+|\/|-|[a-z]+|[+×*÷=%^\u00B2\u00B3\u00B9\u2070-\u2079]|[.!?;\n]/g;
const BOUNDARY = /^[.!?;\n]$/;
/** An ordinal ending on a written number ("66th"): the number is not an answer as said. */
const ORDINAL = /\d(?:st|nd|rd|th)\b/i;

/** Every minus sign as "-": the true minus and the dashes speech-to-text may write. */
const plainMinus = (text: string) => text.replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D]/g, "-");

export interface NumbersRead {
  values: AnswerValue[];
  /** The text has a number form code does not read ("three quarters", "66 squared"): confirm it, do not guess. */
  unreadable: boolean;
  /** The last number is the second number of an operation ("27 minus 66"), so it is not an answer the child kept. */
  lastInOperation: boolean;
}

/**
 * The numbers, fractions and remainder answers in a text, in order. Number words join into one number ("sixty six" is
 * 66); a new number starts where the words cannot continue one ("sixty... no, sixty-six" is 60 and 66). A minus sign or
 * "negative" before a number makes it negative; "minus" or "-" after a number in the same sentence is a subtraction.
 * A sentence end or a new line (between two turns) ends a number, so "27. -66." is 27 and -66.
 */
export function readNumbers(text: string): NumbersRead {
  // A hyphen between words joins a number ("sixty-six"); elsewhere it is a minus sign.
  const tokens = plainMinus(text).toLowerCase().replace(/([a-z])-(?=[a-z])/g, "$1 ").match(TOKEN) ?? [];
  // First the numbers, with a fraction bar or a remainder mark where one was said; then each "number bar number" becomes
  // a fraction and each "number R number" a remainder answer.
  const items: (number | "bar" | "rem")[] = [];
  /** For each number in items: it is the second number of an operation. */
  const operands = new Map<number, boolean>();
  let inOperation = false;
  let total = 0;
  let current = 0;
  let last: NumberWord | null = null;
  let decimals = "";
  let negative = false;
  let afterNumber = false;
  const isNumber = (t = "") => /^\d/.test(t) || kindOf(t) !== null;
  // A value-changing word reaches a number across link words and other value-changing words, in either direction.
  const linked = (i: number) => [-1, 1].some((d) => {
    let k = i + d;
    while (LINK.test(tokens[k] ?? "") || CHANGES.test(tokens[k] ?? "")) k += d;
    return isNumber(tokens[k]);
  });
  let unreadable = ORDINAL.test(text);
  const push = (n: number) => {
    operands.set(items.length, inOperation);
    items.push(negative ? -n : n);
    negative = false;
    inOperation = false;
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
    if (BOUNDARY.test(token)) {
      flush();
      afterNumber = negative = inOperation = false;
      continue;
    }
    const next = tokens[i + 1] ?? "";
    const numberNext = isNumber(next);
    if (CHANGES.test(token)) {
      if (linked(i)) unreadable = true;
      continue;
    }
    if ((token === "to" && next === "the" && (afterNumber || last !== null)) || (PLACE.test(token) && (afterNumber || last !== null))) {
      unreadable = true;
      continue;
    }
    if (FILLER.test(token)) continue;
    if (RESULT.test(token)) {
      flush();
      afterNumber = negative = inOperation = false;
      continue;
    }
    if (OPERATION.test(token) && (afterNumber || last !== null)) {
      flush();
      afterNumber = false;
      inOperation = true;
      continue;
    }
    if (/^[\d.]/.test(token)) {
      flush();
      push(Number(token.replace(/,/g, "")));
      continue;
    }
    if (token === "-" || token === "minus" || token === "dash" || token === "negative") {
      flush();
      negative = token === "negative" || !afterNumber;
      if (!negative) inOperation = true;
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
    if (token === "point" && kindOf(next) === "unit") {
      // "point eight five": the digits after the point, one word each. A number word or a digit after them
      // ("point six sixty") is a form code does not read.
      last ??= "unit";
      while (kindOf(tokens[i + 1] ?? "") === "unit") decimals += String(wordValue(tokens[++i])!);
      if (/^\d/.test(tokens[i + 1] ?? "") || kindOf(tokens[i + 1] ?? "") !== null) unreadable = true;
      flush();
      continue;
    }
    // Any other "point" next to a number ("point sixty-six", "one point sixty-six", "66 point 0").
    if (token === "point" && (numberNext || afterNumber || last !== null)) {
      unreadable = true;
      continue;
    }
    // "two hundred and five" is one number; "27 and 66" is two numbers, and 66 is no answer on its own.
    if (token === "and" && (last === "hundred" || last === "thousand") && kindOf(tokens[i + 1] ?? "") !== null) continue;
    if (token === "and" && (afterNumber || last !== null)) {
      flush();
      afterNumber = false;
      inOperation = true;
      continue;
    }
    const kind = kindOf(token);
    if (kind === null) {
      // Another word ends a number; a sign said before it still holds ("negative, I think, 66").
      flush();
      afterNumber = false;
      continue;
    }
    if (startsNewNumber(last, kind)) flush();
    switch (kind) {
      case "unit":
      case "teen":
      case "ten":
        current += wordValue(token)!;
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
  let lastInOperation = false;
  const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item !== "number") continue;
    const [between, after] = [items[i + 1], items[i + 2]];
    lastInOperation = operands.get(i) ?? false;
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
  return { values, unreadable, lastInOperation };
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

/**
 * What a turn takes back to, or null when it takes nothing back. A correction word takes back a number said before it
 * ("66, no, 56"), and it puts a new answer in place when a number, or a form code cannot read, comes after it
 * ("actually 56", "actually point sixty-six"). "No, I just knew it" takes nothing back. `kept` is the last number kept,
 * or null when no number is kept or code cannot read it.
 */
export function takenBack(text: string): { kept: AnswerValue | null } | null {
  const parts = text.split(CORRECTION);
  if (parts.length === 1) return null;
  const after = readNumbers(parts[parts.length - 1]);
  const before = parts.slice(0, -1).some((p) => {
    const read = readNumbers(p);
    return read.values.length > 0 || read.unreadable;
  });
  if (!before && after.values.length === 0 && !after.unreadable) return null;
  const readable = !after.unreadable && !after.lastInOperation && !offersChoice(parts[parts.length - 1]);
  return { kept: readable ? after.values[after.values.length - 1] ?? null : null };
}

/** The text offers numbers as a choice ("is it 66 or 56?"): none of them is the child's answer yet. */
export const offersChoice = (text: string) => text.split(/\bor\b/i).filter((p) => valuesIn(p).length > 0).length > 1;
