// The workbook generator (#311, spec #296): a two-week plan (#308, src/lib/workbook-plan.ts) in, one coherent draft
// workbook out, stored as one unit through the draft store. The plan fixes every page and part; the AI fills the
// question slots of each page with content only (src/lib/workbook-generator-items.ts), one call per page; code
// computes every answer and worked step, and the answer checker (#306, #307, #362) runs on every question.
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
import { coverContent, dayHeader, howPlanContent, PANEL_SLOTS, panelBlock, spotTheErrorLines } from "@/lib/workbook-book-content";
import { headerGrowth, pageId, pageSlots, type Block, type DayContent, type DayHeader, type Omission, type PageContent, type SlotName } from "@/lib/workbook-page";
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
  /** Its place in the page's layout: "<layout slot index>.<item index>", both from 1. */
  slot: string;
  /** The template slot it sits in (src/lib/workbook-page.ts). */
  place: SlotName;
  /** The part of the day it fills. */
  part: PlannedPart["kind"];
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
  /** What the page's template reads besides its questions: the header and the slots, or the cover and plan words. */
  content: PageContent;
  /** Planned items the page's layout left out, with why (pageSlots). */
  omissions: Omission[];
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
export const GENERATED_DRAFT_VERSION = 2;

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
  /** The new draft's id (a UUID), made by the caller. A resumed run passes the same id. */
  workbookId: string;
  childId: string;
  /** The child's first name, as the cover and page IDs print it. */
  child: string;
  /** The workbook's place in the child's sequence. */
  number: number;
  /** The child profile build the plan was made from, or null. */
  profileBuild: string | null;
  plan: WorkbookPlan;
  /** The child's curriculum: what the AI is told about each skill and step. */
  curriculum: Curriculum;
}

/**
 * Where finished day pages are kept while a run works, so a run that stops (a time limit) resumes without writing them
 * again. `save` throws when the run may no longer write: the generation stops.
 */
export interface PageStore {
  /** The day pages already finished for this draft. */
  load(): Promise<GeneratedPage[]>;
  save(page: GeneratedPage): Promise<void>;
}

export interface GenerateDeps {
  ai: AiClient;
  fit: FitCheck;
  store: WorkbookDraftStore;
  /** A new QR token (16 to 64 letters, digits, - or _), unique everywhere: random in live use. */
  qrToken(): string;
  /** The time limit of one AI call; 3 minutes when not given. */
  timeLimitMs?: number;
  /** Day pages written at the same time; 1 when not given. Each page keeps its own order of calls. */
  concurrency?: number;
  /** Finished pages kept for a resume; none when not given. */
  pages?: PageStore;
  /** Asked before each day page starts: true stops starting pages (the time budget); the result is "paused". */
  stop?(): boolean;
  /** Called after each day page is done, with the pages done and the day pages in all. */
  progress?(done: number, total: number): void;
}

export type GenerateResult =
  | { status: "stored"; draft: GeneratedWorkbook }
  | { status: "paused"; done: number; total: number }
  | { status: "refused"; reason: string };

const TIME_LIMIT_MS = 180_000;

/** A question slot of a day page: its template slot and the planned part it comes from. */
interface Slot {
  id: string;
  place: SlotName;
  part: PlannedPart;
}

const SYSTEM = [
  "You write the questions of one page of a printed math workbook for a child in British Columbia, Canada.",
  "Fill every slot listed, one item per slot, with the slot's id. Use only the skills the slot names.",
  "You write content only: the question text, the operation's numbers, expected wrong answers with their causes, an easier example of the same operation, and an item format from the list. The page's layout, fonts, sizes and positions are fixed by the template; never describe them.",
  "Never write the answer or the worked steps: code computes them from the operation. Give the operation as data: its kind and operands (numbers, fractions, amounts with units, clock times), or for evaluate and solve the expression.",
  "Each wrong answer is a mistake a child makes, with a short cause id (a misconception id such as O3 when the input names one, else a short word such as 'operation'), a plain description, and the worked step where it happens: a column's place ('ones', 'tens', 'hundreds') or null when it is not one step.",
  "The easier example is the same operation kind with smaller numbers or fewer steps.",
  "Formats: write-number (one answer box); show-work (answer box and work box: stories, challenges); two-ways (Solve it two ways: Method 1 and Method 2); tick-and-number (Mixed set: tick the operation, write the answer; +, −, × or ÷ only); spot-the-error (Sam's wrong work shows one of your wrong answers: give its index in shownWrong); written-reason (How do you know?; no operation, a parent checks it).",
  "Each slot names its place on the page; use its format: how-do-you-know is written-reason; spot-the-error is spot-the-error; solve-it-two-ways is two-ways; mixed-set is tick-and-number; word-problems, picture-stories, challenge and math-in-the-world are show-work; every other place is write-number.",
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
    slots: slots.map((s) => ({ slot: s.id, place: s.place, part: s.part.kind, skills: s.part.skills })),
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
  /** The day's page count. */
  pages: number;
  page: PlannedPage;
  header: DayHeader;
  /** The page's layout: its template slots in order, each with its part and items. */
  layout: ReturnType<typeof pageSlots>;
  slots: Slot[];
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
    return b;
  });
}

const generated = (w: PageWork, i: number, b: BuiltQuestion, attempts: 1 | 2): GeneratedQuestion => ({
  number: i + 1, slot: w.slots[i].id, place: w.slots[i].place, part: w.slots[i].part.kind, check: b.check, attempts, package: b.package,
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

/** A day page's content: its header and its slots, with the questions that have a package, and code's panels. */
function dayContent(input: GenerateInput, w: PageWork, questions: GeneratedQuestion[]): DayContent {
  const blocks: Block[] = w.layout.slots.map((s, li) => {
    const mine = questions.filter((q) => q.slot.startsWith(`${li + 1}.`) && q.package);
    const part = w.page.parts[s.part];
    if (PANEL_SLOTS.includes(s.slot)) {
      // Worked from a checked question of the same part, else of the page.
      const source = questions.find((q) => q.check.status === "checked" && q.package?.easierExample && w.page.parts.indexOf(w.slots[q.number - 1].part) === s.part)
        ?? questions.find((q) => q.check.status === "checked" && q.package?.easierExample);
      return { ...panelBlock(s.slot, source?.package ?? null, part?.unit ?? null), items: [] };
    }
    const block: Block = { slot: s.slot, items: mine.map((q) => q.number) };
    if (s.slot === "spot-the-error" && mine[0]?.package) return { ...block, who: "Sam", lines: spotTheErrorLines(mine[0].package) };
    return block;
  });
  return {
    kind: "day", id: pageId(input.child, input.number, `D${String(w.day).padStart(2, "0")}·P${w.page.number}`), level: input.plan.level,
    day: w.day, page: w.page.number, pages: w.pages, ...w.header, blocks,
  };
}

const fitPage = (input: GenerateInput, w: PageWork, qrToken: string, questions: GeneratedQuestion[]): DraftPage => ({
  number: w.number,
  dayLabel: `Day ${w.day}`,
  type: w.page.type,
  qrToken,
  questions: questions.filter((q) => q.package).map((q) => ({ number: q.number, package: q.package! })),
  content: dayContent(input, w, questions),
});

/** One day page, written, checked and fitted (see the header). Never throws but through the page store. */
async function writePage(input: GenerateInput, deps: GenerateDeps, w: PageWork, qrToken: string, book: FitBook): Promise<GeneratedPage> {
  const page = { number: w.number, type: w.page.type, dayLabel: `Day ${w.day}`, day: w.day, pageOfDay: w.page.number, qrToken, omissions: w.layout.omissions };
  if (w.slots.length === 0) return { ...page, fit: { status: "not-needed" }, attempts: 0, questions: [], content: dayContent(input, w, []) };
  let questions = await firstPass(input, deps, w);
  let fit = await deps.fit.fits(fitPage(input, w, qrToken, questions), book);
  let attempts: 1 | 2 = 1;
  if (!fit.ok) {
    const note = `The last page did not fit its template: ${fit.problems.map((p) => (p.question ? `question ${p.question}: ` : "") + p.reason).join("; ")}. Write shorter text and smaller numbers so it fits.`;
    const retried = await pageRetry(input, deps, w, questions, note);
    if (retried) {
      questions = retried;
      fit = await deps.fit.fits(fitPage(input, w, qrToken, questions), book);
      attempts = 2;
    }
  }
  return { ...page, fit: fit.ok ? { status: "fits" } : { status: "failed", problems: fit.problems }, attempts, questions, content: dayContent(input, w, questions) };
}

/**
 * Runs `run` on each item, at most `limit` at a time, in item order; stops taking items once `stop` says so. On the
 * first error no new item starts, and every item in flight settles before the error is thrown (R379-2), so nothing of
 * this call is still writing when its caller tries again.
 */
async function pool<T>(items: T[], limit: number, run: (item: T) => Promise<void>, stop: () => boolean): Promise<void> {
  let next = 0;
  let failure: { error: unknown } | null = null;
  const worker = async () => {
    while (!failure && next < items.length && !stop()) {
      try {
        await run(items[next++]);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  if (failure) throw (failure as { error: unknown }).error;
}

/**
 * Generates a draft from a plan and stores it as one unit. Refused, with nothing stored and no AI call, when the input
 * is not sound; refused after generation when the store refuses the draft. Day pages run `concurrency` at a time; each
 * finished page goes to the page store, and a page found there is not written again. "paused": `stop` said to stop
 * before every day page was done; call again with the same input and page store to go on.
 */
export async function generateWorkbook(input: GenerateInput, deps: GenerateDeps): Promise<GenerateResult> {
  if (!isUuid(input.workbookId)) return { status: "refused", reason: "the workbook id is not a UUID" };
  if (!isUuid(input.childId)) return { status: "refused", reason: "the child id is not a UUID" };
  if (input.plan.days.length === 0) return { status: "refused", reason: "the plan has no days" };
  const level = input.plan.level;

  // The book's pages and their numbers, before any AI call: the cover, How + Plan, the days, the back cover, blanks.
  const work: PageWork[] = [];
  let number = 2;
  const ranges: [number, number][] = [];
  for (const day of input.plan.days) {
    ranges.push([number + 1, number + day.pages.length]);
    for (const page of day.pages) {
      const header = dayHeader(input.curriculum, page, level);
      const layout = pageSlots(page, level, { headerGrowth: headerGrowth(header, level, day.day, page.number, day.pages.length) });
      const slots = layout.slots.flatMap((s, li) => (PANEL_SLOTS.includes(s.slot) ? [] : Array.from({ length: s.items }, (_, j) => ({ id: `${li + 1}.${j + 1}`, place: s.slot, part: page.parts[s.part] }))));
      work.push({ number: ++number, day: day.day, pages: day.pages.length, page, header, layout, slots });
    }
  }
  const backCover = number + 1;
  const total = Math.ceil(backCover / 4) * 4;
  const book: FitBook = { id: input.workbookId, childId: input.childId, number: input.number, levels: [level], profileBuild: input.profileBuild };

  const kept = new Map((await deps.pages?.load() ?? []).map((p) => [p.number, p]));
  const used = new Set([...kept.values()].map((p) => p.qrToken));
  // A new token never repeats a kept page's token (a bounded number of tries; a maker that keeps repeating is caught by draftProblem).
  const token = (n: number) => kept.get(n)?.qrToken ?? (() => {
    let t = deps.qrToken();
    for (let tries = 0; used.has(t) && tries < 1000; tries++) t = deps.qrToken();
    used.add(t);
    return t;
  })();
  const tokens = Array.from({ length: total }, (_, i) => token(i + 1));
  const facts = { curriculum: input.curriculum, plan: input.plan, child: input.child, number: input.number };
  const plain = (n: number, type: BookPageType, content: PageContent): GeneratedPage => ({
    number: n, type, dayLabel: null, day: null, pageOfDay: null, qrToken: tokens[n - 1], fit: { status: "not-needed" }, attempts: 0, questions: [], content, omissions: [],
  });

  const done = new Map<number, GeneratedPage>();
  for (const w of work) if (kept.has(w.number)) done.set(w.number, kept.get(w.number)!);
  if (done.size > 0) deps.progress?.(done.size, work.length);
  const todo = work.filter((w) => !done.has(w.number));
  await pool(todo, deps.concurrency ?? 1, async (w) => {
    const page = await writePage(input, deps, w, tokens[w.number - 1], book);
    await deps.pages?.save(page);
    done.set(w.number, page);
    deps.progress?.(done.size, work.length);
  }, () => deps.stop?.() ?? false);
  if (done.size < work.length) return { status: "paused", done: done.size, total: work.length };
  // With a page store, the stored pages are the truth (R379-2): the draft is built from them, not from this call's own.
  if (deps.pages) {
    const stored = new Map((await deps.pages.load()).map((p) => [p.number, p]));
    for (const w of work) {
      const page = stored.get(w.number);
      if (!page) throw new Error(`day page ${w.number} is not stored`);
      done.set(w.number, page);
    }
  }

  const pages: GeneratedPage[] = [
    plain(1, "cover", coverContent(facts)),
    plain(2, "how-plan", howPlanContent(facts, ranges)),
    ...work.map((w) => done.get(w.number)!),
    plain(backCover, "back-cover", { kind: "back-cover", id: pageId(input.child, input.number, "BACK"), level }),
  ];
  for (let n = backCover + 1; n <= total; n++) pages.push(plain(n, "blank", { kind: "blank", id: pageId(input.child, input.number, `BLANK·P${n}`), level }));

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
