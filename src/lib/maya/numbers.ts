// The numbers in a spoken or written turn (#321): what the child said, as speech-to-text writes it ("66", "sixty-six",
// "two hundred and five", "0.85", ".85", "point eight five", "-66", "minus 66", "3/4", "1 3/8", "26 R 1", "26 remainder 1").
// In a fraction call (#407) the exact spoken fraction forms code writes are read too ("three quarters", "fourteen
// sixteenths", "one and a half": writtenFractions). A number form code cannot read ("three quarter", "twenty-fourths",
// "66 squared") is flagged, so the session confirms it instead of guessing. Maya's own claims are checked in claims.ts.
// Pure TypeScript.
import type { AnswerValue } from "@/lib/question-package";
import { writtenTimes } from "./clock-times";

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
/** A value-changing word, every fraction word included ("sixteenths"): read only in the exact forms of writtenFractions. */
const changes = (token: string) => CHANGES.test(token) || DENOMINATORS.has(token);
/** Words that join a value-changing word to its number ("half of 66", "66 and a half", "square root of 66"). */
const LINK = /^(?:of|a|an|the|and)$/;
/**
 * Place words right after a number. After a digit or a teen ("6 tens", "sixteen ones") they name the digits of a column,
 * as a child says a step ("I got 6 tens"): the number is kept as that step's value, but it is never the final answer.
 * After a bigger number ("66 tens") they change its value: a form code does not read yet.
 */
const PLACE = /^(?:ones|tens|hundreds|thousands)$/;
/**
 * The two-word places of a 5- or 6-digit number: "ten thousands", "hundred thousands" (always plural). They name a column,
 * never the number 10 or 100: "6 ten thousands" is a column's digits, as "6 tens" is; "carry 1 to the ten thousands" is
 * a place. The singular ("ten thousand") stays a number.
 */
const bigPlaceAt = (tokens: string[], k: number) => (tokens[k] === "ten" || tokens[k] === "hundred") && tokens[k + 1] === "thousands";
/** The largest number a place word may follow as a column's digits ("19 ones"); above it the form is unreadable. */
const PLACED_MAX = 19;
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
const TOKEN = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+|\/|-|[a-z]+|[+×*÷=%^\u00B2\u00B3\u00B9\u2070-\u2079]|[.!?;\n]|\u2064|\u2065/g;
const BOUNDARY = /^[.!?;\n]$/;
/** An ordinal ending on a written number ("66th", "7 8ths"): the number is not an answer as said. */
const ORDINAL = /\d(?:st|nd|rd|th)s?\b/i;
/**
 * A written mixed number: a whole number, one space and a fraction ("1 3/8"), not inside a longer number. Code marks the
 * space with an invisible character (U+2064) the tokens keep, so "1 3/8" is one value and "1, 3/8" two.
 */
const MIXED = /(?<![\d.,/])(\d+) (\d+) ?\/ ?(\d+)(?!\d|\.\d|\s*\/)/g;
const MIX_MARK = "\u2064";
/** A clock time's colon, from writtenTimes in a clock-time call: "7:03" is the hour, this mark, and the minutes. */
const CLOCK_MARK = "\u2065";
/** An unsupported fraction expression. None of its number parts may be scored. */
const UNREAD_MARK = "\u2063";

/** Every minus sign as "-": the true minus and the dashes speech-to-text may write. */
export const plainMinus = (text: string) => text.replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D]/g, "-");

export interface NumbersRead {
  values: AnswerValue[];
  /** The text has a number form code does not read ("three quarters", "66 squared"): confirm it, do not guess. */
  unreadable: boolean;
  /** The last number is the second number of an operation ("27 minus 66"), so it is not an answer the child kept. */
  lastInOperation: boolean;
  /**
   * For each value, in order: it is never a final answer, because a place word follows it ("6 tens": a column's
   * digits) or it names a digit the child points at ("the one I carried", "I wrote the 6"). It may still answer a step.
   */
  notAnswer: boolean[];
  /** For each value, in order: it is the second number of an operation ("27 plus 39"). */
  operand: boolean[];
}

/**
 * The numbers, fractions and remainder answers in a text, in order. Number words join into one number ("sixty six" is
 * 66); a new number starts where the words cannot continue one ("sixty... no, sixty-six" is 60 and 66). A minus sign or
 * "negative" before a number makes it negative; "minus" or "-" after a number in the same sentence is a subtraction.
 * A sentence end or a new line (between two turns) ends a number, so "27. -66." is 27 and -66.
 */
/** The words after "to the" that name a place on the page, never a value: "to the tens", "to the top", "to the next column". */
const TO_THE_PLACE = /^(?:ones?|tens?|hundreds?|thousands?|tenths?|hundredths?|thousandths?|top|bottom|left|right|next|column|columns|side|front|end|row|board|paper|page)$/;

export function readNumbers(text: string, options?: ReadOptions): NumbersRead {
  text = prepared(text, options);
  if (text.includes(UNREAD_MARK)) return { values: [], unreadable: true, lastInOperation: false, notAnswer: [], operand: [] };
  // A hyphen between words joins a number ("sixty-six"); elsewhere it is a minus sign.
  const tokens = plainMinus(text).toLowerCase().replace(/\b(mm|cm|dm|km|m)²(?![a-z0-9])/g, "$1").replace(/\b(?:square|squared)\s+(?=(?:(?:milli|centi|deci|kilo)?met(?:re|er)s?|mm|cm|dm|km|m)\b)/g, "").replace(/([a-z])-(?=[a-z])/g, "$1 ").match(TOKEN) ?? [];
  // First the numbers, with a fraction bar, a remainder mark or a mixed-number mark where one was said; then each "number
  // bar number" becomes a fraction, each "number mix number bar number" a mixed number and each "number R number" a
  // remainder answer.
  const items: (number | "bar" | "rem" | "mix" | "clock")[] = [];
  /** For each number in items: it is the second number of an operation. */
  const operands = new Map<number, boolean>();
  /** The numbers in items a place word follows ("6 tens"). */
  const placed = new Set<number>();
  /** The numbers in items said right after "the", "this" or "that" ("the one I carried", "I wrote the 6"). */
  const named = new Set<number>();
  /** The token before the number being read: "the", "this" or "that" make it a named digit. */
  let pointedAt = false;
  const POINTER = /^(?:the|this|that)$/;
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
    while (LINK.test(tokens[k] ?? "") || changes(tokens[k] ?? "")) k += d;
    return isNumber(tokens[k]);
  });
  let unreadable = ORDINAL.test(text);
  const push = (n: number) => {
    operands.set(items.length, inOperation);
    if (pointedAt) named.add(items.length);
    pointedAt = false;
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
  const mark = (m: "bar" | "rem" | "mix" | "clock") => {
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
    // "6 ten thousands", "2 hundred thousands", "six ten thousands": the digits of that column, as for a one-word place
    // below. Only right after a finished number: digits, or a unit or teen word before "ten", which cannot go on with a
    // number. "one hundred thousands" and "a hundred thousands" may mean 100000, and a place with no number before it is
    // read as it always was.
    if (bigPlaceAt(tokens, i) && ((afterNumber && last === null) || (token === "ten" && (last === "unit" || last === "teen")))) {
      flush();
      const at = items.length - 1;
      const n = items[at];
      if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= PLACED_MAX) placed.add(at);
      else unreadable = true;
      i += 1;
      continue;
    }
    if (changes(token)) {
      if (linked(i)) unreadable = true;
      continue;
    }
    if (PLACE.test(token) && (afterNumber || last !== null)) {
      flush();
      const at = items.length - 1;
      const n = items[at];
      if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= PLACED_MAX) placed.add(at);
      else unreadable = true;
      continue;
    }
    // "6 in the ones", "16 for the ones": the digits of a column, as above. A bigger number is left as it is.
    if ((token === "in" || token === "for") && next === "the" && (PLACE.test(tokens[i + 2] ?? "") || bigPlaceAt(tokens, i + 2)) && (afterNumber || last !== null)) {
      flush();
      const at = items.length - 1;
      const n = items[at];
      if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= PLACED_MAX) placed.add(at);
      i += bigPlaceAt(tokens, i + 2) ? 3 : 2;
      continue;
    }
    // "66 to the power of 2" is a form code does not read. "Carry the 1 to the tens" names a place (#605: a clear
    // carry was confirmed as if unclear): "to the" before a place or position word is a location, read as nothing.
    if (token === "to" && next === "the" && (afterNumber || last !== null)) {
      // "to the ten thousands" is the same location, all four words.
      if (bigPlaceAt(tokens, i + 2)) i += 3;
      else if (!TO_THE_PLACE.test(tokens[i + 2] ?? "")) unreadable = true;
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
      pointedAt = POINTER.test(tokens[i - 1] ?? "");
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
    if (token === MIX_MARK) {
      mark("mix");
      continue;
    }
    if (token === CLOCK_MARK) {
      mark("clock");
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
    // "a ten", "the carry ten", "carried one": a digit the child points at. "a hundred" is still a number.
    if (last === null) pointedAt = POINTER.test(tokens[i - 1] ?? "") || (/^(?:an?|carry|carried)$/.test(tokens[i - 1] ?? "") && (token === "ten" || token === "one"));
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
  const notAnswer: boolean[] = [];
  const operand: boolean[] = [];
  const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item !== "number") continue;
    const [between, after] = [items[i + 1], items[i + 2]];
    lastInOperation = operands.get(i) ?? false;
    notAnswer.push(placed.has(i) || named.has(i));
    operand.push(lastInOperation);
    const [n, bar, d] = [items[i + 2], items[i + 3], items[i + 4]];
    if (between === "mix" && whole(item) && item >= 1 && whole(n) && bar === "bar" && whole(d) && n >= 1 && n < d) {
      values.push({ type: "mixed", whole: item, numerator: n, denominator: d });
      i += 4;
    } else if (between === "bar" && whole(item) && whole(after) && after > 0) {
      values.push({ type: "fraction", numerator: item, denominator: after });
      i += 2;
    } else if (between === "rem" && whole(item) && whole(after) && item >= 0 && after >= 0) {
      values.push({ type: "remainder", quotient: item, remainder: after });
      i += 2;
    } else if (between === "clock" && whole(item) && whole(after) && item >= 1 && item <= 12 && after >= 0 && after <= 59) {
      values.push({ type: "time", hours: item, minutes: after, period: null });
      i += 2;
    } else {
      values.push({ type: "number", value: item });
    }
  }
  return { values, unreadable, lastInOperation, notAnswer, operand };
}

/** The numbers, fractions and remainder answers in a text, in order (readNumbers). */
export const valuesIn = (text: string, options?: ReadOptions): AnswerValue[] => readNumbers(prepared(text, options)).values;

// ---------- Spoken fractions (#407) ----------

/** How a turn is read: `fractions` reads the exact spoken fraction forms, in a call about a fraction question. */
export interface ReadOptions {
  fractions?: boolean;
  /**
   * The question's own numbers: its printed operands and every number of its worked steps (digits, carries, column
   * totals). Working the child drops after an answer may hold these and single digits only (PR #624 review).
   */
  known?: number[];
  /** Scope reads complete operands too. Answer reading still rejects unfinished fraction calculations. */
  operands?: boolean;
  /** The carries of the question's worked steps: the only numbers a carry sentence may point back at ("I carry 1."). */
  carries?: number[];
  /** Numbers from the child's earlier turns and done steps: the only ones "I already said" may point back at. */
  saidBefore?: number[];
  /**
   * A clock-time call (time-add, C3c): times are read too, in their exact forms only (clock-times.ts): "6:53",
   * "six fifty-three", "seven oh three", "seven o'clock". Any other form stays numbers.
   */
  times?: boolean;
}

/** The text as the readers take it: in a fraction call, with its spoken fractions written (writtenFractions). */
const prepared = (text: string, options?: ReadOptions) => {
  const timed = options?.times ? writtenTimes(text, CLOCK_MARK) : text;
  return options?.fractions ? writtenFractions(timed.replace(POINTING_ONE, "$1"), options).replace(MIXED, `$1${MIX_MARK}$2/$3`) : timed;
};
/**
 * "that one" or "this one" at the end of a clause is the question, not a number ("I got 7/8 for that one."). In a fraction
 * call the stray "one" made the turn unreadable, so Maya asked for an answer the child had just given (first-ship practice,
 * C38-r1). "that one third" goes on to a fraction and stays as it is.
 */
const POINTING_ONE = /\b(that|this)\s+one\b(?=\s*(?:[.,;:!?\n]|$))/gi;

/** The denominator words code reads, one word each, singular and plural: "half" and "halves" are 2. */
const DENOMINATORS = new Map<string, { value: number; plural: boolean }>();
for (const [one, many, value] of [
  ["half", "halves", 2], ["third", "thirds", 3], ["quarter", "quarters", 4], ["fourth", "fourths", 4], ["fifth", "fifths", 5],
  ["sixth", "sixths", 6], ["seventh", "sevenths", 7], ["eighth", "eighths", 8], ["ninth", "ninths", 9], ["tenth", "tenths", 10],
  ["eleventh", "elevenths", 11], ["twelfth", "twelfths", 12], ["thirteenth", "thirteenths", 13], ["fourteenth", "fourteenths", 14],
  ["fifteenth", "fifteenths", 15], ["sixteenth", "sixteenths", 16], ["seventeenth", "seventeenths", 17], ["eighteenth", "eighteenths", 18],
  ["nineteenth", "nineteenths", 19], ["twentieth", "twentieths", 20], ["thirtieth", "thirtieths", 30], ["fortieth", "fortieths", 40],
  ["fiftieth", "fiftieths", 50], ["sixtieth", "sixtieths", 60], ["seventieth", "seventieths", 70], ["eightieth", "eightieths", 80],
  ["ninetieth", "ninetieths", 90], ["hundredth", "hundredths", 100],
] as const) {
  DENOMINATORS.set(one, { value, plural: false });
  DENOMINATORS.set(many, { value, plural: true });
}
/**
 * What may follow a singular fraction ("one half", "a quarter") for code to read it: the end of a clause, or a word that
 * goes on with math or an explanation. Anything else ("a third time", "a quarter past 3") is not read as a fraction.
 */
const AFTER_ONE = /^(?:[.,!?;:\n+=×÷-]|of|and|or|is|plus|minus|so|equals|then|right)$/;

/**
 * The text with each exact spoken fraction written as code writes it (#407): a number (digits or number words) then a
 * plural denominator word ("three quarters", "fourteen sixteenths", "7 eighths") is "3/4", "14/16", "7/8"; one, 1, a or an
 * then a singular one, at the end of a clause or before a word that goes on ("a half", "one eighth"), is "1/2", "1/8"; a
 * whole number, "and", then a proper fraction ("one and three eighths", "2 and a half", "1 and 3/4") is a mixed number
 * ("1 3/8"). Every other form is left as said, so the reader flags it and Maya confirms it: "three quarter" (no plural),
 * "twenty-fourths" (two words), "three quarters of 8" (an operation), "a third time". Fail-closed: code writes the forms it
 * reads, and never guesses the rest (D-199).
 */
export function writtenFractions(text: string, options?: ReadOptions): string {
  const low = plainMinus(text).toLowerCase().replace(/([a-z])-(?=[a-z])/g, "$1 ");
  // A lower-case conversion that changes offsets cannot be parsed safely.
  if (low.length !== text.length) return UNREAD_MARK;
  const words = [...low.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+|[a-z]+|\S|\n/g)]
    .map((m) => ({ t: m[0], at: m.index, end: m.index + m[0].length }));
  type Span = { from: number; to: number; text: string; anchor: number };
  const spans: Span[] = [];
  // An operand must touch the bar, or have only horizontal space between it and the bar. Never cross a sentence.
  const adjacent = (a: number, b: number) => a >= 0 && b < words.length && /^[ \t]*$/.test(low.slice(words[a].end, words[b].at));
  const numeric = (i: number) => i >= 0 && i < words.length && (/^(?:\d|\.\d)/.test(words[i].t) || kindOf(words[i].t) !== null);
  /** One complete nonnegative integer, without "and". A run such as "six sixty" has no reading. */
  const integer = (at: number, direction: -1 | 1) => {
    if (at < 0 || at >= words.length) return null;
    let from = at;
    let to = at;
    if (kindOf(words[at].t) !== null) {
      while (direction < 0 && from > 0 && kindOf(words[from - 1].t) !== null && adjacent(from - 1, from)) from -= 1;
      while (direction > 0 && to + 1 < words.length && kindOf(words[to + 1].t) !== null && adjacent(to, to + 1)) to += 1;
    } else if (!/^\d+$/.test(words[at].t)) return null;
    const read = readNumbers(low.slice(words[from].at, words[to].end));
    const v = read.values[0];
    return !read.unreadable && read.values.length === 1 && v.type === "number" && Number.isSafeInteger(v.value) && v.value >= 0
      ? { from, to, value: v.value } : null;
  };
  const invalid = (at: number) => spans.push({ from: at, to: at, text: UNREAD_MARK, anchor: at });
  for (let k = 0; k < words.length; k++) {
    const token = words[k].t;
    const bar = token === "/" || token === "over";
    const den = DENOMINATORS.get(token);
    if (!bar && !den) continue;
    const article = den && !den.plural && /^(?:a|an)$/.test(words[k - 1]?.t ?? "");
    const n = article ? { from: k - 1, to: k - 1, value: 1 } : integer(k - 1, -1);
    const d = bar ? integer(k + 1, 1) : { from: k, to: k, value: den!.value };
    // Ordinals and clock wording stay ordinary words: "a third time", "a quarter past 3".
    if (!bar && !n) {
      // "I used eighths." names a method, not an incomplete amount. Ignore only
      // this complete nonnumeric sentence; keep doubt, corrections and numeric work.
      const method = den!.plural && /(?:^|[.!?;\n])\s*i\s+used\s+$/.test(low.slice(0, words[k].at)) &&
        /^\s*(?:[.!?;\n]|$)/.test(low.slice(words[k].end));
      if (method) spans.push({ from: k, to: k, text: "", anchor: k });
      else if (den!.plural) invalid(k);
      continue;
    }
    const following = k + 1 < words.length ? low.slice(words[k + 1].at) : "";
    const explanation = EXPLANATION.exec(following);
    const explains = explanation !== null && /^[’']?$/.test(following.slice(0, explanation.index));
    if (den && !den.plural && !(k + 1 >= words.length || AFTER_ONE.test(words[k + 1].t) || explains || (options?.operands && numeric(k + 1)))) continue;
    if (!n || !d || !adjacent(n.to, k) || (bar && !adjacent(k, d.from)) || d.value === 0 ||
        (den && (n.value === 1) === den.plural)) {
      invalid(k);
      continue;
    }
    let from = n.from;
    const to = d.to;
    let value = `${n.value}/${d.value}`;
    const and = words[from - 1]?.t === "and" && adjacent(from - 1, from);
    const typedMixed = bar && token === "/" && /^\d+$/.test(words[n.from].t) &&
      /^\d+$/.test(words[from - 1]?.t ?? "") && low.slice(words[from - 1].end, words[from].at) === " ";
    if (and || typedMixed) {
      const w = integer(from - (and ? 2 : 1), -1);
      // "one hundred and fourteen sixteenths" is ambiguous, not 100 14/16.
      if (!w || !adjacent(w.to, from - (and ? 1 : 0)) || w.value < 1 || n.value < 1 || n.value >= d.value ||
          /^(?:hundred|thousand)$/.test(words[w.to].t)) {
        invalid(k);
        continue;
      }
      from = w.from;
      value = `${w.value} ${value}`;
    }
    // No leftover number, decimal point, sign, "and", or extra fraction bar may attach to this expression.
    const joins = (i: number) => /^(?:and|point|minus|negative|dash|over|\/|[+\-])$/.test(words[i]?.t ?? "") || numeric(i);
    const before = from - 1;
    const after = to + 1;
    const attachedBefore = before >= 0 && adjacent(before, from) && joins(before) && !(options?.operands && /^[+\-]$/.test(words[before].t) && before > 0);
    const attachedAfter = after < words.length && adjacent(to, after) && ((numeric(after) && !options?.operands) || /^(?:and|over|\/)$/.test(words[after].t) || DENOMINATORS.has(words[after].t));
    if (attachedBefore || attachedAfter) invalid(k);
    else spans.push({ from, to, text: value, anchor: k });
  }
  // Recognize local fraction forms before classifying corrections. Reuse these
  // exact spans so article fractions and digit fractions have the same grammar.
  // Their source offsets stay unchanged, even when the written form is shorter.
  const fractionStarts = new Set(spans.filter((span) => span.text && span.text !== UNREAD_MARK).map((span) => words[span.from].at));
  const corrections = correctionRuns(low, (at) => fractionStarts.has(at)).filter((run) => run.clean);
  const expressionBoundary = (at: number) => {
    const word = words[at];
    return (options?.operands && /^(?:minus|-)$/i.test(word.t)) || /^[.!?;:\n]$/.test(word.t) || RESULT.test(word.t) || OPERATION.test(word.t) || EXPLANATION.test(word.t) ||
      /^(?:so|then)$/.test(word.t) || corrections.some((run) => word.at >= run.index && word.end <= run.end);
  };
  const recognizedNumbers = new Set(spans.filter(span => span.text && span.text !== UNREAD_MARK).flatMap(span =>
    Array.from({ length: span.to - span.from + 1 }, (_, i) => span.from + i)));
  for (const span of spans) {
    if (!span.text || span.text === UNREAD_MARK) continue;
    let expressionFrom = span.from;
    let expressionTo = span.to;
    while (expressionFrom > 0 && !expressionBoundary(expressionFrom - 1)) expressionFrom -= 1;
    while (expressionTo + 1 < words.length && !expressionBoundary(expressionTo + 1)) expressionTo += 1;
    // Every numeric fragment in this expression must belong to the recognized
    // integer/fraction/mixed form. Never retain only the fraction of an unsupported mixed form.
    const unconsumedNumber = words.slice(expressionFrom, expressionTo + 1)
      .some((_word, i) => { const at = expressionFrom + i; return (at < span.from || at > span.to) && numeric(at) && !(options?.operands && recognizedNumbers.has(at)); });
    // Signs and "of" belong to this expression, not arithmetic in its explanation or an earlier corrected answer.
    const expression = words.slice(expressionFrom, expressionTo + 1);
    const ofPhrase = expression.some((w) => w.t === "of");
    const signed = expression.some((w) => /^(?:minus|negative|dash|[+\-])$/.test(w.t));
    // An operation word is an expression boundary, so it is not in `expression`. One that touches the expression
    // ("1/2 +", "plus 1/2") makes it an unfinished calculation, which Maya must confirm (R409-R7-1). An operation
    // after a result or explanation word ("is", "because") does not touch it.
    const operand = [expressionFrom - 1, expressionTo + 1]
      .some((at) => at >= 0 && at < words.length && OPERATION.test(words[at].t));
    const signAt = expressionFrom - 1;
    const unary = options?.operands && signAt >= 0 && /^(?:minus|[+\-])$/.test(words[signAt].t) &&
      readNumbers(low.slice(0, words[signAt].at)).values.length === 0;
    if (unconsumedNumber || ofPhrase || signed || unary || (!options?.operands && operand)) {
      span.from = span.to = span.anchor;
      span.text = UNREAD_MARK;
    }
  }
  // Overlapping expressions ("3/4/5") are unsupported as a whole, never separate fractions.
  spans.sort((a, b) => a.from - b.from);
  let out = "";
  let from = 0;
  for (const span of spans) {
    const start = words[span.from].at;
    if (start < from) { out += UNREAD_MARK; continue; }
    out += text.slice(from, start) + span.text;
    from = words[span.to].end;
  }
  return out + text.slice(from);
}

/** Words a child uses to take back what they just said: "sixty-six... no, sixty", "66... no, I don't know". */
const CORRECTION = /\b(?:no|wait|i mean|actually|oops)\b/gi;
/** Words that may sit between a correction word and the number it puts in place ("no wait, 65", "no, I mean 65"). */
const TAKE_BACK_FILLER = /^(?:[\s,.!?…:;-]|\b(?:no|wait|i mean|actually|oops|um+|uh+|it's|its|it is|it was|i got|i get|i think|i think it's|the answer is|it should be|that's|thats|that is)\b)*/i;

/** Words a spoken number may start with before its digits or number words ("point sixty-six", "minus 3"). */
const NUMBER_LEAD = /^(?:point|minus|negative|a|an|one|half)$/i;

/** One run of correction words ("no wait", "no, I mean"), and whether it is a clean correction or only unclear. */
interface CorrectionRun { index: number; end: number; clean: boolean; numberNext?: boolean }

/**
 * Every run of correction words in a turn (R391-1-1, R391-2). A run is clean only in one of two shapes: it starts a
 * clause (the start of the turn or a punctuation mark before it) and a number is the next word after it ("65, no, 66",
 * "No wait, 65", "It's 66, actually 65"); or it starts a clause and stands alone, so it withdraws what came before with
 * nothing in its place ("66... no, I don't know"). Any other correction word ("66 no that is wrong", "there are actually
 * 66 blocks", "I have no idea") is unclear: the turn then holds no final answer, so Maya asks rather than guess.
 */
function correctionRuns(text: string, numberStartsAt?: (at: number) => boolean): CorrectionRun[] {
  const runs: CorrectionRun[] = [];
  for (const m of text.matchAll(CORRECTION)) {
    const index = m.index ?? 0;
    const end = index + m[0].length;
    const last = runs[runs.length - 1];
    // A correction word right after another (only punctuation between) continues its run: "no wait", "no, I mean".
    if (last && /^[\s,.!?…:;-]*$/.test(text.slice(last.end, index))) {
      last.end = end;
      continue;
    }
    runs.push({ index, end, clean: false });
  }
  for (const r of runs) {
    const after = text.slice(r.end);
    const filler = (TAKE_BACK_FILLER.exec(after)?.[0] ?? "").length;
    const words = after.slice(filler).split(/\s+/);
    // The next word is a number, or starts a spoken number form ("point sixty-six", "minus 3", "a half").
    const lead = NUMBER_LEAD.test(words[0] ?? "") ? words.slice(0, 3).join(" ") : words[0] ?? "";
    const read = readNumbers(lead);
    const numberFollows = read.values.length > 0 || read.unreadable || numberStartsAt?.(r.end + filler) === true;
    // The start of the turn or a punctuation mark before it, maybe with an interjection ("Oh wait, 28", "Hmm, no, 66").
    const clauseStart = /(?:^|[,.!?…;:-])\s*(?:(?:oh|ah|oops|um+|uh+|hmm+|okay|ok)[\s,.!?…]*)?$/i.test(text.slice(0, r.index));
    const alone = /^\s*(?:[,.!?…;:-]|$)/.test(after);
    // A bare "no" straight before a number ("No 66") may answer "no" to Maya and then give 66, or take something back:
    // unclear (R391-4-2). "No, 66" and "no wait, 66" are clean.
    const bareNo = /^no$/i.test(text.slice(r.index, r.end).trim()) && !/^\s*[,.!?…;:-]/.test(after);
    r.clean = clauseStart && (alone || (numberFollows && !bareNo));
    r.numberNext = numberFollows;
  }
  return runs;
}

/** Where the child takes something back: every correction run, clean or unclear (correctionRuns). */
const takeBacks = (text: string) => correctionRuns(text);

/**
 * A negative word ("It is not 66", "66 isn't right", "that's wrong", "I don't think it's 66"). It takes back a number in
 * its own sentence (withoutNegated), and one it points back to (POINTS_BACK). A number beside any negative is never sure
 * (R391-3): Maya confirms it before she accepts it.
 */
const NEGATIVE = /\b(?:not|never|wrong|nope|nah|false|untrue|doubt|doubts|withdraw|withdrawn|retract|incorrect|mistake|mistaken|reject|rejected|ruled|scratch|forget|ignore|undo|cancel|dont|doesnt|didnt|isnt|wasnt|arent|werent|cant|wont|couldnt|shouldnt|aint)\b|\w+n['’]t\b|\b(?:take|taking|took|takes) (?:that|it|this|my answer|it all)? ?back\b|\b(?:erase|erased|delete|deleted|rub out|cross out|crossed out|start over|redo|different answer)\b|\b(?:change|changed|changing) (?:my|the) answer\b|\b(?:changed?|changing) my mind\b|\bnever ?mind\b/i;
/**
 * A negative that points back at what the child said, in a sentence of its own: "That is wrong", "That's not it", "I
 * don't think so", "Not really", "I take it back" (#605). Every other negative ("I don't know what to do with it", "I
 * can't remember why") says nothing about the number before it, and the number stays. "My teacher says 56. You are wrong."
 * counts as pointing back: the 56 is not the child's own answer, so no number is kept and Maya asks on (C10).
 */
const POINTS_BACK = /\b(?:wrong|nope|nah|false|untrue|doubts?|withdraw|withdrawn|retract|incorrect|mistake|mistaken|reject|rejected|ruled|scratch|forget|ignore|undo|cancel)\b|\b(?:take|taking|took|takes) (?:that|it|this|my answer|it all)? ?back\b|\b(?:erase|erased|delete|deleted|rub out|cross out|crossed out|start over|redo|different answer)\b|\b(?:change|changed|changing) (?:my|the) answer\b|\b(?:changed?|changing) my mind\b|\bnever ?mind\b|\b(?:that|it|this|those|these|mine|answer)(?:['’]?s| is| was| are| were)?\s+(?:not|never)\b|\b(?:that|it|this|those|these|mine|answer)\s+(?:isn['’]?t|wasn['’]?t|aren['’]?t|weren['’]?t)\b|\b(?:isn['’]?t|wasn['’]?t|aren['’]?t|not|never)\s+(?:right|correct|true|it|the answer|that|so)\b|\b(?:don['’]?t|do not|didn['’]?t|did not)\s+(?:think|believe|mean|want)\b|^[\s\W]*(?:not|never)(?:\s+(?:really|quite|at all))?[\s\W]*$/i;
/**
 * The clauses a negative can reach: a sentence end, a semicolon, "but" or ", so" ends one ("16 but I don't know what to
 * do", "The one is not a big deal, so it's still 56": practice run 1 of #605, C10-r1).
 */
const CLAUSE_END = /(?<=[.!?…])\s+|;|\bbut\b|,\s*so\b/i;

/**
 * The text with what the child's negatives take back left out (#605, R391-3, R391-4-1, R391-6-2): the numbers in a
 * negative's own clause, the same numbers said before it, and every number before a negative that points back. A line
 * with no sentence end runs on into the next one ("I reject this answer:" then "66"). `taken`: a number was taken back.
 */
function withoutNegated(text: string): { text: string; taken: boolean } {
  if (!NEGATIVE.test(text)) return { text, taken: false };
  const kept: { line: number; clause: string }[] = [];
  let taken = false;
  let runsOn = false;
  const holds = (x: string) => { const r = readNumbers(x); return r.values.length > 0 || r.unreadable; };
  turnLines(text).forEach((line, n) => {
    const clauses = line.split(CLAUSE_END);
    clauses.forEach((clause, i) => {
      if (!NEGATIVE.test(clause) && !(i === 0 && runsOn)) {
        kept.push({ line: n, clause });
        return;
      }
      if (holds(clause)) {
        taken = true;
        const rejected = readNumbers(clause).values.map((v) => JSON.stringify(v));
        for (let k = kept.length - 1; k >= 0; k--) if (readNumbers(kept[k].clause).values.some((v) => rejected.includes(JSON.stringify(v)))) kept.splice(k, 1);
      }
      if (POINTS_BACK.test(clause.replace(/’/g, "'")) && kept.some((x) => holds(x.clause))) {
        taken = true;
        kept.length = 0;
      }
    });
    runsOn = !/[.!?…]\s*$/.test(line) && NEGATIVE.test(clauses[clauses.length - 1]);
  });
  // The kept clauses, with a boundary between them, so "sixty but six" does not read as one number.
  const lines = new Map<number, string[]>();
  for (const k of kept) lines.set(k.line, [...(lines.get(k.line) ?? []), k.clause]);
  return { text: [...lines.values()].map((x) => x.join(" ; ")).join("\n"), taken };
}

/**
 * Words of doubt, and a question mark (R391-5): "maybe 66", "is it 66?", "66 or something", "66, I am unsure". The
 * number may still be judged wrong, but it is never accepted as right: Maya confirms it first. "I'm sure it's 66" is no
 * doubt (#605); "I'm not sure" is a negative beside the number, so it is not sure either.
 */
const DOUBT = /\b(?:maybe|perhaps|probably|possibly|guess|guessing|unsure|or something|or so|ish|dunno|idk|kinda|sorta)\b|\?/i;

/** The child's turn lines, blank lines left out ("Maybe", "", "66" reads as "Maybe" then "66", R391-7-3). */
const turnLines = (text: string) => text.split("\n").filter((line) => line.trim() !== "");

/** The first line to read from: the line before `first` when it runs on into it (no sentence end: "Maybe" then "66"). */
const runsOn = (lines: string[], first: number) => (first > 0 && !/[.!?]\s*$/.test(lines[first - 1]) ? first - 1 : first);

/**
 * A negative in the child's first turn that holds a number, the turn just before it ("I reject this answer:" then "66",
 * R391-6-2), or any turn after it (a line is one child turn: "I don't know." then "Sixteen for the ones." has none). The
 * final answer is then never sure (R391-3); what the negative takes back is withoutNegated's.
 */
const negativeNearAnswer = (text: string) => {
  const lines = turnLines(text);
  const first = lines.findIndex((line) => { const r = readNumbers(line); return r.values.length > 0 || r.unreadable; });
  return first >= 0 && lines.slice(runsOn(lines, first)).some((line) => NEGATIVE.test(line));
};

/** A word of doubt or a question mark in the child's first turn with a number or any turn after it (DOUBT). */
const doubtNearAnswer = (text: string) => {
  const lines = turnLines(text);
  const first = lines.findIndex((line) => { const r = readNumbers(line); return r.values.length > 0 || r.unreadable; });
  return first >= 0 && lines.slice(runsOn(lines, first)).some((line) => DOUBT.test(line));
};

/**
 * The turn has a correction word in an unclear shape after a number it could take back: it holds no final answer
 * (correctionRuns). An unclear word before any number ("I am software with no body. I got 66.") takes nothing back.
 */
const unclearCorrection = (text: string) => correctionRuns(text).some((r) => {
  if (r.clean) return false;
  if (r.numberNext) return true;
  const before = readNumbers(text.slice(0, r.index));
  return before.values.length > 0 || before.unreadable;
});

/** The text split at every word that takes something back (takeBacks). */
function splitTakeBacks(text: string): string[] {
  const parts: string[] = [];
  let from = 0;
  for (const t of takeBacks(text)) {
    parts.push(text.slice(from, t.index));
    from = t.end;
  }
  parts.push(text.slice(from));
  return parts;
}

/**
 * The child's committed words: what follows the last word that takes something back ("sixty... no, sixty-six" commits
 * to "sixty-six"; "66... no, I don't know" commits to no number). The whole text when nothing was taken back.
 */
export function committedText(text: string): string {
  const parts = splitTakeBacks(text);
  return parts[parts.length - 1];
}

/**
 * Words that start the child's explanation of an answer (D-199): "because", "since", "cause" (also "'cause"), "cuz" and
 * "coz". "So I got 66, because six tens and six ones": the numbers after "because" explain 66, they are not the answer.
 */
const EXPLANATION = /\b(?:because|since|cause|cuz|coz)\b/i;

/**
 * The text with the child's explanations left out (D-199). An explanation runs from an explanation word to the end of
 * its turn (a new line), or to a word that takes something back, whichever comes first: "66 because six tens, no wait,
 * 65" keeps "66 no wait, 65", so the correction still wins. A sentence end does not end it, because speech-to-text puts
 * full stops anywhere ("66 because 7 + 9 is 16. And 2 + 3 + 1 is 6.").
 */
export function withoutExplanations(text: string): string {
  return text.split("\n").map((line) => {
    let out = "";
    let rest = line;
    for (let m = EXPLANATION.exec(rest); m; m = EXPLANATION.exec(rest)) {
      out += rest.slice(0, m.index);
      rest = rest.slice(m.index + m[0].length);
      const correction = takeBacks(rest)[0];
      if (!correction) return out;
      rest = rest.slice(correction.index);
    }
    return out + rest;
  }).join("\n");
}

/**
 * The clause is pure working, how the child got there, and states no answer (#605, PR #624 review): it holds an
 * operation, every number in it is a plain number, the last is an operand of that operation ("I added 2 and 3") or its
 * result ("7 plus 9 is 16", "2 plus 3 plus 1 is 6", "12 minus 8 is 4"), and it has no answer word. Any other clause
 * with a number ("I added 2 and 3 so my answer is 56") is kept, so it can be the final answer.
 */
function isWorking(clause: string): boolean {
  const r = readNumbers(clause);
  if (r.unreadable || r.values.length < 2 || !r.operand.some(Boolean) || ANSWER_WORD.test(clause)) return false;
  if (r.values.some((v) => v.type !== "number")) return false;
  const xs = r.values.map((v) => (v as { value: number }).value);
  if (r.operand[xs.length - 1]) return true;
  // The clause's own operation, and only one kind: "2 plus 3 is 6" is not working (2 × 3 is not what it says).
  const kinds = [WORK_ADD.test(clause), WORK_SUBTRACT.test(clause), WORK_MULTIPLY.test(clause)];
  if (kinds.filter(Boolean).length !== 1) return false;
  const before = xs.slice(0, -1);
  const last = xs[xs.length - 1];
  const result = kinds[0] ? before.reduce((a, b) => a + b, 0)
    : kinds[1] ? before.slice(1).reduce((a, b) => a - b, before[0])
    : before.reduce((a, b) => a * b, 1);
  return last === result;
}
const WORK_ADD = /\b(?:plus|and|add|added|adding|adds)\b|\+/i;
const WORK_SUBTRACT = /\b(?:minus|take away|takeaway|subtract|subtracted|subtracting)\b|[−-]\s*\d/i;
const WORK_MULTIPLY = /\b(?:times|multiplied|multiply)\b|[×*]/i;
const ANSWER_WORD = /\b(?:answer|final|got|get|gets|total|equals? to)\b/i;

/**
 * The text with the child's working after an answer left out (#605): "I got 66. 7 plus 9 is 16, so I carry the ten." keeps
 * "I got 66.". A clause with an operation before any answer stays ("7 plus 9 is 16."), and so does a new answer after the
 * working ("I got 66. 2 plus 3 is 5, so 56." has the final answer 56).
 */
/** The text with its working after an answer left out (`kept`), and the clauses left out (`dropped`). */
function workingSplit(text: string): { kept: string; dropped: string[] } {
  const keep = answerClauses();
  const dropped: string[] = [];
  const kept = text.split("\n").map((line) => line.split(/(?<=[.!?…,;:])\s+/).filter((clause) => {
    if (!holdsAnswer(clause) || keep(clause)) return true;
    dropped.push(clause);
    return false;
  }).join(" ")).join("\n");
  return { kept, dropped };
}

/** The result a clause of working makes: its stated result, or its operation over every number when it states none. */
function workingResult(clause: string): number | null {
  const r = readNumbers(clause);
  if (r.values.some((v) => v.type !== "number")) return null;
  const xs = r.values.map((v) => (v as { value: number }).value);
  const kinds = [WORK_ADD.test(clause), WORK_SUBTRACT.test(clause), WORK_MULTIPLY.test(clause)];
  if (kinds.filter(Boolean).length !== 1 || xs.length < 2) return null;
  if (!r.operand[xs.length - 1]) return xs[xs.length - 1];
  return kinds[0] ? xs.reduce((a, b) => a + b, 0) : kinds[1] ? xs.slice(1).reduce((a, b) => a - b, xs[0]) : xs.reduce((a, b) => a * b, 1);
}

/**
 * Dropped working cannot hide another answer (PR #624 review, fails closed on the outcome): each dropped clause holds
 * only single digits and the question's own numbers (`known`), or its working makes the kept final itself ("I got 66. I
 * added 20 and 40 and 6."). Any other dropped clause ("I added 20 and 30 and 6 so my final is 56") leaves the final
 * not sure, so Maya asks.
 */
function workingHidesAnswer(dropped: string[], final: AnswerValue | null, known: number[]): boolean {
  return dropped.some((clause) => {
    // A writing claim inside working can name a new answer. Its role must be confirmed, even for a known number.
    if (/\b(?:wrote|write|put)\b/i.test(clause)) return true;
    const r = readNumbers(clause);
    const plain = !r.unreadable && r.values.every((v) => v.type === "number" && ((Number.isInteger(v.value) && v.value >= 0 && v.value <= 9) || known.includes(v.value)));
    if (plain) return false;
    const made = workingResult(clause);
    return !(final?.type === "number" && made !== null && made === final.value);
  });
}

/**
 * The results of false equations the child keeps (PR #624 review rounds 2 and 3): a result word ("is", "are",
 * "equals", "makes", "gives", "=") with the number right after it, after a chain of numbers joined by operation words
 * right before it ("7 plus 9 is 6 and I carry the 1", "seven and nine make sixteen"), where the result is not that
 * operation's true result. Read on the words a take-back or a negative left (retainedText), word by word: a number on
 * its own before a result word ("16 is 1 ten") is no equation.
 */
export function falseEquationResults(text: string, options?: ReadOptions): AnswerValue[] {
  const out: AnswerValue[] = [];
  const tokens = numberTokens(retainedText(text, options));
  tokens.forEach((t, i) => {
    if (t.kind !== "result") return;
    const after = tokens[i + 1];
    if (!after || after.kind !== "number") return;
    // The chain right before the result word: number (op number)+.
    const chain: number[] = [];
    let op: "add" | "subtract" | "multiply" | null = null;
    let j = i - 1;
    while (j >= 0 && tokens[j].kind === "number") {
      chain.unshift((tokens[j] as { value: number }).value);
      const before = tokens[j - 1];
      if (!before || before.kind !== "op") break;
      if (op !== null && op !== before.op) return;
      op = before.op;
      j -= 2;
    }
    if (op === null || chain.length < 2) return;
    const truth = op === "add" ? chain.reduce((x, y) => x + y, 0) : op === "subtract" ? chain.slice(1).reduce((x, y) => x - y, chain[0]) : chain.reduce((x, y) => x * y, 1);
    if (after.value !== truth) out.push({ type: "number", value: after.value });
  });
  return out;
}

type NumberToken = { kind: "number"; value: number } | { kind: "op"; op: "add" | "subtract" | "multiply" } | { kind: "result" } | { kind: "word" };
const OP_WORDS: Record<string, "add" | "subtract" | "multiply"> = { plus: "add", "+": "add", and: "add", minus: "subtract", "−": "subtract", "-": "subtract", times: "multiply", "×": "multiply", x: "multiply" };
const RESULT_WORDS = new Set(["is", "are", "equals", "equal", "make", "makes", "gives", "give", "="]);

/** The words of a text as numbers ("twenty six" is 26), operation words, result words and other words. */
function numberTokens(text: string): NumberToken[] {
  const words = text.toLowerCase().replace(/[’]/g, "'")
    .replace(/\b(?:is|are)\s+equal\s+to\b|\bequals?\s+to\b/g, " equals ")
    .replace(/\badded\s+to\b/g, " plus ")
    .replace(/(\d)\s*([+=×−])\s*/g, "$1 $2 ").replace(/([+=×−])\s*(\d)/g, "$1 $2")
    .replace(/(?<=[a-z])-(?=[a-z])/g, " ").split(/[^a-z0-9+=×−'.-]+/).filter(Boolean).map((w) => w.replace(/[.']+$/, ""));
  const out: NumberToken[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^\d+$/.test(w)) { out.push({ kind: "number", value: Number(w) }); continue; }
    const v = wordValue(w);
    // "1 ten", "6 ones": a place word after a number names its place, so it joins no chain.
    if (/^(?:ten|tens|one|ones|hundred|hundreds)$/.test(w) && out.at(-1)?.kind === "number") { out.push({ kind: "word" }); continue; }
    if (v !== null) {
      // "twenty six": a ten word and a unit word make one number.
      const next = words[i + 1] !== undefined ? wordValue(words[i + 1]) : null;
      if (kindOf(w) === "ten" && next !== null && next < 10) { out.push({ kind: "number", value: v + next }); i++; continue; }
      out.push({ kind: "number", value: v });
      continue;
    }
    if (w === "take" && words[i + 1] === "away") { out.push({ kind: "op", op: "subtract" }); i++; continue; }
    if (OP_WORDS[w]) { out.push({ kind: "op", op: OP_WORDS[w] }); continue; }
    if (RESULT_WORDS.has(w)) { out.push({ kind: "result" }); continue; }
    out.push({ kind: "word" });
  }
  return out;
}

/** Where a sentence ends: an end mark before a space or the end ("0.85" is one number), a semicolon or a new line. */
const SENTENCE_END = /[.!?]+(?=\s|$)|[;\n]+/;

/** The words the child kept: after the last take-back, without what their negatives take back (#605). */
export function retainedText(said: string, options?: ReadOptions): string {
  return withoutNegated(committedText(prepared(said, options))).text;
}

/**
 * The child's sentences that hold a number, in the words they kept (retainedText): a turn commits a final answer only
 * when it has exactly one (PR #624 review round 3), so no clause can hide another answer.
 */
export function numberSentences(said: string, options?: ReadOptions): string[] {
  return retainedText(said, options).split(SENTENCE_END).filter((x) => { const r = readNumbers(x); return r.values.length > 0 || r.unreadable; });
}

/** Reads clauses in order: whether each clause that holds an answer stands as one, or is working after an answer. */
function answerClauses(): (clause: string) => boolean {
  let seen = false;
  return (clause) => {
    if (isWorking(clause)) return !seen;
    seen = true;
    return true;
  };
}

export interface AnswerRead {
  /**
   * The numbers the child kept, in order, after the last word that takes something back: a step answer is one of them.
   * When an explanation holds a number form code cannot read ("six tens"), only the numbers outside the explanations.
   */
  kept: AnswerValue[];
  /**
   * The child's final answer: the last number kept outside any explanation, or null when there is none, it is the second
   * number of an operation ("27 plus 39"), the part outside the explanations has a form code cannot read, or the turn
   * offers numbers as a choice.
   */
  final: AnswerValue | null;
  /** The turn offers numbers as a choice ("is it 66 or 56?"): none of them is the child's answer yet. */
  choice: boolean;
  /**
   * The numbers kept outside the child's explanations, in order: what the child gave as answers, and not as reasons.
   * A wrong final answer the child said among them may be judged wrong even when a later number is the final one
   * ("I got 56. I did 7 plus 9 is 16 ... 2 plus 3 is 5"); it is never accepted as right.
   */
  outside: AnswerValue[];
  /**
   * The child committed (R391-5): no doubt ("maybe", "?", "or something") and the final answer stands among plain answer
   * words (committedFinal). A number the child was not sure of may be judged wrong, never accepted as right.
   */
  sure: boolean;
}

/**
 * The plain words a committed answer may stand among (R391-5): "I got 66", "It's 66", "So, all together, 66", "66
 * centimetres", "The answer is sixty-six". A final answer is sure only when its own clause holds nothing else, so any
 * other word beside it ("maybe 66", "66 or something", "I reject 66") makes Maya confirm it before it is accepted. An allow-list, because no list of doubting or rejecting words is ever complete.
 */
const ANSWER_WORDS = new Set([
  "i", "i'm", "im", "got", "get", "gets", "it", "it's", "its", "is", "was", "the", "answer", "my", "so", "then", "and",
  "that's", "thats", "that", "makes", "make", "equals", "equal", "to", "gives", "oh", "ok", "okay", "well", "yes", "yeah",
  "yep", "now", "think", "all", "together", "total", "in", "for", "final", "sum", "have", "has",
  "are", "there", "here", "wrote", "write", "down", "done", "a", "an", "of", "on", "one", "mean", "meant", "groups", "group",
  "rows", "row", "lots", "sets", "set", "each", "left", "over", "remainder", "r", "whole", "number", "altogether", "but",
  "said", "just", "really", "actually", "wait", "no", "point", "zero",
  // Where the answer went, and how a child ends a turn ("I got 66. I wrote it on my paper.", "I'm done. Thanks, Maya!").
  "paper", "page", "board", "sheet", "notebook", "finished", "thanks", "yay", "hooray", "woohoo", "yippee", "maya",
  // "I'm sure it's 66.", "It's 66. I already wrote it." (#605).
  "sure", "already",
]);
/** Words of ordinary math talk after an answer ("I carried the ten", "I added the ones first", "I counted on my fingers"). */
const MATH_WORDS = new Set([
  "added", "carried", "carry", "counted", "count", "took", "borrowed", "regrouped", "regroup", "used", "did", "worked",
  "out", "first", "next", "last", "lined", "up", "put", "made", "split", "broke", "apart", "doubled", "halved", "subtracted",
  "multiplied", "divided", "shared", "grouped", "drew", "dots", "blocks", "fingers", "line", "head", "with", "from", "by",
  "me", "them", "they", "these", "those", "this", "column", "columns", "top", "bottom", "under", "above", "extra", "more",
  "less", "other", "both", "times", "again", "too", "also", "checked", "check", "know", "knew", "remember", "remembered",
  "away", "fine", "alright", "carrying", "adding", "regrouping", "borrowing", "counting", "subtracting", "multiplying", "dividing",
]);
const UNIT_WORD = /^(?:mm|cm|dm|m|km|g|kg|mg|ml|l|(?:milli|centi|deci|kilo)?(?:metre|meter|gram|litre|liter)s?|metres?|meters?|grams?|litres?|liters?|dollars?|cents?|seconds?|minutes?|hours?|days?|weeks?|months?|years?|o'clock|am|pm|a\.m\.|p\.m\.|degrees?|percent|\$|¢|%)$/i;

/** Every word of a clause is a plain answer word, a number word, a place, an operation, a filler or a unit. */
function plainClause(clause: string): boolean {
  const words = clause.toLowerCase().replace(/\bthank you\b/g, "thanks").replace(/[’]/g, "'").replace(/[^\w'$¢%.+×÷=\/-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.every((w) => {
    const bare = w.replace(/^[.'-]+|[.'-]+$/g, "");
    if (!bare) return true;
    if (ANSWER_WORDS.has(bare) || MATH_WORDS.has(bare) || UNIT_WORD.test(bare) || PLACE.test(bare) || OPERATION.test(bare) || RESULT.test(bare) || FILLER.test(bare) || LINK.test(bare) || changes(bare)) return true;
    const read = readNumbers(bare);
    return read.values.length > 0 || read.unreadable;
  });
}

/**
 * Every clause of the final number's sentence (with a line before that runs on into it) and of every sentence after it
 * is plain (plainClause: answer words, math talk, numbers, units): the child committed to it (R391-6). Any other word anywhere there ("66, I doubt it", "Maybe" then
 * "66", "I would say 66", "Suppose: 66") means Maya confirms the answer before she accepts it.
 */
function committedFinal(text: string): boolean {
  const lines = turnLines(text);
  // The final answer's line and sentence: a digit the child points at ("I added the one I carried.") or a column's
  // digits after it are not the answer, so they do not move the check off the answer's own sentence.
  // Where the final answer stands: working after it is not a new answer (workingSplit).
  const keep = answerClauses();
  let at = -1;
  let inLine = -1;
  lines.forEach((line, n) => line.split(/[.!?]+/).forEach((sentence, i) => {
    for (const clause of sentence.split(/[,;:]+/)) if (holdsAnswer(clause) && keep(clause)) { at = n; inLine = i; }
  }));
  if (at < 0) return false;
  // The line before counts when it runs on into the answer ("Maybe" then "66", "I reject this answer:" then "66"); one
  // that ends a sentence ("I don't know." then "66") does not.
  const before = at > 0 && !/[.!?]\s*$/.test(lines[at - 1]) ? `${lines[at - 1]}: ` : "";
  const sentences = `${before}${lines[at]}`.split(/[.!?]+/);
  const last = inLine + before.split(/[.!?]+/).length - 1;
  // The final number's sentence, with whatever introduces it in that sentence ("Suppose: 66", "I would say 66"), and
  // every sentence after it.
  // Every later line too ("66" then "I changed my mind", R391-7-1).
  const later = lines.slice(at + 1).join(". ").split(/[.!?]+/);
  return [...sentences.slice(last), ...later].every((x) => x.split(/[,;:]+/).every(plainClause));
}

/** Every explanation in the text ("because six tens and six ones") is plain too: math talk, numbers, answer words. */
function plainExplanations(text: string): boolean {
  return turnLines(text).every((line) => {
    const m = EXPLANATION.exec(line);
    if (!m) return true;
    return line.slice(m.index + m[0].length).split(/[.!?,;:]+/).every((c) => plainClause(c.replace(EXPLANATION_ALL, " ")));
  });
}
const EXPLANATION_ALL = /\b(?:because|since|cause|cuz|coz)\b/gi;

/**
 * What the child kept in a turn, and their final answer (D-199). The rule never needs the answer key. First the last word
 * that takes something back wins (committedText: "65, no, 66" is 66), then every explanation is left out
 * (withoutExplanations), and the final answer is the last number left: "So I got 66, because six tens and six ones" is
 * 66, "I think it's sixty-six because seven and nine make sixteen" is 66. A number in an explanation is never the final
 * answer: "Because seven and nine make sixteen" has none, and "Because 7 + 9 is 16, it's 66" has none either (the
 * explanation runs to the end of the turn), so Maya asks again rather than guess.
 */
export function readAnswer(said: string, options?: ReadOptions): AnswerRead {
  return readAnswerParts(said, options).read;
}

/**
 * readAnswer, and whether the final answer would be sure apart from the one-sentence rule (`sureApart`): a correction
 * that restates the accepted answer with its working ("Actually 66. 7 plus 9 is 16.") keeps that answer standing, and
 * never commits a new one (takenBack).
 */
function readAnswerParts(said: string, options?: ReadOptions): { read: AnswerRead; sureApart: boolean } {
  const text = prepared(said, options);
  const committed = committedText(text);
  if (offersChoice(committed)) return { read: { kept: [], final: null, choice: true, sure: false, outside: [] }, sureApart: false };
  // What a negative takes back is gone (#605): the rest of the turn is read as usual.
  const stated = withoutNegated(committed).text;
  const all = readNumbers(stated);
  const reasonless = withoutExplanations(stated);
  const answer = readNumbers(reasonless);
  // A correction word in an unclear shape after a number leaves no final answer: Maya asks (R391-2).
  const unclear = unclearCorrection(text);
  // Working after the answer does not replace it (#605).
  const working = workingSplit(reasonless);
  const final = unclear || answer.unreadable ? null : finalOf(readNumbers(working.kept));
  // An unclear correction keeps no number at all, so no step answer is taken from the turn either (R391-2).
  const kept = unclear ? [] : all.unreadable ? answer.values : all.values;
  // Sure: no negative beside a number (R391-3), no doubt anywhere from the first number on, and the final answer stands
  // only among plain answer words. The explanation is read too, so nothing can hide behind "because" (R391-8-2).
  const sureApart = !unclear && !workingHidesAnswer(working.dropped, final, options?.known ?? []) && !negativeNearAnswer(text) && (!options?.fractions || !answer.unreadable) && !doubtNearAnswer(text) && committedFinal(withoutExplanations(committed)) && plainExplanations(committed);
  // PR #624 review round 3: a turn commits a final answer only with exactly one sentence that holds a number, in the
  // words the child kept. Any other turn with numbers is confirmed in code's words, or Maya asks which one they mean.
  // A sentence before the last that only points back at work done is no second answer (first-ship practice, C28-r1, C29-r1).
  const numeric = stated.split(SENTENCE_END).filter((x) => { const r = readNumbers(x); return r.values.length > 0 || r.unreadable; });
  const sure = sureApart && numeric.filter((x, i) => i === numeric.length - 1 || !pointsBack(x, options)).length === 1;
  return { read: { kept, final, choice: false, sure, outside: unclear ? [] : answer.values }, sureApart };
}

/**
 * The sentence only says what the child did or said before, as an exact allow-list. "I carry the one", "I carried the ten",
 * or a carry of the question's own worked steps ("I carry 1."): never another number ("I carry 6."). "I already said 16.":
 * only numbers from the child's earlier turns or done steps. Any other sentence with a number is a second answer.
 */
function pointsBack(sentence: string, options?: ReadOptions): boolean {
  const s = sentence.trim().replace(/’/g, "'").replace(/[.!]+$/, "").toLowerCase();
  const start = "^(?:(?:so|and|okay|ok|well)\\b[,\\s]*)*(?:i|we)\\s+";
  const carried = new RegExp(`${start}(?:carry|carried)\\s+(.+)$`).exec(s);
  if (carried) {
    if (/^the\s+(?:one|ten)$/.test(carried[1])) return true;
    const n = plainNumber(carried[1]);
    return n !== null && (options?.carries ?? []).includes(n);
  }
  const said = new RegExp(`${start}already\\s+(?:said|got|told\\s+you)\\s+(.+)$`).exec(s);
  if (!said) return false;
  const n = plainNumber(said[1]);
  return n !== null && (options?.saidBefore ?? []).includes(n);
}

/** The whole text is one plain whole number, in digits or words ("16", "sixteen", "twenty-six"), or null. */
export function plainNumber(text: string): number | null {
  const words = text.trim().toLowerCase().split(/[\s-]+/);
  if (!(words.length === 1 && /^\d+$/.test(words[0])) && !words.every((w) => kindOf(w) !== null)) return null;
  const r = readNumbers(text);
  const v = r.values[0];
  return !r.unreadable && r.values.length === 1 && v.type === "number" ? v.value : null;
}

/**
 * The child's whole turn when it can be one step template (stepTurnHeard): trimmed, with at most one leading "so", "okay",
 * "um" or "oh" and one final full stop or "!". Null for any turn with a question mark or more than one line. Whether the rest is
 * one template is for the readers below: a second sentence fits none of them.
 */
export function wholeTurn(text: string): string | null {
  const t = text.trim().replace(/’/g, "'");
  if (t.includes("?") || t.includes("\n")) return null;
  return t.replace(/^(?:so|okay|ok|um|oh)\b[,.\s]*/i, "").replace(/[.!]$/, "").trim().toLowerCase() || null;
}

/** The whole text is one value, alone or in the child's own words: "16", "it's 16", "I got 16". Else null. */
export function wholeValue(body: string): number | null {
  const m = /^(?:it's|i got)\s+(.+)$/.exec(body);
  return plainNumber(m ? m[1] : body);
}

/**
 * The whole text is a plain yes, with at most the number it confirms: "yes", "yeah", "yep", "yes 16", "yes, it's 16". The
 * number is null when none is said. Null for anything else: "yes I think 16" is not a plain yes.
 */
export function wholeYes(body: string): { value: number | null } | null {
  const m = /^(?:yes|yeah|yep)(?:[,\s]+(?:it's\s+)?(.+))?$/.exec(body);
  if (!m) return null;
  if (m[1] === undefined) return { value: null };
  const value = plainNumber(m[1]);
  return value === null ? null : { value };
}

/** The only words a step's confirm may stand on beside its number: no place, column, verb, speaker or "answer". */
const CONFIRM_ONLY = new Set(["is", "it", "it's", "its", "i", "got", "get", "think", "maybe", "guess", "so", "okay", "ok", "oh", "um", "uh", "hmm"]);

/** After the number, every word of the text is on the step confirm's short list ("Is it 16?", "I got 16, I think."). */
export const confirmWordsOnly = (text: string) =>
  text.toLowerCase().replace(/’/g, "'").split(/[\s,.?!]+/).filter(Boolean).every((w) => CONFIRM_ONLY.has(w) || plainNumber(w) !== null);

/** The whole text is one sum: "a plus|and|+ b [plus|and|+ c] is|equals|makes|make|= d", in digits or words, or null. */
export function wholeSum(body: string): { operands: number[]; sum: number } | null {
  const m = /^(.+?)\s*(?:\s(?:is|equals|makes|make)\s|=)\s*(.+)$/.exec(body);
  if (!m) return null;
  const operands = m[1].split(/\s*\+\s*|\s+(?:plus|and)\s+/).map(plainNumber);
  const sum = plainNumber(m[2]);
  return sum !== null && operands.length >= 2 && operands.every((n) => n !== null) ? { operands: operands as number[], sum } : null;
}

/** Words a first-person written-digit or carry claim may hold besides numbers. No other subject, hedge or negation is here. */
const CLAIM_ONLY = new Set(["i", "write", "wrote", "written", "writing", "put", "putting", "have", "am", "it", "as", "down", "the", "a", "digit", "number", "and", "then",
  "carry", "carried", "carrying", "in", "into", "under", "at", "on", "for", "to", "from", "ones", "tens", "hundreds", "thousands", "tenths", "hundredths", "thousandths"]);

/** Every word of the whole text is a claim word or a number. */
export const claimWordsOnly = (body: string) => body.split(/[\s,]+/).filter(Boolean).every((w) => CLAIM_ONLY.has(w) || plainNumber(w) !== null);

/** The child's turn shows doubt about its answer: a doubt word or a question mark from its first number on (R391-5). */
export const showsDoubt = (said: string, options?: ReadOptions) =>
  doubtNearAnswer(prepared(said, options)) || /\b(?:not (?:so |really |very )?sure|no (?:idea|clue)|don'?t know if)\b/i.test(said.replace(/’/g, "'"));

/**
 * The final answer among the numbers read: the last one that can be an answer (not a column's digits, "6 tens", and
 * not a digit the child points at, "the one I carried"), or null when there is none or it is the second number of an
 * operation ("27 plus 39").
 */
function finalOf(read: NumbersRead): AnswerValue | null {
  const at = read.notAnswer.lastIndexOf(false);
  return at < 0 || read.operand[at] ? null : read.values[at];
}

/** The text holds a number that can be a final answer (finalOf), or a form code cannot read. */
function holdsAnswer(text: string): boolean {
  const r = readNumbers(text);
  return r.unreadable || r.notAnswer.includes(false);
}

/** The text has a number form code cannot read outside the child's explanations: confirm it before judging (D-199). */
export const unreadableAnswer = (text: string, options?: ReadOptions) => readNumbers(withoutExplanations(prepared(text, options))).unreadable;

/**
 * What a turn takes back to, or null when it takes nothing back. A correction word takes back a number said before it
 * ("66, no, 56"), and it puts a new answer in place when a number, or a form code cannot read, comes after it
 * ("actually 56", "actually point sixty-six"). "No, I just knew it" takes nothing back. `kept` is the final answer kept
 * (readAnswer: "actually 66 because six tens" keeps 66), or null when no number is kept or code cannot read it.
 */
export function takenBack(said: string, options?: ReadOptions): { kept: AnswerValue | null } | null {
  const text = prepared(said, options);
  // An explicit rejection also withdraws an answer accepted in an earlier turn. It needs no correction word or number.
  // "I don't know" after a request to explain is not a withdrawal of the accepted answer.
  const withdrawal = /\b(?:withdraw|withdrawn|retract|wrong|incorrect|mistake|mistaken|reject|rejected|scratch|forget|undo|cancel)\b|\b(?:take|taking|took|takes) (?:that|it|this|my answer|it all)? ?back\b|\b(?:change|changed|changing) (?:my|the) answer\b|\b(?:changed?|changing) my mind\b|\bnever ?mind\b/i;
  const plain = text.replace(/’/g, "'");
  const target = "(?:(?:my|the|this|that) answer|that|this|it)";
  const erased = new RegExp(`\\b(?:eras(?:e|ed)|delet(?:e|ed)|cross(?:ed)?|rub(?:bed)?|rul(?:e|ed))\\s+(?:out\\s+)?${target}(?:\\s+out)?\\b`, "i");
  const denied = new RegExp(`\\b${target}(?:'s| is| was)?\\s+(?:not|never)\\s+(?:right|correct|true)\\b|\\b(?:don't|do not|dont)\\s+(?:think|believe)\\s+${target}(?:'s| is)?\\s+(?:right|correct|true)\\b`, "i");
  const erasure = erased.exec(plain);
  const beforeErasure = erasure ? plain.slice(0, erasure.index).split(/[,.!?;\n]|\bbut\b/i).at(-1) ?? "" : "";
  const erasedAnswer = erasure !== null && !NEGATIVE.test(beforeErasure);
  if (withdrawal.test(plain) || erasedAnswer || denied.test(plain) || withoutNegated(text).taken) return { kept: null };
  const parts = splitTakeBacks(text);
  if (parts.length === 1) return null;
  const last = parts[parts.length - 1];
  const after = readNumbers(last);
  const before = parts.slice(0, -1).some((p) => {
    const read = readNumbers(p);
    return read.values.length > 0 || read.unreadable;
  });
  if (!before && after.values.length === 0 && !after.unreadable) return null;
  // An unclear correction anywhere puts nothing in place: what was said is taken back, and Maya asks (R391-2).
  // Read with the question's own numbers (PR #624 review round 3), and sure apart from the one-sentence rule: a
  // restatement keeps the answer only when it is right for the question (the caller), so it never commits a new one.
  const { read, sureApart } = readAnswerParts(last, options);
  return { kept: unclearCorrection(text) || negativeNearAnswer(text) || !sureApart ? null : read.final };
}

/** Plain yes words, as a whole turn: "Yes.", "Yep, that's it.", "Uh huh." A number, a question mark or any doubt is not one. */
const YES_WORD = "(?:yes|yeah|yea|yep|yup|uh[- ]huh|mm[- ]?hmm|mhm|right|correct|exactly|that['’]?s (?:right|it|what i said)|it is|i did|i said (?:that|it))";
const YES_TURN = new RegExp(`^[\\s,.!]*(?:(?:um+|uh+|oh|okay|ok|well)[\\s,.!]+)*${YES_WORD}(?:[\\s,.!]+${YES_WORD})*[\\s,.!]*$`, "i");

/** The whole turn is a plain yes (#605): it answers Maya's "Did you say 66?". */
export const saysYes = (text: string) => YES_TURN.test(text);

/**
 * The child says the writing is done (#605): "I wrote 66", "66 is on my paper", "I'm done writing". Not "I'm writing",
 * "I will write it", or any negative beside it ("I didn't write it yet"): that child keeps their time.
 */
export function saysWritten(text: string): boolean {
  const plain = text.replace(/’/g, "'");
  if (NEGATIVE.test(plain)) return false;
  if (/\b(?:done|finished)\s+writing\b/i.test(plain)) return true;
  if (/\b(?:i'?m|am|are|still|keep|will|gonna|going to|need to|have to|let me|can i|should i|i'?ll)\b[^.!?\n]*\b(?:writ|put|circl)/i.test(plain)) return false;
  // "I circled it": a claim question's word (claim.ts) is circled, not written.
  return /\b(?:wrote|written|circled)\b|\bput (?:it|that|\w+) (?:down|on)\b|\b(?:is|it's|its|that's) (?:on|in) my (?:paper|page|sheet|notebook)\b/i.test(plain);
}

/**
 * One sentence in which the child says, in the first person, that they are stuck: "I don't know", "I don't know about
 * the ten", "I don't get it", "I don't understand", "I'm stuck", "I have no idea", "I'm confused" (#605 practice run 2:
 * C24-r2; PR #624 review). The words after "about", "how", "what", "where" or "why" hold no negative.
 */
const STUCK_SENTENCE = /^(?:(?:um+|uh+|oh|well|hmm+|okay|ok)[\s,]+)*(?:i (?:don'?t|do not) (?:know|get it|understand(?: it)?)(?: (about|how|what|where|why)((?: [a-z']+){1,6}))?|i(?:'m| am) stuck|i have no idea|i(?:'m| am) (?:really |so )?confused)$/;
const NEGATIVE_WORD = /\b(?:not|no|never|nothing)\b|n't\b/;

/**
 * The child's turn says they are stuck, and nothing else that could move Maya on: at least one STUCK_SENTENCE, no
 * question mark, no number in any other sentence, no negative outside the stuck sentence, and no answer in the turn.
 * Any other turn keeps the old reading (no change in help). Code reads it as a request for one more level of help.
 */
export function saysStuck(text: string): boolean {
  if (text.includes("?") || readAnswer(text).final !== null) return false;
  const sentences = text.toLowerCase().replace(/[’]/g, "'").split(/[.!\n]+/).map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean);
  let stuck = false;
  for (const sentence of sentences) {
    const m = STUCK_SENTENCE.exec(sentence);
    if (m) {
      if (m[2] && NEGATIVE_WORD.test(m[2])) return false;
      stuck = true;
      continue;
    }
    if (NEGATIVE.test(sentence) || readNumbers(sentence).values.length > 0 || readNumbers(sentence).unreadable) return false;
  }
  return stuck;
}

/**
 * The sentence is exactly an addition of single numbers, as a child sets up a column: "2 plus 3 plus 1", "So 1 plus 2
 * plus 3", "I add the 2 and the 3 and the 1" (#605, PR #624 review). Its operands in order, or null for every other
 * form: another operation, a negative, a result ("is 6"), any other word.
 */
const SETUP_LEAD = new Set(["oh", "so", "um", "uh", "okay", "ok", "then", "now", "i", "add", "yes", "yeah", "is", "it"]);
export function additionSetup(sentence: string): number[] | null {
  const tokens = sentence.toLowerCase().replace(/[’]/g, "'").replace(/[?,]/g, " ").replace(/\+/g, " plus ").split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < tokens.length && SETUP_LEAD.has(tokens[i])) i++;
  const operands: number[] = [];
  for (;;) {
    if (tokens[i] === "the") i++;
    const t = tokens[i];
    const value = t === undefined ? null : /^\d$/.test(t) ? Number(t) : wordValue(t);
    if (value === null || value > 9) return null;
    operands.push(value);
    i++;
    if (i === tokens.length) break;
    if (tokens[i] !== "plus" && tokens[i] !== "and") return null;
    i++;
  }
  return operands.length >= 2 ? operands : null;
}

/**
 * The child says they are done (#605, Savar 2026-11-06), in a sentence of its own: "I'm done", "I'm finished", "All
 * done!", "Okay, I'm done with it". Every other sentence holds no number but the answer that stands; the turn has no
 * question and no negative. Any other turn is not read as done.
 */
const DONE_SENTENCE = /^(?:(?:okay|ok|yay|yes|yeah|um+|so|and|well|alright|all right|hooray|woohoo)[\s,!]+)*(?:(?:i'?m|i am|we'?re|we are) )?(?:all )?(?:done|finished)(?: (?:now|with (?:it|this|that|this one|that one|the question|my question|the problem)))?$/;
export function saysDone(text: string, options?: ReadOptions, answer?: AnswerValue): boolean {
  if (text.includes("?") || NEGATIVE.test(text)) return false;
  const sentences = text.toLowerCase().replace(/[’]/g, "'").split(/[.!,\n]+/).map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean);
  let done = false;
  for (const sentence of sentences) {
    if (DONE_SENTENCE.test(sentence)) {
      done = true;
      continue;
    }
    const r = readNumbers(prepared(sentence, options));
    if (r.unreadable || r.values.some((v) => !answer || JSON.stringify(v) !== JSON.stringify(answer))) return false;
  }
  return done;
}

/**
 * The child says, in the first person, that they guessed: "I guessed", "I just guessed it", "It was a guess", "I'm just
 * guessing" (#605). "I guess it's 66" is a hedge, not a guess. A sentence with a negative ("I didn't guess") is not one.
 */
const GUESS_SENTENCE = /\b(?:i|i've|i have|i'm|i am)\s+(?:just\s+|only\s+|kind of\s+|kinda\s+)?(?:guessed|guessing)\b|\b(?:it was|that was|just)\s+a\s+(?:lucky\s+)?guess\b/;
export function saysGuess(text: string): boolean {
  return text.toLowerCase().replace(/[’]/g, "'").split(/[.!?\n]+/).some((x) => GUESS_SENTENCE.test(x) && !NEGATIVE.test(x));
}

/** The text offers numbers as a choice ("is it 66 or 56?"): none of them is the child's answer yet. */
export const offersChoice = (text: string) => text.split(/\bor\b/i).filter((p) => valuesIn(p).length > 0).length > 1;

/** A complete calculation in a plain request. This reuses the D-199 tokenizer and value reader. Other wording,
 * claims, choices, metadata, partial calculations and unsupported number forms are uncertain, not outside work. */
export function completeExpression(said: string): { operation: "add" | "subtract" | "multiply" | "divide"; operands: AnswerValue[] } | null {
  if (readAnswer(said, { fractions: true }).choice) return null;
  let text = plainMinus(said).toLowerCase().trim().replace(/[.!?]+$/, "");
  text = text.replace(/^(?:what is|what's|how much is|calculate|solve|explain|can you (?:explain|solve|calculate)|help me (?:with|solve))\s+/, "");
  const verb = /^(add|subtract|multiply|divide)\s+/.exec(text);
  if (verb) text = text.slice(verb[0].length);
  // A proposed result does not become another operand. A choice was already treated as uncertain above.
  const result = /,?\s+\b(?:is it|is|equals?|makes?)\b|=/.exec(text);
  if (result) text = text.slice(0, result.index).trim();
  text = prepared(text.replace(/multiplied by/g, "times").replace(/divided by/g, "÷").replace(/take away/g, "minus"), { fractions: true, operands: true });
  const matches = [...text.matchAll(TOKEN)];
  const operators = new Map<string, "add" | "subtract" | "multiply" | "divide">(Object.entries({
    "+": "add", plus: "add", "-": "subtract", minus: "subtract", less: "subtract",
    "×": "multiply", "*": "multiply", x: "multiply", times: "multiply", "÷": "divide",
  } as const));
  const ops = new Set<string>(verb ? [verb[1]] : []);
  let end = 0, previous = "", operationCount = 0;
  for (const m of matches) {
    if (!/^[\s,]*$/.test(text.slice(end, m.index))) return null;
    const token = m[0];
    const op = operators.get(token);
    if (op && (!["-", "minus", "+"].includes(token) || (previous && !operators.has(previous)))) {
      ops.add(op); operationCount++;
    }
    if (!op && !/^[\d.]/.test(token) && kindOf(token) === null && !["and", "point", "negative", "/", MIX_MARK].includes(token)) return null;
    previous = token; end = m.index! + token.length;
  }
  if (!/^[\s,]*$/.test(text.slice(end)) || ops.size !== 1 || operators.has(previous) ||
      ["and", "point", "negative", "/", MIX_MARK].includes(previous)) return null;
  const read = readNumbers(text);
  if (read.unreadable || read.values.length < 2 || (!verb &&
      (operationCount !== read.values.length - 1 || !read.operand.slice(1).every(Boolean)))) return null;
  return { operation: [...ops][0] as "add" | "subtract" | "multiply" | "divide", operands: read.values };
}
