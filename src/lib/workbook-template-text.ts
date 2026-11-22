// Template text helpers (#489, #1213): pure checks and rewrites of a filled template's printed text and answer, shared by
// the step template items (workbook-step-items.ts) and the warm-up progression (workbook-warm-up.ts).
// Pure TypeScript: no Next.js, React, network, database, clock or Math.random.
import { printedMinus, singularPlaces } from "./workbook-wording";
import { bareCalculationWithoutRegrouping } from "./workbook-work-space";

/** The most words a short written answer may have. */
export const MOST_ANSWER_WORDS = 3;

export const NUMERIC = /^-?\d+(?:\.\d+)?$|^-?\d+\/\d+$|^\d+ \d+\/\d+$/;
export const UNIT_NUMBER = /^-?\d+(?:\.\d+|\/\d+)? (?:mm|cm|km|m|kg|g|mL|L|cm²|m²|cm³|m³|km per hour|words per minute)$/;
export const integerAnswer = (a: string) => /^-?\d+$/.test(a);

/** Normalize raw template text into its printed form (minus sign, `?` blanks, regular plurals). */
export function cleanTemplateText(raw: string): string {
  return printedMinus(
    singularPlaces(
      raw
        .replace(/_{2,}/g, "?")
        .replace(/\?\s*\./g, "?")
        .replace(/\b(box|dish|bench|glass|bush|lunchbox|pouch|batch)s\b/gi, "$1es"),
    ),
  );
}

/** From U13, a trivial factor of 1 ("1 × ? = 320") asks nothing. */
export function disallowedFactorOne(text: string, level: number): boolean {
  return level >= 13 && /(?:^|[^\d.])1 ?[×x] |[×x] ?1(?![\d.])/.test(text);
}

/** Whether a short bare/missing equation requires multi-digit regrouping column work (unsuitable for a no-work-box warm-up). */
export function needsColumnWork(text: string): boolean {
  const nums = (text.replace(/(\d),(\d)/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (!nums.length || Math.max(...nums) < 100) return false;
  if (nums.every((n) => n < 10 || n % 10 === 0)) return false;
  if (bareCalculationWithoutRegrouping(text)) return false;
  return true;
}

/** The choices a text offers for a word answer, or null: true or false, yes or no, and "a, b or c" at its end. */
export function choicesFor(text: string, answer: string): string[] | null {
  const found = choiceList(text, answer);
  // The key as the template writes it ("True"), among the choices printed in lower case; letters in capitals.
  if (found && /^[abc]$/i.test(answer)) return found.map((x) => (x === answer.toUpperCase() ? answer : x));
  return found && found.map((x) => (x.toLowerCase() === answer.toLowerCase() ? answer : x));
}

function choiceList(text: string, answer: string): string[] | null {
  const a = answer.toLowerCase();
  if (a === "true" || a === "false") return ["true", "false"];
  if (a === "yes" || a === "no") return ["yes", "no"];
  if (["never", "sometimes", "always"].includes(a)) return ["never", "sometimes", "always"];
  if (/^[abc]$/.test(a)) {
    // The letters as printed, capitals (the U4 review: "A) 5 B) 6" never circles as "A b").
    const letters = ["A", "B", "C"].filter((l) => new RegExp(`\\b${l}[:)]`).test(text));
    return letters.length >= 2 && letters.includes(answer.toUpperCase()) ? letters : null;
  }
  // "Is it a cone or a cube?", "Write = or ≠", "... more likely, less likely or equally likely?"
  const tail = (text.split(/[.:]\s+/).at(-1) ?? text).replace(/^which is greater[,:?]\s*/i, "");
  const m = tail.match(/\b(?:is it|is that|write|circle|say|choose|it is|they are|use)\s+([^?]*?\bor\b[^?]*?)\??\s*$/i) ?? tail.match(/^\s*([^?]*?\bor\b[^?]*?)\??\s*$/i);
  if (!m) return null;
  const options = m[1].split(/,\s*|\s+or\s+/).map((x) => x.trim().replace(/^(?:a|an|the)\s+/i, "").replace(/[.?!]$/, "")).filter(Boolean);
  const clean = (x: string) => x.toLowerCase().replace(/^(?:a|an|the)\s+/, "");
  if (options.length < 2 || options.length > 4 || options.some((x) => x.length > 40 || x.split(/\s+/).length > MOST_ANSWER_WORDS)) return null;
  const hit = options.find((x) => clean(x) === clean(answer));
  return hit ? options.map((x) => (x === hit ? answer : x)) : null;
}

/**
 * A count with blanks and its answer, as a sequence (#489): "Count on: 8, ?, ?. What are the next two numbers?" with
 * "9, 10" is the text "Count on. What are the next two numbers?" and the terms 8, [ ], [ ], each blank a box. Null
 * when the text has no such run, the answer does not fill its blanks, or the numbers do not change by one step.
 */
export function sequenceOf(text: string, answer: string): { text: string; terms: (number | null)[]; step: number } | null {
  if (!/^-?\d+(?:, -?\d+)+$/.test(answer)) return null;
  const run = /-?\d+(?:, (?:-?\d+|\?))*(?:, \?)(?:, (?:-?\d+|\?))*/.exec(text);
  if (!run) return null;
  const parts = run[0].split(", ");
  const answers = answer.split(", ").map(Number);
  if (parts.filter((x) => x === "?").length !== answers.length || parts.length < 3) return null;
  let k = 0;
  const values = parts.map((x) => (x === "?" ? answers[k++] : Number(x)));
  const step = values[1] - values[0];
  if (step === 0 || values.some((v, i) => i > 0 && v - values[i - 1] !== step)) return null;
  const rest = (text.slice(0, run.index) + text.slice(run.index + run[0].length)).replace(/:\s*([.?])/, "$1").replace(/:\s+(?=[A-Z])/, ". ")
    .replace(/\s+([.,?])/g, "$1").replace(/\.\s*\./g, ".").replace(/\s{2,}/g, " ").trim();
  if (!/[a-z]/i.test(rest)) return null;
  return { text: rest, terms: parts.map((x) => (x === "?" ? null : Number(x))), step };
}

/**
 * "Each box holds 3 pencils. Amara fills 890 of them." with more than 12 containers reads as packs bought: "Amara buys
 * 890 packs of 3 pencils. How many pencils is that?". Other texts are unchanged.
 */
export function plausibleGroups(text: string): string {
  // Packs a person buys: up to 50 (the U16 review: "buys 810 packs of 20 apples"); more than that, a school
  // orders them. The numbers stay, each once.
  const many = (count: string, size: string, things: string, who: string) => Number(count) <= 50
    ? `${who} buys ${count} packs of ${size} ${things}. How many ${things} is that?`
    : `${who}'s school orders ${count} boxes with ${size} ${things} in each. How many ${things} is that?`;
  const each = text.match(/^Each (\w+) holds (\d+) ([a-z ]+?)\. ([A-Z][a-z]+) fills (\d+) (?:of them|\w+)\. How many \3 (?:is that|in all|does (?:he|she|they) have(?: now)?|are in the \w+ now)\?$/);
  if (each && Number(each[5]) > 12) return many(each[5], each[2], each[3], each[4]);
  const puts = text.match(/^([A-Z][a-z]+) puts (\d+) ([a-z ]+?) in each (\w+) and fills (\d+) of them\. How many \3 is that\?$/);
  if (puts && Number(puts[5]) > 12) return many(puts[5], puts[2], puts[3], puts[1]);
  return text;
}

/**
 * A wrong answer a child could give (#482 review at db3b1a0: "60001" for 60000 looks arbitrary): a dropped zero
 * (60000 as 6000), two digits swapped (47 as 74), one ten off, or for a small number one off. Never the answer.
 */
export function plausibleWrong(answer: number, bounds: { min: number; max: number } | null): number {
  const fits = (n: number) => n !== answer && n >= 0 && (!bounds || n >= bounds.min && n <= bounds.max);
  const digits = String(answer);
  const swapped = digits.length >= 2 ? Number(digits.slice(0, -2) + digits.at(-1) + digits.at(-2)) : NaN;
  const ways = [answer >= 100 && answer % 10 === 0 ? answer / 10 : NaN, swapped, answer >= 20 ? answer + 10 : NaN, answer >= 20 ? answer - 10 : NaN, answer + 1, answer - 1];
  return ways.find((n) => Number.isInteger(n) && fits(n)) ?? answer + 1;
}
