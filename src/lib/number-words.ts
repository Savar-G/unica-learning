// Numbers in printed text (#380, R380-5, R380-6). The text the AI writes passes one gate (aiTextProblem), or the item
// is written again:
// - Characters: after curly quotes and the en dash become ASCII, only ASCII letters and digits, the space, the
//   punctuation . , ? ! ' " - : ( ) $ ¢ % / and the math signs + = × ÷ < > (an operation is written "7 + 5 = ?").
//   Anything else is refused: ½, ⅓, the U+2212 minus (write "-"), full-width digits, superscripts, other non-ASCII.
// - Number tokens: each run of digits with the number signs around it is one of the forms in NUMBER_FORMS, so "0,5",
//   "5 %", "5%%", ".5", "10 000" and "3-8" are refused.
// - Words: no number word (NUMBER_WORDS, with every ordinal made from the cardinals) outside a few allowed phrases.
// Code then reads the digits exactly (readNumbers): a sign, a decimal point, a fraction slash, a percent, a clock time,
// a ratio and money. Code's own text (Sam's lines, labels) is read by readNumbers too, with its own "−" minus. Pure: no
// imports, no clock, no randomness.

/** A number a text shows, with its form; money and coin values marked. */
export interface ReadNumber {
  value: number;
  form: "whole" | "decimal" | "fraction" | "percent" | "time" | "ratio";
  money?: true;
  coin?: true;
}

/** A Canadian coin's value (1¢, 5¢, 10¢, 25¢, $1, $2). */
export const isCoin = (value: number, unit: string) => (unit === "¢" && [1, 5, 10, 25].includes(value)) || (unit === "$" && [1, 2].includes(value));

/**
 * The number lexicon. NUMBER_WORDS name or build a number and are refused anywhere in AI-written text: cardinals, tens
 * and scales (with plurals; "hundreds of dots"), dozen and score, fraction words, every ordinal made from the cardinals
 * ("fourth", "thirteenth", "twentieth", "hundredth"; a compound such as "twenty-first" has a cardinal in it) with its
 * plural (as a fraction), and "twice". "first", "second" and "third" are order words and not here; "third" as a fraction ("a
 * third", "one third", "third of", "thirds") is refused. OPERATOR_WORDS have ordinary meanings too ("Point to it", "a
 * negative number", "how many times", "what percent") and are refused next to a digit or a number word ("minus 3",
 * "negative 3", "0 point 5", "3 times 4", "50 percent").
 */
const CARDINALS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
  "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
  "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
  "hundred", "thousand", "million", "billion",
];
/** A cardinal's ordinal: "thirteen" thirteenth, "twenty" twentieth, "twelve" twelfth, "nine" ninth, "hundred" hundredth. */
const ORDINAL_OF: Record<string, string> = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
export const ordinalOf = (cardinal: string) => ORDINAL_OF[cardinal] ?? (cardinal.endsWith("y") ? `${cardinal.slice(0, -1)}ieth` : `${cardinal}th`);
/** Order words, not quantities: kept out of NUMBER_WORDS. */
const ORDER_WORDS = new Set(["first", "second", "third"]);
const ORDINALS = CARDINALS.filter((c) => c !== "zero").map(ordinalOf).filter((o) => !ORDER_WORDS.has(o));

export const NUMBER_WORDS: readonly string[] = [
  ...CARDINALS,
  ...["hundred", "thousand", "million", "billion"].map((w) => `${w}s`),
  "dozen", "dozens", "score", "scores", "half", "halves", "quarter", "quarters", "thirds",
  ...ORDINALS, ...ORDINALS.map((o) => `${o}s`),
  "twice",
];
export const OPERATOR_WORDS: readonly string[] = ["point", "minus", "negative", "plus", "times", "percent", "per cent"];
const THIRD_FRACTION = /\b(a|one|two)\s+third\b|\bthird\s+of\b/i;

/**
 * Phrases that use a number word and name no quantity, removed before the check: a pronoun "one" ("which one", "each
 * one", "this one", "that one", "the one"), "one more" and "one less" on a skill about one more or one less, place
 * names ("the tens digit", "the hundreds place", "ones column", and a place after digits: "3 hundreds", "4 tens"), the
 * ten-frame and five-frame pictures, and on a money skill the quarter coin ("a quarter", "3 quarters").
 */
const ALLOWED: readonly RegExp[] = [
  /\b(which|each|this|that|the)\s+one\b/gi,
  /\b(ones|tens|hundreds|thousands)\s+(digits?|places?|columns?)\b/gi,
  /\b\d+\s+(ones|tens|hundreds|thousands)\b/gi,
  /\b(ten|five)-frames?\b/gi,
];
const ONE_MORE_LESS = /\bone\s+(more|less)\b/gi;
const QUARTER_COIN = /\b(a\s+)?quarters?\b/gi;
/** A skill about one more or one less ("K5-one-more-less", "1.1-one-more-less-20"). */
export const isOneMoreLessSkill = (skill: string) => /one-more-less/.test(skill);

const wordRe = (w: string) => w.replace(" ", "\\s+");
const NUMBER_RE = new RegExp(`\\b(${NUMBER_WORDS.map(wordRe).join("|")})\\b`, "i");
const NEAR = `(?:\\d|\\b(?:${NUMBER_WORDS.map(wordRe).join("|")})\\b)`;
const OPERATOR_RE = new RegExp(`${NEAR}[\\s-]*\\b(?:${OPERATOR_WORDS.map(wordRe).join("|")})\\b|\\b(?:${OPERATOR_WORDS.map(wordRe).join("|")})\\b[\\s-]*[−-]?${NEAR}`, "i");

/** What the item's skill allows: "one more" and "one less" (a skill about them), the quarter coin (a money skill). */
export interface WordContext { skill: string | null; money: boolean }

/**
 * Why AI-written text breaks the digits rule, or null: a number word outside the allowed phrases, or an operator word
 * next to a number.
 */
export function numberWordProblem(text: string, { skill, money }: WordContext): string | null {
  const operator = text.match(OPERATOR_RE);
  if (operator) return `"${operator[0]}" is a number in words: write every number in digits and signs`;
  let rest = text;
  for (const re of ALLOWED) rest = rest.replace(re, " ");
  if (skill && isOneMoreLessSkill(skill)) rest = rest.replace(ONE_MORE_LESS, " ");
  if (money) rest = rest.replace(QUARTER_COIN, " ");
  const word = rest.match(THIRD_FRACTION) ?? rest.match(NUMBER_RE);
  return word ? `"${word[0]}" is a number in words: write every number in digits` : null;
}

// ---------- The gate for AI-written text ----------

/** Curly quotes and the en dash, written as ASCII before the check; nothing else is changed. */
const NORMALISE: [RegExp, string][] = [[/[‘’]/g, "'"], [/[“”]/g, '"'], [/–/g, "-"]];
export const normaliseAiText = (text: string) => NORMALISE.reduce((t, [re, to]) => t.replace(re, to), text);

/** The characters AI-written text may use (see the header). */
const ALLOWED_CHAR = /[A-Za-z0-9 .,?!'"\-:()$¢%/+=×÷<>]/;

/** The number forms a token may take. A negative sign before one ("-3") is read as a sign; the levels check it. */
export const NUMBER_FORMS: readonly { name: string; form: RegExp; example: string }[] = [
  { name: "whole number", form: /^\d+$/, example: "345" },
  { name: "thousands", form: /^\d{1,3}(,\d{3})+$/, example: "12,500" },
  { name: "decimal", form: /^\d+\.\d+$/, example: "0.5" },
  { name: "fraction", form: /^\d+\/\d+$/, example: "1/2" },
  { name: "percent", form: /^\d+(\.\d+)?%$/, example: "50%" },
  { name: "clock time", form: /^\d{1,2}:\d{2}$/, example: "3:30" },
  { name: "ratio", form: /^\d+:\d+$/, example: "3:4" },
  { name: "dollars", form: /^\$(\d+|\d{1,3}(,\d{3})+)(\.\d{2})?$/, example: "$4.75" },
  { name: "cents", form: /^\d+¢$/, example: "25¢" },
];

/**
 * Why a number token in AI-written text has no allowed form, or null. A token is a run of digits and the signs around
 * them (. , : / % $ ¢ -); sentence punctuation after it ("is 5.", "5, 6") and a negative sign before it are not part
 * of it. A lone %, $ or ¢ ("5 %", "$ 5") and digit groups split by a space ("10 000") are refused too.
 */
function numberTokenProblem(text: string): string | null {
  const spaced = text.match(/\d \d{3}(?!\d)/);
  if (spaced) return `"${spaced[0]}" is not a number form we print: a number split by a space; write 10,000`;
  const re = /[0-9.,:/%$¢-]+/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    let token = m[0];
    if (!/[0-9%$¢]/.test(token)) continue;
    token = token.replace(/(?<=[0-9%¢])[.,:]+$/, "");
    if (token.startsWith("-") && /^-[0-9$]/.test(token)) token = token.slice(1);
    if (!NUMBER_FORMS.some((f) => f.form.test(token))) return `"${m[0]}" is not a number form we print: write numbers like ${NUMBER_FORMS.map((f) => f.example).join(", ")}`;
  }
  return null;
}

/**
 * Why AI-written printed text (the question and the easier example's text) cannot be printed, or null: a character
 * outside the allowed set, a number token in no allowed form, or a number in words (numberWordProblem).
 */
export function aiTextProblem(raw: string, context: WordContext): string | null {
  const text = normaliseAiText(raw);
  const bad = [...text].find((c) => !ALLOWED_CHAR.test(c));
  if (bad !== undefined) return `the character "${bad}" (U+${bad.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}) is not allowed: use plain letters, digits and - for minus`;
  return numberTokenProblem(text) ?? numberWordProblem(text, context);
}

/** Every number a text shows in digits (see the header). */
export function readNumbers(text: string): ReadNumber[] {
  const out: ReadNumber[] = [];
  const re = /([−-])?(\$)?(\d+:\d+|\d{1,3}(?:[ ,  ]\d{3})+(?!\d)|\d+(?:\.\d+)?(?:\/\d+)?)(%|¢)?/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const [, minus, dollar, body, after] = m;
    // A minus sign right before the number is a negative sign unless it takes away: after a number, a closing bracket
    // or a one-letter unknown ("9 − 3", "(2) − 1", "3n − 2").
    const prior = text.slice(0, m.index).trimEnd();
    const sign = minus && !/(\d|\)|(^|[^A-Za-z])[A-Za-z])$/.test(prior) ? -1 : 1;
    if (body.includes(":")) {
      const [h, min] = body.split(":").map(Number);
      const form = /^\d{1,2}:\d{2}$/.test(body) ? "time" : "ratio";
      out.push({ value: h, form }, { value: min, form });
      continue;
    }
    if (body.includes("/")) {
      const [a, b] = body.split("/").map(Number);
      out.push({ value: sign * a, form: "fraction" }, { value: b, form: "fraction" });
      continue;
    }
    const value = sign * Number(body.replace(/[ ,  ]/g, ""));
    if (after === "%") { out.push({ value, form: "percent" }); continue; }
    const unit = dollar ? "$" : after === "¢" ? "¢" : null;
    const r: ReadNumber = { value, form: Number.isInteger(value) ? "whole" : "decimal" };
    out.push(unit ? { ...r, money: true, ...(isCoin(value, unit) ? { coin: true as const } : {}) } : r);
  }
  return out;
}
