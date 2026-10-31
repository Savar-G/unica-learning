// The workbook generator (#311, spec #296): a two-week plan (#308, src/lib/workbook-plan.ts) in, one coherent draft
// workbook out, stored as one unit through the draft store. The plan fixes every page and part; the AI fills the
// question slots of each page with content only (src/lib/workbook-generator-items.ts), one call per page; code
// computes every answer and worked step, and the answer checker (#306, #307, #362) runs on every question. The formats
// with no operation (places, order, compare, sequence, count, pattern) and the pictures are #377.
//
// - One AI call per day page fills its slots. A question that fails the check (or that the AI left out) is written
//   again once, in one call for the page's failed slots, with the reason; if it fails again it stays in the draft,
//   marked failed with the reason (never dropped). A question code cannot check is kept, marked "not checked by code".
// - The fit check (FitCheck, a seam: the renderer's measure on main, the real templates of #310 later) runs on every
//   page with questions. A page that does not fit is written again once, with the problems; if it still does not fit,
//   it stays in the draft, marked failed with the problems. Each question has two AI attempts in all: the page retry
//   writes again only questions with an attempt left, so a question that failed twice is never written a third time.
// - The book (CONTEXT.md sections 1 and 7, D-187, D-191): the cover (page 1), the How + Plan page, the ten days' pages
//   in plan order, the back cover, then blank pages to a multiple of 4. Page numbers run from the cover through the
//   book; question numbers restart on each page. The page type, day and numbers come from the plan and code, never from
//   the AI: the AI writes no layout, font, size or position.
// - An AI call that throws (a time-out, a refusal, output that is not JSON) counts as a try whose questions failed.
// Pure TypeScript: no Next.js, React, network, database, clock or randomness (the caller passes the QR token maker).
import { BC_SKILL_MAP } from "@/lib/assessment";
import { withTimeLimit, type AiClient } from "@/lib/ai-client";
import type { QuestionPackage } from "@/lib/question-package";
import { isQrToken, isUuid } from "@/lib/workbook-content";
import type { Curriculum } from "@/lib/workbook-curriculum";
import { buildQuestion, ITEMS_SCHEMA, type BuiltQuestion, type QuestionCheck } from "@/lib/workbook-generator-items";
import { bookPageContent, dayPageContent, layoutDayPage, mistakesFor, rangeProblem, samProblem, slotRanges, SLOT_FORMATS, STRICT_SLOTS, type DayLayout } from "@/lib/workbook-book";
import type { Omission, PageContent, SlotName } from "@/lib/workbook-page";
import type { PageType, PlannedPage, PlannedPart, WorkbookPlan } from "@/lib/workbook-plan";
import type { DraftPage } from "@/lib/workbook-render";

export type { QuestionCheck } from "@/lib/workbook-generator-items";

// ---------- The fit check seam ----------

/** A fit problem on a page: the question, or null for the page. */
export interface FitProblem {
  question: number | null;
  reason: string;
}

export type FitResult = { ok: true } | { ok: false; problems: FitProblem[] };

/** The book a page belongs to, as a template reads it. */
export interface FitBook {
  id: string;
  childId: string;
  number: number;
  levels: number[];
  profileBuild: string | null;
}

/**
 * Whether a page's content fits its template's slots. Adapters: the renderer on main (src/lib/workbook-fit.ts) and the
 * real templates' strict check (#310) once it merges.
 */
export interface FitCheck {
  fits(page: DraftPage, book: FitBook): Promise<FitResult>;
}

// ---------- The draft ----------

/** The pages of a book that are not day pages. */
export const BOOK_PAGE_TYPES = ["cover", "how-plan", "back-cover", "blank"] as const;
export type BookPageType = (typeof BOOK_PAGE_TYPES)[number];

export interface GeneratedQuestion {
  /** From 1; restarts on each page. */
  number: number;
  /** The plan's slot: "<part index>.<item index>", both from 1. */
  slot: string;
  /** The part of the day it fills. */
  part: PlannedPart["kind"];
  /** The template slot it sits in ("now-you", "word-problems"), when the book is laid out for the templates (#363). */
  place?: SlotName;
  check: QuestionCheck;
  /** Its AI attempts: 1, or 2 when it was written again (after a failed check or for a page retry). Never more. */
  attempts: 1 | 2;
  /** Its package; null only when code could build none (the AI wrote nothing usable). */
  package: QuestionPackage | null;
}

export type PageFit = { status: "fits" } | { status: "failed"; problems: FitProblem[] } | { status: "not-needed" };

export interface GeneratedPage {
  /** From 1 at the cover; runs through the whole book. */
  number: number;
  type: PageType | BookPageType;
  /** "Day 3" on a day page; else null. */
  dayLabel: string | null;
  /** 1 to 10 on a day page; else null. */
  day: number | null;
  /** The page of the day, from 1; else null. */
  pageOfDay: number | null;
  qrToken: string;
  fit: PageFit;
  /**
   * 1, or 2 when the page was written again after a failed fit check (some question had an attempt left); 0 for a page
   * with no AI content.
   */
  attempts: 0 | 1 | 2;
  questions: GeneratedQuestion[];
  /**
   * What the template lays out (#363): the header, the slots with their question numbers, the panels and pictures.
   * Set on every page when the book is laid out for the templates (GenerateInput.book); else absent.
   */
  content?: PageContent;
  /** Planned items the page has no room for, with why (pageSlots); only on a laid-out day page that leaves some out. */
  omissions?: Omission[];
}

export interface GeneratedWorkbook {
  id: string;
  childId: string;
  /** The workbook's place in the child's sequence, from 1. */
  number: number;
  levels: number[];
  profileBuild: string | null;
  /** The AI model id. */
  model: string;
  pages: GeneratedPage[];
  counts: { pages: number; questions: number; checked: number; notChecked: number; failed: number; failedPages: number };
}

/** The shape version of a stored GeneratedWorkbook. Raise it when the shape changes. */
export const GENERATED_DRAFT_VERSION = 1;

export type DraftSave = { status: "saved"; draftId: string } | { status: "refused"; reason: string };

/** The draft store. Adapters: Supabase (src/lib/workbook-draft-store.ts) and in memory (workbook-draft-memory.ts). */
export interface WorkbookDraftStore {
  /** Stores a whole draft as one unit, or nothing. */
  save(draft: GeneratedWorkbook): Promise<DraftSave>;
  draft(id: string): Promise<GeneratedWorkbook | null>;
}

/** What is wrong with a draft to store, or null: ids, numbering, tokens and each question's place and verdict. */
export function draftProblem(d: GeneratedWorkbook): string | null {
  if (!isUuid(d.id)) return "the draft id is not a UUID";
  if (!isUuid(d.childId)) return "the child id is not a UUID";
  if (!Number.isInteger(d.number) || d.number < 1 || d.number > 1000) return "the workbook number is not from 1 to 1000";
  if (d.levels.length === 0 || !d.levels.every((l) => Number.isInteger(l) && l >= 1 && l <= 30)) return "the levels are not U1 to U30";
  if (d.pages.length === 0 || d.pages.length % 4 !== 0) return "the page count is not a multiple of 4";
  const tokens = new Set<string>();
  const ids = new Set<string>();
  for (const [i, p] of d.pages.entries()) {
    if (p.number !== i + 1) return `page ${i + 1} is numbered ${p.number}`;
    if (!isQrToken(p.qrToken) || tokens.has(p.qrToken)) return `page ${p.number}: the QR token is not valid or is used twice`;
    tokens.add(p.qrToken);
    for (const [j, q] of p.questions.entries()) {
      const at = `page ${p.number}, question ${j + 1}`;
      if (q.number !== j + 1) return `${at} is numbered ${q.number}`;
      if (q.check.status !== "failed" && !q.package) return `${at} has no package but is not marked failed`;
      if (q.check.status !== "checked" && !q.check.reason) return `${at} is ${q.check.status} with no reason`;
      if (q.package) {
        const ref = q.package.ref;
        if (ref.source !== "workbook" || ref.workbookId !== d.id || ref.page !== p.number || ref.question !== q.number) return `${at}: the package names another place`;
        if (ids.has(q.package.id)) return `${at}: the question id is used twice`;
        ids.add(q.package.id);
      }
    }
  }
  return null;
}

// ---------- Generating ----------

export interface GenerateInput {
  /** The new draft's id (a UUID), made by the caller. */
  workbookId: string;
  childId: string;
  /** The workbook's place in the child's sequence. */
  number: number;
  /** The child profile build the plan was made from, or null. */
  profileBuild: string | null;
  plan: WorkbookPlan;
  /** The child's curriculum: what the AI is told about each skill and step. */
  curriculum: Curriculum;
  /**
   * Lay the book out for the real templates (#310, #363): each day page's questions fill the template's slots
   * (pageSlots, so a page asks the AI for no more than it holds), every page gets its content, and the fit check reads
   * it. `child` is the child's first name, as printed on the cover and in each page ID. Absent: the plan's parts give
   * the slots and no page has content.
   */
  book?: { child: string };
}

export interface GenerateDeps {
  ai: AiClient;
  fit: FitCheck;
  store: WorkbookDraftStore;
  /** A new QR token (16 to 64 letters, digits, - or _), unique everywhere: random in live use. */
  qrToken(): string;
  /** The time limit of one AI call; 3 minutes when not given. */
  timeLimitMs?: number;
  /** Called after each day page is done, with the pages done and the day pages in all. */
  progress?(done: number, total: number): void;
  /** How many day pages are written at once; 1 when not given. The draft is the same in any order. */
  concurrency?: number;
}

export type GenerateResult = { status: "stored"; draft: GeneratedWorkbook } | { status: "refused"; reason: string };

const TIME_LIMIT_MS = 180_000;

/** A question slot of a day page: in a laid-out book, also its template slot and that slot's index in the layout. */
interface Slot {
  id: string;
  part: PlannedPart;
  place: SlotName | null;
  layoutSlot: number;
}

const slotsOf = (page: PlannedPage): Slot[] =>
  page.parts.flatMap((part, i) => Array.from({ length: part.items }, (_, j) => ({ id: `${i + 1}.${j + 1}`, part, place: null, layoutSlot: -1 })));

/** The question slots of a laid-out page, in reading order: ids count each part's items across its template slots. */
function layoutSlots(page: PlannedPage, layout: DayLayout): Slot[] {
  const seen = new Map<number, number>();
  return layout.slots.flatMap((x, k) => Array.from({ length: x.items }, () => {
    const n = (seen.get(x.part) ?? 0) + 1;
    seen.set(x.part, n);
    return { id: `${x.part + 1}.${n}`, part: page.parts[x.part], place: x.slot, layoutSlot: k };
  }));
}

const SYSTEM = [
  "You write the questions of one page of a printed math workbook for a child in British Columbia, Canada.",
  "Fill every slot listed, one item per slot, with the slot's id. Use only the skills the slot names.",
  "A slot may name its place on the page (now-you, word-problems, mixed-set, ...) and the formats that place takes: use one of those formats.",
  "A slot may give its numbers: for each skill, the range of that skill's own level. Every number of an item on that skill is at most its max: the numbers in its text, the operation's numbers, the answer, every wrong answer, the easier example's numbers and answer, and every number in its sequence, places, comparison, choices and picture. None is negative unless its negatives is true, none is a fraction (1/2) unless its fractions is true, none is a decimal unless its decimals is true, and none is a percent unless its percents is true; a clock time (3:30) only when its time is true, else its numbers count; coin values and amounts with cents only when its money is true. So a review of an earlier skill uses that skill's small numbers.",
  "Write every number in digits. Never write numbers as words: 12, not twelve; -3, not minus three; 0.5, not zero point five; 1/2, not half; 50%, not fifty percent; 3:30, not half past three. The only number words allowed are order words (first, second, third), 'which one', 'each one', 'this one', 'that one', 'the one', place names (the tens digit, the ones place, 3 tens), ten-frame and five-frame, 'one more' and 'one less' on a skill about them, and the quarter coin on a money skill.",
  "On the spot-the-error place, pick one mistake from the slot's mistakes: write a sum it can happen on (its 'when'), give Sam's wrong answer as exactly what that mistake makes, put the mistake's name as that wrong answer's cause, and set its step as the mistake's 'step' says. Code writes Sam's steps.",
  "You write content only: the question text, the operation's numbers, expected wrong answers with their causes, an easier example of the same operation, and an item format from the list. The page's layout, fonts, sizes and positions are fixed by the template; never describe them.",
  "Never write the answer or the worked steps: code computes them from the operation. Give the operation as data: its kind and operands (numbers, fractions, amounts with units, clock times), or for evaluate and solve the expression.",
  "Each wrong answer is a mistake a child makes, with a short cause id (a misconception id such as O3 when the input names one, else a short word such as 'operation'), a plain description, and the worked step where it happens: a column's place ('ones', 'tens', 'hundreds') or null when it is not one step.",
  "The easier example is the same operation kind with smaller numbers or fewer steps, and a different answer (never the question's answer, never the question with its numbers swapped).",
  "Formats with an operation: write-number (one answer box); show-work (answer box and work box: stories, challenges); two-ways (Solve it two ways: Method 1 and Method 2); tick-and-number (Mixed set: tick the operation, write the answer; +, −, × or ÷ only); spot-the-error (Sam's wrong work shows one of your wrong answers: give its index in shownWrong); number-line (hop on a number line, then write where you land: + or − of whole numbers).",
  "Formats with no operation (set operation, easier and wrongAnswers to null and empty; code computes every answer): places (one number in numbers; places lists the places to ask, or null for all: 'How many tens and ones?'); order (2 to 6 numbers in numbers, direction up or down); compare (two numbers in numbers: tick or circle <, > or =); sequence (sequence: the first number, the step, how many terms and which terms from 0 are blanks: missing numbers, skip-counting); count (the picture's counts in numbers, with a figure: 'How many dots?'); pattern (pattern: the core that repeats, how many shapes are shown, and which one from 0 is the blank: 'What comes next?').",
  "Formats a parent checks: written-reason (How do you know?); draw (Draw 6 dots; make a set). No operation, no figure.",
  "Pictures: figure names a picture kind (dots, ten-frame, number-line, base-ten, array) or null. Code draws it from the operation (dots for 3 + 4 are 3 and 4 dots; an array for 3 × 4) or from numbers (count: dots take each group, a ten-frame each part, base-ten the hundreds, tens and ones, an array the rows and columns); you never draw, size or place it. Picture stories below U10 should have dots or a ten-frame with small whole numbers.",
  "Keep to the part's kind: practice builds from easy to harder in small changes; Fix it uses new numbers on the skills listed, never a question named in 'avoid'; Friday 5, mini-tests and the level test have no hints.",
  "Copy: short plain sentences a child can read; Canadian English (Mom, metre, litre, colour); money in Canadian dollars and cents; never a school grade, a brand name, or a prompt to scan or call anyone; no last names.",
].join("\n");

/** What the AI reads about a skill: its text and, where drafted, the step the part teaches. */
function skillFacts(curriculum: Curriculum, id: string, step: number | null) {
  const skill = curriculum.skill(id);
  const text = skill?.text ?? BC_SKILL_MAP.standards.flatMap((s) => s.skills).find((k) => k.id === id)?.text ?? id;
  const s = step !== null ? curriculum.skillSteps(id)?.find((x) => x.number === step) : undefined;
  return {
    id,
    text,
    step: s ? { name: s.name, rules: s.rules, example: s.example, representation: s.representation, mistakes: s.mistakes, spotTheError: s.spotTheError } : null,
  };
}

function pageRequest(input: GenerateInput, day: number, page: PlannedPage, slots: Slot[], note: string | null) {
  const { plan, curriculum } = input;
  const parts = page.parts.map((part, i) => ({
    part: i + 1,
    kind: part.kind,
    items: part.items,
    hints: part.hints,
    methods: part.methods ?? null,
    faded: part.faded ?? null,
    reviews: part.reviews ?? null,
    test: part.test ?? null,
    fixIt: part.fixIt?.map((f) => ({ skill: f.skill, mistakes: f.mistakes, stuckSteps: f.stuckSteps, avoid: f.avoid.questions })) ?? null,
    skills: part.skills.map((id) => skillFacts(curriculum, id, part.step?.skill === id ? part.step.step : null)),
  }));
  return {
    level: `U${plan.level}`,
    lead: plan.lead,
    instructions: page.instructions,
    day,
    pageType: page.type,
    parts,
    slots: slots.map((s) => ({ slot: s.id, part: s.part.kind, skills: s.part.skills, ...(s.place ? { place: s.place, formats: SLOT_FORMATS[s.place] ?? null } : {}), ...(s.place === "spot-the-error" ? { mistakes: mistakesFor(plan.level) } : {}), ...(s.place ? { numbers: slotRanges(curriculum, plan.level, s.part.skills) } : {}) })),
    note,
  };
}

/** The AI's items by slot id; an answer of another shape gives none. */
async function callAi(deps: GenerateDeps, name: string, request: unknown): Promise<{ items: Map<string, unknown>; error: string | null }> {
  try {
    const out = await withTimeLimit(deps.timeLimitMs ?? TIME_LIMIT_MS, (signal) =>
      deps.ai.json({ name, system: SYSTEM, content: [{ type: "text", text: JSON.stringify(request) }], schema: ITEMS_SCHEMA, effort: "medium" }, signal));
    const items = new Map<string, unknown>();
    const list = (out as { items?: unknown } | null)?.items;
    if (Array.isArray(list)) {
      for (const item of list) {
        const slot = (item as { slot?: unknown } | null)?.slot;
        if (typeof slot === "string" && !items.has(slot)) items.set(slot, item);
      }
    }
    return { items, error: null };
  } catch (e) {
    return { items: new Map(), error: e instanceof Error ? e.message : String(e) };
  }
}

interface PageWork {
  number: number;
  day: number;
  page: PlannedPage;
  slots: Slot[];
  layout: DayLayout | null;
}

/** Each question has at most this many AI attempts in all, across the question redo and the page retry. */
const QUESTION_ATTEMPTS = 2;

/** Writes the page's slots at `which` (indexes) in one AI call and builds each; never throws. */
async function writeSlots(input: GenerateInput, deps: GenerateDeps, w: PageWork, which: number[], note: string | null, name: string) {
  const asked = which.map((i) => w.slots[i]);
  const out = await callAi(deps, name, pageRequest(input, w.day, w.page, asked, note));
  return which.map((i) => {
    const slot = w.slots[i];
    const b = buildQuestion(out.items.get(slot.id), {
      id: `${input.workbookId}:d${w.day}p${w.page.number}s${slot.id}`,
      workbookId: input.workbookId, page: w.number, question: i + 1, level: input.plan.level, skills: slot.part.skills,
    });
    if (out.error && !out.items.has(slot.id)) b.check = { status: "failed", reason: `the AI gave no answer: ${out.error}` };
    // A slot with a layout of its own takes only its format: another would not lay out there.
    const format = b.package?.item?.format;
    if (slot.place && STRICT_SLOTS.includes(slot.place) && b.check.status !== "failed" && format && !SLOT_FORMATS[slot.place]?.includes(format)) {
      b.check = { status: "failed", reason: `the ${slot.place} place takes the ${SLOT_FORMATS[slot.place]!.join(" or ")} format, not ${format}` };
    }
    // Spot the error shows Sam's wrong steps, built by code: the shown wrong answer must be a mistake code can show.
    if (slot.place === "spot-the-error" && b.check.status !== "failed" && b.package) {
      const problem = samProblem(b.package, input.plan.level);
      if (problem) b.check = { status: "failed", reason: problem };
    }
    // Every number fits the level and slot: the range of the item's skill (an earlier skill's under review).
    if (slot.place && b.check.status !== "failed" && b.package) {
      const problem = rangeProblem(b.package, input.curriculum, input.plan.level);
      if (problem) b.check = { status: "failed", reason: problem };
    }
    return b;
  });
}

const generated = (w: PageWork, i: number, b: BuiltQuestion, attempts: 1 | 2): GeneratedQuestion => ({
  number: i + 1, slot: w.slots[i].id, part: w.slots[i].part.kind, ...(w.slots[i].place ? { place: w.slots[i].place! } : {}), check: b.check, attempts, package: b.package,
});

/** The first pass at a page: the page call, then one redo call for its failed questions (their last attempt). */
async function firstPass(input: GenerateInput, deps: GenerateDeps, w: PageWork): Promise<GeneratedQuestion[]> {
  const all = w.slots.map((_, i) => i);
  const built = await writeSlots(input, deps, w, all, null, "workbook_page");
  const questions = all.map((i) => generated(w, i, built[i], 1));
  const failed = all.filter((i) => built[i].check.status === "failed");
  if (failed.length === 0) return questions;
  const note = failed.map((i) => {
    const steps = built[i].stepIds.length ? ` Its operation's worked steps are named: ${built[i].stepIds.join(", ")}.` : "";
    return `Slot ${w.slots[i].id} failed the check: ${(built[i].check as { reason: string }).reason}.${steps} Write it again.`;
  }).join("\n");
  const redo = await writeSlots(input, deps, w, failed, note, "workbook_page_redo");
  failed.forEach((i, k) => { questions[i] = generated(w, i, redo[k], 2); });
  return questions;
}

/**
 * The page retry after a failed fit check. Only questions with an attempt left are written again (their last attempt);
 * a question that used both attempts stays as it is, failed or not. A sound question whose retry fails the check keeps
 * its sound version: a retry never puts a failed question in place of a sound one. Null when no question has an
 * attempt left, so there is nothing to write again.
 */
async function pageRetry(input: GenerateInput, deps: GenerateDeps, w: PageWork, previous: GeneratedQuestion[], note: string): Promise<GeneratedQuestion[] | null> {
  const open = previous.flatMap((q, i) => (q.attempts < QUESTION_ATTEMPTS ? [i] : []));
  if (open.length === 0) return null;
  const built = await writeSlots(input, deps, w, open, note, "workbook_page");
  const questions = [...previous];
  open.forEach((i, k) => {
    questions[i] = built[k].check.status === "failed" ? { ...previous[i], attempts: 2 } : generated(w, i, built[k], 2);
  });
  return questions;
}

/** A laid-out day page's content for its questions; null when the book is not laid out. */
function contentOf(input: GenerateInput, w: PageWork, questions: GeneratedQuestion[]): PageContent | null {
  if (!input.book || !w.layout) return null;
  return dayPageContent({
    curriculum: input.curriculum, plan: input.plan, day: w.day, page: w.page, layout: w.layout, child: input.book.child, workbook: input.number,
    questions: questions.map((q) => ({
      number: q.number, slot: w.slots[q.number - 1].layoutSlot, package: q.package, ...(q.check.status === "failed" ? { failed: q.check.reason } : {}),
    })),
  });
}

const fitPage = (w: PageWork, qrToken: string, questions: GeneratedQuestion[], content: PageContent | null): DraftPage => ({
  number: w.number,
  dayLabel: `Day ${w.day}`,
  type: w.page.type,
  qrToken,
  questions: questions.filter((q) => q.package).map((q) => ({ number: q.number, package: q.package! })),
  ...(content ? { content } : {}),
});

/** Runs `run` on every item, at most `limit` at once; the results keep the items' order. */
async function pool<T, R>(items: T[], limit: number, run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await run(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/**
 * Generates a draft from a plan and stores it as one unit. Refused, with nothing stored and no AI call, when the input
 * is not sound; refused after generation when the store refuses the draft.
 */
export async function generateWorkbook(input: GenerateInput, deps: GenerateDeps): Promise<GenerateResult> {
  if (!isUuid(input.workbookId)) return { status: "refused", reason: "the workbook id is not a UUID" };
  if (!isUuid(input.childId)) return { status: "refused", reason: "the child id is not a UUID" };
  if (input.plan.days.length === 0) return { status: "refused", reason: "the plan has no days" };

  // The book's pages and their numbers, before any AI call: the cover, How + Plan, the days, the back cover, blanks.
  const work: PageWork[] = [];
  let number = 2;
  for (const day of input.plan.days) {
    for (const page of day.pages) {
      const layout = input.book ? layoutDayPage(input.curriculum, input.plan, day.day, page) : null;
      work.push({ number: ++number, day: day.day, page, layout, slots: layout ? layoutSlots(page, layout) : slotsOf(page) });
    }
  }
  const backCover = number + 1;
  const total = Math.ceil(backCover / 4) * 4;
  const tokens = Array.from({ length: total }, () => deps.qrToken());
  const book: FitBook = { id: input.workbookId, childId: input.childId, number: input.number, levels: [input.plan.level], profileBuild: input.profileBuild };

  const plain = (n: number, type: BookPageType): GeneratedPage => ({
    number: n, type, dayLabel: null, day: null, pageOfDay: null, qrToken: tokens[n - 1], fit: { status: "not-needed" }, attempts: 0, questions: [],
    ...(input.book ? { content: bookPageContent({ curriculum: input.curriculum, plan: input.plan, child: input.book.child, workbook: input.number, type, number: n }) } : {}),
  });
  let done = 0;
  const dayPages = await pool(work, deps.concurrency ?? 1, async (w): Promise<GeneratedPage> => {
    const qrToken = tokens[w.number - 1];
    const page = { number: w.number, type: w.page.type, dayLabel: `Day ${w.day}`, day: w.day, pageOfDay: w.page.number, qrToken };
    const laidOut = (questions: GeneratedQuestion[]) => {
      const content = contentOf(input, w, questions);
      return { ...(content ? { content } : {}), ...(w.layout?.omissions.length ? { omissions: w.layout.omissions } : {}) };
    };
    let result: GeneratedPage;
    if (w.slots.length === 0) {
      result = { ...page, fit: { status: "not-needed" }, attempts: 0, questions: [], ...laidOut([]) };
    } else {
      let questions = await firstPass(input, deps, w);
      let fit = await deps.fit.fits(fitPage(w, qrToken, questions, contentOf(input, w, questions)), book);
      let attempts: 1 | 2 = 1;
      if (!fit.ok) {
        const note = `The last page did not fit its template: ${fit.problems.map((p) => (p.question ? `question ${p.question}: ` : "") + p.reason).join("; ")}. Write shorter text and smaller numbers so it fits.`;
        const retried = await pageRetry(input, deps, w, questions, note);
        if (retried) {
          questions = retried;
          fit = await deps.fit.fits(fitPage(w, qrToken, questions, contentOf(input, w, questions)), book);
          attempts = 2;
        }
      }
      result = { ...page, fit: fit.ok ? { status: "fits" } : { status: "failed", problems: fit.problems }, attempts, questions, ...laidOut(questions) };
    }
    deps.progress?.(++done, work.length);
    return result;
  });
  const pages: GeneratedPage[] = [plain(1, "cover"), plain(2, "how-plan"), ...dayPages];
  pages.push(plain(backCover, "back-cover"));
  for (let n = backCover + 1; n <= total; n++) pages.push(plain(n, "blank"));

  const questions = pages.flatMap((p) => p.questions);
  const draft: GeneratedWorkbook = {
    ...book,
    model: deps.ai.model,
    pages,
    counts: {
      pages: pages.length,
      questions: questions.length,
      checked: questions.filter((q) => q.check.status === "checked").length,
      notChecked: questions.filter((q) => q.check.status === "not-checked").length,
      failed: questions.filter((q) => q.check.status === "failed").length,
      failedPages: pages.filter((p) => p.fit.status === "failed").length,
    },
  };
  const saved = await deps.store.save(draft);
  return saved.status === "saved" ? { status: "stored", draft } : saved;
}
