// Numbers in printed text (#380, R380-5): digits only. The AI writes every number in digits; a number word in the
// text it writes is refused (numberWordProblem), so the item is written again. Code then reads the digits exactly
// (readNumbers): a sign ("-3", "−3"), a decimal point ("0.5"), a fraction slash ("1/2"), a percent ("50%"), a clock
// time ("3:30") and money ("$4.75", "25¢"). Pure: no imports, no clock, no randomness.

/** A number a text shows, with its form; money and coin values marked. */
export interface ReadNumber {
  value: number;
  form: "whole" | "decimal" | "fraction" | "percent" | "time";
  money?: true;
  coin?: true;
}

/** A Canadian coin's value (1¢, 5¢, 10¢, 25¢, $1, $2). */
export const isCoin = (value: number, unit: string) => (unit === "¢" && [1, 5, 10, 25].includes(value)) || (unit === "$" && [1, 2].includes(value));

/**
 * The number lexicon. NUMBER_WORDS name or build a number and are refused anywhere in AI-written text: cardinals, tens
 * and scales (with plurals; "hundreds of dots"), dozen and score, fraction words, ordinals from fourth (as amounts or
 * fractions) and "twice". "first", "second" and "third" are order words and not here; "third" as a fraction ("a
 * third", "one third", "third of", "thirds") is refused. OPERATOR_WORDS have ordinary meanings too ("Point to it", "a
 * negative number", "how many times", "what percent") and are refused next to a digit or a number word ("minus 3",
 * "negative 3", "0 point 5", "3 times 4", "50 percent").
 */
export const NUMBER_WORDS: readonly string[] = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
  "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
  "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
  "hundred", "hundreds", "thousand", "thousands", "million", "millions", "billion", "billions", "dozen", "dozens", "score", "scores",
  "half", "halves", "quarter", "quarters", "thirds",
  "fourth", "fourths", "fifth", "fifths", "sixth", "sixths", "seventh", "sevenths", "eighth", "eighths", "ninth", "ninths",
  "tenth", "tenths", "eleventh", "twelfth", "twentieth", "hundredth", "hundredths", "thousandth", "thousandths", "millionth",
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

/** Every number a text shows in digits (see the header). */
export function readNumbers(text: string): ReadNumber[] {
  const out: ReadNumber[] = [];
  const re = /([−-])?(\$)?(\d{1,2}:\d{2}|\d{1,3}(?:[ ,  ]\d{3})+(?!\d)|\d+(?:\.\d+)?(?:\/\d+)?)(%|¢)?/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const [, minus, dollar, body, after] = m;
    // A minus sign right before the number is a negative sign unless it takes away: after a number, a closing bracket
    // or a one-letter unknown ("9 − 3", "(2) − 1", "3n − 2").
    const prior = text.slice(0, m.index).trimEnd();
    const sign = minus && !/(\d|\)|(^|[^A-Za-z])[A-Za-z])$/.test(prior) ? -1 : 1;
    if (body.includes(":")) {
      const [h, min] = body.split(":").map(Number);
      out.push({ value: h, form: "time" }, { value: min, form: "time" });
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
