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
import { BC_SKILL_MAP } from "@/lib/assessment";
import type { AnswerRegion, Item, ItemCheck, QuestionPackage } from "@/lib/question-package";
import { checkQuestionPackage } from "@/lib/question-package";
import { storedDomain, templateAnswerValue, templateScalar, type TemplateScalar, type TemplateSource } from "@/lib/question-package-template";
import type { Curriculum, CurriculumStep, NumberDomain, NumberRange, StepTemplate, TemplateDifficulty } from "@/lib/workbook-curriculum";
import { prepareTemplate, seededRandom, slotDomain } from "@/lib/workbook-curriculum/template";
import type { AiItem, BuiltQuestion, SlotPlace } from "@/lib/workbook-generator-items";
import type { SlotName } from "@/lib/workbook-page";

/** How the question is answered on the page. */
export type StepItemKind = "box" | "story" | "choice" | "spot" | "two-ways";

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
}

/** Places whose questions are stories with a work box. */
export const STEP_STORY_PLACES: ReadonlySet<SlotName> = new Set<SlotName>(["word-problems", "picture-stories", "challenge", "math-in-the-world"]);
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
const integerAnswer = (a: string) => /^-?\d+$/.test(a);

/** The choices a text offers for a word answer, or null: true or false, yes or no, and "a, b or c" at its end. */
export function choicesFor(text: string, answer: string): string[] | null {
  const found = choiceList(text, answer);
  // The key as the template writes it ("True"), among the choices printed in lower case.
  return found && found.map((x) => (x.toLowerCase() === answer.toLowerCase() ? answer : x));
}

function choiceList(text: string, answer: string): string[] | null {
  const a = answer.toLowerCase();
  if (a === "true" || a === "false") return ["true", "false"];
  if (a === "yes" || a === "no") return ["yes", "no"];
  if (["never", "sometimes", "always"].includes(a)) return ["never", "sometimes", "always"];
  if (/^[abc]$/.test(a)) {
    const letters = ["A", "B", "C"].filter((l) => new RegExp(`\\b${l}[:)]`).test(text));
    return letters.length >= 2 && letters.includes(answer.toUpperCase()) ? letters.map((l) => l.toLowerCase()) : null;
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

/** The kind a filled template takes at a place, or null when it cannot print there. */
function kindAt(place: SlotName | null, answer: string, text: string): { kind: StepItemKind; choices?: string[] } | null {
  const numeric = NUMERIC.test(answer);
  if (place === "spot-the-error") return integerAnswer(answer) ? { kind: "spot" } : null;
  if (place === "solve-it-two-ways") return numeric ? { kind: "two-ways" } : null;
  const story = !!place && STEP_STORY_PLACES.has(place);
  if (numeric) return { kind: story ? "story" : "box" };
  const choices = choicesFor(text, answer);
  if (choices) return { kind: "choice", choices };
  // A short answer the child writes in the box ("pentagon", "9, 10", "4, 5, 6, 7"); never a sentence to mark.
  const short = answer.length <= 24 && (answer.split(/\s+/).length <= MOST_ANSWER_WORDS || /^-?\d+(?:, -?\d+)+$/.test(answer));
  return short ? { kind: story ? "story" : "box" } : null;
}

/** The difficulties a place asks for, the first preferred. */
export function wantedDifficulty(place: SlotName | null, day: number, ordinal: number): TemplateDifficulty[] {
  if (place === "challenge") return ["hard", "medium", "easy"];
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
  /** The slot's place among its block's slots, from 0. */
  ordinal: number;
  /** Templates the page has used, by index, so the page's slots take different ones first. */
  usedOnPage?: ReadonlyMap<number, number>;
  /** The most characters the text has room for. */
  room?: number;
  /** A name never to print (the child's own). */
  avoid?: string | null;
}

/** Why a template cannot print in a workbook at this level, or null. */
export function templateProblem(t: StepTemplate, level: number): string | null {
  if (/\(picture:/i.test(t.text)) return "it needs a picture code cannot draw";
  // Shading or colouring needs a printed figure, which a template item does not have.
  if (/\b(?:shade|shades|shaded|colou?r in)\b/i.test(t.text)) return "it asks to shade a figure code does not print";
  if (level >= 4 && BANNED_FROM_U4.test(t.text)) return "it asks for drawing or tracing";
  if (BANNED.test(t.text)) return "it uses rejected workbook wording";
  return null;
}

/**
 * The step template item for a slot, or null when the step has no template that can print there. The template is the
 * first of the wanted difficulty the page has used least, turned by the seed and the attempt; its numbers come from the
 * step's ranges through the seeded filler, tried again (other numbers) until the text fits its room and its numbers its
 * ranges.
 */
export function stepTemplateItem(r: StepItemRequest): { ref: StepTemplateRef; text: string; numbers: number[] } | null {
  const step = stepOf(r.curriculum, r.skill, r.step);
  const contexts = r.curriculum.contexts;
  if (!step?.templates?.length || !contexts) return null;
  const wanted = wantedDifficulty(r.place, r.day, r.ordinal);
  const printable = step.templates.map((t, index) => ({ t, index })).filter(({ t }) => !templateProblem(t, r.level));
  // A Challenge takes the step's hardest questions first (see the order below); an easy one only when no other fits.
  const usable = printable;
  if (!usable.length) return null;
  const used = (i: number) => r.usedOnPage?.get(i) ?? 0;
  // A story place takes the step's stories first, then its number questions (word problems are number stories).
  const storyPlace = !!r.place && STEP_STORY_PLACES.has(r.place) && r.place !== "challenge";
  const numberPlace = r.place === "solve-it-two-ways" || r.place === "spot-the-error";
  const fit = (t: StepTemplate) => numberPlace ? (["bare", "missing"].includes(t.format) ? 0 : t.format === "story" ? 2 : 1)
    : !storyPlace ? 0 : t.format === "story" ? 0 : ["bare", "missing"].includes(t.format) ? 1 : 2;
  // A worked example and a Challenge take their difficulty first: the easiest to show, the hardest to stretch.
  const byDifficulty = r.place === "challenge" || r.place === "worked-example" || r.place === "watch-one" || r.place === "reminder";
  const order = usable
    .map((x, k) => ({ ...x, rank: wanted.indexOf(x.t.difficulty), turn: (k + r.seed) % usable.length }))
    // A Challenge takes the step's hardest template first (Cedric's section 9), whatever its format.
    .sort((a, b) => (byDifficulty ? a.rank - b.rank : 0) || fit(a.t) - fit(b.t) || used(a.index) - used(b.index) || a.rank - b.rank || a.turn - b.turn);
  const people = contexts.people.map((p) => p.name);
  for (let k = 0; k < order.length; k++) {
    const { t, index } = order[(k + r.attempt) % order.length];
    let prepared;
    try { prepared = prepareTemplate(step, t, contexts); } catch { continue; }
    const random = seededRandom(((r.seed * 31 + r.attempt * 7919 + k * 104729) % 2147483647) + 1);
    for (let tryNo = 0; tryNo < 12; tryNo++) {
      let filled;
      try { filled = prepared.fill(random); } catch { break; }
      // A template's blank ("Count on: 8, __, __.") prints as "?", as code's missing numbers do: a line of underscores
      // alone leaves too little ink to count as printed.
      const text = filled.text.replace(/_{2,}/g, "?");
      if (r.avoid && new RegExp(`\\b${r.avoid}\\b`, "i").test(text)) continue;
      if (r.room !== undefined && text.length > r.room) continue;
      if (stepRangeProblem(step, text) || stepRangeProblem(step, filled.answer)) continue;
      const at = kindAt(r.place, filled.answer, text);
      if (!at) break;
      const slots: TemplateSource["slots"] = [];
      let ok = true;
      for (const [name, ref] of Object.entries(t.slots)) {
        const value = templateScalar(filled.values[name]);
        if (!value) { ok = false; break; }
        slots.push({ name, value, domain: storedDomain(slotDomain(step, ref)) });
      }
      const values = step.values ? step.values.map((v) => (typeof v === "number" ? (Number.isInteger(v) ? { int: String(v) } : { dec: String(v) }) : { text: v })) as TemplateScalar[] : null;
      if (!ok) break;
      const source: TemplateSource = { answer: t.answer, check: t.check || null, derived: Object.entries(t.derived ?? {}), slots, values };
      const shown = at.kind === "spot" ? String(Number(filled.answer) + (Number(filled.answer) + 1 <= (stepBounds(step)?.max ?? Infinity) ? 1 : -1)) : undefined;
      const level = (d: TemplateDifficulty) => ["easy", "medium", "hard"].indexOf(d);
      const ref: StepTemplateRef = {
        skill: step.skill, step: step.number, index, format: t.format, difficulty: t.difficulty, kind: at.kind, source, answer: filled.answer,
        ...(at.choices ? { choices: at.choices } : {}), ...(shown !== undefined ? { shown } : {}),
        frame: sentenceFrame(text, people), drill: !HAS_SENTENCE.test(t.text),
        rank: stepRank(r.curriculum, step.skill, step.number) ?? 0, bounds: stepBounds(step),
        hardest: level(t.difficulty) >= Math.max(...printable.map((x) => level(x.t.difficulty))),
      };
      return { ref, text, numbers: printedNumbersOf(text) };
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
  }
}

/** The step a package was filled from (its template id "<skill>#<step>.<template>:<format>"), or null. */
export function stepTemplateOf(p: QuestionPackage): { skill: string; step: number; index: number; format: string } | null {
  const m = /^([^#\s]+)#(\d+)\.(\d+):([a-z-]+)$/.exec(p.templateId ?? "");
  return m && (p.item?.checks ?? []).some((c) => c.kind.startsWith("template")) ? { skill: m[1], step: Number(m[2]), index: Number(m[3]) - 1, format: m[4] } : null;
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
