// Step template items (#489): a workbook question filled from its step's templates (Cedric's step progressions, #487),
// with numbers code samples from the step's `numbers` ranges by a seeded random source, never chosen by the AI. The
// template's answer expression gives the key; the package keeps the template source, so the checker recomputes the
// answer from the sampled numbers and checks each number against its range (question-package-template.ts).
//
// - A slot's step: the page's step (teaching parts) or one of the part's `reviewSteps` (review, checks and tests).
// - Its template: one the page can print (no picture placeholder, no drawing or tracing from U4, an answer the child
//   can write or circle), of the difficulty its place asks for, the page's other slots taking other templates first.
// - Its format, by place: a story card (show-work: an answer box and a work box), a circle (true or false, yes or no,
//   never / sometimes / always, a choice the text names), Spot the error (the answer shown wrong, "Is it right?" and a
//   box to fix it), Solve it two ways (two work boxes and the answer), else one answer box.
// - The AI may reword a story's text only (in real runs): the same numbers, every one of them, checked by code.
// Pure TypeScript: no Next.js, React, network, database, clock or Math.random.
import { likelihoodWord } from "./workbook-likelihood";
import { BC_SKILL_MAP } from "@/lib/assessment";
import type { AnswerRegion, Item, ItemCheck, QuestionPackage } from "@/lib/question-package";
import { checkQuestionPackage } from "@/lib/question-package";
import { storedDomain, templateAnswerValue, templateScalar, type TemplateScalar, type TemplateSource } from "@/lib/question-package-template";
import type { Curriculum, CurriculumStep, NumberDomain, NumberRange, StepTemplate, TemplateDifficulty } from "@/lib/workbook-curriculum";
import { prepareTemplate, seededRandom, slotDomain } from "@/lib/workbook-curriculum/template";
import type { AiItem, BuiltQuestion, SlotPlace } from "@/lib/workbook-generator-items";
import type { SlotName } from "@/lib/workbook-page";

/** How the question is answered on the page. */
export type StepItemKind = "box" | "story" | "choice" | "spot" | "two-ways" | "sequence";

/** The template a question was filled from: its step, its place in the step's templates and what code sampled. */
export interface StepTemplateRef {
  skill: string;
  step: number;
  /** 0-based place in the step's `templates`. */
  index: number;
  format: StepTemplate["format"];
  difficulty: TemplateDifficulty;
  kind: StepItemKind;
  source: TemplateSource;
  /** The key as the filler wrote it. */
  answer: string;
  /** The choices a circle item offers. */
  choices?: string[];
  /** Spot the error: the wrong answer Sam's work shows. */
  shown?: string;
  /** A count with blanks (#489, the U4 review): its terms in order, null for each blank, and its step. */
  terms?: (number | null)[];
  seqStep?: number;
  /** The sentence frame: the template's text with its numbers and names taken out, its context words kept. */
  frame: string;
  /** A drill (bare numbers, a missing number, a comparison) rather than a sentence frame. */
  drill: boolean;
  /** The step's place in the curriculum's progression (stepRank): the progression check compares days by it. */
  rank: number;
  /** The least and most number the step's ranges allow (the range check). */
  bounds: { min: number; max: number } | null;
  /** Of the step's templates that print here, none is harder. */
  hardest: boolean;
  /** How many templates the step keeps for its Challenge (its hardest with a number to work out). */
  challengeTemplates?: number;
  /** This template is one the step keeps for its Challenge. */
  reserved?: boolean;
}

/** Places whose questions are stories with a work box. */
export const STEP_STORY_PLACES: ReadonlySet<SlotName> = new Set<SlotName>(["word-problems", "picture-stories", "challenge", "math-in-the-world"]);
/** Places on the day's own step, which leave its hardest templates to the Challenge. */
export const TEACH_PLACES: ReadonlySet<SlotName> = new Set<SlotName>(["now-you", "finish-these", "on-your-own", "practice-row", "unit-b-practice", "word-problems", "spot-the-error", "solve-it-two-ways", "try-first", "worked-example", "watch-one", "reminder"]);
/** Places a template does not fill: their formats need an operation or code's fact grid (#482's builders keep them). */
export const NO_TEMPLATE_PLACES: ReadonlySet<SlotName> = new Set<SlotName>(["warm-up", "in-your-head", "mixed-set", "how-do-you-know"]);

const BANNED_FROM_U4 = /\b(?:draw|drawing|trace|tracing)\b/i;
/** Copy the brief rejects on any page. */
const BANNED = /\b(?:watch one|finish two|stretch you|unit [ab]|maybe)\b/i;
const MOST_ANSWER_WORDS = 3;

/** The step `number` of a skill (null: its last), or null when the curriculum has none. */
export function stepOf(curriculum: Curriculum, skill: string, step: number | null): CurriculumStep | null {
  const steps = curriculum.skillSteps(skill) ?? [];
  if (!steps.length) return null;
  return step === null ? steps.at(-1)! : steps.find((s) => s.number === step) ?? null;
}

/** A step's place in the whole curriculum's progression (#489): its level, its skill's order, then its number. */
export function stepRank(curriculum: Curriculum, skill: string, step: number | null): number | null {
  const level = curriculum.levelOfSkill(skill);
  const own = curriculum.skill(skill);
  const at = stepOf(curriculum, skill, step);
  if (!level || !own || !at) return null;
  return level.number * 10_000 + own.order * 20 + at.number;
}

/** The numbers a step's ranges allow: the least and the most of every numeric range and value (0 counts as allowed). */
export function stepBounds(step: CurriculumStep): { min: number; max: number } | null {
  const nums: number[] = [];
  const add = (d: NumberDomain) => {
    if (Array.isArray(d)) for (const v of d) { if (typeof v === "number") nums.push(v); }
    else { const r = d as NumberRange; nums.push(r.min, r.max, ...(r.values ?? [])); }
  };
  for (const d of Object.values(step.numbers ?? {})) add(d);
  for (const v of step.values ?? []) if (typeof v === "number") nums.push(v);
  return nums.length ? { min: Math.min(0, ...nums), max: Math.max(...nums) } : null;
}

/** Every number printed in a text ("$4.50", "3/4", "-2" read as 4.5, 3, 4 and -2). */
export const printedNumbersOf = (text: string): number[] => (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/** Why a printed number is outside its step's ranges, or null (Cedric's range check, section 11). */
export function stepRangeProblem(step: CurriculumStep, text: string): string | null {
  const bounds = stepBounds(step);
  if (!bounds) return null;
  const out = printedNumbersOf(text).find((n) => n < bounds.min || n > bounds.max);
  return out === undefined ? null : `the number ${out} is outside ${step.skill} step ${step.number}'s range (${bounds.min} to ${bounds.max})`;
}

const NUMERIC = /^-?\d+(?:\.\d+)?$|^-?\d+\/\d+$|^\d+ \d+\/\d+$/;
const UNIT_NUMBER = /^-?\d+(?:\.\d+|\/\d+)? (?:mm|cm|km|m|kg|g|mL|L|cm²|m²|cm³|m³|km per hour|words per minute)$/;
const integerAnswer = (a: string) => /^-?\d+$/.test(a);

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
  const tail = text.split(/[.:]\s+/).at(-1) ?? text;
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
  const each = text.match(/^Each (\w+) holds (\d+) ([a-z ]+?)\. ([A-Z][a-z]+) fills (\d+) (?:of them|\w+)\. How many \3 (?:is that|in all|does (?:he|she|they) have(?: now)?|are in the \w+ now)\?$/);
  if (each && Number(each[5]) > 12) return `${each[4]} buys ${each[5]} packs of ${each[2]} ${each[3]}. How many ${each[3]} is that?`;
  const puts = text.match(/^([A-Z][a-z]+) puts (\d+) ([a-z ]+?) in each (\w+) and fills (\d+) of them\. How many \3 is that\?$/);
  if (puts && Number(puts[5]) > 12) return `${puts[1]} buys ${puts[5]} packs of ${puts[2]} ${puts[3]}. How many ${puts[3]} is that?`;
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

/** The kind a filled template takes at a place, or null when it cannot print there. */
function kindAt(place: SlotName | null, answer: string, text: string): { kind: StepItemKind; choices?: string[] } | null {
  const numeric = NUMERIC.test(answer) || UNIT_NUMBER.test(answer);
  if (place === "spot-the-error") return integerAnswer(answer) ? { kind: "spot" } : null;
  if (place === "solve-it-two-ways") return numeric ? { kind: "two-ways" } : null;
  const story = !!place && STEP_STORY_PLACES.has(place);
  if (numeric) return { kind: story ? "story" : "box" };
  const choices = choicesFor(text, answer);
  if (choices) return { kind: "choice", choices };
  // A short answer the child writes in the box ("pentagon", "9, 10", "4, 5, 6, 7"); never a sentence to mark.
  const orderedNumbers = answer.length <= 64 && /^-?\d+(?:\.\d+|\/\d+)?(?:, -?\d+(?:\.\d+|\/\d+)?){1,5}$/.test(answer);
  const short = orderedNumbers || answer.length <= 24 && (answer.split(/\s+/).length <= MOST_ANSWER_WORDS || /^-?\d+(?:, -?\d+)+$/.test(answer));
  return short ? { kind: story ? "story" : "box" } : null;
}

/** The difficulties a place asks for, the first preferred. */
export function wantedDifficulty(place: SlotName | null, day: number, ordinal: number): TemplateDifficulty[] {
  if (place === "challenge" || place === "show-what-you-know") return ["hard", "medium", "easy"];
  // Days 8 to 10 practise the step's harder questions (the U4 review: Day 10 must not feel like Day 1); the hardest
  // of the day's own step stay the Challenge's.
  if (day >= 8 && (place === "on-your-own" || place === "practice-row" || place === "remember-these" || place === "unit-b-practice" || place === "friday-5")) return ["hard", "medium", "easy"];
  if (day >= 8 && (place === "now-you" || place === "finish-these")) return ["medium", "easy", "hard"];
  if (place === "now-you" || place === "finish-these" || place === "worked-example" || place === "watch-one" || place === "reminder" || place === "try-first") return ["easy", "medium", "hard"];
  if (place === "on-your-own") return ["medium", "hard", "easy"];
  if (place === "word-problems" || place === "picture-stories") return day >= 8 ? ["hard", "medium", "easy"] : ["medium", "easy", "hard"];
  if (place === "practice-row" || place === "unit-b-practice") {
    // Rows build from easy to hard; later days start harder.
    const turn = (ordinal + Math.floor((day - 1) / 3)) % 3;
    return turn === 0 ? ["easy", "medium", "hard"] : turn === 1 ? ["medium", "hard", "easy"] : ["hard", "medium", "easy"];
  }
  return ["medium", "easy", "hard"];
}

/** A text's sentence frame: names and numbers taken out, context words kept ("change the context, not only the name"). */
export function sentenceFrame(text: string, names: readonly string[]): string {
  const name = new RegExp(`\\b(?:${names.map((n) => n.replace(/[^A-Za-z]/g, "")).filter(Boolean).join("|") || "_"})\\b`, "g");
  return text.replace(name, "_").replace(/-?\d+(?:\.\d+)?/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
}

const HAS_SENTENCE = /\{(?:name|They|they|them|their|Their|things|animals|foods|places|container)\}/;

export interface StepItemRequest {
  curriculum: Curriculum;
  skill: string;
  step: number | null;
  place: SlotName | null;
  level: number;
  day: number;
  /** Fixed by the book, the page and the slot: the same request always gives the same item. */
  seed: number;
  /** A later attempt takes the next template and other numbers. */
  attempt: number;
  /** Show what you know: only the step's harder templates (internal). */
  hardOnly?: boolean;
  /** Show what you know: every template, after the harder ones did not fit (internal). */
  allEasy?: boolean;
  /** The slot's place among its block's slots, from 0. */
  ordinal: number;
  /** Templates the page has used, by index, so the page's slots take different ones first. */
  usedOnPage?: ReadonlyMap<number, number>;
  /** The most characters the text has room for. */
  room?: number;
  /** A name never to print (the child's own). */
  avoid?: string | null;
}

/**
 * A template two methods can work (#489, the U4 review: Solve it two ways is for sums, never a choice): a number
 * answer (no quoted word in its answer) to a bare, missing-number or story question that adds, takes away, multiplies,
 * shares or splits.
 */
export function sumTemplate(t: StepTemplate, allowUnits = false): boolean {
  const literals = [...t.answer.matchAll(/(['"])(.*?)\1/g)].map(([, , literal]) => literal);
  const numberWithUnit = allowUnits && literals.length > 0 && literals.every(literal => /^ (?:mm|cm|km|m|kg|g|mL|L|cm²|m²|cm³|m³|km per hour|words per minute)$/.test(literal));
  return ["bare", "missing", "story"].includes(t.format) && (!/['"]/.test(t.answer) || numberWithUnit)
    && !/\bevery (?:other )?place\b/i.test(t.text)
    && /[+×÷−]|\s-\s|\b(?:count on|count back|more|less|fewer|add|adds|take|takes|left|rest|altogether|times|groups? of|shares?|split|makes?|in all|total|each|every|per|holds?|fills?|grows?|loses?)\b/i.test(t.text);
}

/** Why a template cannot print in a workbook at this level, or null. */
export function templateProblem(t: StepTemplate, level: number): string | null {
  if (/\(picture:/i.test(t.text)) return "it needs a picture code cannot draw";
  // Its printed words only: a slot's name ("{shown}") is never printed.
  const words = t.text.replace(/\{[^}]*\}/g, "#");
  // Shading or colouring needs a printed figure, which a template item does not have.
  if (/\b(?:shade|shades|shaded|colou?r in)\b/i.test(words)) return "it asks to shade a figure code does not print";
  // A picture the text names must be printed: dots, counters, a chart or a grid (the U4 review: "8 dots: 3 red").
  if (/\b(?:dots?|counters?|tally|tallies|chart|graph|grid|picture|pictured|shown|array|bars?|pictograph|symbols?)\b/i.test(words)) return "it names a picture code does not print";
  // A reversed numeral must be drawn: in words ("A) 5 facing the right way  B) 5 backwards") the choice says its answer.
  if (/\bbackwards?\b|\bfacing the (?:right|wrong) way\b/i.test(words)) return "it needs a reversed numeral code cannot draw";
  // Likelihood is rated never, sometimes or always (workbook-likelihood.ts); a likelihood answer is no rating word.
  if (likelihoodWord(words)) return `it rates likelihood as "${likelihoodWord(words)}", not never, sometimes or always`;
  if (/\blikely\b|\bcertain\b|\bpossible\b/i.test(t.answer)) return "its answer is a likelihood word other than never, sometimes or always";
  if (level >= 4 && BANNED_FROM_U4.test(words)) return "it asks for drawing or tracing";
  if (BANNED.test(words)) return "it uses rejected workbook wording";
  return null;
}

// Numeric output may include a currency sign, a fixed decimal format, or a unit.
// A quoted choice or model explanation is not number work.
const numberAnswerOf = (t: StepTemplate) => ["bare", "missing", "story"].includes(t.format)
  && (t.format === "story" && /str\(/.test(t.answer) || [...t.answer.matchAll(/(['"])(.*?)\1/g)].every(([, , literal]) =>
    /^[\d\s$,+/.-]*$|^%\.?\d*[fgd]$|^ (?:mm|cm|km|m|kg|g|mL|L|cm²|m²|cm³|m³)$/.test(literal)));
const difficultyRank = (d: TemplateDifficulty) => ["easy", "medium", "hard"].indexOf(d);

/**
 * How many templates a step keeps for its Challenge: its hardest with a number to work out (as `stepTemplateItem`).
 * A Challenge asks each once; with fewer than 3, its other cards come from steps taught or reviewed before (U16 review).
 */
export function challengeTemplateCount(curriculum: Curriculum, skill: string, step: number | null, level: number): number {
  const printable = (stepOf(curriculum, skill, step)?.templates ?? []).filter((t) => !templateProblem(t, level));
  const hardest = printable.filter(t => difficultyRank(t.difficulty) === Math.max(...printable.map(t => difficultyRank(t.difficulty))));
  const numeric = hardest.filter(numberAnswerOf);
  return (numeric.length ? numeric : hardest).length;
}

/** Whether a step has a hard template with a number to work out, that prints at this level. */
export function hasHardNumberTemplate(curriculum: Curriculum, skill: string, step: number | null, level: number): boolean {
  return (stepOf(curriculum, skill, step)?.templates ?? []).some((t) => t.difficulty === "hard" && numberAnswerOf(t) && !templateProblem(t, level));
}

/**
 * The step template item for a slot, or null when the step has no template that can print there. The template is the
 * first of the wanted difficulty the page has used least, turned by the seed and the attempt; its numbers come from the
 * step's ranges through the seeded filler, tried again (other numbers) until the text fits its room and its numbers its
 * ranges.
 */
// The same request always gives the same item (a seeded fill): the generator asks for one slot's item many times while
// it plans, measures and checks a page, so the results are kept per curriculum.
const FILL_CACHE = new WeakMap<Curriculum, Map<string, ReturnType<typeof stepTemplateFill>>>();

export function stepTemplateItem(r: StepItemRequest): { ref: StepTemplateRef; text: string; numbers: number[] } | null {
  let cache = FILL_CACHE.get(r.curriculum);
  if (!cache) FILL_CACHE.set(r.curriculum, cache = new Map());
  const { curriculum: _c, usedOnPage, ...rest } = r;
  void _c;
  const key = JSON.stringify([rest, usedOnPage ? [...usedOnPage].sort((a, b) => a[0] - b[0]) : null]);
  if (cache.has(key)) { const hit = cache.get(key)!; return hit ? structuredClone(hit) : null; }
  if (cache.size > 200_000) cache.clear();
  const made = stepTemplateItemUncached(r);
  cache.set(key, made ? structuredClone(made) : null);
  return made;
}

function stepTemplateItemUncached(r: StepItemRequest): { ref: StepTemplateRef; text: string; numbers: number[] } | null {
  // Show what you know takes its step's hardest version that fits its card; when none of the harder ones fits (a
  // long story on a 3-line card), the easy one with the largest numbers, the hardest that fits.
  if ((r.place === "show-what-you-know" || r.place === "level-test") && !r.allEasy) {
    // (Its own and the next attempts' numbers: the planner may take another step after a refused attempt.)
    for (let k = 0; k < 48; k += 3) { const hard = stepTemplateFill({ ...r, attempt: r.attempt + k, hardOnly: true }); if (hard) return hard; }
    const any = stepTemplateFill(r);
    return any ? { ...any, ref: { ...any.ref, hardest: true } } : null;
  }
  return stepTemplateFill(r);
}

function stepTemplateFill(r: StepItemRequest): { ref: StepTemplateRef; text: string; numbers: number[] } | null {
  const step = stepOf(r.curriculum, r.skill, r.step);
  const contexts = r.curriculum.contexts;
  if (!step?.templates?.length || !contexts) return null;
  const wanted = wantedDifficulty(r.place, r.day, r.ordinal);
  // A number to work out: a number answer, or a list of numbers (a count with boxes).
  const numberAnswer = numberAnswerOf;
  const printable = step.templates.map((t, index) => ({ t, index })).filter(({ t }) => !templateProblem(t, r.level)
    && (r.place !== "solve-it-two-ways" || sumTemplate(t)) && (r.place !== "spot-the-error" || numberAnswer(t)));
  // The step's hardest questions are the Challenge's (#482 review at 3134252: the Challenge is clearly harder than the
  // day's practice): its teaching pages take the easier ones, and the Challenge takes the hardest, with a number to
  // work out when its hardest set has one (the U4 review).
  const rank = (d: TemplateDifficulty) => ["easy", "medium", "hard"].indexOf(d);
  // Difficulty comes first. Prefer number work within the hardest set, so a medium
  // numeric question cannot displace a hard comparison or reasoning question.
  const top = Math.max(...printable.map(({ t }) => rank(t.difficulty)));
  const hardest = printable.filter(({ t }) => rank(t.difficulty) === top);
  const numeric = hardest.filter(({ t }) => numberAnswer(t));
  const reserved = numeric.length ? numeric : hardest;
  // (And the step's other templates at the Challenge's difficulty: the Challenge is clearly the day's hardest.)
  const harder = printable.filter((x) => rank(x.t.difficulty) >= top && !reserved.includes(x));
  const rest = printable.filter((x) => !reserved.includes(x) && !harder.includes(x));
  // Outside the Challenge its templates are kept for it (Codex at 3134252: reserve scarce Challenge tasks), but for a
  // teaching page whose other templates print fewer than 3 formats, and a story page with no other story; the
  // Challenge plans first and keeps their largest numbers.
  let usable = r.place === "challenge" ? reserved : rest.length ? rest : printable.filter((x) => !harder.includes(x));
  const storyPage = !!r.place && STEP_STORY_PLACES.has(r.place) && r.place !== "challenge";
  if (r.place && TEACH_PLACES.has(r.place) && !storyPage && new Set(rest.map(({ t }) => t.format)).size < 3) usable = [...rest, ...reserved];
  else if (storyPage && (!rest.some(({ t }) => t.format === "story") || r.attempt >= 128)) usable = [...rest, ...reserved];
  // A review place (Remember these?, the warm-up, Friday 5) on a step of an earlier level takes them all: no Challenge of
  // this book asks that step. On a step of this level it takes them only late, when the others ran out.
  const reviewPlace = !!r.place && !TEACH_PLACES.has(r.place) && !STEP_STORY_PLACES.has(r.place);
  if (reviewPlace && (r.curriculum.levelOfSkill(r.skill)?.number ?? r.level) < r.level) usable = printable;
  else if (reviewPlace && r.attempt >= 192) usable = printable.filter((x) => !harder.includes(x));
  if (!usable.length) usable = printable;
  // A Number stories page asks stories when the step has them (the review: no drills on a page of stories).
  if (r.place && STEP_STORY_PLACES.has(r.place) && r.place !== "challenge" && r.attempt < 256 && usable.some(({ t }) => t.format === "story")) usable = usable.filter(({ t }) => t.format === "story");
  if (r.place === "challenge" && r.attempt < 256) usable = reserved;
  // Show what you know asks each step's hardest version, the Challenge's templates too (the real U4 sample: "Kai says
  // 2. What does Kai say next?" on Day 10); it is a review, not the day's practice of the step.
  const topPlace = r.place === "show-what-you-know" || r.place === "level-test";
  // (Never an easy one when the step has harder ones, before late attempts.)
  if (topPlace) usable = r.hardOnly && printable.some(({ t }) => t.difficulty !== "easy") ? printable.filter(({ t }) => t.difficulty !== "easy") : printable;
  // Show what you know asks work to do, not mostly true or false (#482 review at db3b1a0).
  // (Every other card, so the page keeps three forms.)
  // (Among the harder ones only for a few attempts: a harder choice beats an easy number question.)
  if (r.place === "show-what-you-know" && r.ordinal % 2 === 0 && r.attempt < (r.hardOnly ? 16 : 192) && usable.some(({ t }) => numberAnswer(t))) usable = usable.filter(({ t }) => numberAnswer(t));
  if (!usable.length) return null;
  const used = (i: number) => r.usedOnPage?.get(i) ?? 0;
  // A story place takes the step's stories first, then its number questions (word problems are number stories).
  const storyPlace = !!r.place && STEP_STORY_PLACES.has(r.place) && r.place !== "challenge";
  const numberPlace = r.place === "solve-it-two-ways" || r.place === "spot-the-error";
  const fit = (t: StepTemplate) => numberPlace ? (["bare", "missing"].includes(t.format) ? 0 : t.format === "story" ? 2 : 1)
    : !storyPlace ? 0 : t.format === "story" ? 0 : ["bare", "missing"].includes(t.format) ? 1 : 2;
  // A worked example and a Challenge take their difficulty first: the easiest to show, the hardest to stretch.
  const byDifficulty = r.place === "challenge" || topPlace || r.place === "worked-example" || r.place === "watch-one" || r.place === "reminder";
  const order = usable
    .map((x, k) => ({ ...x, rank: wanted.indexOf(x.t.difficulty), turn: (k + r.seed) % usable.length }))
    // A Challenge takes the step's hardest template first (Cedric's section 9), whatever its format.
    .sort((a, b) => (byDifficulty ? a.rank - b.rank : 0) || fit(a.t) - fit(b.t) || used(a.index) - used(b.index) || a.rank - b.rank || a.turn - b.turn);
  const people = contexts.people.map((p) => p.name);
  for (let k = 0; k < order.length; k++) {
    const { t, index } = order[(k + r.attempt) % order.length];
    let prepared;
    try {
      // Priced objects need a purchase context. The shared counting list also has
      // leaves and acorns, which do not fit these price questions.
      const purchase = t.text.includes("{things}") && /\$|\bdollars?\b|\b(?:buys?|bought)\b|Each \{container\} holds|puts .* in each \{container\}/.test(t.text);
      prepared = prepareTemplate(step, t, purchase ? { ...contexts, things: ["books", "notebooks", "tickets", "toy cars"] } : contexts);
    } catch { continue; }
    const random = seededRandom(((r.seed * 31 + r.attempt * 7919 + k * 104729) % 2147483647) + 1);
    // A Challenge takes the fill with the largest numbers of several, the top of the step's range (the U4 review); a
    // later attempt the next largest, so the page's three Challenge questions find three tasks.
    const fills: { ref: StepTemplateRef; text: string; numbers: number[] }[] = [];
    const tries = r.place === "challenge" || topPlace ? 24 : 12;
    for (let tryNo = 0; tryNo < tries; tryNo++) {
      let filled;
      try { filled = prepared.fill(random); } catch { break; }
      // A template's blank ("Count on: 8, __, __.") prints as "?", as code's missing numbers do: a line of underscores
      // alone leaves too little ink to count as printed.
      // (A template's plural of a container: "boxs" is "boxes".)
      let text = filled.text.replace(/_{2,}/g, "?").replace(/\?\s*\./g, "?").replace(/\b(box|dish|bench|glass|bush|lunchbox|pouch|batch)s\b/gi, "$1es");
      // A count with blanks ("Count on: 8, ?, ?.") prints its numbers with a box in each blank (the U4 review).
      const seq = sequenceOf(text, filled.answer);
      if (seq && r.place !== "spot-the-error" && r.place !== "solve-it-two-ways") text = seq.text;
      if (r.avoid && new RegExp(`\\b${r.avoid}\\b`, "i").test(text)) continue;
      // An expanded form prints no empty place ("9 000 + 000 + 20 + 8", the real U16 sample).
      if ((text.match(/ \+ /g) ?? []).length >= 2) text = text.replace(/ \+ 0+(?=\s*(?:[+=.?]|$))/g, "");
      // From U13 no factor is 1 ("1 × ? = 320" asks nothing, the real U16 sample).
      if (r.level >= 13 && /(?:^|[^\d.])1 ?[×x] |[×x] ?1(?![\d.])/.test(text)) continue;
      // A Challenge asks no part of 0 ("? and 0 make 10", the real U4 sample).
      if (r.place === "challenge" && (/(?:^|[^\d.,])0 (?:and|\+)|(?:and|\+) 0(?![\d.,])/.test(text) || filled.answer === "0")) continue;
      // "They gets": a person whose pronoun is they takes the plain verb (the U16 sample).
      text = text.replace(/\b(They|they) (has|does|is|was|[a-z]+?(?:ches|shes|xes|sses|oes)|[a-z]+s)\b/g, (_, who: string, verb: string) =>
        `${who} ${({ has: "have", does: "do", is: "are", was: "were" } as Record<string, string>)[verb] ?? (/(?:ch|sh|x|ss|o)es$/.test(verb) ? verb.slice(0, -2) : verb.slice(0, -1))}`);
      // "1 shells", "has 0 buttons": a count a child would not read (the U4 sample); other numbers are tried.
      if (/\b1 (?!(?:more|less|fewer|of|and|or|is|to|in|comes|makes|says|gets|eats|has|was|goes|needs|wants|plus|minus|times|tens|ones)\b)(?:hockey |toy |orange )?[a-z]+s\b/i.test(text) || /\b(?:has|have|had|picks|sees|finds) 0\b/i.test(text) || /(?:^|[^\d.,/])1 are\b/.test(text)) continue;
      // Many containers one person fills ("Amara fills 890 boxes"): packs bought, a count that can be that large (the U16
      // review). The numbers stay, each once.
      text = plausibleGroups(text);
      // (After the packs: "buys 570 packs of 1 toy cars" from "Each bag holds 1 toy car", the real U16 sample.)
      if (r.level >= 13 && /\bpacks? of 1 [a-z]|\bholds? 1 [a-z]+s\b/i.test(text)) continue;
      // Colours that fit the things: no blue apples, acorns or leaves (#482 review at db3b1a0); other things are tried.
      if (/\b(?:red|blue|green|yellow|purple|orange)\b(?! slices)/i.test(text) && /\b(?:apples?|acorns?|leaves|leaf|carrots?|grapes?|berries|berry|cookies|cookie|pancakes?|muffins?|crackers?|orange slices|pumpkins?|bananas?|shells?|pinecones?|pebbles?)\b/i.test(text)) continue;
      // A big count of small things no one has ("10000 leaves", "53805 beads"): another fill takes other things (the U16
      // review: pages, people, kilometres, dollars).
      // Things that come in thousands take their place ("counts 4521 tickets on Monday", the U16 review: Grade 5 stories
      // work with the step's 4-digit numbers); a container holding thousands of them is still no story.
      const SMALL = /\b\d{4,}\s+(leaves|beads|shells|stickers|crayons|marbles|buttons|blocks|acorns|apples|pencils|cookies|toy cars|stamps|grapes|carrots|muffins|crackers|pancakes|berries|orange slices|hockey cards|books|cards|pebbles|rocks|feathers|seeds|toys|balloons)\b/i;
      const small = SMALL.exec(text);
      if (small) {
        if (/\b(?:holds?|box(?:es)?|bags?|jars?|trays?|baskets?|bins?|containers?|packs?|bottles?)\b/i.test(text)) continue;
        const big = (r.seed + r.attempt + tryNo) % 2 ? "points" : "tickets";
        text = text.replace(new RegExp(`\\b${small[1]}\\b`, "gi"), big);
      }
      // Derived words can introduce the same unsupported drawing or picture
      // request as literal template text. Check the final text too.
      if (templateProblem({ ...t, text }, r.level)) continue;
      if (r.room !== undefined && text.length > r.room) continue;
      if (stepRangeProblem(step, text) || stepRangeProblem(step, filled.answer)) continue;
      // An answer that names a person ("'name' if a > b else 'friend'"): circle the name or "the friend".
      let answer = filled.answer;
      let labels: [string, string][] | null = null;
      if (/'name'/.test(t.answer)) {
        const who = people.find((n) => new RegExp(`\\b${n}\\b`).test(text));
        if (!who || !/\b(?:a|the) friend\b/.test(text) || (answer !== "name" && answer !== "friend")) break;
        labels = [["name", who], ["friend", "the friend"]];
        answer = answer === "name" ? who : "the friend";
      }
      const at = labels ? { kind: "choice" as const, choices: labels.map(([, word]) => word) }
        : seq && r.place !== "spot-the-error" && r.place !== "solve-it-two-ways" ? { kind: "sequence" as const } : kindAt(r.place, answer, text);
      if (!at) break;
      if (r.place === "challenge" && at.kind === "choice" && /str\(/.test(t.answer) && /['"](?:yes|no)['"]/.test(t.answer)) continue;
      // A circled answer is circled, never written (the U4 review: "Write true or false" beside a circle).
      if (at.kind === "choice") text = text.replace(/\b(?:Write|Say)\s+(true or false|yes or no)\b/gi, "Circle $1");
      const slots: TemplateSource["slots"] = [];
      let ok = true;
      for (const [name, ref] of Object.entries(t.slots)) {
        const value = templateScalar(filled.values[name]);
        if (!value) { ok = false; break; }
        slots.push({ name, value, domain: storedDomain(slotDomain(step, ref)) });
      }
      const values = step.values ? step.values.map((v) => (typeof v === "number" ? (Number.isInteger(v) ? { int: String(v) } : { dec: String(v) }) : { text: v })) as TemplateScalar[] : null;
      if (!ok) break;
      const source: TemplateSource = { answer: t.answer, check: t.check || null, derived: Object.entries(t.derived ?? {}), slots, values, ...(labels ? { labels } : {}) };
      const shown = at.kind === "spot" ? String(plausibleWrong(Number(filled.answer), stepBounds(step))) : undefined;
      const level = (d: TemplateDifficulty) => ["easy", "medium", "hard"].indexOf(d);
      const ref: StepTemplateRef = {
        skill: step.skill, step: step.number, index, format: t.format, difficulty: t.difficulty, kind: at.kind, source, answer,
        ...("choices" in at && at.choices ? { choices: at.choices } : {}), ...(shown !== undefined ? { shown } : {}),
        ...(at.kind === "sequence" && seq ? { terms: seq.terms, seqStep: seq.step } : {}),
        frame: sentenceFrame(text, people), drill: !HAS_SENTENCE.test(t.text),
        rank: stepRank(r.curriculum, step.skill, step.number) ?? 0, bounds: stepBounds(step),
        hardest: level(t.difficulty) >= Math.max(...printable.map((x) => level(x.t.difficulty))),
        challengeTemplates: reserved.length, reserved: reserved.some((x) => x.index === index),
      };
      const found = { ref, text, numbers: printedNumbersOf(text) };
      if (r.place !== "challenge" && !topPlace) return found;
      if (!fills.some((f) => f.text === found.text && f.ref.answer === found.ref.answer)) fills.push(found);
    }
    if (fills.length) {
      const size = (f: (typeof fills)[number]) => Math.max(0, ...f.numbers, ...printedNumbersOf(f.ref.answer));
      fills.sort((a, b) => size(b) - size(a));
      // (Show what you know: the largest numbers, the second largest when another card took them.)
      const k = topPlace ? Math.floor(r.attempt / Math.max(1, order.length)) % Math.min(3, fills.length) : Math.floor(r.attempt / Math.max(1, order.length));
      return fills[Math.min(fills.length - 1, k)];
    }
  }
  return null;
}

/** The AI item a step template item is sent as (its words only may change) and the layout code reads. */
export function stepAiItem(slot: string, ref: StepTemplateRef, text: string): AiItem {
  return {
    slot, skill: ref.skill, difficulty: ref.difficulty === "easy" ? 1 : ref.difficulty === "medium" ? 2 : 3 as 1 | 2 | 3, text,
    format: ref.kind === "story" ? "show-work" : ref.kind === "spot" ? "spot-the-error" : ref.kind === "two-ways" ? "two-ways" : "write-number",
    operation: null, wrongAnswers: [], easier: null, shownWrong: null, figure: null, numbers: [], places: null, direction: null, sequence: null,
    pattern: null, relation: null, figureShows: null, name: null, thing: null,
  } as AiItem;
}

const standardOf = (skill: string) => BC_SKILL_MAP.standards.find((s) => s.skills.some((k) => k.id === skill))?.code ?? null;

/** The item regions and checks of a step template item. */
export function stepItem(ref: StepTemplateRef): Item {
  const answer = templateAnswerValue(ref.answer);
  const box = (id: string, label: string | null): AnswerRegion => ({ id, kind: "box", label, answer: answer as never });
  const check = (region: string): ItemCheck => ({ kind: "template", region, source: ref.source });
  const base = { scorable: true, parentChecked: false, error: null };
  switch (ref.kind) {
    case "story":
      return { ...base, format: "show-work", regions: [box("answer", null), { id: "work", kind: "work", label: "Show your work" }], checks: [check("answer")] };
    case "two-ways":
      return { ...base, format: "two-ways", regions: [{ id: "method-1", kind: "work", label: "Method 1" }, { id: "method-2", kind: "work", label: "Method 2" }, box("answer", null)], checks: [check("answer")] };
    case "spot":
      return {
        ...base, format: "spot-the-error",
        regions: [{ id: "right", kind: "choice", mark: "tick", label: "Is it right?", choices: ["Yes", "No"], answer: ref.shown === ref.answer ? "Yes" : "No" }, box("fix", "Fix it")],
        checks: [{ kind: "template-shown", region: "right", source: ref.source, shown: ref.shown! }, check("fix")],
      };
    case "choice":
      return { ...base, format: "circle", regions: [{ id: "answer", kind: "choice", mark: "circle", label: null, choices: ref.choices!, answer: ref.answer }], checks: [{ kind: "template-choice", region: "answer", source: ref.source }] };
    case "box":
      return { ...base, format: answer.type === "text" ? "write-words" : "write-number", regions: [box("answer", null)], checks: [check("answer")] };
    case "sequence": {
      // One box in each blank of the count; code checks each against the count's step.
      let k = 0;
      const values = ref.answer.split(", ").map(Number);
      const regions: AnswerRegion[] = [];
      const terms = ref.terms!.map((t) => {
        if (t !== null) return { type: "number" as const, value: t };
        const id = `b${++k}`;
        regions.push({ id, kind: "box", label: null, answer: { type: "number", value: values[k - 1] } });
        return { region: id };
      });
      return { ...base, format: "boxes", regions, checks: [{ kind: "sequence", terms, step: { type: "number", value: ref.seqStep! } } as ItemCheck] };
    }
  }
}

/** The step a package was filled from (its template id "<skill>#<step>.<template>:<format>"), or null. */
export function stepTemplateOf(p: QuestionPackage): { skill: string; step: number; index: number; format: string } | null {
  const m = /^([^#\s]+)#(\d+)\.(\d+):([a-z-]+)$/.exec(p.templateId ?? "");
  return m && p.ref.source === "workbook" ? { skill: m[1], step: Number(m[2]), index: Number(m[3]) - 1, format: m[4] } : null;
}

/** The checked package of a step template item, with the text the child reads. */
export function buildStepItem(ref: StepTemplateRef, text: string, place: SlotPlace, textSource: "code" | "ai"): BuiltQuestion {
  const standard = standardOf(ref.skill);
  if (!standard) return { package: null, stepIds: [], check: { status: "failed", reason: `the skill ${ref.skill} is not in the BC skill map` } };
  const pkg: QuestionPackage = {
    id: place.id,
    ref: { source: "workbook", workbookId: place.workbookId, page: place.page, question: place.question },
    templateId: `${ref.skill}#${ref.step}.${ref.index + 1}:${ref.format}`,
    textSource,
    text,
    item: stepItem(ref),
    answer: null, operation: null, steps: [],
    skill: { standard, skills: [ref.skill] },
    level: place.level,
    difficulty: ref.difficulty === "easy" ? 1 : ref.difficulty === "medium" ? 2 : 3,
    wrongAnswers: [], easierExample: null,
  };
  const checked = checkQuestionPackage(pkg);
  if (checked.status === "failed" || checked.status === "unsupported") return { package: null, stepIds: [], check: { status: "failed", reason: checked.reason } };
  return { package: pkg, stepIds: [], check: checked.status === "checked" ? { status: "checked" } : { status: "not-checked", reason: checked.reason } };
}

/** Why the AI's rewording of a step template story breaks its contract, or null: the same numbers, a story, no answer. */
export function stepStoryProblem(text: unknown, numbers: readonly number[], ref: StepTemplateRef, level: number): string | null {
  if (typeof text !== "string" || !text.trim()) return "the writer gave no question text";
  const read = printedNumbersOf(text).sort((a, b) => a - b), given = [...numbers].sort((a, b) => a - b);
  if (JSON.stringify(read) !== JSON.stringify(given)) return `the text must use exactly the code-picked numbers: ${given.join(", ")}`;
  if (level >= 4 && BANNED_FROM_U4.test(text)) return "the writer changed the task to drawing or tracing";
  if (BANNED.test(text) || /\b(?:in all|altogether|left over)\b/i.test(text)) return "the story uses rejected wording";
  if (!/\?\s*$/.test(text.trim()) && ref.kind === "story") return "a story ends with its question";
  return null;
}
