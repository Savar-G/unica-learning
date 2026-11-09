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
// crossed-out count, a ten-frame shows its counters in all (`filled`) with each of two parts in its own colour, a number line has no hop (it would land on the
// answer: the child draws it), base-ten blocks keep hundreds, tens and ones, and a pattern keeps its shapes.
//
// The words here are code's, never the AI's: headers, panel labels and explanations come from the plan and the
// curriculum. Pure TypeScript: no Next.js, React, network, database, clock or randomness.
import { verifiedWatchOut } from "@/lib/workbook-personal-items";
import { templateAnswer, templateNumbers, type TemplateSource } from "@/lib/question-package-template";
import { TITLE_WORDS_MAX, titleWords } from "@/lib/workbook-title-rules";
import { likelihoodWord } from "@/lib/workbook-likelihood";
import { workbookCoverTitle } from "@/lib/workbook-cover-titles";
import { workbookCoverLine } from "@/lib/workbook-cover-line";
import { SKILL_TITLES } from "@/lib/workbook-skill-titles";
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
  type CoinGiven,
} from "@/lib/question-package";
import { givenNumbers, givensProblem } from "@/lib/question-package-givens";
import { aiTextProblem, groupingWords, isCoin, readNumbers, signOperation, textOperations, type ReadNumber, type SignOperation } from "@/lib/number-words";
import { figureCount } from "@/lib/question-package-items";
import { relationChoices } from "@/lib/question-package";
import type { Curriculum } from "@/lib/workbook-curriculum";
import { curriculumTitleSkills, pageTitle } from "@/lib/workbook-titles";
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
  if (SKILL_TITLES[skill]) return SKILL_TITLES[skill];
  const clause = (curriculum.skill(skill)?.text ?? skill).split(/,|;| \(/)[0].trim();
  return clause.length <= TOPIC_MAX ? clause : curriculum.levelOfSkill(skill)?.title ?? "Review";
}

/** Strands whose skills have a number range a story title can name ("Number stories to 10"). */
const NUMBER_STRANDS = new Set(["N", "O", "A"]);

/**
 * The headline words of a day page: its topic (the plan row's words; the day label no longer prints it, D-201), its
 * title (src/lib/workbook-titles.ts: at most 4 words, naming what every card of the page practises), subtitle and the
 * grown-up line.
 */
export function dayHeader(curriculum: Curriculum, page: PlannedPage, level: number): DayHeader {
  const main = page.parts.find((p) => p.step) ?? page.parts[0];
  const topic = pageTopic(curriculum, main?.step?.skill ?? main?.skills[0], main?.step?.step);
  const early = level <= 3;
  // A parent-led page takes the subtitle of its first part.
  const first = page.parts[0]?.kind;
  const type = page.type !== "parent-led" ? page.type
    : first === "new-idea" ? "new-idea" : first === "picture-stories" ? "word-problems" : first === "remember-these" ? "remember-these" : first ?? "practice";
  const subtitles: Record<string, string> = {
    // From U13 the warm-up's facts go past 20 (times tables, adding hundreds): it names no range then.
    "warm-up": level >= 16 ? "Facts you know. Beat your own count from last time." : level >= 13 ? "Facts you know. Take your time: there is no timer." : "Facts to 20. Take your time: there is no timer.",
    "new-idea": level >= 19 ? "Try it first. Then see how it works." : "Read how it works, then try it.",
    practice: "Read the example, then answer the questions.",
    "practice-2": "Each row is a little harder than the one before.",
    "word-problems": "Read it. Work it out in the box. Write the answer.",
    "math-in-the-world": "One real task. Plan it, then work it out.",
    "unit-b": "Answer the questions. Use the example if you need help.",
    "friday-5": "Things you learned before, then five with no hints.",
    challenge: "Test yourself.",
    "show-what-you-know": "Ten days of work. Show what you learned!",
    "level-test": "Do this on your own.",
  };
  const subtitle = subtitles[type] ?? "Answer the questions about what you learned before.";
  const title = page.type === "challenge" ? "Challenge" : pageTitle(page, level, curriculumTitleSkills(curriculum, (skill) => {
    const strand = curriculum.unit(curriculum.skill(skill)?.unit ?? "")?.strand;
    return strand && NUMBER_STRANDS.has(strand) ? skillRange(curriculum, level, skill).max : null;
  }));

  const shown = stepTitle(curriculum, title, main?.step ?? null, page.type);

  const parentLed = level <= 3 && page.type === "parent-led";
  const grownUp = parentLed
    ? "Read each line aloud. Your child circles, colours or writes one number."
    : early && type === "new-idea" ? "Read the blue box aloud. Show both ways with a finger." : null;
  return { topic: type === "level-test" ? "Level test" : type === "show-what-you-know" ? "Show what you know" : topic, title: shown, subtitle, grownUp };
}

/**
 * A step page's title names its step's numbers (the U16 review: "Place value to millions" over Day 1's five-digit
 * numbers): a skill title's closing range ("to millions", "to 1000") becomes the step's, rounded up to a power of ten
 * ("Place value to 100 000"), when the step stops below it.
 */
/**
 * A title that names a range reads naturally (Savar, 2026-11-04): "Place value up to 100,000", not "Place value to 100
 * 000". A title that starts with what the child does keeps its "to" ("Count on to 20", "Add within 10 to 20").
 */
const DOING = /^(?:count|add|subtract|multiply|divide|skip|round|compare|order|read|write|make|share|split|jump|hop|find|show|use|using|go|get|move|match|sort|estimate)\b/i;
export function naturalTitle(title: string): string {
  if (DOING.test(title.trim())) return title;
  const up = title.replace(/(?<!\bup )\bto ((?:\d[\d ,\u00a0]*\d|\d)|millions|a million|thousands)$/i, "up to $1");
  // (A title keeps 4 words at most, "up to" one of them: "Number stories to 20" stays.)
  return titleWords(up).length <= TITLE_WORDS_MAX ? up : title;
}

function stepTitle(curriculum: Curriculum, title: string, step: { skill: string; step: number | null } | null, type: string): string {
  return naturalTitle(stepRangeTitle(curriculum, title, step, type));
}

function stepRangeTitle(curriculum: Curriculum, title: string, step: { skill: string; step: number | null } | null, type: string): string {
  if (!step?.step || ["challenge", "word-problems", "remember-these", "show-what-you-know", "friday-5", "level-test"].includes(type)) return title;
  const at = curriculum.skillSteps(step.skill)?.[step.step - 1];
  const m = title.match(/^(.*\bto) (millions|a million|thousands|\d[\d ]*)$/i);
  if (!at?.numbers || !m) return title;
  const nums = Object.entries(at.numbers).flatMap(([name, d]) => /^(?:flip|error|e\d*)$/.test(name) ? [] : Array.isArray(d) ? d.filter((v): v is number => typeof v === "number") : [(d as { max: number }).max]);
  const max = Math.max(0, ...nums);
  if (max < 10) return title;
  const top = /million/i.test(m[2]) ? 1_000_000 : /thousand/i.test(m[2]) ? 1000 : Number(m[2].replace(/ /g, ""));
  const nice = 10 ** Math.ceil(Math.log10(max + 1));
  if (!(nice < top)) return title;
  const written = nice >= 10_000 ? String(nice).replace(/\B(?=(\d{3})+$)/g, " ") : String(nice);
  return `${m[1]} ${written}`;
}

/** The most characters a line of the 66 px cover title holds. */
const COVER_LINE = 19;

/** A level title as two cover lines: the whole title when it wraps into two, else its part before " and " or a comma. */
export function coverTitleLines(title: string): [string, string] {
  // A number written in groups ("1 000 000") is one word: it never breaks across the lines.
  const glue = (text: string) => text.replace(/(\d) (?=\d{3}\b)/g, "$1\u00a0");
  const plain = (line: string) => line.replace(/\u00a0/g, " ");
  const [first, second] = splitCoverTitle(glue(title));
  return [plain(first), plain(second)];
}

function splitCoverTitle(title: string): [string, string] {
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
      // A short title breaks before its closing phrase ("Numbers / to 20"), never leaving a number alone on the line
      // (the U4 review).
      const at = words.findLastIndex((w, i) => i > 0 && /^(?:to|within|up|past|over|of|and|with|in|on|by|for)$/i.test(w));
      if (at > 0) return [words.slice(0, at).join(" "), words.slice(at).join(" ")];
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
  if (page.capacity) return { header, slots: structuredClone(page.capacity), omissions: structuredClone(page.capacityOmissions ?? []) };
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

/** A panel's worked example: its title, its worked lines, and its one answered line (a reminder's). */
interface PanelExample {
  label: string;
  lines: string[];
  answered: string;
}

/** The lines of a sound example item: a sum worked out, or a count, a sequence or an order shown done; else null. */
function exampleOf(p: QuestionPackage, level: number): PanelExample | null {
  if (p.operation) {
    const lines = workedLines(p.operation, 3, level);
    return { label: operationText(p.operation), lines, answered: lines.at(-1)! };
  }
  const item = p.item;
  if (!item) return null;
  const boxAnswer = (id: string) => {
    const r = item.regions.find((x) => x.id === id);
    return r?.kind === "box" && r.answer ? valueText(r.answer) : "?";
  };
  for (const c of item.checks) {
    // #489: a step template item worked as an example: the question, then its answer.
    if (c.kind === "template" || c.kind === "template-choice") {
      const r = item.regions.find((x) => x.id === c.region);
      const answer = r?.kind === "box" && r.answer ? valueText(r.answer) : r?.kind === "choice" ? r.answer ?? "?" : "?";
      // The work, then the answer: a worked example shows its method, never an answer key alone (Codex at db3b1a0).
      const how = templateMethod(c.source, p.text);
      if (!how) return null;
      // (The method and its answer on one line: "Work it out: 7 − 4 = 3. Answer: 3", a line less on a full page.)
      return { label: "Example", lines: [p.text, `${how} Answer: [${answer}]`], answered: `Answer: [${answer}]` };
    }
    if (c.kind === "count" && item.figure) {
      const n = figureCount(item.figure);
      if (n !== null && n >= 1 && n <= 20) {
        const lines = [`Count them: ${Array.from({ length: n }, (_, k) => k + 1).join(", ")}.`, `There are [${n}].`];
        return { label: "Count", lines, answered: lines[1] };
      }
    }
    if (c.kind === "sequence") {
      const line = c.terms.map((t) => ("region" in t ? `[${boxAnswer(t.region)}]` : valueText(t))).join(", ");
      const step = c.step.type === "number" ? c.step.value : null;
      const how = step ? `${step > 0 ? "Add" : "Take away"} ${Math.abs(step)} each time.` : null;
      // (A template's question first: "Count on. What are the next two numbers?" over its worked count.)
      const asked = p.templateId && /[a-z]{3,}/i.test(p.text) ? [p.text] : [];
      return { label: "Fill the gaps", lines: [...asked, ...(how ? [how] : []), line], answered: line };
    }
    if (c.kind === "relation") {
      const r = relationChoices(c);
      if (typeof r === "string") continue;
      const [n, m] = c.numbers;
      const b = c.to[0];
      const lines = c.relation === "less-than" ? [`Is ${n} less than ${b}?`, `${n} ${n < b ? `comes before ${b}` : n === b ? `is ${b}` : `comes after ${b}`}: [${r.answer}].`]
        : c.relation === "closer" ? [`Is ${n} close to ${c.to[0]} or ${c.to[1]}?`, `${n} is ${Math.abs(n - c.to[0])} from ${c.to[0]} and ${Math.abs(n - c.to[1])} from ${c.to[1]}: [${r.answer}].`]
        : c.relation === "equal" ? [`${n} and ${m}: equal or not?`, `[${r.answer}].`]
        : [`${c.labels[0]} ${n}, ${c.labels[1]} ${m}. Which has ${c.relation}?`, `[${r.answer}].`];
      const label = c.relation === "less-than" ? `Less than ${c.to[0]}?` : c.relation === "closer" ? `Close to ${c.to[0]} or ${c.to[1]}?` : c.relation === "equal" ? "Equal or not?" : `Which has ${c.relation}?`;
      return { label, lines, answered: lines[1] };
    }
    if (c.kind === "order") {
      const line = c.regions.map((id) => `[${boxAnswer(id)}]`).join(", ");
      return { label: `Order ${c.numbers.map(valueText).join(", ")}`, lines: [`${c.direction === "up" ? "Least" : "Greatest"} first: ${line}`], answered: line };
    }
  }
  return null;
}

/**
 * A panel's example, always of the panel's own skill (the part's step, else its first skill): the AI's worked example
 * for the panel (GenerateInput's panel examples, #380), else a question of the same part on that skill (its easier
 * example's sum first), else null: never a sum of another skill on the page.
 */
function panelExample(questions: PageQuestion[], example: QuestionPackage | null, skill: string | undefined, sameP: number[], level: number): PanelExample | null {
  if (example) {
    const own = exampleOf(example, level);
    if (own) return own;
  }
  const mine = questions.filter((q) => sameP.includes(q.slot) && q.package && (!skill || q.package.skill.skills.includes(skill)));
  for (const q of mine) {
    const op = q.package!.easierExample?.operation;
    if (op) return exampleOf({ ...q.package!, operation: op }, level);
  }
  for (const q of mine) {
    const own = exampleOf(q.package!, level);
    if (own) return own;
  }
  return null;
}

const PLACE_NAMES: Record<number, string> = { 1: "ones", 10: "tens", 100: "hundreds", 1000: "thousands", 10000: "ten thousands", 100000: "hundred thousands", 1000000: "millions" };
const SYMBOL: Record<string, string> = { "+": "+", "-": "−", "*": "×", "//": "÷" };

/**
 * A template example's worked method line, from its answer expression and its numbers: "8 − 5 = 3", "20 × 40 = 800",
 * "The thousands digit of 97531 is 7.", or for a true or false the sum it checks. Null when the expression is not one
 * code can word.
 */
export function templateMethod(src: TemplateSource, text: string): string | null {
  const v = templateNumbers(src);
  if (!v) return null;
  const n = (k: string) => (/^\d+$/.test(k) ? Number(k) : v[k]);
  const fmt = (x: number) => groupedNumber(x);
  const binary = (e: string) => {
    const m = e.trim().match(/^(\w+) (\+|-|\*|\/\/) (\w+)$/);
    if (!m || n(m[1]) === undefined || n(m[3]) === undefined) return null;
    const a = n(m[1]), b = n(m[3]);
    const r = m[2] === "+" ? a + b : m[2] === "-" ? a - b : m[2] === "*" ? a * b : Math.floor(a / b);
    return `${fmt(a)} ${SYMBOL[m[2]]} ${fmt(b)} = ${fmt(r)}`;
  };
  const resolve = (e: string, depth = 0): string | null => {
    const b = binary(e);
    if (b) return b;
    const name = e.trim();
    const d = src.derived.find(([k]) => k === name);
    return d && depth < 3 ? resolve(d[1], depth + 1) : null;
  };
  if (src.answer.trim() === "str(h * 100) + ' + ' + str(o)") {
    const h = n("h"), o = n("o"), number = n("n");
    if (!Number.isInteger(h) || h < 1 || h > 9 || !Number.isInteger(o) || o < 0 || o > 9 || number !== 100 * h + o) return null;
    return `${fmt(number)} has ${h} ${h === 1 ? "hundred" : "hundreds"}, 0 tens and ${o} ${o === 1 ? "one" : "ones"}: ${fmt(100 * h)} + ${o} = ${fmt(number)}.`;
  }
  const zeroDigit = "0 if sv == 0 else (o if sv == 1 else h)";
  const zeroValue = "0 if sv == 0 else (o if sv == 1 else h * 100)";
  if (src.answer.trim() === zeroDigit || src.answer.trim() === zeroValue) {
    const h = n("h"), o = n("o"), number = n("n"), sv = n("sv");
    if (!Number.isInteger(h) || h < 1 || h > 9 || !Number.isInteger(o) || o < 0 || o > 9 || number !== 100 * h + o || ![0, 1, 2].includes(sv)) return null;
    const place = ["tens", "ones", "hundreds"][sv], digit = [0, o, h][sv];
    const value = src.answer.trim() === zeroValue ? `, worth ${sv === 2 ? h * 100 : digit}` : "";
    return `${fmt(number)} has ${h} ${h === 1 ? "hundred" : "hundreds"}, 0 tens and ${o} ${o === 1 ? "one" : "ones"}. The ${place} digit is ${digit}${value}.`;
  }
  // A digit of a number: "n // 1000 % 10", its value "n // 1000 % 10 * 1000".
  const digit = src.answer.match(/^\(?(\w+) \/\/ (\d+)\)? % 10(?: \* (\d+))?$/);
  if (digit && n(digit[1]) !== undefined && PLACE_NAMES[Number(digit[2])]) {
    const d = Math.floor(n(digit[1]) / Number(digit[2])) % 10;
    const place = PLACE_NAMES[Number(digit[2])];
    return digit[3] ? `The ${place} digit of ${fmt(n(digit[1]))} is ${d}: ${d} × ${fmt(Number(digit[3]))} = ${fmt(d * Number(digit[3]))}.` : `Read the ${place} place: the ${place} digit of ${fmt(n(digit[1]))} is ${d}.`;
  }
  const more = text.match(/Which is (more|less): (\d+) \w[\w ]*? or (\d+)/i);
  if (more) { const [a, b] = [Number(more[2]), Number(more[3])]; const big = Math.max(a, b), small = Math.min(a, b); return `${big} comes after ${small} when you count, so ${more[1].toLowerCase() === "more" ? big : small} is ${more[1].toLowerCase()}.`; }
  const make = text.match(/(\d+) and (\d+) make (\d+)/);
  if (make) return `Work it out: ${make[1]} + ${make[2]} = ${Number(make[1]) + Number(make[2])}.`;
  // An equality can put its total first: checking the calculation explains both true and false claims.
  const equality = text.match(/\b\d+\s*=\s*(\d+)\s*([+−×÷])\s*(\d+)(?!\d|\.\d|\/\d|[⁰¹²³⁴⁵⁶⁷⁸⁹])/);
  if (equality) {
    const a = Number(equality[1]), b = Number(equality[3]);
    const result = equality[2] === "+" ? a + b : equality[2] === "−" ? a - b : equality[2] === "×" ? a * b : b ? a / b : NaN;
    if (Number.isInteger(result)) return `Work it out: ${fmt(a)} ${equality[2]} ${fmt(b)} = ${fmt(result)}.`;
  }
  const parts = text.match(/parts (\d+) and (\d+), whole (\d+)/i);
  if (parts) return `Work it out: ${parts[1]} + ${parts[2]} = ${Number(parts[1]) + Number(parts[2])}.`;
  // Counting facts the text states: the last number said is how many; one after, one before.
  const last = text.match(/count (\d+) \w[\w ]*?, the last number you say is (\d+)/i);
  if (last) return `When you count ${last[1]} things, the last number you say is ${last[1]}.`;
  const after = text.match(/\b(?:just |right )?after (\d+) comes (\d+)/i) ?? text.match(/comes (?:just |right )?after (\d+)/i);
  if (after) return `Count on 1 from ${after[1]}: ${Number(after[1]) + 1} comes next.`;
  const before = text.match(/\b(?:just |right )?before (\d+)/i);
  if (before) return `Count back 1 from ${before[1]}: ${Number(before[1]) - 1} comes just before.`;
  const direct = resolve(src.answer);
  // (Any expression of its numbers and + − × ÷: "38 + 3 × 12 = 74".)
  const expr = src.answer.trim().replace(/\b[a-z]\w*\b/gi, (k) => (v[k] !== undefined ? String(v[k]) : k));
  if (!direct && /^[\d\s+\-*/()]+$/.test(expr) && /[+\-*/]/.test(expr)) {
    const result = templateAnswer(src);
    if ("answer" in result) return `Work it out: ${expr.replace(/\/\//g, "÷").replace(/\*/g, "×").replace(/-/g, "−").replace(/\d{5,}/g, (x) => groupedNumber(Number(x)))} = ${groupedNumber(Number(result.answer))}.`;
  }
  if (direct) return `Work it out: ${direct}.`;
  // A true or false: the sum it checks, from the derived values.
  // (A sum whose two numbers the question prints.)
  const printed = new Set((text.replace(/(\d)[\s\u00a0\u202f](?=\d{3}\b)/g, "$1").match(/\d+/g) ?? []).map(Number));
  if (/'true'|'false'|'yes'|'no'/.test(src.answer)) for (const [, e] of src.derived) {
    const m = e.trim().match(/^(\w+) (\+|-|\*|\/\/) (\w+)$/);
    if (m && printed.has(n(m[1])) && printed.has(n(m[3]))) return `Work it out: ${binary(e)}.`;
  }
  return null;
}

/** A number as BC prints it: groups of three with a space from 10 000 up ("46 251"), 4 digits together ("4251"). */
export function groupedNumber(x: number): string {
  const s = String(x);
  return Math.abs(x) >= 10000 && Number.isInteger(x) ? s.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") : s;
}

/** The sum with its answer in blue: "5 + 2 = [7]", and for a missing part "2 + [3] = 5". */
function answeredLine(op: Operation): string {
  const answer = valueText(operationResult(op));
  if (op.kind === "missing-addend") return `${op.operands[0]} + [${answer}] = ${op.operands[1]}`;
  return `${operationText(op)} = [${answer}]`;
}

/** The levels that add and take away by counting on and back, before the written column method (Sam's early mistakes too). */
const COUNTING_LEVELS = 6;

/**
 * The worked lines of an operation: its steps in words (at most `most`), then the sum with its answer in blue. Up to
 * U6 a sum of whole numbers to 10 more or less is counted on or back, as the child does it, never worked in columns
 * ("Start at 10. Count back 9."): the column method's regrouping comes later.
 */
function workedLines(op: Operation, most: number, level: number): string[] {
  const [a, b] = op.operands as unknown[];
  if (level <= COUNTING_LEVELS && typeof a === "number" && typeof b === "number") {
    // One line of counting, then the sum: the panel's half-width box has room for little more.
    if ((op.kind === "add" || op.kind === "subtract") && b >= 1 && b <= 10) {
      const dir = op.kind === "add" ? 1 : -1;
      const said = Array.from({ length: b }, (_, k) => a + dir * (k + 1));
      return [`Count ${op.kind === "add" ? "on" : "back"} ${b} from ${a}: ${said.join(", ")}.`, answeredLine(op)];
    }
    if (op.kind === "missing-addend" && b > a) {
      return [`Count on from ${a} to ${b}: ${Array.from({ length: b - a }, (_, k) => a + k + 1).join(", ")}.`, answeredLine(op)];
    }
  }
  const steps = workedSteps(op).filter((s) => s.kind !== "result").map((s) => stepText(s, op));
  return [...steps.slice(0, most), answeredLine(op)];
}

/**
 * A picture for the template from an item's figure: the same numbers, in the template's terms. A number line has no
 * hop: it would land on the answer. Null for no figure.
 */
export function pageFigure(f: ItemFigure | null | undefined): Figure | null {
  if (!f) return null;
  switch (f.kind) {
    case "dots": return { kind: "dots", groups: [...f.groups], takenAway: f.takenAway };
    // Two parts ("2 and 6") in two colours, so the child sees each part (round 6); one part in one colour.
    case "ten-frame": {
      const filled = f.counters.reduce((a, b) => a + b, 0);
      if (filled === 0 && f.counters.length === 2) return { kind: "ten-frame", filled, frames: 2 };
      return f.counters.filter((n) => n > 0).length > 1 ? { kind: "ten-frame", filled, parts: [...f.counters] } : { kind: "ten-frame", filled };
    }
    // A question's number line has no hop drawn: the hop lands on the answer, so the child draws it (#380).
    case "number-line": return { kind: "number-line", from: f.from, to: f.to, step: f.step, hops: [] };
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

/**
 * The ideas a child meets at a level, each from its first level in the curriculum (conceptLevels): fractions,
 * decimals, negative numbers (integers), percents and ratios, and the operations whose signs are printed:
 * subtraction, multiplication, division and comparison (< and >).
 */
export const CONCEPTS = ["fractions", "decimals", "negatives", "percents", "ratios", "subtraction", "multiplication", "division", "comparison"] as const;
export type Concept = (typeof CONCEPTS)[number];

/** A skill's number range: its largest number, the ideas it may show (true once the curriculum has met them), money and time. */
export type NumberRange = {
  /** The largest number an item may print or ask for (printedNumbers). */
  max: number;
  /** The skill is about money: typed coin givens fit, and amounts of money may have cents ($4.75). */
  money: boolean;
  /** The skill is about time: h:mm is a clock time and fits as it is; elsewhere every a:b is a ratio. */
  time: boolean;
  /** The skill is about groups or skip-counting: "3 groups of 2" is its own language before multiplication. */
  grouping: boolean;
} & Record<Concept, boolean>;

/**
 * The first level of each idea, from the curriculum's skill texts (CONCEPT_WORDS). Before it, an item never shows the
 * idea. A test pins the BC levels, so a curriculum text change that breaks the detection fails loudly.
 */
export type ConceptLevels = Record<Concept, number>;
const CONCEPT_WORDS: Record<Concept, RegExp> = {
  fractions: /\bfractions?\b/i,
  decimals: /\bdecimals?\b/i,
  negatives: /\bintegers?\b|\bnegative\b/i,
  percents: /\bpercents?\b/i,
  ratios: /\bratios?\b/i,
  subtraction: /\bsubtract\w*|\btak(?:e|en|ing) away\b/i,
  multiplication: /\bmultipl(?:y|ying|ied|ication)\b/i,
  division: /\bdivi(?:de|des|ded|ding|sion)\b/i,
  comparison: /[<>]/,
};
const conceptCache = new WeakMap<Curriculum, ConceptLevels>();
export function conceptLevels(curriculum: Curriculum): ConceptLevels {
  const cached = conceptCache.get(curriculum);
  if (cached) return cached;
  const first = (re: RegExp) => curriculum.levels.find((l) => (curriculum.levelSkills(l.id) ?? []).some((s) => re.test(s.text)))?.number ?? Infinity;
  const levels = Object.fromEntries(CONCEPTS.map((c) => [c, first(CONCEPT_WORDS[c])])) as ConceptLevels;
  conceptCache.set(curriculum, levels);
  return levels;
}

/** A level's number range, for an item with no skill. */
export function levelRange(curriculum: Curriculum, level: number): NumberRange {
  const c = conceptLevels(curriculum);
  return { max: levelMax(level), money: false, time: false, grouping: false, ...(Object.fromEntries(CONCEPTS.map((k) => [k, level >= c[k]])) as Record<Concept, boolean>) };
}

/** The operation signs a Mixed set may offer at a level: + always, −, × and ÷ once the curriculum has met them. */
export function levelSigns(curriculum: Curriculum, level: number): string[] {
  const r = levelRange(curriculum, level);
  return ["+", "−", "×", "÷"].filter((sign) => { const op = signOperation(sign); return !op || r[op]; });
}

/**
 * The signs a Mixed set item on a skill may offer to tick: the level's signs that the skill's own range allows (G1). An
 * earlier level's skill under review (3.3 adding within 1,000 in a U16 book) is checked against its own level's ideas,
 * so its choices never print a sign that check refuses (× before U11).
 */
export function skillSigns(curriculum: Curriculum, level: number, skill: string | undefined): string[] {
  if (!skill) return levelSigns(curriculum, level);
  const r = skillRange(curriculum, level, skill);
  return levelSigns(curriculum, level).filter((sign) => { const op = signOperation(sign); return !op || r[op]; });
}

/**
 * The limit a skill's id names ("1.3-add-within-10", "3.4-recall-addition-20", "2.1-ten-more-less-100"), or null; none
 * for an id ending in two numbers ("1.1-skip-count-2-5", "K3-benchmarks-5-10").
 */
function idLimit(skill: string): number | null {
  // Two numbers at the end name what the skill is about, not a limit ("1.1-skip-count-2-5" is by 2s and 5s).
  if (/-\d+-\d+$/.test(skill)) return null;
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
 * A skill is about groups when its text names equal groups, skip-counting, groups of a number ("making groups of 10")
 * or arrays; a skill that only mentions a group ("a scattered group") is not. A test pins the BC skills this gives.
 */
const GROUPING_SKILL = /\bequal groups\b|\bskip-count\w*|\bgroups of \d+|\barrays?\b/i;
export const isGroupingSkill = (curriculum: Curriculum, skill: string) => GROUPING_SKILL.test(curriculum.skill(skill)?.text ?? "");

/**
 * The range of an item on a skill: the range of the skill's own level (a review of an earlier skill keeps to that
 * skill's numbers and ideas), never above the page's level, and never above the limit the skill's id names ("facts to
 * 20").
 */
export function skillRange(curriculum: Curriculum, level: number, skill: string): NumberRange {
  const own = curriculum.levelOfSkill(skill)?.number ?? level;
  const range = { ...levelRange(curriculum, Math.min(own, level)), money: isMoneySkill(curriculum, skill), time: isTimeSkill(curriculum, skill), grouping: isGroupingSkill(curriculum, skill) };
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
  unit === "$" || unit === "¢" ? { ...num(value), money: true, currency: unit, ...(isCoin(value, unit) ? { coin: true as const } : {}) } : num(value);
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
    case "add": case "subtract": case "multiply": case "divide": case "missing-addend":
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

function regionNumbers(r: AnswerRegion, fixedBenchmarks: readonly number[] = [], givens?: readonly CoinGiven[]): Read[] {
  const words = (text: string) => readNumbers(text).filter(r => !fixedBenchmarks.includes(r.value));
  const label = givenNumbers(r.label ?? "", givens, { kind: "region-label", region: r.id }).filter(n => !fixedBenchmarks.includes(n.value));
  switch (r.kind) {
    case "box": return [...label, ...valueNumbers(r.answer)];
    case "choice": return [...label, ...r.choices.flatMap(words), ...words(r.answer ?? "")];
    case "work": case "lines": case "picture": return label;
    default: return unreachable(r);
  }
}

function checkNumbers(c: ItemCheck, fixedBenchmarks: readonly number[] = []): Read[] {
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
      // The step is never printed, only its terms: its size counts, not its sign (a count back steps by -1, #380).
      const step = c.step.type === "number" ? [num(Math.abs(c.step.value))] : valueNumbers(c.step);
      return [...c.terms.flatMap(termNumbers), ...blanks, ...step];
    }
    case "compare": return [...valueNumbers(c.left), ...valueNumbers(c.right)];
    case "relation": return [...c.numbers, ...c.to.filter(n => !fixedBenchmarks.includes(n))].map(num);
    case "yes-no": return statementNumbers(c.statement);
    // A template's sampled numbers are printed in its text, which is read already.
    case "template": case "template-choice": case "template-shown": return [];
    default: return unreachable(c);
  }
}

function figureNumbers(f: ItemFigure | null | undefined): Read[] {
  if (!f) return [];
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  switch (f.kind) {
    case "dots": return [...f.groups, f.takenAway, sum(f.groups)].map(num);
    case "ten-frame": return [...f.counters, sum(f.counters)].map(num);
    case "number-line": {
      const drawn = pageFigure(f);
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
// fixedBenchmarks is only for scheduled relation references. It never removes typed quantities being compared.
export function printedValues(p: QuestionPackage, fixedBenchmarks: readonly number[] = []): ReadNumber[] {
  const item = p.item;
  const error = item?.error ?? null;
  const shown = error ? samWork(p.operation, error.answer, shownOf(p).cause) : null;
  const easier = p.easierExample;
  return [
    ...givenNumbers(p.text, item?.givens, { kind: "text" }).filter(r => !fixedBenchmarks.includes(r.value)),
    ...operationNumbers(p.operation),
    ...valueNumbers(p.answer?.value),
    ...(p.answer?.accepted ?? []).flatMap(valueNumbers),
    ...p.wrongAnswers.flatMap((w) => valueNumbers(w.value)),
    ...valueNumbers(error?.answer),
    ...(shown?.lines ?? []).flatMap(readNumbers),
    ...(easier ? [...readNumbers(easier.text), ...operationNumbers(easier.operation), ...valueNumbers(easier.answer)] : []),
    ...(item?.regions ?? []).flatMap(r => regionNumbers(r, fixedBenchmarks, item?.givens)),
    ...(item?.checks ?? []).flatMap(c => checkNumbers(c, fixedBenchmarks)),
    ...figureNumbers(item?.figure),
  ];
}

/** The operation of an operation kind, by its sign; none for adding and the kinds with no sign. */
function kindOperation(op: Operation | null | undefined): SignOperation[] {
  if (!op) return [];
  switch (op.kind) {
    case "add": case "decimal-add": case "fraction-add": case "quantity-add": case "time-add": case "clock-convert": case "convert":
    case "money-round": case "fraction-simplify": case "fraction-equivalent":
    // A missing part ("2 + ? = 5") is a number bond, counted on: it prints no subtraction.
    case "missing-addend":
      return [];
    case "subtract": case "decimal-subtract": case "fraction-subtract": case "quantity-subtract": case "elapsed-time":
      return ["subtraction"];
    case "multiply": case "decimal-multiply": case "fraction-multiply": case "quantity-multiply":
      return ["multiplication"];
    case "divide": case "fraction-divide":
      return ["division"];
    case "evaluate": case "solve":
      return textOperations(op.operands[0]);
    default: return unreachable(op);
  }
}

function checkOperations(c: ItemCheck): SignOperation[] {
  const eq = (e: Equation) => [signOperation(e.op)].filter((x): x is SignOperation => x !== null);
  switch (c.kind) {
    case "operation": case "operation-sign": case "count": case "pattern": case "places": case "order": case "sequence": return [];
    case "equations": return c.equations.flatMap(eq);
    case "compare": return ["comparison"];
    // In words ("less than 5", "close to 10", "more"): no < or > sign is printed.
    case "relation": return [];
    case "yes-no": return c.statement.kind === "equation" ? eq(c.statement.equation) : [];
    case "template": case "template-choice": case "template-shown": return [];
    default: return unreachable(c);
  }
}

/**
 * Every operation whose sign the child sees or is asked for: in the AI's text, the operation and the easier example's,
 * equations, sign choices (a Mixed set's "Tick the operation", a compare item's < > =) and compare checks.
 */
export function printedOperations(p: QuestionPackage): SignOperation[] {
  const choices = (p.item?.regions ?? []).flatMap((r) => (r.kind === "choice" ? r.choices.map(signOperation).filter((x): x is SignOperation => x !== null) : []));
  return [...new Set([
    ...textOperations(p.text),
    ...(p.easierExample ? textOperations(p.easierExample.text) : []),
    ...kindOperation(p.operation),
    ...kindOperation(p.easierExample?.operation),
    ...(p.item?.checks ?? []).flatMap(checkOperations),
    ...choices,
  ])];
}

/** The values of printedValues. */
export const printedNumbers = (p: QuestionPackage): number[] => printedValues(p).map((r) => r.value);

/**
 * Why an item's numbers do not fit its skill's range at the level, or null (see skillRange): text the AI writes (the
 * question and the easier example) that fails the gate (aiTextProblem: characters, number forms, number words), a
 * number past the range, or an idea before the curriculum's first level of it (CONCEPTS: a negative number, fraction,
 * decimal, percent or ratio, or a subtraction, multiplication, division or comparison sign anywhere it is printed). On
 * a money skill, typed coin givens fit and amounts of money may have cents; on a time skill, h:mm is a clock time and
 * fits as it is.
 */
export function rangeProblem(p: QuestionPackage, curriculum: Curriculum, level: number): string | null {
  const givens = givensProblem(p.item?.givens, p.text, p.item?.regions ?? []);
  if (givens) return givens;
  const skill = p.skill.skills[0];
  const range = skill ? skillRange(curriculum, level, skill) : levelRange(curriculum, level);
  const context = { skill: skill ?? null, money: range.money };
  const text = aiTextProblem(p.text, context) ?? (p.easierExample ? aiTextProblem(p.easierExample.text, context) : null);
  if (text) return text;
  // a:b in text is a clock time only on a time skill and in the h:mm shape; anywhere else it is a ratio.
  const read = printedValues(p)
    .filter((r) => !(r.given === "coin" && range.money) && !(r.form === "time" && range.time) && !(r.form === "colon" && r.clock && range.time));
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
  if (!range.ratios && read.some((r) => r.form === "colon")) return `this question uses no ratios: they start at U${c.ratios}${range.time ? "" : " (write a time on a non-time question as 3 o'clock)"}`;
  const grouping = range.multiplication || range.grouping ? null : (groupingWords(p.text) ?? (p.easierExample ? groupingWords(p.easierExample.text) : null));
  if (grouping) return `"${grouping}" is multiplication: this question uses none (it starts at U${c.multiplication})`;
  const op = printedOperations(p).find((o) => !range[o]);
  if (op) return `this question uses no ${op} (${{ subtraction: "-", multiplication: "×", division: "÷", comparison: "< or >" }[op]}): it starts at U${c[op]}`;
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

/** The answer Sam's mistake gives on a sum (G1: a step template Spot the error shows it), or null when it cannot happen. */
export function samAnswer(op: Operation, mistake: SamMistake): number | null {
  const work = samLines(op, mistake);
  const right = operationResult(op);
  return work && !(right.type === "number" && right.value === work.answer) ? work.answer : null;
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

/**
 * A Spot the error question set to show a mistake its sum allows (#380, round 3): when the AI's named mistake cannot
 * happen on its sum, code takes the first mistake of the level (from `from`, in turn) that can, and writes Sam's wrong
 * answer, its cause and its step from it; the first such package `ok` takes (the caller's checks: the package checker,
 * the level's numbers). Null when no mistake of the level gives one.
 */
export function samFix(p: QuestionPackage, level: number, from: number, ok: (p: QuestionPackage) => boolean, prefer: readonly SamMistake[] = []): QuestionPackage | null {
  const op = p.operation;
  if (!op || !p.item) return null;
  const allowed = levelMistakes(level);
  const right = operationResult(op);
  // G1: the child's own mistakes first (the level's only), then the others in turn as before.
  const first = prefer.filter((m) => allowed.includes(m));
  const order = [...first, ...allowed.map((_, k) => allowed[(from + k) % allowed.length]).filter((m) => !first.includes(m))];
  for (const mistake of order) {
    const work = samLines(op, mistake);
    if (!work || (right.type === "number" && right.value === work.answer)) continue;
    const answer: AnswerValue = { type: "number", value: work.answer };
    const others = p.wrongAnswers.filter((w) => w.cause !== mistake && !(w.value.type === "number" && w.value.value === work.answer));
    const fixed: QuestionPackage = {
      ...p,
      wrongAnswers: [{ value: answer, cause: mistake, description: `Sam ${SAM_MISTAKE_RULES[mistake].what}.`, step: work.step }, ...others],
      item: { ...p.item, error: { answer, step: work.step } },
    };
    if (ok(fixed)) return fixed;
  }
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
  /** The AI's worked example of each panel slot, by its index in the layout's slots (#380), when it has one. */
  examples?: { slot: number; package: QuestionPackage }[];
  child: string;
  workbook: number;
}): PageContent {
  const { curriculum, plan, page, layout, questions } = o;
  const pages = plan.days.find((d) => d.day === o.day)?.pages.length ?? page.number;
  let row = 0;
  const blocks: Block[] = layout.slots.map((s, i): Block => {
    // Questions of an earlier step than the part's own (late in a practice block): printed under "Remember these".
    const ownStep = page.parts[s.part]?.step;
    const review = ownStep && ["on-your-own", "practice-row", "finish-these"].includes(s.slot) ? questions.filter((q) => q.slot === i && q.package?.templateId && !q.package.templateId.startsWith(`${ownStep.skill}#${ownStep.step}.`)).map((q) => q.number) : [];
    const firstReview = review.length ? Math.min(...review) : undefined;
    const reviewFrom = firstReview !== undefined && questions.filter((q) => q.slot === i && q.package && q.number > firstReview).every((q) => review.includes(q.number)) ? { reviewFrom: firstReview } : {};
    const mine = questions.filter((q) => q.slot === i && q.package);
    const items = mine.map((q) => q.number);
    // A question with no package cannot print; its placeholder names it and why.
    const lost = questions.filter((q) => q.slot === i && !q.package).map((q) => ({ number: q.number, reason: q.failed ?? "code could build no question" }));
    const missing = lost.length ? { missing: lost } : {};
    const part = page.parts[s.part];
    const figures = mine.map((q) => pageFigure(q.package!.item?.figure));
    const withFigures = figures.some(Boolean) ? { figures } : {};
    // A panel's example: of the panel's own skill only, from its own worked example or the same part's questions.
    const sameP = layout.slots.flatMap((x, k) => (x.part === s.part && k !== i ? [k] : []));
    const panel = () => panelExample(questions, o.examples?.find((e) => e.slot === i)?.package ?? null, part?.step?.skill ?? part?.skills[0], sameP, plan.level);
    // #482 review at db3b1a0: a template step's panel teaches with Cedric's worked example for the step and its common
    // mistake put right, never a question and its key alone.
    const teaching = (): { label: string; lines: string[]; remember: string | null } | null => {
      const step = part?.step ? curriculum.skillSteps(part.step.skill)?.[part.step.step - 1] : undefined;
      // (From U4: parent-led pages keep their counted examples. An example that needs a picture or a drawing cannot print.)
      if (!step?.templates?.length || plan.level < 4) return null;
      const printable = (t: string) => !!t && !/\(picture:|\b(?:shade|shaded|colou?r|draw|trace|dots?|counters?|ten-frame|picture|chart|graph|bars?)\b/i.test(t) && t.length <= 160 && !likelihoodWord(t);
      // The example worked, then the step's common mistake put right (its fix line), in a panel's room.
      if (!printable(step.example?.problem) || !step.example?.answer) return null;
      // The mistake with its fix ("The 3 in 83 175 is worth 300. No: it is in the thousands place: 3 000."), never the
      // fix alone (the U16 sample: a fix line out of context).
      // G1: the child's own coded mistake on the step, only when C2's pair is verified; else today's line.
      // (A personal pair that would not print keeps today's line.)
      const own = verifiedWatchOut(curriculum, plan, part!.step!.skill, step);
      const mistake = own && printable(own.wrong) && printable(own.fix) && `${own.wrong} ${own.fix}`.length <= 150 ? own : step.spotTheError;
      // Once a day: a later page of the day that teaches the same step prints no Watch out line (the real U4 sample:
      // "Mia wrote 9, 10, 12" on three pages of Day 1).
      const day = plan.days.find((d) => d.day === o.day);
      const sameStep = (x: PlannedPage) => x.parts.some((pt) => pt.step && part?.step && pt.step.skill === part.step.skill && pt.step.step === part.step.step && (x.type === "new-idea" || !!pt.faded?.watch));
      const earlier = (day?.pages ?? []).some((x) => x.number < page.number && sameStep(x));
      const both = !earlier && !page.noWatchOut && printable(mistake?.wrong) && printable(mistake?.fix) && `${mistake.wrong} ${mistake.fix}`.length <= 150;
      return { label: "How it works", lines: [step.example.problem, `Answer: [${step.example.answer}]`], remember: both ? `${mistake.wrong.replace(/\.?$/, ".")} No: ${mistake.fix.replace(/^[A-Z]/, (c) => c.toLowerCase())}` : null };
    };
    switch (s.slot) {
      case "worked-example": {
        const step = part?.step ? curriculum.skillSteps(part.step.skill)?.[part.step.step - 1] : undefined;
        const taught = teaching();
        // The page's own reserved example, worked with its method (Codex at 47c5fd78: Cedric's fixed example printed
        // a task the repeat check never saw, and its answer alone); Cedric's example only when there is none.
        const own = o.examples?.find((e) => e.slot === i)?.package;
        const ex = own ? exampleOf(own, plan.level) : taught ? null : panel();
        const lines = ex?.lines.length ? ex.lines : taught?.lines ?? [];
        return {
          slot: s.slot, items: [], label: taught ? step?.name : ex?.label,
          note: "Read how it works, then try it.",
          methods: lines.length ? [{ label: taught ? taught.label : "Step by step", lines }] : [],
          // #489: the imported steps' change notes are for builders; the page names the step plainly, and with Cedric's
          // worked example it puts the step's common mistake right.
          explain: taught?.remember ? `Watch out: ${taught.remember}` : step?.templates?.length ? `${step.name}.` : step?.change ?? "Work one step at a time. Then check your answer.",
        };
      }
      case "watch-one": {
        // Cedric's worked example teaches the step once, on its new idea page; a later page's example is code's own
        // (other numbers, a task no question asks: the real U4 sample printed one example on three pages), with the
        // step's common mistake put right.
        const taught = teaching();
        // (The panel's own example only, never one of the page's questions: it would give that answer away.)
        const own = o.examples?.find((e) => e.slot === i)?.package;
        const ex = taught ? (own ? exampleOf(own, plan.level) : null) : panel();
        // (Its question first when the worked line does not say it: "Count on. What are the next two numbers?" over
        // "6, [7], [8]".)
        const asked = taught && own && ex?.lines.length && !ex.lines.some((l) => l.replace(/[[\]]/g, "").includes(own.text.trim())) ? [own.text] : [];
        const lines = ex?.lines.length ? [...asked, ...ex.lines] : taught?.lines ?? [];
        return { slot: s.slot, items: [], label: ex?.lines.length ? ex.label : taught ? "How it works" : undefined, note: "Read the example, then try it.", lines, ...(taught?.remember ? { explain: `Watch out: ${taught.remember}` } : {}) };
      }
      case "reminder": {
        const ex = panel();
        const step = part?.step ? curriculum.skillSteps(part.step.skill)?.[part.step.step - 1] : undefined;
        return {
          slot: s.slot, items: [], label: "Remember", note: "From before",
          lines: ex ? [ex.answered] : [],
          explain: step?.templates?.length ? `${step.name}.` : step?.change ?? "Do it the same way as before. Check each answer.",
        };
      }
      case "spot-the-error": {
        // Sam's work step by step, built by code from the mistake; the right answer stays in the answer key only.
        const q = mine[0]?.package;
        // #489: a step template item shows Sam's answer to its question; code's error steps need an operation.
        const templated = q?.item?.checks.find((c) => c.kind === "template-shown");
        // The question and the answer given, with no one's name (the U4 review, item 16).
        if (templated?.kind === "template-shown") return { slot: s.slot, items, who: "Sam", lines: [`${q!.text} Answer given: ${templated.shown}.`], ...withFigures, ...missing };
        const shown = q ? shownOf(q) : null;
        const work = samWork(q?.operation ?? null, shown?.answer, shown?.cause);
        return { slot: s.slot, items, who: "Sam", lines: work?.lines ?? [], ...withFigures, ...missing };
      }
      case "practice-row":
        return { slot: s.slot, items, label: ROW_LABELS[Math.min(row++, ROW_LABELS.length - 1)], ...withFigures, ...missing, ...reviewFrom };
      case "finish-these":
        return { slot: s.slot, items, hints: items.map(() => null), ...withFigures, ...missing, ...reviewFrom };
      default:
        return { slot: s.slot, items, ...withFigures, ...missing, ...reviewFrom };
    }
  });
  const two = (n: number) => String(n).padStart(2, "0");
  // L1/G1 contract (D-233, Q6): every block of a part the plan marked Extra, and the day's required-time target when the
  // parent's weekly time sets one, ride with the page; the book checks and the template read them from the draft.
  const extra = layout.slots.map((s) => !!page.parts[s.part]?.extra);
  const target = !page.extraPractice && plan.personal?.adjustments.requiredMinutes != null ? plan.days.find((d) => d.day === o.day)?.time?.target : undefined;
  return {
    // An extra practice page is no day's page (#482 review at db3b1a0: "D10·P9" under "Extra practice").
    kind: "day", id: pageId(o.child, o.workbook, page.extraPractice ? `EXTRA·${two(page.number)}` : `D${two(o.day)}·P${page.number}`), level: plan.level, day: o.day, page: page.number, pages,
    ...layout.header, blocks: extra.some(Boolean) ? blocks.map((b, i) => (extra[i] ? { ...b, extra: true } : b)) : blocks,
    ...(target !== undefined ? { requiredTimeTarget: target } : {}),
  };
}

// ---------- Book pages ----------

/** Each day's row on the plan page: Unit A's topic and the line under it. */
export function planRow(curriculum: Curriculum, plan: WorkbookPlan, day: number): { topic: string; second: string } {
  const d = plan.days.find((d) => d.day === day)!;
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

/** A skill title as a plain continuation of "will learn to" on the cover. */
function learningSkill(title: string): string {
  const verbs: Record<string, string> = { Counting: "Count", Adding: "Add", Subtracting: "Subtract", Comparing: "Compare", Making: "Make",
    Finding: "Find", Measuring: "Measure", Reading: "Read", Writing: "Write", Using: "Use", Multiplying: "Multiply", Dividing: "Divide",
    Solving: "Solve", Ordering: "Order", Rounding: "Round", Drawing: "Draw", Naming: "Name" };
  const [first, ...rest] = title.split(" ");
  if (verbs[first]) return [verbs[first], ...rest].join(" ");
  if (/^(Read|Write|Count|Add|Subtract|Compare|Find|Make|Measure|Use|Draw|Name|Solve|See|Show|Multiply|Divide|Estimate|Describe|Sort|Choose|Order|Break|Change|Plot|Continue|Combine|Match|Skip-count|Predict|Share|Evaluate|Model|Check|Tell|Put|Spot|Take|Balance|Move|Build|Extend|Record|Recall|Link|Slide|Flip|Turn|Translate|Test|Convert|Regroup|Substitute|List|Simplify|Interpolate|Extrapolate|Collect|Save)\b/.test(title)) return title;
  if (/^(What|How|Why)\b/.test(title)) return `Explain ${title.toLowerCase()}`;
  if (/^Which\b/.test(title)) return `Choose ${title.toLowerCase()}`;
  if (title === "Likelihood words") return "Use likelihood words";
  if (title === "More, fewer or same") return "Compare amounts";
  if (first === "Numbers") return `Read and write ${title.toLowerCase()}`;
  if (first === "Ways") return `Find ${title.toLowerCase()}`;
  return `Work with ${title.toLowerCase()}`;
}

/** Prefer the taught skills, then the skills practised in review, for the three cover lines. */
function coverSkills(plan: WorkbookPlan): string[] {
  const parts = plan.days.flatMap(d => d.pages.flatMap(p => p.parts));
  const taught = ["A", "B"].flatMap(unit => parts.filter(p => p.unit === unit).flatMap(p => p.skills));
  const skills = [...new Set([...taught, ...parts.flatMap(p => p.skills)])].slice(0, 3);
  if (skills.length !== 3) throw new Error("The cover needs three planned skills.");
  return skills.map(skill => {
    const title = SKILL_TITLES[skill];
    if (!title) throw new Error(`The cover has no title for ${skill}.`);
    return learningSkill(title);
  });
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
      const title = workbookCoverTitle(level);
      return {
        kind: "cover", id: id("COVER"), level, child, workbook, levelTitle: title, title: coverTitleLines(title),
        madeFrom: workbook === 1 ? "assessment" : "last-workbook", pagesADay, minutes: { ...plan.timeTarget },
        sentence: workbookCoverLine(plan, child, workbook) ?? (level === 4 ? `${child} will count, read and write numbers up to 20, and learn how numbers split into smaller parts.`
          : `${child} will ${coverSkills(plan).map(x => x[0].toLowerCase() + x.slice(1)).join(", ").replace(/, ([^,]+)$/, ", and $1")}.`),
        bullets: [],
        parentLine: "",
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
