// The generated book's page content (#363, spec #296): what the real templates (#310, src/lib/workbook-template.ts)
// need besides the questions, for a book the AI generator (#311, src/lib/workbook-generator.ts) writes. The generator
// lays each planned page into the template's slots with `layoutDayPage` (pageSlots, after a header that may wrap), asks
// the AI for exactly those items, then builds the page's content with `dayPageContent`: the header, one block per slot
// with the numbers of its questions, the panels (Worked example, Watch one, Reminder) made by code from a checked
// operation, Sam's wrong work on Spot the error, and each item's picture. The cover, How + Plan, back cover and blank
// pages come from `bookPageContent`.
//
// Pictures: a question package's item figure (#377, src/lib/question-package.ts) is drawn by the template from the
// block's `figures` (src/lib/workbook-page.ts). `pageFigure` maps one to the other: dots keep their groups and the
// crossed-out count, a ten-frame shows its counters in all (`filled`), a number line gets its hops from the operation
// (a + b hops from a to a + b), base-ten blocks keep hundreds, tens and ones, and a pattern keeps its shapes.
//
// The words here are code's, never the AI's: headers, panel labels and explanations come from the plan and the
// curriculum. Pure TypeScript: no Next.js, React, network, database, clock or randomness.
import {
  operationResult,
  operationText,
  stepText,
  valueText,
  workedSteps,
  type AnswerRegion,
  type AnswerValue,
  type Equation,
  type Figure as ItemFigure,
  type ItemCheck,
  type NumberValue,
  type Statement,
  type Term,
  type Operation,
  type QuestionPackage,
} from "@/lib/question-package";
import { aiTextProblem, isCoin, readNumbers, type ReadNumber } from "@/lib/number-words";
import type { Curriculum } from "@/lib/workbook-curriculum";
import {
  headerGrowth,
  pageId,
  pageSlots,
  type Block,
  type DayHeader,
  type Figure,
  type Omission,
  type PageContent,
  type PlannedSlot,
  type SlotName,
} from "@/lib/workbook-page";
import type { PlannedPage, WorkbookPlan } from "@/lib/workbook-plan";

// ---------- Topics and headers ----------

/** The longest topic a page prints: the longest drafted step name is 45 characters. */
const TOPIC_MAX = 45;

/**
 * A topic for a skill and step, never cut inside a phrase: the drafted step's name, else the skill's text up to its
 * first clause when that is short enough, else the level's title.
 */
export function pageTopic(curriculum: Curriculum, skill: string | undefined, step: number | undefined): string {
  if (!skill) return "Review";
  const named = step ? curriculum.skillSteps(skill)?.[step - 1]?.name : undefined;
  if (named) return named;
  const clause = (curriculum.skill(skill)?.text ?? skill).split(/,|;| \(/)[0].trim();
  return clause.length <= TOPIC_MAX ? clause : curriculum.levelOfSkill(skill)?.title ?? "Review";
}

/** The headline words of a day page: its topic, title, subtitle and the grown-up line. */
export function dayHeader(curriculum: Curriculum, page: PlannedPage, level: number): DayHeader {
  const main = page.parts.find((p) => p.step) ?? page.parts[0];
  const topic = pageTopic(curriculum, main?.step?.skill ?? main?.skills[0], main?.step?.step);
  const early = level <= 9;
  const t = (title: string, subtitle: string) => ({ title, subtitle });
  let head: { title: string; subtitle: string };
  // A parent-led page is titled by its first part.
  const first = page.parts[0]?.kind;
  const type = page.type !== "parent-led" ? page.type
    : first === "new-idea" ? "new-idea" : first === "picture-stories" ? "word-problems" : first === "remember-these" ? "remember-these" : first ?? "practice";
  switch (type) {
    case "warm-up": head = t("Warm-up", level >= 16 ? "Facts to 20. Beat your own count from last time." : "Facts to 20. Take your time: there is no timer."); break;
    case "new-idea": head = t(topic, level >= 19 ? "Try it first. Then see how it works." : "Watch how it works. Then try it."); break;
    case "practice": head = t(`Practice: ${topic}`, "Watch one. Finish two. Then do the rest on your own."); break;
    case "practice-2": head = t(`More practice: ${topic}`, "Each row is a little harder than the one before."); break;
    case "word-problems": head = t(`${topic} in stories`, "Read it. Work it out in the box. Write the answer."); break;
    case "math-in-the-world": head = t("Math in the world", "One real task. Plan it, then work it out."); break;
    case "unit-b": head = t(topic, `Unit B: ${topic.toLowerCase()}.`); break;
    case "friday-5": head = t("Remember these? and Friday 5", "Things you learned before, then five with no hints."); break;
    case "challenge": head = t("Challenge", (page.parts.find((x) => x.kind === "challenge")?.items ?? 1) > 1 ? "Two to stretch you." : "One to stretch you."); break;
    case "show-what-you-know": head = t("Show what you know", "Ten days of work. Show what you learned!"); break;
    case "level-test": head = t(`Level U${level} test`, "Do this on your own."); break;
    default: head = t("Remember these?", "Things you learned before, so they stay fresh.");
  }

  const parentLed = page.type === "parent-led";
  const grownUp = parentLed
    ? "Read each line aloud. Your child circles, colours or writes one number."
    : early && type === "new-idea" ? "Read the blue box aloud. Show both ways with a finger." : null;
  return { topic: type === "level-test" ? "Level test" : type === "show-what-you-know" ? "Show what you know" : topic, ...head, grownUp };
}

/** The most characters a line of the 66 px cover title holds. */
const COVER_LINE = 19;

/** A level title as two cover lines: the whole title when it wraps into two, else its part before " and " or a comma. */
export function coverTitleLines(title: string): [string, string] {
  const wrap = (text: string) => {
    const lines: string[] = [];
    for (const word of text.split(" ")) {
      const last = lines.at(-1);
      if (last !== undefined && `${last} ${word}`.length <= COVER_LINE) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
    }
    return lines;
  };
  for (const text of [title, title.split(" and ")[0], title.split(",")[0]]) {
    const lines = wrap(text);
    if (lines.length === 2 && lines.every((l) => l.length <= COVER_LINE)) return [lines[0], lines[1]];
    if (lines.length === 1) {
      const words = text.split(" ");
      if (words.length > 1) return [words.slice(0, -1).join(" "), words.at(-1)!];
    }
  }
  return [title, ""];
}

// ---------- Day pages ----------

/** A planned day page laid into the template's slots: its header, its slots and what it leaves out (pageSlots). */
export interface DayLayout {
  header: DayHeader;
  slots: PlannedSlot[];
  omissions: Omission[];
}

/** Slots that are panels: code writes them, they hold no question. */
export const PANEL_SLOTS: readonly SlotName[] = ["worked-example", "watch-one", "reminder"];

export function layoutDayPage(curriculum: Curriculum, plan: WorkbookPlan, day: number, page: PlannedPage): DayLayout {
  const header = dayHeader(curriculum, page, plan.level);
  const pages = plan.days.find((d) => d.day === day)?.pages.length ?? page.number;
  const { slots, omissions } = pageSlots(page, plan.level, { headerGrowth: headerGrowth(header, plan.level, day, page.number, pages) });
  return { header, slots, omissions };
}

/**
 * The item formats each slot takes, for the AI and the check: a slot not listed takes any format. Spot the error,
 * Solve it two ways, the Mixed set and How do you know? have a layout of their own, so they take only their format.
 */
export const SLOT_FORMATS: Partial<Record<SlotName, readonly string[]>> = {
  "spot-the-error": ["spot-the-error"],
  "solve-it-two-ways": ["two-ways"],
  "mixed-set": ["tick-and-number"],
  "how-do-you-know": ["written-reason"],
  "word-problems": ["show-work"],
  challenge: ["show-work"],
  "warm-up": ["write-number"],
};

/** Slots whose layout takes only the formats SLOT_FORMATS lists: a question in another format fails its check. */
export const STRICT_SLOTS: readonly SlotName[] = ["spot-the-error", "solve-it-two-ways", "mixed-set", "how-do-you-know"];

/** A question of a day page as dayPageContent reads it: its number, its slot in the layout, its package or none. */
export interface PageQuestion {
  number: number;
  /** The index of its slot in the layout's slots. */
  slot: number;
  package: QuestionPackage | null;
  /** Why it failed, when it did. */
  failed?: string;
}

/** An operation with a whole-number answer of two places or more, or any computed operation: the panel's sum. */
function panelOperation(questions: PageQuestion[], prefer: number[]): Operation | null {
  const ordered = [...questions.filter((q) => prefer.includes(q.slot)), ...questions.filter((q) => !prefer.includes(q.slot))];
  for (const q of ordered) {
    const op = q.package?.easierExample?.operation ?? null;
    if (op) return op;
  }
  for (const q of ordered) if (q.package?.operation) return q.package.operation;
  return null;
}

/** The worked lines of an operation: its steps in words (at most `most`), then the sum with its answer in blue. */
function workedLines(op: Operation, most: number): string[] {
  const steps = workedSteps(op).filter((s) => s.kind !== "result").map((s) => stepText(s, op));
  return [...steps.slice(0, most), `${operationText(op)} = [${valueText(operationResult(op))}]`];
}

/**
 * A picture for the template from an item's figure: the same numbers, in the template's terms. A number line's hops
 * come from the operation: a + b hops from a to a + b, a − b from a back to a − b. Null for no figure.
 */
export function pageFigure(f: ItemFigure | null | undefined, op: Operation | null): Figure | null {
  if (!f) return null;
  switch (f.kind) {
    case "dots": return { kind: "dots", groups: [...f.groups], takenAway: f.takenAway };
    case "ten-frame": return { kind: "ten-frame", filled: f.counters.reduce((a, b) => a + b, 0) };
    case "number-line": {
      const [a, b] = (op?.operands ?? []) as unknown[];
      const hops: [number, number][] = typeof a === "number" && typeof b === "number" && (op?.kind === "add" || op?.kind === "subtract")
        ? [[a, op.kind === "add" ? a + b : a - b]]
        : [];
      return { kind: "number-line", from: f.from, to: f.to, step: f.step, hops: hops.filter(([x, y]) => [x, y].every((v) => v >= Math.min(f.from, f.to) && v <= Math.max(f.from, f.to))) };
    }
    case "base-ten": return { kind: "blocks", hundreds: f.hundreds, tens: f.tens, ones: f.ones };
    case "array": return { kind: "array", rows: f.rows, columns: f.columns };
    case "pattern": return { kind: "pattern", core: [...f.core], length: f.length, blank: f.blank };
  }
}

// ---------- Number ranges ----------

/**
 * The largest number a level's items use, from each level's title and topics (numbers to 10 in Kindergarten, to 20 in
 * U4 to U6, to 100 in U7 to U9, to 1000 in U10 to U12, to 10 000 in U13 to U15, to a million in U16 to U18;
 * no practical limit from U19).
 */
const LEVEL_MAX = [
  10, 10, 10, 20, 20, 20, 100, 100, 100, 1000, 1000, 1000, 10_000, 10_000, 10_000, 1_000_000, 1_000_000, 1_000_000,
  ...Array.from({ length: 12 }, () => 1_000_000_000),
];
const levelMax = (level: number) => LEVEL_MAX[Math.min(30, Math.max(1, level)) - 1];

export interface NumberRange {
  /** The largest number an item may print or ask for (printedNumbers). */
  max: number;
  negatives: boolean;
  fractions: boolean;
  decimals: boolean;
  percents: boolean;
  ratios: boolean;
  /** The skill is about money: coin values always fit, and amounts of money may have cents ($4.75). */
  money: boolean;
  /** The skill is about time: a clock time (3:30) fits as it is; elsewhere its numbers are checked like any other. */
  time: boolean;
}

/**
 * The first level of each idea, from the curriculum: the first level with a skill about fractions, about decimals,
 * about integers or negative numbers, about percents and about ratios (BC: U12, U15, U22, U21 and U21). Before it, an item never shows
 * one. A test pins the BC levels, so a curriculum text change that breaks the detection fails loudly.
 */
export interface ConceptLevels { fractions: number; decimals: number; negatives: number; percents: number; ratios: number }
const CONCEPT_WORDS: Record<keyof ConceptLevels, RegExp> = {
  fractions: /\bfractions?\b/i,
  decimals: /\bdecimals?\b/i,
  negatives: /\bintegers?\b|\bnegative\b/i,
  percents: /\bpercents?\b/i,
  ratios: /\bratios?\b/i,
};
const conceptCache = new WeakMap<Curriculum, ConceptLevels>();
export function conceptLevels(curriculum: Curriculum): ConceptLevels {
  const cached = conceptCache.get(curriculum);
  if (cached) return cached;
  const first = (re: RegExp) => curriculum.levels.find((l) => (curriculum.levelSkills(l.id) ?? []).some((s) => re.test(s.text)))?.number ?? Infinity;
  const levels = { fractions: first(CONCEPT_WORDS.fractions), decimals: first(CONCEPT_WORDS.decimals), negatives: first(CONCEPT_WORDS.negatives), percents: first(CONCEPT_WORDS.percents), ratios: first(CONCEPT_WORDS.ratios) };
  conceptCache.set(curriculum, levels);
  return levels;
}

/** A level's number range, for an item with no skill. */
export function levelRange(curriculum: Curriculum, level: number): NumberRange {
  const c = conceptLevels(curriculum);
  return { max: levelMax(level), negatives: level >= c.negatives, fractions: level >= c.fractions, decimals: level >= c.decimals, percents: level >= c.percents, ratios: level >= c.ratios, money: false, time: false };
}

/** The limit a skill's id names ("1.3-add-within-10", "3.4-recall-addition-20", "2.1-ten-more-less-100"), or null. */
function idLimit(skill: string): number | null {
  const m = skill.match(/-(?:within-|to-)?(\d+)$/) ?? skill.match(/-(?:within|to)-(\d+)-/);
  const n = m ? Number(m[1]) : NaN;
  return [5, 10, 20, 100, 1000, 10_000].includes(n) ? n : null;
}

/** A skill is about money when its unit is a financial literacy standard (BC: K11, 1.11, 2.12, 3.14, 4.18, ...). */
const isMoneySkill = (curriculum: Curriculum, skill: string) =>
  /^financial literacy\b/i.test(curriculum.unit(curriculum.skill(skill)?.unit ?? "")?.text ?? "");

/** A skill is about time when it or its unit names time or clocks ("Read an analog clock", "units of time"). */
const isTimeSkill = (curriculum: Curriculum, skill: string) => {
  const s = curriculum.skill(skill);
  return /\b(time|clocks?)\b/i.test(`${s?.text ?? ""} ${curriculum.unit(s?.unit ?? "")?.text ?? ""}`);
};

/**
 * The range of an item on a skill: the range of the skill's own level (a review of an earlier skill keeps to that
 * skill's numbers and ideas), never above the page's level, and never above the limit the skill's id names ("facts to
 * 20").
 */
export function skillRange(curriculum: Curriculum, level: number, skill: string): NumberRange {
  const own = curriculum.levelOfSkill(skill)?.number ?? level;
  const range = { ...levelRange(curriculum, Math.min(own, level)), money: isMoneySkill(curriculum, skill), time: isTimeSkill(curriculum, skill) };
  const limit = idLimit(skill);
  return limit !== null && limit < range.max ? { ...range, max: limit } : range;
}

/** A slot's ranges for the AI: each skill it may use, with that skill's range. */
export function slotRanges(curriculum: Curriculum, level: number, skills: readonly string[]): Record<string, NumberRange> {
  return Object.fromEntries(skills.map((s) => [s, skillRange(curriculum, level, s)]));
}

// Every number the child sees or is asked for (R380-3-1), walked by one collector over the whole package. Each switch
// ends in `never`, so a new value type, region, check, statement, figure or operation kind does not build until it is
// collected here. Text is read by readNumbers (src/lib/number-words.ts): numbers are digits; AI-written text with a
// number word is refused (numberWordProblem).

const unreachable = (x: never): never => {
  throw new Error(`printedNumbers: unknown ${JSON.stringify(x)}`);
};

type Read = ReadNumber;
const num = (value: number): Read => ({ value, form: Number.isInteger(value) ? "whole" : "decimal" });
const frac = (value: number): Read => ({ value, form: "fraction" });
const money = (value: number, unit: string): Read =>
  unit === "$" || unit === "¢" ? { ...num(value), money: true, ...(isCoin(value, unit) ? { coin: true as const } : {}) } : num(value);
/** The same numbers, as the parts of a fraction (a fraction operation's whole numbers too). */
const asFraction = (rs: Read[]): Read[] => rs.map((r) => ({ ...r, form: "fraction" }));

/** The numbers of a value. */
function valueNumbers(v: AnswerValue | null | undefined): Read[] {
  if (!v) return [];
  switch (v.type) {
    case "number": return [num(v.value)];
    case "fraction": return [frac(v.numerator), frac(v.denominator)];
    case "mixed": return [frac(v.whole), frac(v.numerator), frac(v.denominator)];
    case "remainder": return [num(v.quotient), num(v.remainder)];
    case "quantity": return [money(v.value, v.unit)];
    case "compound": return v.parts.map((part) => money(part.value, part.unit));
    case "time": return [{ value: v.hours, form: "time" }, { value: v.minutes, form: "time" }];
    case "expression":
    case "choice":
    case "text": return readNumbers(v.value);
    default: return unreachable(v);
  }
}

/** The numbers of an operation's operands and its other numbers; a fraction or decimal operation is that idea. */
function operationNumbers(op: Operation | null | undefined): Read[] {
  if (!op) return [];
  const operand = (o: number | string | AnswerValue): Read[] => (typeof o === "number" ? [num(o)] : typeof o === "string" ? readNumbers(o) : valueNumbers(o));
  const operands = (op.operands as readonly (number | string | AnswerValue)[]).flatMap(operand);
  switch (op.kind) {
    case "add": case "subtract": case "multiply": case "divide":
    case "convert": case "quantity-add": case "quantity-subtract": case "quantity-multiply":
    case "money-round": case "elapsed-time": case "time-add": case "clock-convert": case "solve":
      return operands;
    case "decimal-add": case "decimal-subtract": case "decimal-multiply":
      return operands.map((r) => ({ ...r, form: "decimal" }));
    case "fraction-add": case "fraction-subtract": case "fraction-multiply": case "fraction-divide": case "fraction-simplify":
      return asFraction(operands);
    case "fraction-equivalent": return asFraction([...operands, num(op.denominator)]);
    case "evaluate": return [...operands, ...Object.values(op.values ?? {}).map(num)];
    default: return unreachable(op);
  }
}

const termNumbers = (t: Term): Read[] => ("region" in t ? [] : valueNumbers(t));
const equationNumbers = (e: Equation): Read[] => [e.left, e.right, e.result].flatMap(termNumbers);

function statementNumbers(st: Statement): Read[] {
  switch (st.kind) {
    case "equation": return equationNumbers(st.equation);
    case "factor": return [num(st.factor), num(st.of)];
    case "shown-answer": return [];
    default: return unreachable(st);
  }
}

function regionNumbers(r: AnswerRegion): Read[] {
  const label = readNumbers(r.label ?? "");
  switch (r.kind) {
    case "box": return [...label, ...valueNumbers(r.answer)];
    case "choice": return [...label, ...r.choices.flatMap(readNumbers), ...readNumbers(r.answer ?? "")];
    case "work": case "lines": case "picture": return label;
    default: return unreachable(r);
  }
}

function checkNumbers(c: ItemCheck): Read[] {
  switch (c.kind) {
    case "operation": case "operation-sign": case "count": case "pattern": return [];
    case "places": return [num(c.number)];
    case "order": return c.numbers.flatMap(valueNumbers);
    case "equations": return c.equations.flatMap(equationNumbers);
    case "sequence": {
      // Every term printed or asked for: the given ones, and each blank as the term it holds (first given term plus
      // the step for each place after it).
      const at = c.terms.findIndex((t) => !("region" in t));
      const given = at >= 0 ? (c.terms[at] as NumberValue) : null;
      const blanks = given?.type !== "number" || c.step.type !== "number" ? []
        : c.terms.flatMap((t, i) => ("region" in t ? [num(given.value + (i - at) * (c.step as { value: number }).value)] : []));
      return [...c.terms.flatMap(termNumbers), ...blanks, ...valueNumbers(c.step)];
    }
    case "compare": return [...valueNumbers(c.left), ...valueNumbers(c.right)];
    case "yes-no": return statementNumbers(c.statement);
    default: return unreachable(c);
  }
}

function figureNumbers(f: ItemFigure | null | undefined, op: Operation | null): Read[] {
  if (!f) return [];
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  switch (f.kind) {
    case "dots": return [...f.groups, f.takenAway, sum(f.groups)].map(num);
    case "ten-frame": return [...f.counters, sum(f.counters)].map(num);
    case "number-line": {
      const drawn = pageFigure(f, op);
      return [f.from, f.to, f.step, ...(drawn?.kind === "number-line" ? (drawn.hops ?? []).flat() : [])].map(num);
    }
    case "base-ten": return [f.hundreds, f.tens, f.ones, f.hundreds * 100 + f.tens * 10 + f.ones].map(num);
    case "array": return [f.rows, f.columns, f.rows * f.columns].map(num);
    case "pattern": return [];
    default: return unreachable(f);
  }
}

/**
 * Every number a package prints or asks for, with its form (whole, fraction or decimal; money and coins marked), and
 * any number text that does not read with confidence: the question text; the operation's numbers and the answer (with
 * its other accepted forms); the wrong answers; Sam's answer and every number of Sam's steps; the easier example's
 * text, operation and answer; and the item's regions (labels, box answers, choices), checks (places, order, equations,
 * sequence terms and blanks, compare and yes-no numbers) and figure (with a number line's hops).
 */
export function printedValues(p: QuestionPackage): ReadNumber[] {
  const item = p.item;
  const error = item?.error ?? null;
  const shown = error ? samWork(p.operation, error.answer, shownOf(p).cause) : null;
  const easier = p.easierExample;
  return [
    ...readNumbers(p.text),
    ...operationNumbers(p.operation),
    ...valueNumbers(p.answer?.value),
    ...(p.answer?.accepted ?? []).flatMap(valueNumbers),
    ...p.wrongAnswers.flatMap((w) => valueNumbers(w.value)),
    ...valueNumbers(error?.answer),
    ...(shown?.lines ?? []).flatMap(readNumbers),
    ...(easier ? [...readNumbers(easier.text), ...operationNumbers(easier.operation), ...valueNumbers(easier.answer)] : []),
    ...(item?.regions ?? []).flatMap(regionNumbers),
    ...(item?.checks ?? []).flatMap(checkNumbers),
    ...figureNumbers(item?.figure, p.operation),
  ];
}

/** The values of printedValues. */
export const printedNumbers = (p: QuestionPackage): number[] => printedValues(p).map((r) => r.value);

/**
 * Why an item's numbers do not fit its skill's range at the level, or null (see skillRange): text the AI writes (the
 * question and the easier example) that fails the gate (aiTextProblem: characters, number forms, number words), a number past the range, or a negative
 * number, fraction, decimal or percent before the curriculum's first level of that idea. On a money skill, coin values
 * always fit and amounts of money may have cents; on a time skill, a clock time fits as it is.
 */
export function rangeProblem(p: QuestionPackage, curriculum: Curriculum, level: number): string | null {
  const skill = p.skill.skills[0];
  const range = skill ? skillRange(curriculum, level, skill) : levelRange(curriculum, level);
  const context = { skill: skill ?? null, money: range.money };
  const text = aiTextProblem(p.text, context) ?? (p.easierExample ? aiTextProblem(p.easierExample.text, context) : null);
  if (text) return text;
  const read = printedValues(p).filter((r) => !(r.coin && range.money) && !(r.form === "time" && range.time));
  const big = read.find((r) => Math.abs(r.value) > range.max);
  if (big) return `the number ${big.value} is too big for this question: its numbers are at most ${range.max}`;
  const negative = read.find((r) => r.value < 0);
  if (negative && !range.negatives) return `the number ${negative.value} is negative: this question uses no negative numbers`;
  const c = conceptLevels(curriculum);
  if (!range.fractions && read.some((r) => r.form === "fraction")) return `this question uses no fractions: they start at U${c.fractions}`;
  const decimal = read.find((r) => r.form === "decimal" && !(r.money && range.money));
  if (decimal && !range.decimals) return `the number ${decimal.value} is a decimal: this question uses no decimals (they start at U${c.decimals})`;
  const percent = read.find((r) => r.form === "percent");
  if (percent && !range.percents) return `${percent.value}% is a percent: this question uses no percents (they start at U${c.percents})`;
  if (!range.ratios && read.some((r) => r.form === "ratio")) return `this question uses no ratios: they start at U${c.ratios}`;
  return null;
}

// ---------- Sam's wrong work (Spot the error) ----------

/**
 * The mistakes code can show step by step on Sam's work. The AI only names one (as the shown wrong answer's cause) and
 * gives the wrong answer; code builds every line, and the answer must be what the mistake gives.
 * - Column mistakes (whole-number column sums): forgot-carry, smaller-from-larger, regroup-not-taken. Their step is
 *   the column whose digit Sam writes wrong.
 * - Early mistakes (counting on or back, and the answer): counted-one-extra, counted-one-short, wrong-start (counts
 *   on from the first number itself, not after it), wrong-operation (adds instead of taking away, or the other way),
 *   swapped-digits (writes the two digits of the answer the other way round). They are not one worked step: step null.
 */
export const SAM_MISTAKES = [
  "forgot-carry", "smaller-from-larger", "regroup-not-taken",
  "counted-one-extra", "counted-one-short", "wrong-start", "wrong-operation", "swapped-digits",
] as const;
export type SamMistake = (typeof SAM_MISTAKES)[number];

/** What each mistake is and when it can happen, for the AI (in the request of a Spot the error slot). */
export const SAM_MISTAKE_RULES: Record<SamMistake, { what: string; when: string; step: string }> = {
  "forgot-carry": { what: "adds each column and drops the carry", when: "addition of whole numbers with a carry", step: "the column after the carry ('tens' for a carry from the ones)" },
  "smaller-from-larger": { what: "takes the smaller digit from the larger in every column", when: "subtraction of whole numbers that needs a regroup", step: "the first column that needs a regroup" },
  "regroup-not-taken": { what: "regroups but does not take 1 from the next column", when: "subtraction of whole numbers that needs a regroup", step: "the column left of the regroup" },
  "counted-one-extra": { what: "counts on (or back) one too many", when: "addition or subtraction of whole numbers, the second number 1 to 10", step: "null" },
  "counted-one-short": { what: "counts on (or back) one too few", when: "addition or subtraction of whole numbers, the second number 2 to 10", step: "null" },
  "wrong-start": { what: "starts counting on (or back) at the first number itself instead of after it", when: "addition or subtraction of whole numbers, the second number 2 to 10", step: "null" },
  "wrong-operation": { what: "adds instead of taking away, or takes away instead of adding", when: "addition or subtraction of whole numbers (for addition the first number is the larger)", step: "null" },
  "swapped-digits": { what: "writes the two digits of the answer the other way round", when: "an answer from 10 to 99 with two different digits and no 0", step: "null" },
};

/**
 * The mistakes a Spot the error item may use at a level: counting and answer mistakes up to U6 (before column
 * regrouping; swapped digits only from U4, where numbers go past 10), all of them at U7 to U9, and from U10 the column
 * mistakes with the wrong operation and swapped digits.
 */
export function levelMistakes(level: number): SamMistake[] {
  // Swapped digits needs a two-digit answer: not in the levels with numbers to 10.
  if (level <= 6) return ["counted-one-extra", "counted-one-short", "wrong-start", "wrong-operation", ...(levelMax(level) >= 12 ? ["swapped-digits" as const] : [])];
  if (level <= 9) return [...SAM_MISTAKES];
  return ["forgot-carry", "smaller-from-larger", "regroup-not-taken", "wrong-operation", "swapped-digits"];
}

const PLACES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands"] as const;
const UNIT_OF: Record<string, string> = { ones: "one", tens: "ten", hundreds: "hundred", thousands: "thousand", "ten thousands": "ten thousand", "hundred thousands": "hundred thousand" };

/** Sam's wrong work: the mistake, the worked lines (the last is the sum with Sam's answer in blue), where it goes wrong. */
export interface SamWork {
  mistake: SamMistake;
  /**
   * The worked step id where the mistake happens, as in workedSteps: the column whose digit Sam writes wrong ("tens"
   * for a carry from the ones that was dropped); null for a mistake that is not one worked step.
   */
  step: string | null;
  /** The index in `lines` of the first wrong line: what the mistake names. */
  wrongLine: number;
  /** Sam's wrong answer. */
  answer: number;
  lines: string[];
}

const digitsOf = (n: number) => String(n).split("").reverse().map(Number);
const wholeTwo = (op: Operation): [number, number] | null => {
  const [a, b] = op.operands as unknown[];
  return typeof a === "number" && typeof b === "number" && Number.isSafeInteger(a) && Number.isSafeInteger(b) && a >= 0 && b >= 0 ? [a, b] : null;
};
/** The column lines of a whole-number operation, as the worked example writes them, without the result. */
const columnLines = (op: Operation) => workedSteps(op).filter((s) => s.kind !== "result").map((s) => stepText(s, op));

/** One mistake's wrong work on a sum, or null when the mistake cannot happen on it. */
function samLines(op: Operation, mistake: SamMistake): Omit<SamWork, "mistake"> | null {
  const ab = wholeTwo(op);
  if (!ab || (op.kind !== "add" && op.kind !== "subtract" && !(mistake === "swapped-digits" && op.kind === "multiply"))) return null;
  const [a, b] = ab;
  const plus = op.kind === "add";
  const done = (lines: string[], answer: number, wrongLine: number, step: string | null = null) =>
    ({ step, wrongLine, answer, lines: [...lines, `${operationText(op)} = [${answer}]`] });
  switch (mistake) {
    case "forgot-carry": case "smaller-from-larger": case "regroup-not-taken": {
      const x = digitsOf(a);
      const y = digitsOf(b);
      const n = Math.max(x.length, y.length);
      if (n > PLACES.length) return null;
      const lines: string[] = [];
      const written: string[] = [];
      let step: string | null = null;
      if (plus && mistake === "forgot-carry") {
        for (let i = 0; i < n; i++) {
          const total = (x[i] ?? 0) + (y[i] ?? 0);
          const last = i === n - 1;
          // Sam writes the ones digit of each column and drops the carry; the last column is written whole. The
          // mistake shows in the next column: its digit misses the carried 1.
          const write = last ? String(total) : String(total % 10);
          if (!last && total >= 10 && step === null) step = PLACES[i + 1];
          lines.push(`Add the ${PLACES[i]}: ${x[i] ?? 0} + ${y[i] ?? 0} = ${total}. Write ${write}.`);
          written.unshift(write);
        }
      } else if (op.kind === "subtract" && a > b && mistake !== "forgot-carry") {
        let owe = false;
        for (let i = 0; i < n; i++) {
          const top = x[i] ?? 0;
          const bottom = y[i] ?? 0;
          if (mistake === "smaller-from-larger") {
            // Sam takes the smaller digit from the larger in every column, so never regroups.
            if (top < bottom && step === null) step = PLACES[i];
            lines.push(`Subtract the ${PLACES[i]}: ${Math.max(top, bottom)} − ${Math.min(top, bottom)} = ${Math.abs(top - bottom)}. Write ${Math.abs(top - bottom)}.`);
            written.unshift(String(Math.abs(top - bottom)));
          } else {
            // Sam regroups 1 from the next column but does not take that 1 away from it.
            if (owe && step === null) step = PLACES[i];
            owe = top < bottom;
            const from = owe ? top + 10 : top;
            lines.push(owe
              ? `Regroup 1 ${UNIT_OF[PLACES[i + 1]] ?? "ten"} as 10 ${PLACES[i]}: ${from} − ${bottom} = ${from - bottom}. Write ${from - bottom}.`
              : `Subtract the ${PLACES[i]}: ${top} − ${bottom} = ${top - bottom}. Write ${top - bottom}.`);
            written.unshift(String(from - bottom));
          }
        }
      } else return null;
      if (step === null) return null;
      return done(lines, Number(written.join("").replace(/^0+(?=\d)/, "")), PLACES.indexOf(step as (typeof PLACES)[number]), step);
    }
    case "counted-one-extra": case "counted-one-short": case "wrong-start": {
      if (b < (mistake === "counted-one-extra" ? 1 : 2) || b > 10) return null;
      const dir = plus ? 1 : -1;
      // The numbers Sam says: one too many, one too few, or starting at the first number itself.
      const count = mistake === "counted-one-extra" ? b + 1 : b;
      const first = mistake === "wrong-start" ? a : a + dir;
      const said = Array.from({ length: mistake === "counted-one-short" ? b - 1 : count }, (_, k) => first + dir * k);
      if (said.some((v) => v < 0)) return null;
      const answer = said.at(-1)!;
      return done([`Start at ${a}. Count ${plus ? "on" : "back"} ${b}.`, `${said.join(", ")}`], answer, 1);
    }
    case "wrong-operation": {
      if (b === 0 || (plus && a < b)) return null;
      const wrong: Operation = { kind: plus ? "subtract" : "add", operands: [a, b] };
      return done(columnLines(wrong), plus ? a - b : a + b, 0);
    }
    case "swapped-digits": {
      const right = operationResult(op);
      if (right.type !== "number" || !Number.isInteger(right.value) || right.value < 10 || right.value > 99) return null;
      const [tens, ones] = [Math.floor(right.value / 10), right.value % 10];
      if (ones === 0 || ones === tens) return null;
      const lines = columnLines(op);
      return done(lines, ones * 10 + tens, lines.length);
    }
  }
}

/**
 * Sam's wrong work for a question's shown wrong answer: the mistake named (`cause`, when it is one of SAM_MISTAKES),
 * else the first mistake whose answer is that wrong answer. Null when the mistake cannot happen on the sum or does not
 * give that answer: the page cannot show Sam's steps, and the generator fails the question with the reason. The right
 * answer is never Sam's: a mistake that gives it is not one.
 */
export function samWork(op: Operation | null, shown: AnswerValue | null | undefined, cause?: string | null): SamWork | null {
  if (!op || !shown || shown.type !== "number") return null;
  const named = SAM_MISTAKES.find((m) => m === cause);
  const right = operationResult(op);
  for (const mistake of named ? [named] : SAM_MISTAKES) {
    const work = samLines(op, mistake);
    if (work && work.answer === shown.value && !(right.type === "number" && right.value === work.answer)) return { mistake, ...work };
  }
  return null;
}

/** The shown wrong answer of a Spot the error question and its cause, as the package holds them. */
function shownOf(p: QuestionPackage): { answer: AnswerValue | null; cause: string | null; step: string | null } {
  const answer = p.item?.error?.answer ?? null;
  const cause = answer?.type === "number" ? p.wrongAnswers.find((w) => w.value.type === "number" && w.value.value === answer.value)?.cause ?? null : null;
  return { answer, cause, step: p.item?.error?.step ?? null };
}

/**
 * Why a Spot the error question cannot be shown, or null: its shown wrong answer must be what a mistake of the level
 * (levelMistakes) gives on its sum, and its step must be that mistake's step (null for an early mistake).
 */
export function samProblem(p: QuestionPackage, level: number): string | null {
  const shown = shownOf(p);
  const allowed = levelMistakes(level);
  const work = samWork(p.operation, shown.answer, shown.cause);
  if (!work || !allowed.includes(work.mistake)) {
    return `code cannot show Sam's steps for this wrong answer: name one of these mistakes as its cause and give exactly the answer it makes: ${allowed.join(", ")}`;
  }
  if (shown.step !== work.step) return `Sam's mistake (${work.mistake}) ${work.step ? `happens in the ${work.step} column` : "is not one column"}: set the wrong answer's step to ${work.step ?? "null"}`;
  return null;
}

/** The mistakes a Spot the error slot offers the AI at a level, with what each is, when it fits and its step. */
export const mistakesFor = (level: number) => levelMistakes(level).map((name) => ({ name, ...SAM_MISTAKE_RULES[name] }));

/** Notes and labels of list slots, as the sample sheets show them. */
const ROW_LABELS = ["Getting started", "A little harder", "Harder again"];

/**
 * A day page's content for the template: the header, then one block per laid-out slot, each naming its questions by
 * their number on the page. A question with no package (the AI wrote nothing code could use) is left off the page;
 * its number stays free, so the numbers of the other questions do not change.
 */
export function dayPageContent(o: {
  curriculum: Curriculum;
  plan: WorkbookPlan;
  day: number;
  page: PlannedPage;
  layout: DayLayout;
  questions: PageQuestion[];
  child: string;
  workbook: number;
}): PageContent {
  const { curriculum, plan, page, layout, questions } = o;
  const pages = plan.days.find((d) => d.day === o.day)?.pages.length ?? page.number;
  let row = 0;
  const blocks: Block[] = layout.slots.map((s, i): Block => {
    const mine = questions.filter((q) => q.slot === i && q.package);
    const items = mine.map((q) => q.number);
    // A question with no package cannot print; its placeholder names it and why.
    const lost = questions.filter((q) => q.slot === i && !q.package).map((q) => ({ number: q.number, reason: q.failed ?? "code could build no question" }));
    const missing = lost.length ? { missing: lost } : {};
    const part = page.parts[s.part];
    const figures = mine.map((q) => pageFigure(q.package!.item?.figure, q.package!.operation));
    const withFigures = figures.some(Boolean) ? { figures } : {};
    // A panel's sum: from the slots of the same part first (its easier example: smaller numbers, same kind).
    const sameP = layout.slots.flatMap((x, k) => (x.part === s.part && k !== i ? [k] : []));
    switch (s.slot) {
      case "worked-example": {
        const step = part?.step ? curriculum.skillSteps(part.step.skill)?.[part.step.step - 1] : undefined;
        const op = panelOperation(questions, sameP);
        const lines = op ? workedLines(op, 3) : [];
        return {
          slot: s.slot, items: [], label: op ? operationText(op) : undefined,
          note: part?.unit === "B" ? "Unit B · new step" : "Unit A · new step",
          methods: op ? [{ label: "Step by step", lines }] : [],
          explain: step?.change ?? "Work one step at a time. Then check your answer.",
        };
      }
      case "watch-one": {
        const op = panelOperation(questions, sameP);
        return { slot: s.slot, items: [], label: op ? operationText(op) : undefined, note: "Watch one worked out. Then finish two.", lines: op ? workedLines(op, 3) : [] };
      }
      case "reminder": {
        const op = panelOperation(questions, sameP);
        const step = part?.step ? curriculum.skillSteps(part.step.skill)?.[part.step.step - 1] : undefined;
        return {
          slot: s.slot, items: [], label: "Remember", note: "From before",
          lines: op ? [`${operationText(op)} = [${valueText(operationResult(op))}]`] : [],
          explain: step?.change ?? "Do it the same way as before. Check each answer.",
        };
      }
      case "spot-the-error": {
        // Sam's work step by step, built by code from the mistake; the right answer stays in the answer key only.
        const q = mine[0]?.package;
        const shown = q ? shownOf(q) : null;
        const work = samWork(q?.operation ?? null, shown?.answer, shown?.cause);
        return { slot: s.slot, items, who: "Sam", lines: work?.lines ?? [], ...withFigures, ...missing };
      }
      case "practice-row":
        return { slot: s.slot, items, label: ROW_LABELS[Math.min(row++, ROW_LABELS.length - 1)], ...withFigures, ...missing };
      case "finish-these":
        return { slot: s.slot, items, hints: items.map(() => null), ...withFigures, ...missing };
      default:
        return { slot: s.slot, items, ...withFigures, ...missing };
    }
  });
  const two = (n: number) => String(n).padStart(2, "0");
  return {
    kind: "day", id: pageId(o.child, o.workbook, `D${two(o.day)}·P${page.number}`), level: plan.level, day: o.day, page: page.number, pages,
    ...layout.header, blocks,
  };
}

// ---------- Book pages ----------

/** Each day's row on the plan page: Unit A's topic and the line under it. */
export function planRow(curriculum: Curriculum, plan: WorkbookPlan, day: number): { topic: string; second: string } {
  const d = plan.days[day - 1];
  const topicOf = (track: "A" | "B") => {
    const part = d.pages.flatMap((p) => p.parts).find((p) => p.unit === track && p.step);
    return part ? pageTopic(curriculum, part.step!.skill, part.step!.step) : null;
  };
  if (d.kind === "test") return { topic: "Level test", second: "Done alone, in one sitting" };
  if (d.kind === "light") return { topic: "A light day", second: "Remember these? and a challenge" };
  const a = topicOf("A");
  const b = topicOf("B");
  const second = day === 10 ? "Show what you know" : day === 5 ? "Friday 5" : b ?? (d.kind === "mixed" ? "Mixed practice" : "Remember these?");
  return { topic: a ?? (d.kind === "mixed" ? "Mixed practice" : "Review"), second };
}

/** The content of a book page that is not a day page: the cover (1), How + Plan (2), the back cover and blanks. */
export function bookPageContent(o: {
  curriculum: Curriculum;
  plan: WorkbookPlan;
  child: string;
  workbook: number;
  type: "cover" | "how-plan" | "back-cover" | "blank";
  number: number;
}): PageContent {
  const { curriculum, plan, child, workbook } = o;
  const level = plan.level;
  const id = (rest: string) => pageId(child, workbook, rest);
  const pagesADay = Math.max(...plan.days.map((d) => d.pages.length));
  switch (o.type) {
    case "cover": {
      const title = curriculum.level(`U${level}`)?.title ?? `Level U${level}`;
      return {
        kind: "cover", id: id("COVER"), level, child, workbook, levelTitle: title, title: coverTitleLines(title),
        madeFrom: workbook === 1 ? "assessment" : "last-workbook", pagesADay, minutes: { ...plan.timeTarget },
        sentence: workbook === 1
          ? `${child}'s assessment showed what is secure and what to build next at Level U${level}. So this workbook:`
          : `${child}'s last workbook showed which steps stuck and which need another go. So this workbook:`,
        bullets: [
          plan.testWorkbook ? "Checks the whole level with a test on Day 7" : "Builds the next steps of this level, one small step at a time",
          "Shows each new idea with a worked example first",
          "Brings back earlier skills every day, so they stay fresh",
          workbook === 1 ? "Ends each week with five questions and no hints" : "Fixes last time's mistakes with new questions",
        ],
        parentLine: `This fortnight, ask ${child} to show you one worked example and explain it in their own words.`,
      };
    }
    case "how-plan": {
      let next = 3;
      const rows = plan.days.map((d) => {
        const pages: [number, number] = [next, next + d.pages.length - 1];
        next += d.pages.length;
        return { day: d.day, ...planRow(curriculum, plan, d.day), pages };
      });
      return { kind: "how-plan", id: id("HOW+PLAN"), level, child, workbook, pagesADay, minutes: { ...plan.timeTarget }, rows };
    }
    case "back-cover": return { kind: "back-cover", id: id("BACK"), level };
    case "blank": return { kind: "blank", id: id(`BLANK·P${o.number}`), level };
  }
}
