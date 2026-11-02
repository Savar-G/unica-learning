import type { EditCall } from "@/lib/workbook-edit-calls";
// The workbook generator (#311, spec #296): a two-week plan (#308, src/lib/workbook-plan.ts) in, one coherent draft
// workbook out, stored as one unit through the draft store. The plan fixes every page and part; the AI fills the
// question slots of each page with content only (src/lib/workbook-generator-items.ts), one call per page; code
// computes every answer and worked step, and the answer checker (#306, #307, #362) runs on every question. The formats
// with no operation (places, order, compare, sequence, count, pattern) and the pictures are #377.
//
// - One AI call per day page fills its slots. Each slot comes with its room (textRoom, src/lib/workbook-template.ts:
//   the most characters its text has room for on the page) and its rules in plain words (the numbers, signs and ideas
//   its skills allow, digits only, an easier example with another answer). An AI call that throws (a time-out, a
//   refusal, output that is not JSON) is sent once more; if it throws again, its questions fail for that try.
// - Each question has one AI attempt, then at most one more for each reason: a failed check, and a page that does not
//   fit. A question that fails the check (or that the AI left out) is written again once, in one call for the page's
//   failed slots, with the reason; if it fails again it stays in the draft, marked failed with the reason. A question
//   code cannot check is kept, marked "not checked by code".
// - The fit check (FitCheck, a seam: the real templates' strict check, #310) runs on every page with questions. A page
//   that does not fit is written again once, every question shorter, with the problems and each text's length against
//   its room; of the two versions of a question the page keeps the sound one, and of two sound ones the shorter. If the
//   page still does not fit, it leaves out questions, one at a time, until it fits: the last question the fit check
//   names, else the page's last (on a parent-led page, it first tries its tall cards paired in rows). Nothing is shrunk.
// - The book plan (#380): before any AI call, code gives each slot its skill, kind of question, numbers and a person's
//   name, in book order (planBook): a page never has two slots on one pair of numbers, and each kind takes the pairs
//   the book has used least. A question that repeats one goes to the redo with the slot's spare numbers and next kind.
//   A sound question whose text runs past its room joins the same redo, to be written shorter (kept only if it is).
//   Round 6: each planned wording comes with what it works (its operation and picture); a slot of cards spreads them
//   across put together, take away, a missing part, compare and the ten-frame; and a repeat whose item is the planned
//   one takes the planned wording from code, with no AI call. Each question left out is in the page's `leftOut` and its part's
//   omission. A page keeps at least one question: if it does not fit with one, it keeps them all and is marked failed.
// - The book (CONTEXT.md sections 1 and 7, D-187, D-191): the cover (page 1), the How + Plan page, the ten days' pages
//   in plan order, the back cover, then blank pages to a multiple of 4. Page numbers run from the cover through the
//   book; question numbers restart on each page. The page type, day and numbers come from the plan and code, never from
//   the AI: the AI writes no layout, font, size or position.
// - Round 7 (R380-12-1): at U1 to U9 code prints its own wording of every whole-number +, -, missing part, × and ÷
//   (src/lib/workbook-wording.ts), filled from the operation the key comes from, and on a page the wording of a shape the
//   page does not have and the book has printed least. Every other printed text the AI wrote that has a key goes to the
//   solve check (GenerateDeps.solver, src/lib/workbook-solve-check.ts): a separate model answers it from the printed words
//   alone; a different answer, or a check that fails or is late, fails the question, which the redo writes once more.
//   The check is not a generation attempt.
// - Resumable runs (#312): with a page store (GenerateDeps.pages) each finished day page is kept as it is done, and a
//   later call with the same input writes only the missing ones; with an attempt ledger (GenerateDeps.attempts) each
//   AI attempt of a question or worked example is counted before its call, and a slot the ledger refuses is not asked
//   again (the job's ledger allows 3, one per reason: the first call, the check redo and the fit rewrite). The days
//   run in order; the pages of one day run at once (`concurrency`), and each of them reads what the days before asked
//   (the book memory), never its own day's other pages, so the draft is the same at any concurrency and after a resume.
//   With a call store (GenerateDeps.calls, R379-7-1) each AI call of a page is kept as it came back, built and
//   checked, with the attempts it counted, before anything else happens; a later call replays a page's kept calls in
//   order instead of asking again, so an attempt that was paid for is never lost or used twice, and a resumed page is
//   the page an uninterrupted run would have made.
//   R379-8-1: a call is kept as soon as the AI's answer is built, before its solve checks start; each solve check is
//   kept as it comes back, keyed by the call (book page and place) and the question's slot or panel, and a replay runs
//   only the checks that have no kept result. R379-8-2: a resume reads only what the run kept, checked against the book
//   this input plans: a kept page, attempt or call that does not fit the plan's pages and slots stops the generation
//   (ResumeMismatch), never mixing an old answer into a new plan. bookOutline gives the fingerprint of the planned book,
//   so a caller can refuse a resume whose curriculum, layouts or rooms changed.
// Pure TypeScript: no Next.js, React, network, database, clock or randomness (the caller passes the QR token maker).
import { BC_SKILL_MAP } from "@/lib/assessment";
import { withTimeLimit, type AiClient } from "@/lib/ai-client";
import { checkQuestionPackage, type QuestionPackage } from "@/lib/question-package";
import { isQrToken, isUuid } from "@/lib/workbook-content";
import type { Curriculum } from "@/lib/workbook-curriculum";
import { buildQuestion, isCodeWorded, ITEMS_SCHEMA, kindProblem, relationWordings, type BuiltQuestion, type QuestionCheck, type SlotWording } from "@/lib/workbook-generator-items";
import { isOneMoreLessSkill } from "@/lib/number-words";
import { solveCheck, solveReason, type SolveLog, type Solver, type SolveVerdict } from "@/lib/workbook-solve-check";
import { digestOf } from "@/lib/workbook-digest";
import { BOYS, fillFrame, frameDoes, framePair, framesFor, GIRLS, PEOPLE, THINGS, quantityStoryProblem, storyProblem, type Action, type WordingKind } from "@/lib/workbook-wording";
import {
  bookPageContent, dayPageContent, layoutDayPage, mistakesFor, levelSigns, rangeProblem, samFix, samProblem, skillRange, slotRanges, PANEL_SLOTS, SLOT_FORMATS, STRICT_SLOTS,
  type DayLayout, type NumberRange,
} from "@/lib/workbook-book";
import { pageId, type Omission, type PageContent, type SlotName } from "@/lib/workbook-page";
import type { PageType, PlannedPage, PlannedPart, WorkbookPlan } from "@/lib/workbook-plan";
import { workbookEditItem } from "@/lib/workbook-edit-item";
import type { DraftPage } from "@/lib/workbook-render";
import { textRoom } from "@/lib/workbook-template";

import { checkWholeBook, type BookQuality } from "@/lib/workbook-quality";
import { buildPlannedItem, planItem, itemExamples, ITEM_EXAMPLES, type ItemPlan } from "@/lib/workbook-item-plan";

/** The item pipeline uses the day schedule; the public schedule replaces this adapter after #479. */
function contractFor(input: GenerateInput, w: PageWork, slot: Slot, attempt = 0): ItemPlan | null {
  if (attempt === 0 && slot.contract !== undefined) return slot.contract;
  const skill = slot.aim?.skill ?? slot.part.skills[((Number(slot.id.split(".")[1]) || 1) - 1) % slot.part.skills.length];
  if (!skill) return null;
  const max = skillRange(input.curriculum, input.plan.level, skill).max;
  const cap = Math.max(5, Math.floor(max * (w.day <= 3 ? 0.5 : w.day <= 7 ? 0.75 : 1)));
  const format = slot.place === "spot-the-error" ? "spot-the-error" : slot.place === "solve-it-two-ways" ? "two-ways" : slot.place === "mixed-set" ? "tick-and-number" : "write-number";
  return planItem({ skill, slot: slot.id, level: input.plan.level, day: w.day, ordinal: w.number * 31 + (Number(slot.id.split(".")[1]) || 1),
    range: { min: slot.place === "challenge" ? cap : w.day >= 8 ? Math.floor(cap * 0.7) : 1, max: Math.min(max, cap), pictures: w.day <= 3, help: w.day <= 3 ? "full" : w.day <= 7 ? "partial" : "none" },
    story: !!slot.place && STORY_CHECK_PLACES.has(slot.place), explain: slot.place === "how-do-you-know" || slot.place === "in-your-head", format, attempt });
}
const unapprovedBuild = (): BuiltQuestion => ({ package: null, stepIds: [], check: { status: "failed", reason: "this skill has no approved question type; add and review its item builder" } });

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
  /**
   * Its AI attempts: 1, then one more for each reason it was written again: a failed check, and a page that did not
   * fit. Never more than 3.
   */
  attempts: 1 | 2 | 3;
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
  /**
   * Planned items the page has no room for, with why: from the layout (pageSlots), and the questions the fit check left
   * out (`leftOut`); only on a day page that leaves some out.
   */
  omissions?: Omission[];
  /** Questions left out because the page had no room for them after its shorter rewrite, in the order they went. */
  leftOut?: LeftOut[];
}

/** A question the page left out to fit: its slot, part, text and the fit problem that named it. */
export interface LeftOut {
  slot: string;
  part: PlannedPart["kind"];
  text: string | null;
  reason: string;
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
  quality?: BookQuality;
  counts: { pages: number; questions: number; checked: number; notChecked: number; failed: number; failedPages: number };
}

/**
 * The shape version of a stored GeneratedWorkbook. Raise it when the shape changes. Version 2 (#380): a question may
 * have 3 attempts, a page may have `leftOut`, and a package may hold the missing-addend kind (count-up steps), which
 * code before it cannot compute. A version 1 draft is a version 2 draft too, so both are read.
 */
export const GENERATED_DRAFT_VERSION = 2;
/** The stored shape versions this code reads. */
export const READABLE_DRAFT_VERSIONS: readonly number[] = [1, 2];

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
  /** Versioned item policy. Old stored runs keep their original pipeline. */
  itemPolicy?: "approved-v1";
}

/**
 * Where finished day pages are kept while a run works (#312), so a run that stops (a time limit) resumes without
 * writing them again. `save` throws when the run may no longer write: the generation stops.
 */
export interface PageStore {
  /** The day pages already finished for this draft. */
  load(): Promise<GeneratedPage[]>;
  save(page: GeneratedPage): Promise<void>;
}

/**
 * The AI attempts each question slot and worked example has used, kept outside this call (#312, R379-2-1, R379-3-1).
 * `use` asks to count one attempt of each slot before the AI call that makes it and answers the slots it refused (a
 * slot that used `max`); a refused slot is not asked. So a later call that goes on after an error or a crash never gives
 * a slot more than `max`, even when its page was never stored. Keys are "<book page>:<slot>" ("e1" for a worked
 * example). `use` throws when the run may no longer write: the generation stops.
 */
export interface AttemptLedger {
  /** The AI attempts a slot may use in all. */
  readonly max: number;
  load(): Promise<Map<string, number>>;
  use(page: number, slots: string[]): Promise<{ refused: string[] }>;
}

/** What one AI call of a page asked (R379-8-2): its name, and the slots and panels it covered, in order. */
export interface CallAsk {
  name: string;
  slots: string[];
  panels: string[];
}

/**
 * One AI call of a day page as it came back (#312, R379-7-1): what it asked (`ask`), its questions and worked examples
 * built and checked by code, before the solve check (R379-8-1: the solve checks are kept one by one, see CallStore),
 * the slots and panels it did not ask (refused), and the attempts each slot and panel it counted had used once counted.
 * Holds only what the AI wrote and code built from it: the AI is never told the child's name (pageRequest), so no call
 * holds it.
 */
export interface StoredCall {
  ask: CallAsk;
  built: BuiltQuestion[];
  examples: BuiltQuestion[];
  refused: string[];
  tries: Record<string, number>;
}

/**
 * Where each AI call of a day page is kept as soon as it comes back (#312, R379-7-1), keyed by its book page and its
 * place in that page's calls (`seq`: 0 the first call, then the redo, then the shorter rewrite). A later call replays
 * a page's kept calls instead of asking the AI again. The call is kept before its solve checks start, and each solve
 * check as it comes back, under its key (solveKey: the call's key and the question's slot or panel; one check reads
 * every box of its question at once), so a replay runs only the checks with no kept result (R379-8-1). `save` and
 * `saveSolve` throw when the run may no longer write: the generation stops. The first call or check kept at a key stays.
 */
export interface CallStore {
  /** The kept calls of these book pages. */
  load(pages: number[]): Promise<{ page: number; seq: number; call: StoredCall }[]>;
  save(page: number, seq: number, call: StoredCall): Promise<void>;
  /** The kept solve checks' verdicts by key, of these book pages. */
  solves(pages: number[]): Promise<Map<string, SolveVerdict>>;
  saveSolve(key: string, log: SolveLog): Promise<void>;
}

/** A solve check's key (R379-8-1): "<book page>:<call seq>:<slot or panel>", as "14:0:1.2" or "14:1:e1". */
export const solveKey = (page: number, seq: number, id: string) => `${page}:${seq}:${id}`;

/**
 * What a resume found kept that does not fit the book this input plans (R379-8-2): a page, an attempt, a call or its
 * answers of another plan. The generation stops and writes nothing more; trying again gives the same answer.
 */
export class ResumeMismatch extends Error {}

export class WriterPersistenceError extends Error {}

export interface GenerateDeps {
  /** Durable dispatches and results for edit writers and solves. */
  editCall?: EditCall;
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
  /**
   * The solve check (round 7): reads each printed question whose words the AI wrote and answers it; a question it does
   * not answer as the key does fails. The live one is a small model (aiSolver), the fake answers from the key.
   */
  solver: Solver;
  /** The time limit of one solve check; 60 seconds when not given. A late check fails its question. */
  solveTimeLimitMs?: number;
  /** Called after each solve check that ran (a kept one replayed is not), to log it. */
  onSolve?(log: SolveLog): void;
  /** The time in milliseconds, for the solve log only; none when not given. */
  now?(): number;
  /** Finished pages kept for a resume (#312); none when not given. */
  pages?: PageStore;
  /** The attempts used before this call (#312); none when not given (no limit past the generator's own). */
  attempts?: AttemptLedger;
  /** Each page's AI calls, kept for a resume (R379-7-1); none when not given (nothing is replayed). */
  calls?: CallStore;
  /** Asked before each day page starts: true stops starting pages (a time budget); the result is "paused". */
  stop?(): boolean;
}

export type GenerateResult =
  | { status: "stored"; draft: GeneratedWorkbook }
  /** `stop` said to stop before every day page was done: call again with the same input and page store to go on. */
  | { status: "paused"; done: number; total: number }
  | { status: "refused"; reason: string };

const TIME_LIMIT_MS = 180_000;
const SOLVE_TIME_LIMIT_MS = 60_000;

/** A question slot of a day page: in a laid-out book, also its template slot and that slot's index in the layout. */
interface Slot {
  id: string;
  part: PlannedPart;
  place: SlotName | null;
  layoutSlot: number;
  contract?: ItemPlan | null;
  /** The skill and the kind of question code chose for the slot (#380): the skill's kinds in turn through the book. */
  aim?: { skill: string; kind: QuestionKind; orElse: QuestionKind[] };
  /**
   * The numbers and the person code chose for the slot (#380, round 5), planned across the whole book: `use`, a pair no
   * other slot of the page has and the book has not used for this kind, if it can; `spare`, another such pair for a redo
   * after a repeat; `name`, a person's name (never Sam, the child of Spot the error).
   */
  planned?: {
    use: number[] | null; spare: number[] | null; name: string | null; say?: string | null; spareSay?: string | null;
    /** The thing the slot's wording counts (round 7), and the people and things the AI may choose from instead. */
    thing?: string; names?: string[]; things?: string[];
    /** What the planned wording works (round 6): its operation, and the picture it names; the same for the spare. */
    does?: PlannedDoes | null; spareDoes?: PlannedDoes | null;
  };
}

/** What a planned wording works: its operation on whole numbers, and its picture (what a missing part's shows). */
interface PlannedDoes {
  operation: { kind: "add" | "subtract" | "missing-addend"; operands: [number, number] };
  figure: "ten-frame" | "dots" | null;
  figureShows: "part" | "total" | null;
}

/** The kinds of question code turns through for a skill, so its questions differ (#380). */
export const QUESTION_KINDS = ["story", "picture", "fact", "missing-part", "sequence", "order", "relation", "pattern", "draw"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** What each kind asks, for the AI. */
const KIND_WORDS: Record<QuestionKind, string> = {
  story: "a short story with a person and things, asking for a number (write-number with an operation)",
  picture: "the child reads a picture (figure dots or ten-frame): a count, or a sum the picture shows",
  fact: "a bare fact with no story: '6 + 3 = ?', 'What is 1 more than 6?'",
  "missing-part": "a missing part (missing-addend): '4 and what make 9?', 'How far is 7 from 10?'",
  sequence: "the sequence format: missing numbers in a count",
  order: "the order format: 2 to 4 numbers to put in order",
  relation: "the relation format: the child circles one of two choices code writes (less than 5 or not; close to 0 or 10; equal or not; which has more)",
  pattern: "the pattern format",
  draw: "the draw format: the child draws, a parent checks",
};

/**
 * The kinds of question a skill takes, from its words, in the order code turns through them. A relation comes first
 * for a skill about less than, close to, equal or more; a count for a skill about how many; a story for adding and
 * taking away.
 */
export function kindsOf(text: string): QuestionKind[] {
  const t = text.toLowerCase();
  if (/less than \d|benchmark|close to/.test(t)) return ["relation", "picture", "missing-part", "relation", "story"];
  if (/\bequal\b|balance/.test(t)) return ["relation", "missing-part", "story", "relation", "picture"];
  if (/compare|which has more|greater|which group has more/.test(t)) return ["relation", "picture", "order", "story"];
  if (/\border\b/.test(t)) return ["order", "sequence", "relation"];
  // No missing part on 1 more and 1 less: its missing part is always the 1 the text names (round 5).
  if (/1 more|2 more|more and \d|less than a quantity/.test(t)) return ["fact", "story", "picture", "sequence"];
  if (/before or just after|sequence|count forward|count on|count back|skip-count|count to/.test(t)) return ["sequence", "fact", "picture"];
  if (/make 5|make 10|part|decompose|ways to make|partners/.test(t)) return ["missing-part", "picture", "story", "fact"];
  if (/pattern/.test(t)) return ["pattern", "draw"];
  if (/how many|count|subitize|frame|numeral|graph/.test(t)) return ["picture", "story", "draw", "fact"];
  if (/add|take|subtract|change|purchase|total|sum|double|fact/.test(t)) return ["story", "picture", "fact", "missing-part"];
  return ["draw", "story"];
}

/** Places whose format is fixed by their layout: code chooses no kind there. */
const FIXED_KIND_PLACES: ReadonlySet<SlotName> = new Set<SlotName>([
  "warm-up", "spot-the-error", "solve-it-two-ways", "mixed-set", "how-do-you-know", "fix-it", "challenge", "math-in-the-world", "in-your-head", "try-first",
]);

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

// ---------- The book plan: kinds, numbers and names (#380) ----------

/** The most numbers a sequence has on a parent-led card (U1 to U3): more wrap to a second line, and the page overflows. */
const PARENT_SEQUENCE_MOST = 5;
/** The kinds of question code plans numbers for: each has an operation, or a relation of one or two numbers. */
const NUMBERED_KINDS: ReadonlySet<QuestionKind> = new Set<QuestionKind>(["story", "picture", "fact", "missing-part", "relation"]);
/** Planned numbers stop at this range: beyond it the book has enough sums not to repeat, and the vary number does. */
const PLANNED_MAX = 20;

/** A fixed order of the candidates for a skill (a hash, never Math.random), so a book does not start at 1 + 1. */
const hashOf = (key: string) => {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
};

/**
 * The number pairs a slot may take for a kind on a skill, or null when code plans none (a range past PLANNED_MAX or not
 * of whole numbers). A sum's parts a + b (each from 1, the total at most the max); on a skill about 1 (or 2) more and
 * less, a and the 1 (or 2); a relation's two different numbers, never the halfway of a benchmark skill.
 */
function numberChoices(skill: string, text: string, kind: QuestionKind | "spot", r: NumberRange): number[][] | null {
  if (r.max > PLANNED_MAX || r.max < 2 || r.fractions || r.decimals || r.negatives) return null;
  const t = text.toLowerCase();
  const pairs: number[][] = [];
  if (kind === "relation") {
    const benchmark = /less than \d|benchmark|close to/.test(t);
    for (let a = 0; a <= r.max; a++) for (let b = 1; b <= r.max; b++) if (a !== b && !(benchmark && (a === 5 || 2 * a === r.max))) pairs.push([a, b]);
  } else {
    const step = /two-more-less|2 more/.test(`${skill} ${t}`) ? 2 : isOneMoreLessSkill(skill) || /1 more/.test(t) ? 1 : null;
    if (step && kind !== "missing-part") for (let a = 1; a + step <= r.max; a++) pairs.push([a, step]);
    else for (let a = 1; a < r.max; a++) for (let b = 1; a + b <= r.max; b++) pairs.push([a, b]);
  }
  return pairs.length ? pairs.sort((x, y) => hashOf(`${skill}:${x}`) - hashOf(`${skill}:${y}`)) : null;
}

/** Spot the error's sum is a bare sum, as a fact is: they share the book's pairs, so "5 + 1 = ?" is not asked twice. */
const group = (kind: QuestionKind | "spot") => (kind === "spot" ? "fact" : kind);

/** The wordings of a sequence (missing numbers), with no number in them. */
const SEQUENCE_FRAMES = [
  "Fill in the missing numbers.", "What numbers are missing?", "Count up. Fill in the boxes.", "Write the numbers that go in the gaps.",
  "Count on. Which numbers are missing?", "Find the missing numbers in the count.", "Count on. Write the numbers you skip.",
];

/**
 * Plans every slot of the book in book order (#380): its skill and kind of question (each skill's kinds in turn, and on
 * a page a skill takes another kind before it takes one again), its numbers and a person's name. A page's slots never
 * share a pair of numbers (in either order); across the book each kind takes the pair it has used least. Spot the
 * error slots take numbers too: Sam's sum.
 */
function planBook(input: GenerateInput, work: PageWork[]) {
  const { curriculum, plan } = input;
  const child = input.book?.child.toLowerCase();
  const people = PEOPLE.filter((n) => n.toLowerCase() !== child);
  const turns = new Map<string, number>();
  const used = new Map<string, number>();
  const frameUse = new Map<string, number>();
  const said = new Set<string>();
  const bookActs = new Map<Action, number>();
  const shapeUse = new Map<string, number>();
  const spotPairs = new Set<string>();
  const things = THINGS;
  let person = 0;
  let thing = 0;
  for (const w of work) {
    const inPart = new Map<PlannedPart, number>();
    const pageKinds = new Set<string>();
    const pagePairs = new Set<string>();
    const pageFrames = new Set<string>();
    // What each template slot's cards ask so far (round 6), by the slot's index in the layout.
    const slotActs = new Map<number, Map<Action, number>>();
    const pageShapes = new Set<string>();
    const pageNumbers = new Map<number, number>();
    for (const slot of w.slots) {
      const k = inPart.get(slot.part) ?? 0;
      inPart.set(slot.part, k + 1);
      if (!slot.place || slot.part.skills.length === 0) continue;
      let numbered: { skill: string; kind: QuestionKind | "spot" } | null = null;
      if (slot.place === "spot-the-error") {
        // Sam's sum: on the slot's skill with the widest range, so the sum fits each of its rules.
        const skill = [...slot.part.skills].sort((a, b) => skillRange(curriculum, plan.level, b).max - skillRange(curriculum, plan.level, a).max)[0];
        numbered = { skill, kind: "spot" };
      } else if (!FIXED_KIND_PLACES.has(slot.place)) {
        const skill = slot.part.skills[k % slot.part.skills.length];
        const kinds = kindsOf(curriculum.skill(skill)?.text ?? skill).filter((x) => slot.place === "picture-stories" || slot.place === "word-problems" ? x === "story" || x === "picture" || x === "missing-part" : true);
        if (kinds.length > 0) {
          const n = turns.get(skill) ?? 0;
          // The skill's next kind this page has not asked on it yet (all asked: the next in turn).
          const step = kinds.findIndex((_, j) => !pageKinds.has(`${skill}|${kinds[(n + j) % kinds.length]}`));
          const kind = kinds[(n + Math.max(0, step)) % kinds.length];
          turns.set(skill, n + Math.max(0, step) + 1);
          pageKinds.add(`${skill}|${kind}`);
          slot.aim = { skill, kind, orElse: [...new Set(kinds)].filter((x) => x !== kind) };
          if (NUMBERED_KINDS.has(kind)) numbered = { skill, kind };
        }
      }
      let pair: number[] | null = null;
      let spare: number[] | null = null;
      if (numbered) {
        const choices = numberChoices(numbered.skill, curriculum.skill(numbered.skill)?.text ?? numbered.skill, numbered.kind, skillRange(curriculum, plan.level, numbered.skill));
        const bond = (p: number[]) => [...p].sort((a, b) => a - b).join(",");
        // The pair whose numbers the page prints least first, a number printed twice costing more (round 6: not "1 cat", "1 dot" and "1 red
        // button" on one page), then the pair its kind has used least.
        const seen = (p: number[]) => [p[0], p[1], p[0] + p[1]].reduce((n, x) => n + (pageNumbers.get(x) ?? 0) ** 2, 0);
        const ranked = (choices ?? []).filter((p) => !pagePairs.has(bond(p)))
          .map((p, j) => ({ p, j, n: used.get(`${group(numbered.kind)}|${p}`) ?? 0, s: seen(p) }))
          .sort((a, b) => a.s - b.s || a.n - b.n || a.j - b.j);
        // Spot the error prints its bare sum (round 7): a sum no Spot the error of the book has had, while there is one.
        if (numbered.kind === "spot" && ranked.some((x) => !spotPairs.has(`${x.p}`))) ranked.splice(0, ranked.length, ...ranked.filter((x) => !spotPairs.has(`${x.p}`)));
        // And one no bare fact of the book has printed yet, while there is one ("5 + 4 = ?" is a fact's wording too).
        if (numbered.kind === "spot" && ranked.some((x) => x.n === 0)) ranked.splice(0, ranked.length, ...ranked.filter((x) => x.n === 0));
        pair = ranked[0]?.p ?? null;
        if (pair && numbered.kind === "spot") spotPairs.add(`${pair}`);
        spare = ranked.find((x) => pair && bond(x.p) !== bond(pair))?.p ?? null;
        if (pair) {
          used.set(`${group(numbered.kind)}|${pair}`, (used.get(`${group(numbered.kind)}|${pair}`) ?? 0) + 1);
          pagePairs.add(bond(pair));
          if (spare) pagePairs.add(bond(spare));
        }
      }
      const name = slot.place === "spot-the-error" ? null : people[person++ % people.length];
      // Each named slot's thing, in turn (round 7): its wording counts it, whether planned here or written by code later.
      const thingHere = name ? things[thing++ % things.length] : null;
      // Outside practice a book asks one shape of question at most SHAPE_MOST times (duplicateProblem): so does the plan.
      const practice = PRACTICE_PLACES.has(slot.place);
      const withinShapes = (text: string) => practice || !shapeOf(text) || (shapeUse.get(shapeOf(text)) ?? 0) < SHAPE_MOST;
      const countShape = (text: string) => { if (!practice && shapeOf(text)) shapeUse.set(shapeOf(text), (shapeUse.get(shapeOf(text)) ?? 0) + 1); };
      // The wording: a frame of the kind, filled with the numbers, the name and a thing, within the slot's room. A slot
      // of several cards spreads them across what they ask (round 6): the action it has asked least first, then the
      // one the book has asked least, so no action takes more than its share of the cards.
      let say: string | null = null;
      let spareSay: string | null = null;
      let does: PlannedDoes | null = null;
      let spareDoes: PlannedDoes | null = null;
      if (numbered && numbered.kind !== "spot" && numbered.kind !== "relation" && name) {
        const range = skillRange(curriculum, plan.level, numbered.skill);
        const room = roomOf(input, slot.place, w.day)?.characters ?? Infinity;
        const text = curriculum.skill(numbered.skill)?.text ?? numbered.skill;
        const step = /two-more-less|2 more/.test(`${numbered.skill} ${text}`) || isOneMoreLessSkill(numbered.skill) || /1 more/.test(text.toLowerCase());
        const acts = slotActs.get(slot.layoutSlot) ?? new Map<Action, number>();
        slotActs.set(slot.layoutSlot, acts);
        const bond = (p: number[]) => [...p].sort((x, y) => x - y).join(",");
        // At most a third of a slot's cards ask one thing (2 of 6), when the level has that many things to ask.
        const cap = Math.max(1, Math.ceil(w.slots.filter((x) => x.layoutSlot === slot.layoutSlot).length / 3));
        const own = numbered.kind as QuestionKind;
        // On a page of stories, a card whose kind has nothing left under the cap borrows a wording of the slot's other
        // story kinds (a story for a picture), and takes that kind.
        const storyPlace = slot.place === "picture-stories" || slot.place === "word-problems";
        const kindsHere = [own, ...(storyPlace ? (slot.aim?.orElse ?? []).filter((k) => k === "story" || k === "picture" || k === "missing-part") : [])];
        const pick = (pairNow: number[] | null, thingNow: string, not: number[] | null = null, limit = true) => {
          if (!pairNow) return null;
          // A page of stories takes stories only (D-201: a person and real things), never a bare "9 + ? = 10".
          const frames = kindsHere.flatMap((k, o) => framesFor(k, step, range.subtraction).map((f) => ({ f, k, o })))
            .filter((x) => !storyPlace || x.f.f.includes("{name}"));
          const fills = frames.map((x, j) => ({ ...x, j, n: frameUse.get(x.f.f) ?? 0, a: acts.get(x.f.act) ?? 0 }))
            .filter((x) => !pageFrames.has(x.f.f))
            .sort((a, b) => Number(a.a >= cap) - Number(b.a >= cap) || a.o - b.o || a.a - b.a || (bookActs.get(a.f.act) ?? 0) - (bookActs.get(b.f.act) ?? 0)
              || a.n - b.n || hashOf(`${slot.id}:${w.number}:${a.j}`) - hashOf(`${slot.id}:${w.number}:${b.j}`))
            .flatMap((x) => {
              const numbers = framePair(x.f, pairNow);
              if (!numbers || numbers[0] + numbers[1] > range.max) return [];
              // A missing part to 10 changes the numbers: never to a pair another slot of the page (or `not`) has.
              if (bond(numbers) !== bond(pairNow) && (pagePairs.has(bond(numbers)) || (not && bond(numbers) === bond(not)))) return [];
              return [{ frame: x.f, kind: x.k, numbers, said: fillFrame(x.f.f, { a: numbers[0], b: numbers[1], t: numbers[0] + numbers[1] }, name, thingNow) }];
            })
            .filter((x) => x.said.length <= room && !said.has(x.said) && !pageShapes.has(shapeOf(x.said)) && (!limit || withinShapes(x.said)));
          // Late in the book every shape may be used 3 times (round 7): then the shape the book has used least, so a
          // slot never runs out of planned wordings.
          if (!limit) return fills.sort((a, b) => (shapeUse.get(shapeOf(a.said)) ?? 0) - (shapeUse.get(shapeOf(b.said)) ?? 0))[0] ?? null;
          return fills[0] ?? null;
        };
        const chosen = pick(pair, thingHere!) ?? pick(pair, thingHere!, null, false);
        if (chosen) {
          say = chosen.said;
          if (slot.aim && chosen.kind !== slot.aim.kind) slot.aim = { ...slot.aim, kind: chosen.kind, orElse: [slot.aim.kind, ...slot.aim.orElse.filter((k) => k !== chosen.kind)] };
          does = frameDoes(chosen.frame, chosen.numbers);
          frameUse.set(chosen.frame.f, (frameUse.get(chosen.frame.f) ?? 0) + 1);
          acts.set(chosen.frame.act, (acts.get(chosen.frame.act) ?? 0) + 1);
          bookActs.set(chosen.frame.act, (bookActs.get(chosen.frame.act) ?? 0) + 1);
          pageFrames.add(chosen.frame.f);
          pageShapes.add(shapeOf(chosen.said));
          countShape(chosen.said);
          said.add(chosen.said);
          // A missing part to 10 works a and 10 - a: those are the slot's numbers now.
          if (pair && chosen.numbers.join() !== pair.join()) {
            pair = chosen.numbers;
            pagePairs.add(bond(pair));
          }
        }
        // The spare's wording is for a redo only: it takes no frame from the page's other slots.
        const other = pick(spare, things[(thing + 7) % things.length], pair) ?? pick(spare, things[(thing + 7) % things.length], pair, false);
        if (other) {
          spare = other.numbers;
          spareSay = other.said;
          spareDoes = frameDoes(other.frame, other.numbers);
          // Kept for the redo: no later slot takes the same words.
          said.add(other.said);
        }
      }
      // A sequence names no number in its text (code can then fit it to a card): only its wording is planned.
      if (slot.aim?.kind === "sequence") {
        const room = roomOf(input, slot.place, w.day)?.characters ?? Infinity;
        const frame = SEQUENCE_FRAMES.map((f, j) => ({ f, j, n: frameUse.get(f) ?? 0 })).filter((x) => !pageFrames.has(x.f) && x.f.length <= room && withinShapes(x.f)).sort((a, b) => a.n - b.n || a.j - b.j)[0]?.f;
        if (frame) {
          say = frame;
          frameUse.set(frame, (frameUse.get(frame) ?? 0) + 1);
          pageFrames.add(frame);
          countShape(frame);
        }
      }
      // The numbers a card may print: both numbers and their total (a take-away and a missing part print it).
      if (pair && numbered?.kind !== "spot") for (const x of [pair[0], pair[1], pair[0] + pair[1]]) pageNumbers.set(x, (pageNumbers.get(x) ?? 0) + 1);
      const offered = <T,>(xs: T[], at: number) => [0, 1, 2].map((k) => xs[(at + k * 5) % xs.length]);
      slot.planned = {
        use: pair, spare, name, say, spareSay, does, spareDoes,
        ...(name && thingHere ? { thing: thingHere, names: offered(people, people.indexOf(name)), things: offered(things, things.indexOf(thingHere)) } : {}),
      };
    }
  }
}

/** A package with Sam (Spot the error's child) renamed: the slot's planned name, or one its pronouns fit, not in its text. */
function withoutSam(p: QuestionPackage, planned: string | null): QuestionPackage {
  const json = JSON.stringify(p);
  if (!/\bSam\b/.test(json)) return p;
  const text = `${p.text} ${p.easierExample?.text ?? ""}`;
  const free = (names: string[]) => names.find((n) => !new RegExp(`\\b${n}\\b`).test(json));
  const he = /\b(he|him|his)\b/i.test(text);
  const she = /\b(she|her|hers)\b/i.test(text);
  const fits = (n: string | null) => n && !new RegExp(`\\b${n}\\b`).test(json) && (he ? BOYS.includes(n) : she ? GIRLS.includes(n) : true);
  const name = fits(planned) ? planned! : (he ? free(BOYS) : she ? free(GIRLS) : free(PEOPLE)) ?? "Ben";
  return JSON.parse(json.replace(/\bSam\b/g, name)) as QuestionPackage;
}

/**
 * The AI's item with a sequence short enough for a parent-led card (U1 to U3): at most PARENT_SEQUENCE_MOST numbers, the
 * window with the most blanks (and one number printed). Only when the text names no number, which a window would change.
 */
function shortSequence(raw: unknown, level: number): unknown {
  if (level > 3 || typeof raw !== "object" || raw === null) return raw;
  const r = raw as { text?: unknown; sequence?: { start?: { type?: string; value?: number }; step?: { type?: string; value?: number }; terms?: unknown; blanks?: unknown } | null };
  const s = r.sequence;
  if (!s || typeof r.text !== "string" || /\d/.test(r.text) || typeof s.terms !== "number" || s.terms <= PARENT_SEQUENCE_MOST || !Array.isArray(s.blanks)) return raw;
  if (s.start?.type !== "number" || s.step?.type !== "number" || typeof s.start.value !== "number" || typeof s.step.value !== "number") return raw;
  const blanks = s.blanks.filter((b): b is number => Number.isInteger(b));
  let best: { at: number; n: number } | null = null;
  for (let at = 0; at + PARENT_SEQUENCE_MOST <= s.terms; at++) {
    const n = blanks.filter((b) => b >= at && b < at + PARENT_SEQUENCE_MOST).length;
    if (n >= 1 && n < PARENT_SEQUENCE_MOST && (!best || n > best.n)) best = { at, n };
  }
  if (!best) return raw;
  const { at } = best;
  return {
    ...r,
    sequence: {
      ...s, start: { ...s.start, value: s.start.value + at * s.step.value }, terms: PARENT_SEQUENCE_MOST,
      blanks: blanks.filter((b) => b >= at && b < at + PARENT_SEQUENCE_MOST).map((b) => b - at),
    },
  };
}

const SYSTEM = [
  "You write the questions of one page of a printed math workbook for a child in British Columbia, Canada.",
  "Fill every slot listed, one item per slot, with the slot's id. Use only the skills the slot names.",
  "A slot may name its place on the page (now-you, word-problems, mixed-set, ...) and the formats that place takes: use one of those formats.",
  "A slot may give its numbers: for each skill, the range of that skill's own level. Every number of an item on that skill is at most its max: the numbers in its text, the operation's numbers, the answer, every wrong answer, the easier example's numbers and answer, and every number in its sequence, places, comparison, choices and picture. None is negative unless its negatives is true, none is a fraction (1/2) unless its fractions is true, none is a decimal unless its decimals is true, and none is a percent unless its percents is true; no subtraction sign (-) unless its subtraction is true, no × (nor x as a times sign, nor '3 groups of 2', 'lots of' or 'rows of' unless the skill is about groups or skip-counting) unless its multiplication is true, no ÷ unless its division is true, and no < or > unless its comparison is true; a:b is a clock time (3:30) only when its time is true, and anywhere else a ratio, so off a time skill write a time as 3 o'clock; coin values and amounts with cents only when its money is true. So a review of an earlier skill uses that skill's small numbers.",
  "Write every number in digits. Never write numbers as words: 12, not twelve; -3, not minus three; 0.5, not zero point five; 1/2, not half; 50%, not fifty percent; 3:30, not half past three. The only number words allowed are order words (first, second, third), 'which one', 'each one', 'this one', 'that one', 'the one', place names (the tens digit, the ones place, 3 tens), ten-frame and five-frame, 'one more' and 'one less' on a skill about them, and the quarter coin on a money skill.",
  "The question text and the easier example's text use only plain ASCII letters and digits, spaces, the punctuation . , ? ! ' \" - : ( ) $ ¢ % / and the signs + = × ÷ < >. Write minus as -, never as a special character; never use ½, ⅓, superscripts or other special characters, and only plain ASCII names. Each number takes one of these forms, with no space inside: 345, 12,500, 0.5, 1/2, 50%, 3:30 (a clock time, on a time skill), 3:4 (a ratio), $4.75, 25¢, and -3 for a negative number.",
  "On the spot-the-error place, the question text is the sum only, such as '5 + 2 = ?' (Sam's work is printed above it). Pick one mistake from the slot's mistakes: write a sum it can happen on (its 'when'), give Sam's wrong answer as exactly what that mistake makes, put the mistake's name as that wrong answer's cause, and set its step as the mistake's 'step' says. Code writes Sam's steps.",
  "You write content only: the question text, the operation's numbers, expected wrong answers with their causes, an easier example of the same operation, and an item format from the list. The page's layout, fonts, sizes and positions are fixed by the template; never describe them.",
  "Never write the answer or the worked steps: code computes them from the operation. Give the operation as data: its kind and operands (numbers, fractions, amounts with units, clock times), or for evaluate and solve the expression.",
  "Each wrong answer is a mistake a child makes, with a short cause id (a misconception id such as O3 when the input names one, else a short word such as 'operation'), a plain description, and the worked step where it happens: a column's place ('ones', 'tens', 'hundreds') or null when it is not one step.",
  "The easier example is the same operation kind with smaller numbers or fewer steps, and a different answer (never the question's answer, never the question with its numbers swapped). With as many digits, sort both sets of numbers from least to greatest: each number of the easier example is no larger than the question's at its place, and one is smaller. For 4 + 3: 2 + 3 or 1 + 2, never 5 + 1 or 4 + 3. For 2 + 1 it is 1 + 1.",
  "Formats with an operation: write-number (one answer box); show-work (answer box and work box: stories, challenges); two-ways (Solve it two ways: Method 1 and Method 2); tick-and-number (Mixed set: tick the operation, write the answer; +, −, × or ÷ only); spot-the-error (Sam's wrong work shows one of your wrong answers: give its index in shownWrong); number-line (hop on a number line, then write where you land: + or − of whole numbers).",
  "Formats with no operation (set operation, easier and wrongAnswers to null and empty; code computes every answer): places (one number in numbers; places lists the places to ask, or null for all: 'How many tens and ones?'); order (2 to 6 numbers in numbers, direction up or down); compare (two numbers in numbers: tick or circle <, > or =); sequence (sequence: the first number, the step, how many terms and which terms from 0 are blanks: missing numbers, skip-counting); count (the picture's counts in numbers, with a figure: 'How many dots?'); pattern (pattern: the core that repeats, how many shapes are shown, and which one from 0 is the blank: 'What comes next?').",
  "Formats a parent checks: written-reason (How do you know?); draw (Draw 6 dots; make a set). No operation, no figure.",
  "Pictures: figure names a picture kind (dots, ten-frame, number-line, base-ten, array) or null. Code draws it from the operation (dots for 3 + 4 are 3 and 4 dots; an array for 3 × 4) or from numbers (count: dots take each group, a ten-frame each part, base-ten the hundreds, tens and ones, an array the rows and columns); you never draw, size or place it. Picture stories below U10 should have dots or a ten-frame with small whole numbers.",
  "Keep to the part's kind: practice builds from easy to harder in small changes; Fix it uses new numbers on the skills listed, never a question named in 'avoid'; Friday 5, mini-tests and the level test have no hints.",
  "Stories and every quantity-of-things question on practice and review pages, at every level, use plain story language; bare number sentences and pure equations stay as equations; code checks it and a story that breaks a rule is written again: (1) every story has a person, the slot's planned name, and real things: 'Gus has 2 plums.', never bare counts such as '2 plums' or '9 dots'; (2) one action per sentence: 'He finds 5 more.'; (3) the question names the counted thing again and says 'now' or asks plainly: 'How many plums does Gus have now?', never 'in all', 'altogether', 'total' or 'left over'; (4) things only do what they really can: '9 frogs. 7 hop away.' is fine, '9 dots. 7 hop off.' is wrong; (5) keep the math words the curriculum teaches (ten-frame, take away, equal groups, and so on): simplify only the everyday words.",
  "Copy: short plain sentences a child can read; Canadian English (Mom, metre, litre, colour); money in Canadian dollars and cents; never a school grade, a brand name, or a prompt to scan or call anyone; no last names.",
  "Room: a slot may give its room: the most characters its question text has room for on the printed page (characters), in lines of about perLine characters. Count the characters of the text, spaces included, and stay within it: the page has no room for more, and nothing is shrunk to fit. Say it in short sentences: 'Gus has 2 plums. He finds 5 more. How many plums does Gus have now?', not a long story. On a card (lines 2 or 3), writing lines (written-reason) or a tall picture (number-line, base-ten) take the place of a line: then write one line at most. A ten-frame on a card is taller than its answer box: with a ten-frame, write one line. A written-reason card's lines take as much room as 2 lines of text, so a page of cards has at most 2 written-reason items. For another question with no number answer (Equal? Which has more?), use draw ('Draw 3 dots and 3 dots. Circle the bigger group.'): a parent checks it and it takes the room of an answer box. A write-number item always needs an operation.",
  "Vary: every page is written alone, and other days practise the same skills. So no two questions of a page are the same, and each slot gives a vary number: make it one of the item's numbers (its first number, its total or its count) when the rules allow, so the pages of different days differ.",
  "Pictures must show what the text says. A dots picture of a subtraction crosses out the dots taken away: use it only for take-away, never to compare two groups (how many more red than blue? has no picture). A missing part's picture shows only the part given. There is no five-frame picture: a five-frame question has no picture.",
  "Aim: a slot may give its aim: a skill and a kind of question code chose for it (what the kind means is in means). Write that kind of question on that skill. Only when that kind cannot ask that skill, use the first kind of orElse that can, or another of the slot's skills.",
  "Relation format: give numbers (one number, or two) and relation: kind less-than (to: [the benchmark], as 'Is 7 less than 5?'), closer (to: [two benchmarks], as 'Is 8 close to 0 or 10?', never halfway), equal (two numbers: 'Equal or not?'), more or fewer (two numbers and labels: one short word for each, as cats and dogs: 'Who has more?'). Code writes the choices the child circles and the answer; the text never says the answer. No < or > signs.",
  "A picture of a missing part shows the part given or the total: say which in figureShows ('Mia has 3 dots. How many more dots make 8?' shows the part, 3; 'Mia has 8 dots. 5 are blue. How many dots are not blue?' shows the total, 8). Any number the text says the picture shows ('8 dots', 'Ten-frame: 8') is what code draws.",
  "One question per item: the text never holds a worked fact or a second task ('5 and 0 more is 5. Show 6.' is not a question). A draw item says what to draw and never asks how many, which number or who; ask which has more with a relation item.",
  "Used up: the request may list usedUp, shapes of question the book already asks 3 times: each an example and its words (the question's lowercase words in order, without numbers, names or other capitalised words). Outside practice, write no question whose lowercase words are exactly one of them: use other words or another kind of question, not only other numbers or names.",
  "Planned: a slot may give planned numbers and a name, chosen by code across the whole book so its questions differ. Build the item on the numbers [a, b]: a sum is a + b; a take-away starts at a + b and takes b away; a missing part has the part a and the total a + b; a picture shows a and b (or a + b in all); 1 more than a is a + 1; a relation uses a (and b); Sam's sum in Spot the error is a + b (or a + b take away b). Keep to them unless a rule of the slot forbids it; then change as little as you can. A person in the question is the planned name. Never name anyone Sam outside Spot the error: Sam is the child whose work Spot the error shows. Planned say is the wording code chose for the slot, with those numbers, that name and a thing to count, so the book's questions do not all sound alike: write the question text as say, word for word, unless a rule of the slot forbids it (then change as few words as you can). Its operation, picture, wrong answers and easier example are of that text: 'Mia has 3 shells. How many more shells make 8?' is missing-addend [3, 8]; 'Mia has 3 counters. She adds 4. How many counters now?' is add 3 + 4 with a ten-frame. With say, planned gives its operation (kind and operands), figure and figureShows: use exactly those. Code checks that the text names the numbers the operation works: an operation of other numbers fails.",
  "Relation format: code writes the question text from your numbers, relation kind, benchmarks and labels (your text is replaced), so get those right: they are what the child reads.",
  "Asked: a slot may list asked, the questions the book already asks on its skills. Never repeat one of them. On this page, no two questions may be the same, work the same sum, or differ only by one number when another kind of question is possible: change the kind (a story, a picture to count, a missing part, a sequence), not only a number.",
  "Examples: the request may list examples. Each is the worked example a panel (worked-example, watch-one, reminder) shows for its own skill: fill it like a slot, with its id and on that skill only, of the kind its aim gives. Give a small sum of the skill (write-number with an operation), or a count, sequence, order or relation item code can show done. It is not printed as a question, so it has no room limit.",
  "A count from one number to another ('Count from 2 to 7', 'Count back from 10 to 1') is the sequence format, starting and ending at those numbers; if the text says 'start at 2', the sequence starts at 2.",
  "On a skill about 1 more and 1 less (or 2 more and 2 less), each item asks one of them: 'What is 1 more than 7?' in one slot, 'What is 1 less than 7?' in another, each with its operation (7 + 1, 7 - 1).",
  "A missing-addend's only worked step is named count: a wrong answer's step is count or null. Every item with an operation has at least one wrong answer and an easier example. Fill every slot and every example you are asked for, each with its own id.",
  "Never give the answer in the text: 'Red 6, blue 4. How many red?' is not a question, and adding or taking away 0 only hands back a number the text gives. At U1 to U3 an order item has 2 to 4 numbers, and a sequence at most 5 (more do not fit a card's line).",
  "A missing number in a list (4, 5, ?, 7) is the sequence format, with the blanks as data: never write _ or a gap in the text.",
  "Rules: a slot may give the rules of each of its skills in plain words: the largest number, the signs and ideas not taught yet, and the formats to leave out. Follow them exactly; they are checked by code, and an item that breaks one is thrown away.",
  "The operation's answer is exactly the number the child writes in the box. A missing part is the missing-addend kind, operands [the part given, the total]: '2 and what make 5?', '3 + ? = 5', 'Mia has 3. How many more make 5?' and 'How far is 7 from 10?' are missing-addend [2, 5], [3, 5], [3, 5] and [7, 10]; code's answer is the missing part (3, 2, 2, 3). Never write them as 2 + 3 (code would print 5 as the answer). It is a number bond, not subtraction, so it is allowed before subtraction is taught; its totals go to 20.",
  "The box takes the operation's number, so a question with an operation asks for that number: never a yes-or-no question (Is 8 close to 10? Are they equal?) or a choice (close to 10 or less than 5?). Ask 'How far is 8 from 10?' instead, or use the draw format.",
  "Printed words (round 7): at U1 to U9 code writes the printed text of an item with a whole-number add, subtract, missing-addend, multiply or divide operation, from your operation and picture: your text is not printed there, so get the operation and the figure right. Set name to one of the slot's planned names and thing to one of its planned things, or null for code's choice; on any other item set both to null. Every other text you write is read by a separate checker who sees only the printed words and picture and answers them: write it so it asks exactly what the answer key answers, with every number it needs.",
  "Before you write an easier example, work out both answers: the easier example's answer is a different number from the question's answer. For a missing part, easier means a smaller missing part (fewer to count on) with a total no larger, so its answer differs: for 3 + ? = 5 (answer 2) it is 3 + ? = 4 (answer 1), never 2 + ? = 4 (answer 2 again); for 'How far is 7 from 10?' (answer 3) it is 'How far is 9 from 10?' (answer 1). So ask a missing part of 2 or more: a missing part of 1 has no easier example. Every item with an operation has an easier example; for the smallest sums take a smaller number: 1 + 1 for 2 + 1, 1 + 0 for 1 + 1.",
  "Binding item contract (#480): a slot with contract has exactly one approved type and a code-built item. Copy every field of contract.item. Change only text. Keep the exact operation, operands, skill and format. Write every given number exactly once per occurrence in contract.numbers, with no extra numbers. Write only stories or explanations. Code writes all drills and worked examples; they are never sent to you. Follow exampleBank for the type and grade band.",
].join("\n");

/** A skill's rules in plain words for the AI, from its number range (skillRange): the checks rangeProblem makes. */
function rangeRules(skill: string, r: NumberRange): string {
  const whole = !r.fractions && !r.decimals && !r.negatives;
  const rules = [
    `Every number is ${whole ? `a whole number from 0 to ${r.max}` : `at most ${r.max}`}: the numbers in the text, the operation's numbers and its answer, every wrong answer, and the easier example's numbers and answer. Leave out a wrong answer that would be bigger (adding by mistake on a take-away often is).`,
  ];
  const no: string[] = [];
  if (!r.subtraction) no.push("subtraction (no subtract operation, no - sign; a missing part such as 2 + ? = 5 is the missing-addend kind, which is allowed)");
  if (!r.multiplication) no.push(r.grouping ? "multiplication (no multiply operation, no × sign)" : "multiplication (no multiply operation, no × sign, no 'groups of')");
  if (!r.division) no.push("division (no divide operation, no ÷ sign, no sharing into equal groups as an operation)");
  if (!r.comparison) no.push("comparison (no < or > anywhere, so never the compare format; to compare two numbers use the order format or ask which is more in words)");
  const ideas = ([["fractions", "fractions"], ["decimals", "decimals"], ["negatives", "negative numbers"], ["percents", "percents"], ["ratios", "ratios"]] as const)
    .filter(([k]) => !r[k]).map(([, name]) => name);
  if (ideas.length) no.push(`${ideas.slice(0, -1).join(", ")}${ideas.length > 1 ? " or " : ""}${ideas.at(-1)}`);
  if (!r.time && !r.ratios) no.push("clock times written with a colon (write 3 o'clock)");
  if (no.length) rules.push(`Not taught yet, so never use: ${no.join("; ")}.`);
  rules.push(`Numbers in digits only. Never write the word "one" (not "one by one", "one side", "one way"; write "a" or reword), except in "which one", "each one", "this one", "that one" and "the one"${isOneMoreLessSkill(skill) ? ", and \"one more\" and \"one less\"" : ""}.`);
  return rules.join(" ");
}

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

function pageRequest(input: GenerateInput, w: PageWork, slots: Slot[], note: string | null, panels: Panel[] = [], memory: BookMemory | null = null, pageTexts: string[] = [], attempt = 0) {
  const { plan, curriculum } = input;
  const { day, page } = w;
  // What the book asked on the skills, and (on a redo) the questions this page keeps.
  const asked = (skills: readonly string[]) => [...new Set([...skills.flatMap((k) => memory?.texts.get(k) ?? []).slice(-40), ...pageTexts])];
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
    ...(input.itemPolicy ? { itemPolicy: input.itemPolicy } : {}),
    level: `U${plan.level}`,
    lead: plan.lead,
    instructions: page.instructions,
    day,
    page: page.number,
    pageType: page.type,
    parts,
    slots: slots.map((s) => {
      if (input.itemPolicy === "approved-v1") {
        const contract = contractFor(input, w, s, attempt);
        return { slot: s.id, skills: contract ? [contract.item.skill] : [], contract, ...(s.place ? { room: roomOf(input, s.place, day) } : {}) };
      }
      if (!s.place) return { slot: s.id, part: s.part.kind, skills: s.part.skills };
      const numbers = slotRanges(curriculum, plan.level, s.part.skills);
      const room = roomOf(input, s.place, day);
      const max = Math.min(...Object.values(numbers).map((r) => r.max));
      return {
        slot: s.id, part: s.part.kind, skills: s.part.skills, place: s.place, formats: SLOT_FORMATS[s.place] ?? null,
        ...(s.place === "spot-the-error" ? { mistakes: mistakesFor(plan.level) } : {}),
        numbers,
        rules: Object.fromEntries(Object.entries(numbers).map(([skill, r]) => [skill, rangeRules(skill, r)])),
        ...(room ? { room: { characters: room.characters, perLine: room.perLine, lines: room.lines } } : {}),
        ...(s.planned?.use ? {} : { vary: varyNumber(`${day}:${page.number}:${s.id}`, max) }),
        ...(memory ? { asked: asked(s.part.skills) } : {}),
        ...(s.aim ? { aim: { skill: s.aim.skill, kind: s.aim.kind, means: KIND_WORDS[s.aim.kind], orElse: s.aim.orElse } } : {}),
        ...(s.planned?.use || s.planned?.name ? {
          planned: {
            ...(s.planned.use ? { numbers: s.planned.use } : {}), ...(s.planned.name ? { name: s.planned.name } : {}), ...(s.planned.say ? { say: s.planned.say } : {}),
            ...(s.planned.names ? { names: s.planned.names, things: s.planned.things } : {}),
            ...(s.planned.say && s.planned.does ? { operation: s.planned.does.operation, figure: s.planned.does.figure, figureShows: s.planned.does.figureShows } : {}),
          },
        } : {}),
      };
    }),
    // Shapes of question the book has used up: none of the page's questions (outside practice) may take one again.
    ...(memory && [...memory.shapes.values()].some((x) => x.length >= SHAPE_MOST)
      ? { usedUp: [...memory.shapes].filter(([, x]) => x.length >= SHAPE_MOST).map(([k]) => ({ example: memory.shapeText.get(k)!, words: k })) }
      : {}),
    ...(panels.length ? {
      examples: panels.map((x) => {
        const numbers = slotRanges(curriculum, plan.level, [x.skill]);
        const kind = kindsOf(curriculum.skill(x.skill)?.text ?? x.skill).find((k) => k !== "draw" && k !== "story") ?? "fact";
        return { slot: x.id, panel: x.place, skills: [x.skill], numbers, rules: { [x.skill]: rangeRules(x.skill, numbers[x.skill]) }, aim: { skill: x.skill, kind, means: KIND_WORDS[kind] } };
      }),
    } : {}),
    exampleBank: slots.flatMap(s => { const c = input.itemPolicy === "approved-v1" ? contractFor(input, w, s, attempt) : null; return c ? [itemExamples(c.type, plan.level, c.source)] : []; }),
    note,
  };
}

/**
 * A number from 1 to `max` for a slot, fixed by its day, page and slot: the AI builds the item around it, so pages
 * written apart (each call sees one page) do not all ask "What is 1 more than 6?". The same plan always gives the same.
 */
function varyNumber(key: string, max: number): number {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return 1 + (h % Math.max(1, Math.min(max, 1000)));
}

/** A slot's text room on a day's page (textRoom), for the plan's level and the day's page count. */
function roomOf(input: GenerateInput, place: SlotName, day: number) {
  return textRoom(place, input.plan.level, input.plan.days.find((d) => d.day === day)?.pages.length ?? 8);
}

/**
 * The AI's items by slot id; an answer of another shape gives none. A call that throws (a time-out, a refusal, output
 * that is not JSON) is sent once more, the same; the second error is the one returned.
 */
const APPROVED_SYSTEM = [
  "You write only stories and explain-how questions for a printed math workbook in British Columbia.",
  "For every requested slot, copy contract.item with the same slot ID. Change only text. Never change the format, skill, operation, operands, figure or easier example. Code writes every drill and worked example.",
  "Use exactly the digits in contract.numbers in the question text, including repeated occurrences. Add no numbers and omit none. Do not write numbers as words. The operation and its operands are fixed data, not a choice.",
  "Use exampleBank for each question type and grade band. A story must use a named person and real things. Ask about the same things in the question. Use short sentences with one action each. Say now when it helps. Never use in all, altogether, all together, total or left over.",
  "Use plain, simple Canadian English. Keep taught math words. Never ask for tracing, an abstract drawing, a scan, a call or a school grade. Never write the answer or a worked solution.",
  "An explain item must ask how or why about the given math. It is parent-checked. A story must ask for exactly the answer computed by the given operation. For add combine the two operands; subtract takes the second from the first; missing-addend asks what to add to the first to reach the second; multiply asks for equal groups; divide shares equally.",
  "Stay within room.characters. Every printed word outside text is code's. A note gives the reason a prior answer failed. Correct only that reason and keep the fixed contract.",
].join("\n");

async function callAi(deps: GenerateDeps, name: string, request: unknown, ids: string[] = []): Promise<{ items: Map<string, unknown>; error: string | null }> {
  const ask = async () => {
    const prompt = { name, system: (request as { itemPolicy?: string }).itemPolicy === "approved-v1" ? APPROVED_SYSTEM : SYSTEM, content: [{ type: "text" as const, text: JSON.stringify(request) }], schema: ITEMS_SCHEMA, effort: "medium" as const };
    const dispatch = () => withTimeLimit(deps.timeLimitMs ?? TIME_LIMIT_MS, signal => deps.ai.json(prompt, signal));
    const response = deps.editCall ? await deps.editCall("write", "", prompt, dispatch) : await dispatch();
    return response;
  };
  const read = (out: unknown, into: Map<string, unknown>) => {
    const list = (out as { items?: unknown } | null)?.items;
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const slot = (item as { slot?: unknown } | null)?.slot;
      if (typeof slot === "string" && !into.has(slot)) into.set(slot, item);
    }
  };
  try {
    let resent = false;
    const out = await ask().catch((error) => { if (error instanceof WriterPersistenceError) throw error; resent = true; return ask(); });
    const items = new Map<string, unknown>();
    read(out, items);
    // An answer that leaves out slots it was asked for is incomplete, like one that is not JSON: sent once more (if it
    // was not already), and the slots it gave are kept.
    if (!resent && ids.some((id) => !items.has(id))) read(await ask().catch((error) => { if (error instanceof WriterPersistenceError) throw error; return null; }), items);
    return { items, error: null };
  } catch (e) {
    if (e instanceof WriterPersistenceError) throw e;
    return { items: new Map(), error: e instanceof Error ? e.message : String(e) };
  }
}

/** A panel of a laid-out page (worked example, Watch one, reminder), and the skill its worked example teaches. */
interface Panel {
  id: string;
  layoutSlot: number;
  place: SlotName;
  skill: string;
}

/**
 * What the book has asked so far (#380): each skill's question texts, each question's key with its page, and each
 * question shape (outside practice) with the pages it is on.
 */
interface BookMemory {
  texts: Map<string, string[]>;
  keys: Map<string, number>;
  shapes: Map<string, number[]>;
  /** The first question of each shape, to show the AI which shapes are used up. */
  shapeText: Map<string, string>;
  /** Each shape of code's wordings (round 7) with how often the book prints it: code prints the least used. */
  codeShapes: Map<string, number>;
}

/**
 * A question's shape: its words without numbers, names or other capitalised words, and punctuation ("Mia has 3. How many
 * more make 10?" and "Ben has 6. How many more make 9?" are one shape: "has many more make").
 */
export const shapeOf = (text: string) => text.split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, "")).filter((w) => w && !/^[A-Z]/.test(w)).join(" ").toLowerCase();
/** Practice places ask one step again and again on purpose: no shape limit there. */
const PRACTICE_PLACES: ReadonlySet<SlotName> = new Set<SlotName>(["warm-up", "finish-these", "on-your-own", "practice-row", "unit-b-practice", "now-you"]);
/** How many questions of one shape a book may have outside practice. */
const SHAPE_MOST = 3;

const plainText = (t: string) => t.toLowerCase().replace(/[^a-z0-9+=?×÷−-]+/g, " ").trim();
/** A question's key: its words and numbers, and for an item with no operation its data too ("How many dots?" twice with other dots is not a repeat). */
const dupKey = (p: QuestionPackage) => `${plainText(p.text)}|${p.operation ? "" : JSON.stringify([p.item?.checks ?? [], p.item?.figure ?? null])}`;
const opKey = (p: QuestionPackage) => (p.operation ? JSON.stringify(p.operation) : null);
const numbersIn = (t: string) => plainText(t).match(/\d+/g) ?? [];
/** Review places: a page of them asks different things, not one question with a new number each time. */
const REVIEW_PLACES: ReadonlySet<SlotName> = new Set<SlotName>(["remember-these", "already-know-it", "friday-5", "show-what-you-know", "picture-stories", "mini-test", "unit-check"]);

/**
 * Why a question repeats one the book already has, or null (#380, round 3): the same question on an earlier page (its
 * text, or for an item with no operation its text and data; not for warm-up facts, which come back on purpose), or on
 * this page the same question, the same sum, or (on a review place) the same words with only one number changed.
 */
function duplicateProblem(p: QuestionPackage, place: SlotName | null, memory: BookMemory | null, siblings: { number: number; package: QuestionPackage }[]): string | null {
  const key = dupKey(p);
  // Warm-up facts come back day after day on purpose (fluency): only a repeat on the same page counts there.
  const at = place === "warm-up" || p.textSource === "code" ? undefined : memory?.keys.get(key);
  if (at !== undefined) return `it repeats a question already asked on page ${at} ("${p.text}"): write a different question`;
  const shape = shapeOf(p.text);
  // A relation's words are code's (round 6), and so are a whole-number question's at U1 to U9 (round 7): code prints the
  // wording the book has used least, so only the same words twice on a page count.
  const own = isRelation(p) || isCodeWorded(p);
  const onPages = place && !PRACTICE_PLACES.has(place) && shape && !own ? memory?.shapes.get(shape) ?? [] : [];
  if (onPages.length >= SHAPE_MOST) return `the book already asks this kind of question ${onPages.length} times (pages ${[...new Set(onPages)].join(", ")}): ask another kind of question`;
  for (const s of siblings) {
    if (dupKey(s.package) === key) return `it is the same as question ${s.number} on this page ("${s.package.text}")`;
    // The same words twice on a page read as one question asked again, whatever the numbers behind them (round 6).
    if (p.textSource !== "code" && plainText(s.package.text) === plainText(p.text)) return `its text is the same as question ${s.number}'s on this page ("${s.package.text}"): word it another way`;
    const op = opKey(p);
    if (op && op === opKey(s.package)) return `it works the same sum as question ${s.number} on this page ("${s.package.text}")`;
    const [a, b] = [numbersIn(p.text), numbersIn(s.package.text)];
    if (p.textSource !== "code" && place && REVIEW_PLACES.has(place) && a.length > 0 && a.length === b.length && plainText(p.text).replace(/\d+/g, "#") === plainText(s.package.text).replace(/\d+/g, "#")
      && a.filter((x, i) => x !== b[i]).length <= 1) return `it differs from question ${s.number} on this page ("${s.package.text}") only by one number: ask another kind of question`;
    if (place && !PRACTICE_PLACES.has(place) && shape && !own && shape === shapeOf(s.package.text)) return `it asks the same kind of question as question ${s.number} on this page ("${s.package.text}") with other numbers or names: ask another kind of question`;
  }
  return null;
}

/** A relation item: its text is code's (round 6). */
const isRelation = (p: QuestionPackage) => (p.item?.checks ?? []).some((c) => c.kind === "relation");

/** A copy of the memory to add to: `remember` replaces each list, so the copy shares none it changes. */
const cloneMemory = (m: BookMemory): BookMemory => ({
  texts: new Map(m.texts), keys: new Map(m.keys), shapes: new Map(m.shapes), shapeText: new Map(m.shapeText), codeShapes: new Map(m.codeShapes),
});

/** Adds a finished page's questions to what the book has asked. */
function remember(memory: BookMemory, page: number, questions: GeneratedQuestion[]) {
  for (const q of questions) {
    if (!q.package) continue;
    if (!memory.keys.has(dupKey(q.package))) memory.keys.set(dupKey(q.package), page);
    const shape = shapeOf(q.package.text);
    if (shape && q.place && !PRACTICE_PLACES.has(q.place) && q.check.status !== "failed" && isCodeWorded(q.package)) memory.codeShapes.set(shape, (memory.codeShapes.get(shape) ?? 0) + 1);
    else if (shape && q.place && !PRACTICE_PLACES.has(q.place) && q.check.status !== "failed" && !isRelation(q.package)) {
      memory.shapes.set(shape, [...(memory.shapes.get(shape) ?? []), page]);
      if (!memory.shapeText.has(shape)) memory.shapeText.set(shape, q.package.text);
    }
    for (const k of q.package.skill.skills) memory.texts.set(k, [...(memory.texts.get(k) ?? []), q.package.text]);
  }
}

interface PageWork {
  number: number;
  day: number;
  page: PlannedPage;
  slots: Slot[];
  layout: DayLayout | null;
  /** The page's panels, each asked for a worked example of its own skill (#380). */
  panels: Panel[];
  /** The AI attempts each slot and panel of the page used (#312), with those of earlier calls; shared by its redos. */
  tries: Tries;
  /** The page's AI calls in order (R379-7-1): the next call's place, and the calls an earlier try kept; shared too. */
  calls: { next: number; kept: Map<number, StoredCall> };
  /** The solve checks an earlier try kept of the page's calls, by solveKey (R379-8-1). */
  solves: Map<string, SolveVerdict>;
}

/** A page's AI attempts by slot or panel id, and the most a slot may use (the ledger's; no limit without one). */
interface Tries {
  used: Map<string, number>;
  max: number;
}

/** A question or worked example that used its AI attempts in an earlier try that stopped before its page was stored. */
const EXHAUSTED: QuestionCheck = { status: "failed", reason: "it used its AI attempts in an earlier try that stopped before its page was stored" };
const exhaustedBuild = (): BuiltQuestion => ({ check: EXHAUSTED, package: null, stepIds: [] });
/** The attempts a slot has used, as a question stores them (1 to 3). */
const triesOf = (w: PageWork, id: string) => Math.min(3, Math.max(1, w.tries.used.get(id) ?? 1)) as GeneratedQuestion["attempts"];
/** Whether a slot or panel may be asked again. */
const hasTry = (w: PageWork, id: string) => (w.tries.used.get(id) ?? 0) < w.tries.max;

const askText = (a: CallAsk | undefined) => (a ? `${a.name} of ${[...a.slots, ...a.panels].join(", ") || "nothing"}` : "a call of an older shape");
const sameAsk = (a: CallAsk | undefined, b: CallAsk) =>
  !!a && a.name === b.name && JSON.stringify(a.slots) === JSON.stringify(b.slots) && JSON.stringify(a.panels) === JSON.stringify(b.panels);

/** A slot's room for code's wordings: two thirds of it on a shorter rewrite. */
const shorterRoom = (room: number | undefined, shorter: boolean) => (room !== undefined && shorter ? Math.floor((room * 2) / 3) : room);

/**
 * Writes the page's slots at `which` (indexes) and its `panels` in one AI call and builds each. Each attempt is counted
 * before the call (#312, R379-2-1); a slot or panel with no attempt left, or that the ledger refuses (R379-3-1), is not
 * asked: it comes back failed with no package, and is in `refused`. Throws when the ledger or the call store does (the
 * run was lost), and when a kept call asked other slots than this one does (ResumeMismatch).
 */
async function writeSlots(input: GenerateInput, deps: GenerateDeps, w: PageWork, which: number[], note: string | null, name: string, panels: Panel[] = [], memory: BookMemory | null = null, pageTexts: string[] = [], o: { wordLater?: boolean; skipSolve?: boolean } = {}) {
  const seq = w.calls.next++;
  const ask: CallAsk = { name, slots: which.map((i) => w.slots[i].id), panels: panels.map((x) => x.id) };
  // A call an earlier try kept (R379-7-1): the same call of the same page, replayed as it came back, with the attempts
  // it counted; no attempt is counted again and the AI is not asked. It must have asked what this call asks (R379-8-2).
  const kept = w.calls.kept.get(seq);
  if (kept) {
    if (!sameAsk(kept.ask, ask) || kept.built.length !== which.length || kept.examples.length !== panels.length) {
      throw new ResumeMismatch(`page ${w.number}: its kept call ${seq} is ${askText(kept.ask)}, and the plan now asks ${askText(ask)}`);
    }
    for (const [id, n] of Object.entries(kept.tries)) w.tries.used.set(id, n);
    await solveChecks(deps, w, seq, ask, kept.built, kept.examples);
    return { built: kept.built, examples: kept.examples, refused: new Set(kept.refused) };
  }
  const attempt = name === "workbook_page_redo" ? 1 : 0;
  const contracts = new Map(which.map(i => [w.slots[i].id, input.itemPolicy === "approved-v1" ? contractFor(input, w, w.slots[i], attempt) : null]));
  const local = new Map<string, unknown>();
  if (input.itemPolicy === "approved-v1") {
    for (const [id, c] of contracts) if (c?.source === "code") local.set(id, c.item);
    for (const p of panels) {
      const slot: Slot = { id: p.id, part: { ...w.slots[0]?.part, skills: [p.skill] } as PlannedPart, place: null, layoutSlot: -1 };
      const c = contractFor(input, w, slot);
      contracts.set(p.id, c);
      if (c) local.set(p.id, c.item);
    }
  }
  const ids = [...ask.slots, ...ask.panels].filter(id => input.itemPolicy !== "approved-v1" || contracts.get(id)?.source !== "code" && contracts.get(id) !== null);
  const open = ids.filter((id) => hasTry(w, id));
  const denied = open.length > 0 && deps.attempts ? (await deps.attempts.use(w.number, open)).refused : [];
  const refused = new Set([...ids.filter((id) => !open.includes(id)), ...denied]);
  for (const id of open) w.tries.used.set(id, denied.includes(id) ? w.tries.max : (w.tries.used.get(id) ?? 0) + 1);
  const asked = which.map((i) => w.slots[i]).filter((x) => !refused.has(x.id) && (input.itemPolicy !== "approved-v1" || contracts.get(x.id)?.source === "story" || contracts.get(x.id)?.source === "explain"));
  const askedPanels = panels.filter((x) => !refused.has(x.id) && input.itemPolicy !== "approved-v1");
  const out = asked.length + askedPanels.length > 0
    ? await callAi(deps, name, pageRequest(input, w, asked, note, askedPanels, memory, pageTexts, attempt), [...asked.map((x) => x.id), ...askedPanels.map((x) => x.id)])
    : { items: new Map<string, unknown>(), error: null };
  for (const [id, raw] of local) out.items.set(id, raw);
  const missing = (id: string) => (out.items.size ? ` (it answered slots ${[...out.items.keys()].join(", ")}, not ${id})` : " (its answer held no items)");
  // Each panel's worked example: of its own skill, one code can show worked out, in the level's numbers.
  const examples = panels.map((x) => {
    if (refused.has(x.id)) return exhaustedBuild();
    const c = contracts.get(x.id);
    const builder = input.itemPolicy === "approved-v1" ? (raw: unknown, place: Parameters<typeof buildQuestion>[1]) => c ? buildPlannedItem(c, raw, place) : unapprovedBuild() : buildQuestion;
    const b = builder(shortSequence(out.items.get(x.id), input.plan.level), {
      id: `${input.workbookId}:d${w.day}p${w.page.number}${x.id}`, workbookId: input.workbookId, page: w.number, question: 1, level: input.plan.level, skills: [x.skill],
      signs: levelSigns(input.curriculum, input.plan.level),
    });
    if (out.error && !out.items.has(x.id) && (input.itemPolicy !== "approved-v1" || c)) b.check = { status: "failed", reason: `the AI gave no answer: ${out.error}` };
    if (b.package) b.package = withoutSam(b.package, null);
    const pkg = b.package;
    if (b.check.status !== "failed" && pkg && !pkg.operation && !pkg.item?.checks.some((c) => c.kind === "count" || c.kind === "sequence" || c.kind === "order" || c.kind === "relation")) {
      b.check = { status: "failed", reason: "a panel's worked example is a sum, a count, a sequence, an order or a relation code can work out" };
    }
    if (b.check.status !== "failed" && pkg) {
      const problem = rangeProblem(pkg, input.curriculum, input.plan.level);
      if (problem) b.check = { status: "failed", reason: problem };
    }
    return b;
  });
  const built = which.map((i) => {
    const slot = w.slots[i];
    if (refused.has(slot.id)) return exhaustedBuild();
    const c = contracts.get(slot.id);
    const builder = input.itemPolicy === "approved-v1" ? (raw: unknown, place: Parameters<typeof buildQuestion>[1]) => c ? buildPlannedItem(c, raw, place) : unapprovedBuild() : buildQuestion;
    const b = builder(shortSequence(out.items.get(slot.id), input.plan.level), {
      id: `${input.workbookId}:d${w.day}p${w.page.number}s${slot.id}`,
      workbookId: input.workbookId, page: w.number, question: i + 1, level: input.plan.level, skills: slot.part.skills,
      signs: levelSigns(input.curriculum, input.plan.level),
      // A shorter rewrite (the page did not fit) gives code's wordings two thirds of the room: a shorter one prints.
      ...(slot.place ? { room: shorterRoom(roomOf(input, slot.place, w.day)?.characters, name === "workbook_page_shorter") } : {}), variant: w.number + i,
      ...(slotWording(input, slot) ? { wording: slotWording(input, slot) } : {}),
      ...(slot.place && STORY_CHECK_PLACES.has(slot.place) ? { story: true } : {}),
    });
    // Sam is only Spot the error's child: anyone else named Sam takes the slot's planned name.
    if (b.package && slot.place && slot.place !== "spot-the-error") b.package = withoutSam(b.package, slot.planned?.name ?? null);
    if (out.error && !out.items.has(slot.id) && (input.itemPolicy !== "approved-v1" || c)) b.check = { status: "failed", reason: `the AI gave no answer: ${out.error}` };
    else if (input.itemPolicy !== "approved-v1" && !out.items.has(slot.id) && b.check.status === "failed") b.check = { status: "failed", reason: `${b.check.reason}${missing(slot.id)}` };
    // A slot with a layout of its own takes only its format: another would not lay out there.
    const format = b.package?.item?.format;
    // Before any other reason: a question of another format is never written into this place, whatever else it fails.
    if (input.itemPolicy !== "approved-v1" && slot.place && STRICT_SLOTS.includes(slot.place) && format && !SLOT_FORMATS[slot.place]?.includes(format)) {
      b.check = { status: "failed", reason: `the ${slot.place} place takes the ${SLOT_FORMATS[slot.place]!.join(" or ")} format, not ${format}` };
    }
    // Spot the error shows Sam's wrong steps, built by code: the shown wrong answer must be a mistake code can show.
    if (slot.place === "spot-the-error" && b.package?.item?.format === "spot-the-error" && b.check.status !== "failed" && b.package) {
      let problem = samProblem(b.package, input.plan.level);
      if (problem) {
        // The AI's mistake cannot happen on its sum: show one that can (chosen in turn by the slot), checked again.
        const fixed = samFix(b.package, input.plan.level, varyNumber(`${w.day}:${w.page.number}:${slot.id}`, 100), (p) =>
          checkQuestionPackage(p).status === "checked" && !samProblem(p, input.plan.level) && !rangeProblem(p, input.curriculum, input.plan.level));
        if (fixed) {
          b.package = fixed;
          problem = null;
        }
      }
      if (problem) b.check = { status: "failed", reason: problem };
    }
    // Every number fits the level and slot: the range of the item's skill (an earlier skill's under review).
    if (slot.place && b.check.status !== "failed" && b.package) {
      const problem = rangeProblem(b.package, input.curriculum, input.plan.level);
      if (problem) b.check = { status: "failed", reason: problem };
    }
    return b;
  });
  if (!o.wordLater) chooseWordings(input, w, which, built, memory, pageTexts);
  // The call is kept with the attempts it counted as soon as it is built, before its solve checks and anything else
  // (R379-7-1, R379-8-1), so a try that stops later (a solve check, another page, the function's end) never loses an
  // answer it paid for. A call that counted none is not kept: it asked nothing, and a replay makes the same.
  if ((open.length > 0 || input.itemPolicy === "approved-v1") && deps.calls) {
    await deps.calls.save(w.number, seq, { ask, built, examples, refused: [...refused], tries: Object.fromEntries(open.map((id) => [id, w.tries.used.get(id)!])) });
  }
  if (!o.skipSolve) await solveChecks(deps, w, seq, ask, built, examples);
  return { built, examples, refused };
}

/**
 * The solve check (round 7) of a call's questions and worked examples: every sound one whose printed words the AI wrote
 * is read and answered by a separate model; one it answers otherwise than the key, or a check that fails or is late,
 * fails it. Each check is kept as it comes back, under its key (R379-8-1); a check an earlier try kept is not run
 * again, its verdict is used. Every check settles before this returns or throws, so none is still writing after.
 */
async function solveChecks(deps: GenerateDeps, w: PageWork, seq: number, ask: CallAsk, built: BuiltQuestion[], examples: BuiltQuestion[]) {
  const items = [...built.map((b, k) => ({ b, id: ask.slots[k] })), ...examples.map((b, k) => ({ b, id: ask.panels[k] }))];
  const settled = await Promise.allSettled(items.map(async ({ b, id }) => {
    if (b.check.status === "failed" || !b.package) return;
    const key = solveKey(w.number, seq, id);
    let verdict = w.solves.get(key);
    if (!verdict) {
      const log = await solveCheck(deps.solver, b.package, deps.solveTimeLimitMs ?? SOLVE_TIME_LIMIT_MS, deps.now);
      if (!log) return;
      deps.onSolve?.(log);
      await deps.calls?.saveSolve(key, log);
      verdict = log.verdict;
    }
    if (verdict.status !== "agreed") b.check = { status: "failed", reason: solveReason(verdict) };
  }));
  const failure = settled.find((x) => x.status === "rejected");
  if (failure) throw (failure as PromiseRejectedResult).reason;
}

/**
 * Code's wording of the built questions, chosen against the page's other texts (`pageTexts`, then each one chosen) and
 * the book (`memory`); changes only their text, never their check.
 */
function chooseWordings(input: GenerateInput, w: PageWork, which: number[], built: BuiltQuestion[], memory: BookMemory | null, pageTexts: string[]) {
  // A relation's text is code's (round 6): of its wordings, one whose words no other question of the page has. So is a
  // whole-number question's at U1 to U9 (round 7): of code's sound wordings, one whose shape the page does not have yet
  // and the book has printed least (under 3 times when it can), so no slot runs out of wordings late in the book.
  // A bare sum has no words: its form is its signs ("# + ? = #"), so "1 + ? = 8" and "1 + ? = 9" are one form.
  const formOf = (x: string) => shapeOf(x) || plainText(x).replace(/\d+/g, "#");
  const taken = new Set(pageTexts.map(formOf));
  built.forEach((b, k) => {
    if (!b.package) return;
    const place = w.slots[which[k]].place;
    const room = (place ? roomOf(input, place, w.day)?.characters : null) ?? Infinity;
    const onPage = (x: string) => taken.has(formOf(x));
    if (b.wordings && b.check.status !== "failed") {
      const practice = !place || PRACTICE_PLACES.has(place);
      const used = (x: string) => (practice ? 0 : memory?.codeShapes.get(shapeOf(x)) ?? 0);
      // Not a question the book already printed word for word (warm-up facts come back on purpose).
      const printed = (x: string) => !!memory && place !== "warm-up" && memory.keys.has(dupKey({ ...b.package!, text: x }));
      // Within the room if it can; a sound question past its room beats a repeat (the fit check then decides).
      const unused = b.wordings.filter((x) => !onPage(x) && !printed(x));
      const fitting = unused.filter((x) => x.length <= room);
      const fresh = fitting.length ? fitting : unused.sort((x, y) => x.length - y.length).slice(0, 1);
      const best = fresh.find((x) => used(x) < SHAPE_MOST) ?? [...fresh].sort((x, y) => used(x) - used(y))[0];
      if (best && best !== b.package.text) b.package = { ...b.package, text: best };
    } else {
      const wordings = relationWordings(b.package);
      if (wordings.length > 0 && onPage(b.package.text)) {
        const free = wordings.find((x) => !onPage(x) && x.length <= room);
        if (free) b.package = { ...b.package, text: free };
      }
    }
    taken.add(formOf(b.package.text));
  });
}

type PageCall = Awaited<ReturnType<typeof writeSlots>>;

/**
 * A page's first call (#312): every slot and panel, told what the days before asked (`memory`), never this day's other
 * pages, so the pages of a day make it at once and the same at any concurrency. Code's wording and the rest of the page
 * (its repeats, the redo, the fit) are firstPass's, in page order. The solve check reads no code wording, so it runs here.
 */
const pageCall = (input: GenerateInput, deps: GenerateDeps, w: PageWork, memory: BookMemory | null) =>
  writeSlots(input, deps, w, w.slots.map((_, i) => i), null, PAGE_CALL, w.panels, memory, [], { wordLater: true });

/** The names of a page's AI calls: its first call, then the redo and the shorter rewrite. */
const PAGE_CALL = "workbook_page";
const LATER_CALLS: readonly string[] = ["workbook_page_redo", "workbook_page_shorter"];

/** Places that print bare sums, and places that print stories: what code's wording of a whole-number question takes. */
const BARE_PLACES: ReadonlySet<SlotName> = new Set<SlotName>(["warm-up", "in-your-head", "practice-row", "finish-these", "on-your-own", "unit-b-practice", "solve-it-two-ways"]);
const STORY_PLACES: ReadonlySet<SlotName> = new Set<SlotName>(["word-problems", "picture-stories", "challenge", "math-in-the-world", "mixed-set"]);
const WORDING_KINDS: readonly string[] = ["story", "picture", "fact", "missing-part"];
/** Places whose every question is a story, checked for plain story language (D-201, storyProblem). */
const STORY_CHECK_PLACES: ReadonlySet<SlotName> = new Set<SlotName>(["word-problems", "picture-stories", "mixed-set"]);

/**
 * What code words a slot's whole-number question with at U1 to U9 (round 7): the planned person and thing (and the
 * ones the AI may choose instead), the kinds of question its place and aim take, and the planned wording. Undefined
 * for a slot the book plan named no one for (code's defaults then).
 */
function slotWording(input: GenerateInput, slot: Slot): SlotWording | undefined {
  const p = slot.planned;
  if (!p?.name || !p.thing) return undefined;
  const skill = slot.aim?.skill ?? slot.part.skills[0];
  const text = input.curriculum.skill(skill)?.text ?? skill;
  const step = /two-more-less|2 more/.test(`${skill} ${text}`) || isOneMoreLessSkill(skill) || /1 more/.test(text.toLowerCase());
  const aimed = slot.aim ? [slot.aim.kind, ...slot.aim.orElse].filter((k) => WORDING_KINDS.includes(k)) as WordingKind[] : [];
  const kinds: WordingKind[] = slot.place && BARE_PLACES.has(slot.place) ? ["fact", "missing-part"]
    : slot.place && STORY_PLACES.has(slot.place) ? ["story", "picture", "missing-part"]
      : aimed.length ? aimed : ["story", "picture", "missing-part", "fact"];
  return {
    name: p.name, thing: p.thing, names: p.names ?? [p.name], things: p.things ?? [p.thing], kinds, step,
    subtraction: skillRange(input.curriculum, input.plan.level, skill).subtraction,
    planned: p.say && p.does ? { say: p.say, operation: p.does.operation, figure: p.does.figure } : null,
  };
}

/**
 * A question given its slot's planned wording by code (round 6), or null: when the AI's text failed as a repeat of its
 * page or book but its item works the planned operation (with the planned picture), code's wording of the same item.
 * The rewritten question is checked again in full; null when it would fail.
 */
function withPlannedWording(input: GenerateInput, b: BuiltQuestion, slot: Slot): BuiltQuestion | null {
  if (b.package?.textSource) return null;
  const say = slot.planned?.say;
  const does = slot.planned?.does;
  const p = b.package;
  if (!say || !does || !p?.operation || p.text === say) return null;
  if (p.operation.kind !== does.operation.kind || JSON.stringify(p.operation.operands) !== JSON.stringify(does.operation.operands)) return null;
  if (does.figure && p.item?.figure?.kind !== does.figure) return null;
  const pkg: QuestionPackage = { ...p, text: say };
  const check = checkQuestionPackage(pkg);
  const facts = { thing: slot.planned?.thing ?? null };
  const story = slot.place && STORY_CHECK_PLACES.has(slot.place) ? storyProblem(say, facts) : quantityStoryProblem(say, facts);
  if (check.status === "failed" || kindProblem(pkg, {}) || story || rangeProblem(pkg, input.curriculum, input.plan.level)) return null;
  return { ...b, package: pkg, check: check.status === "checked" ? { status: "checked" } : { status: "not-checked", reason: check.reason } };
}

/** A failed repeat given its planned wording by code, when that is sound and repeats nothing on the page (round 6). */
function rewordRepeat(input: GenerateInput, b: BuiltQuestion, slot: Slot, memory: BookMemory | null, others: { number: number; package: QuestionPackage }[]): BuiltQuestion {
  if (b.check.status !== "failed" || !NEEDS_NEW.test(b.check.reason)) return b;
  const again = withPlannedWording(input, b, slot);
  if (!again) return b;
  markRepeat(again, slot.place, memory, others);
  return again.check.status === "failed" ? b : again;
}

const generated = (w: PageWork, i: number, b: BuiltQuestion, attempts: GeneratedQuestion["attempts"]): GeneratedQuestion => ({
  number: i + 1, slot: w.slots[i].id, part: w.slots[i].part.kind, ...(w.slots[i].place ? { place: w.slots[i].place! } : {}), check: b.check, attempts, package: b.package,
});

/** What to do about a failed check, said plainly for the redo; null when the reason says it all. */
function hintFor(reason: string): string | null {
  if (/is too big for this question/.test(reason)) return "Every number counts: the text, the operation and its answer, each wrong answer and the easier example. Leave out a wrong answer past the limit.";
  if (/easier example has the question's answer/.test(reason)) return "Work out both answers first: the easier example's answer must be a different number. For a missing part, make it 1 smaller (3 + ? = 4 for 3 + ? = 5), and ask a missing part of 2 or more.";
  if (/is a number in words/.test(reason)) return "Write numbers in digits, and do not use the word \"one\": write \"a\" or reword.";
  if (/this question uses no /.test(reason)) return "Keep to the slot's rules: only an operation kind and a format they allow.";
  if (/easier example is not smaller/.test(reason)) return "Sort both sets of numbers from least to greatest: each easier number is no larger than the question's at its place, and one is smaller (for 4 + 3: 1 + 2 or 2 + 3).";
  if (/needs an operation code can compute/.test(reason)) return "A question with no number answer is a draw item (a parent checks it); else give the operation.";
  if (/has no easier example/.test(reason)) return "Give an easier example of the same kind: a smaller missing part (3 + ? = 4 for 3 + ? = 5), or smaller numbers (1 + 1 for 2 + 1).";
  if (/but its answer is the operation's number/.test(reason)) return "Ask for the number the operation gives, or make it a draw item.";
  if (/repeats a question|same as question|text is the same as question|same sum as question|only by one number|same kind of question|this kind of question/.test(reason)) return "Write a different question: another kind (a story, a picture to count, a missing part, a sequence) or other numbers, never one in the slot's asked list.";
  if (/is a count: write it as the sequence format|the sequence goes from|the sequence starts at/.test(reason)) return "Make it a sequence item whose first and last numbers are the ones the text says.";
  if (/gives its own answer|adding or taking away 0/.test(reason)) return "Ask for a number the child works out; the text gives only what the child needs.";
  if (/the solve check/.test(reason)) return "A reader who sees only the printed text and picture must work out exactly the answer code computes from your data: name every number it works, ask for what it gives, and say nothing that points to another operation.";
  return null;
}

/** A reason that the question repeats one of the book or of its page, or gives its own answer: its redo takes new numbers. */
const NEEDS_NEW = /repeats a question|same as question|text is the same as question|same sum as question|only by one number|same kind of question|this kind of question|gives its own answer/;

/** The redo's words for a failed question or worked example. */
function failNote(id: string, b: BuiltQuestion, slot?: Slot): string {
  const reason = (b.check as { reason: string }).reason;
  const steps = b.stepIds.length ? ` Its operation's worked steps are named: ${b.stepIds.join(", ")}.` : "";
  const hint = hintFor(reason);
  // A repeat: the slot's next kind of question and its spare numbers (as its planned numbers), so the redo asks it
  // another way.
  const again = slot && NEEDS_NEW.test(reason);
  const next = again && slot.aim && !/gives its own answer/.test(reason) ? slot.aim.orElse[0] : undefined;
  const kind = next ? ` Write it as a ${next} question: ${KIND_WORDS[next]}.` : "";
  const numbers = again && slot.planned?.spare
    ? ` Use the numbers ${slot.planned.spare.join(" and ")} (its planned numbers now)${slot.planned.spareSay ? `, worded as "${slot.planned.spareSay}"` : ""}.` : "";
  return `Slot ${id} failed the check: ${reason}.${steps}${hint ? ` ${hint}` : ""}${kind}${numbers} Write it again.`;
}

/** The slot as its redo asks it after `reason`: a repeat takes the slot's next kind and its spare numbers. */
function redoSlot(slot: Slot, reason: string): Slot {
  if (!NEEDS_NEW.test(reason)) return slot;
  const next = slot.aim && !/gives its own answer/.test(reason) ? slot.aim.orElse[0] : undefined;
  return {
    ...slot,
    ...(slot.aim && next ? { aim: { ...slot.aim, kind: next, orElse: slot.aim.orElse.filter((k) => k !== next) } } : {}),
    ...(slot.planned?.spare ? { planned: { ...slot.planned, use: slot.planned.spare, spare: null, say: slot.planned.spareSay ?? null, spareSay: null, does: slot.planned.spareDoes ?? null, spareDoes: null } } : {}),
  };
}

/**
 * Why a sound question is too long for its place, for the redo, or null: its text runs past its slot's room, or (on a
 * parent-led card) its sequence has more numbers than a line holds. `length` is what a shorter redo must beat.
 */
function overRoom(input: GenerateInput, w: PageWork, i: number, b: BuiltQuestion): { length: number; note: string } | null {
  const place = w.slots[i].place;
  const room = place ? roomOf(input, place, w.day) : null;
  // Code's wording is already the shortest that fits (round 7): an AI redo would not change it.
  if (!room || b.check.status === "failed" || !b.package || isCodeWorded(b.package)) return null;
  const id = w.slots[i].id;
  const n = b.package.text.length;
  if (n > room.characters) {
    return { length: n, note: `Slot ${id} is sound but too long for its place: its text has ${n} characters and its room is ${room.characters}. Write the same kind of question again, on the same skill, in at most ${room.characters} characters (short sentences: 'Mia has 5 cars. She gets 3 more. How many cars now?').` };
  }
  const terms = (b.package.item?.checks ?? []).flatMap((c) => (c.kind === "sequence" ? [c.terms.length] : []))[0] ?? 0;
  if (input.plan.level <= 3 && terms > PARENT_SEQUENCE_MOST) {
    return { length: n, note: `Slot ${id} is sound but too long for its card: its sequence has ${terms} numbers and a card's line holds ${PARENT_SEQUENCE_MOST}. Write it again with at most ${PARENT_SEQUENCE_MOST} numbers (count from 3 to 7, not from 1 to 10).` };
  }
  return null;
}

/** Fails a sound question that repeats one of the book or of `others` on this page. */
function markRepeat(b: BuiltQuestion, place: SlotName | null, memory: BookMemory | null, others: { number: number; package: QuestionPackage }[]) {
  if (b.check.status === "failed" || !b.package || !memory) return;
  const problem = duplicateProblem(b.package, place, memory, others);
  if (problem) b.check = { status: "failed", reason: problem };
}

/** The sound questions of `built` other than `except`, as siblings to compare with. */
const siblingsOf = (built: BuiltQuestion[], upTo: number, except = -1) =>
  built.flatMap((b, j) => (j < upTo && j !== except && b.check.status !== "failed" && b.package ? [{ number: j + 1, package: b.package }] : []));

/**
 * The first pass at a page: the page call (with its panels' worked examples), then one redo call for its failed
 * questions and examples (their one try for a failed check). A question that repeats one the book already asked, or
 * another on its page, fails the check with the reason (round 3); its redo takes the slot's next kind and spare numbers.
 * A sound question whose text runs past its room goes to the same redo to be written shorter (round 5): the page keeps
 * the redo only when it is sound and shorter, so a long question is never marked failed for its length.
 */
async function firstPass(input: GenerateInput, deps: GenerateDeps, w: PageWork, memory: BookMemory | null, first: PageCall): Promise<{ questions: GeneratedQuestion[]; examples: (QuestionPackage | null)[] }> {
  const all = w.slots.map((_, i) => i);
  const built = first.built;
  // The page call left code's wording to now (#312): it reads this day's pages before this one too.
  chooseWordings(input, w, all, built, memory, []);
  built.forEach((b, i) => {
    markRepeat(b, w.slots[i].place, memory, siblingsOf(built, i));
    // A repeat whose item is the planned one takes the planned wording from code, with no AI call (round 6).
    built[i] = rewordRepeat(input, b, w.slots[i], memory, siblingsOf(built, i));
  });
  const examples = first.examples;
  const questions = all.map((i) => generated(w, i, built[i], triesOf(w, w.slots[i].id)));
  // Only a slot or panel with an attempt left goes to the redo (#312): one that used them keeps what it has.
  const failed = all.filter((i) => built[i].check.status === "failed" && hasTry(w, w.slots[i].id));
  const long = input.book ? all.flatMap((i) => {
    const over = hasTry(w, w.slots[i].id) ? overRoom(input, w, i, built[i]) : null;
    return over ? [{ i, ...over }] : [];
  }) : [];
  const failedPanels = w.panels.flatMap((x, k) => (examples[k].check.status === "failed" && hasTry(w, x.id) ? [k] : []));
  if (failed.length > 0 || failedPanels.length > 0 || long.length > 0) {
    const note = [
      ...failed.map((i) => failNote(w.slots[i].id, built[i], w.slots[i])),
      ...long.map((x) => x.note),
      ...failedPanels.map((k) => failNote(w.panels[k].id, examples[k])),
    ].join("\n");
    const which = [...failed, ...long.map((x) => x.i)].sort((a, b) => a - b);
    const kept = built.flatMap((b) => (b.check.status !== "failed" && b.package ? [b.package.text] : []));
    // A repeat's redo asks the slot its next kind with its spare numbers.
    const redoWork: PageWork = { ...w, slots: w.slots.map((x, i) => (failed.includes(i) ? redoSlot(x, (built[i].check as { reason: string }).reason) : x)) };
    const redo = await writeSlots(input, deps, redoWork, which, note, "workbook_page_redo", failedPanels.map((k) => w.panels[k]), memory, memory ? kept : []);
    which.forEach((i, k) => {
      // The ledger refused it after all (#312): it keeps its first version.
      if (redo.refused.has(w.slots[i].id)) {
        questions[i] = generated(w, i, built[i], triesOf(w, w.slots[i].id));
        return;
      }
      let fresh = redo.built[k];
      markRepeat(fresh, w.slots[i].place, memory, siblingsOf(built, built.length, i));
      fresh = rewordRepeat(input, fresh, redoWork.slots[i], memory, siblingsOf(built, built.length, i));
      const wasLong = long.find((x) => x.i === i);
      // A long question keeps its first version unless the redo is sound and shorter.
      if (wasLong && (fresh.check.status === "failed" || !fresh.package || !!overRoom(input, w, i, fresh) && fresh.package.text.length >= wasLong.length)) {
        questions[i] = generated(w, i, built[i], triesOf(w, w.slots[i].id));
        return;
      }
      built[i] = fresh;
      questions[i] = generated(w, i, built[i], triesOf(w, w.slots[i].id));
    });
    failedPanels.forEach((k, j) => { if (!redo.refused.has(w.panels[k].id)) examples[k] = redo.examples[j]; });
  }
  return { questions, examples: examples.map((e) => (e.check.status === "failed" ? null : e.package)) };
}

const sound = (q: GeneratedQuestion) => q.check.status !== "failed";
const textLength = (q: GeneratedQuestion) => q.package?.text.length ?? Infinity;

/** What the shorter rewrite is told: the fit problems, and each question's text length against its room. */
function shorterNote(input: GenerateInput, w: PageWork, questions: GeneratedQuestion[], problems: FitProblem[]): string {
  const lengths = questions.flatMap((q, i) => {
    const place = w.slots[i].place;
    const room = place ? roomOf(input, place, w.day) : null;
    return q.package ? [`slot ${q.slot}: ${q.package.text.length} characters${room ? ` (room ${room.characters})` : ""}${q.package.item?.format === "written-reason" ? ", with writing lines" : ""}`] : [];
  });
  return [
    `The page did not fit its template: ${problems.map((p) => (p.question ? `question ${p.question}: ` : "") + p.reason).join("; ")}.`,
    "Write every slot again, shorter, so the page fits: keep each question's text well within its room (fewer characters than its room if you can), with no writing lines (written-reason) or tall picture on a card, and the same skill and rules.",
    `Now: ${lengths.join("; ")}.`,
  ].join(" ");
}

/**
 * The shorter rewrite after a failed fit check: every question is written once more (its one try for a page that does
 * not fit). Of the two versions the page keeps the sound one, and of two sound (or two failed) ones the shorter text: a
 * rewrite never puts a failed question in place of a sound one, nor a longer one in place of a shorter. A question with
 * no attempt left (#312: the job allows 3) is not written again and keeps its version. Null: no question had one.
 */
async function shorterRewrite(input: GenerateInput, deps: GenerateDeps, w: PageWork, previous: GeneratedQuestion[], note: string, memory: BookMemory | null): Promise<GeneratedQuestion[] | null> {
  const all = previous.map((_, i) => i);
  const open = all.filter((i) => hasTry(w, w.slots[i].id));
  if (open.length === 0) return null;
  const written = await writeSlots(input, deps, w, open, note, "workbook_page_shorter", [], memory);
  const built = new Map(open.flatMap((i, k) => (written.refused.has(w.slots[i].id) ? [] : [[i, written.built[k]] as const])));
  // Each question is compared with the ones the page keeps before it (whichever version they keep), so two shorter
  // versions never come back as copies of each other.
  const chosen: GeneratedQuestion[] = [];
  for (const i of all) {
    const old = previous[i];
    const attempts = triesOf(w, w.slots[i].id);
    const before = chosen.flatMap((q, j) => (q.package && q.check.status !== "failed" ? [{ number: j + 1, package: q.package }] : []));
    const again = built.get(i);
    if (again) markRepeat(again, w.slots[i].place, memory, before);
    const fresh = again ? generated(w, i, again, attempts) : null;
    const keepOld = !fresh || (sound(old) !== sound(fresh) ? sound(old) : textLength(fresh) > textLength(old));
    let pick: GeneratedQuestion = keepOld || !fresh ? { ...old, attempts } : fresh;
    // The old version may repeat one kept before it too (written before those changed): then it fails with the reason.
    if (pick === fresh || !pick.package || pick.check.status === "failed" || !memory) {
      chosen.push(pick);
      continue;
    }
    const problem = duplicateProblem(pick.package, w.slots[i].place, null, before);
    if (problem) pick = { ...pick, check: { status: "failed", reason: problem } };
    chosen.push(pick);
  }
  return chosen;
}

/** The questions numbered again from 1 in their order, each package's place with its new number. */
const renumbered = (questions: GeneratedQuestion[]): GeneratedQuestion[] => questions.map((q, k) => ({
  ...q, number: k + 1, package: q.package ? { ...q.package, ref: { ...q.package.ref, question: k + 1 } } : null,
}));

/**
 * How tall a question's card is, roughly, for pairing: a picture and a format drawn under the text (a sequence, order,
 * relation or pattern, a drawing) each add to it, and so does each line of text past the first.
 */
function tallness(input: GenerateInput, w: PageWork, q: GeneratedQuestion): number {
  const p = q.package;
  if (!p) return 0;
  const place = w.slots.find((x) => x.id === q.slot)?.place;
  const perLine = (place ? roomOf(input, place, w.day)?.perLine : null) ?? 23;
  const drawn = p.item?.format === "draw" || (p.item?.checks ?? []).some((c) => c.kind === "sequence" || c.kind === "order" || c.kind === "relation" || c.kind === "pattern");
  return (p.item?.figure ? 2 : 0) + (drawn ? 2 : 0) + Math.max(0, Math.ceil(p.text.length / perLine) - 1);
}

/**
 * A parent-led page's questions with its tall cards paired in rows (#380, round 5): a row of 2 cards is as tall as its
 * taller card, so in each slot of 3 or more cards the tallest go first, side by side. Null when the order is the same.
 */
function pairedTall(input: GenerateInput, w: PageWork, questions: GeneratedQuestion[]): GeneratedQuestion[] | null {
  if (input.plan.level > 3) return null;
  const layoutSlot = (q: GeneratedQuestion) => w.slots.find((x) => x.id === q.slot)?.layoutSlot ?? -1;
  const out: GeneratedQuestion[] = [];
  for (let i = 0; i < questions.length;) {
    let j = i;
    while (j < questions.length && layoutSlot(questions[j]) === layoutSlot(questions[i])) j++;
    const block = questions.slice(i, j);
    out.push(...(block.length >= 3 ? block.map((q, k) => ({ q, k, t: tallness(input, w, q) })).sort((a, b) => b.t - a.t || a.k - b.k).map((x) => x.q) : block));
    i = j;
  }
  return out.every((q, k) => q === questions[k]) ? null : renumbered(out);
}

/** The question to leave out of a page that does not fit: the last one its problems name, else the page's last. */
function toLeaveOut(questions: GeneratedQuestion[], problems: FitProblem[]): { index: number; reason: string } {
  const named = problems.filter((p) => p.question !== null && questions.some((q) => q.number === p.question));
  const last = named.reduce<FitProblem | null>((a, p) => (!a || p.question! > a.question! ? p : a), null);
  if (last) return { index: questions.findIndex((q) => q.number === last.question), reason: last.reason };
  return { index: questions.length - 1, reason: problems[0]?.reason ?? "the page does not fit" };
}

/** The layout's omissions with the questions left out added to their parts' (the page placed fewer of them). */
function omissionsWith(w: PageWork, leftOut: { slot: Slot }[]): Omission[] {
  const omissions = (w.layout?.omissions ?? []).map((o) => ({ ...o }));
  const why = (n: number) => `${n} question${n === 1 ? "" : "s"} left out: the page had no room for ${n === 1 ? "its" : "their"} text`;
  w.page.parts.forEach((part, index) => {
    const n = leftOut.filter((x) => x.slot.part === part).length;
    if (n === 0) return;
    const had = omissions.find((o) => o.part === index);
    if (had) {
      had.placed = Math.max(0, had.placed - n);
      had.reason = `${had.reason}; ${why(n)}`;
    } else {
      const placed = w.slots.filter((x) => x.part === part && x.place !== "how-do-you-know").length;
      omissions.push({ part: index, kind: part.kind, requested: placed, placed: Math.max(0, placed - n), reason: why(n) });
    }
  });
  return omissions.sort((a, b) => a.part - b.part);
}

/**
 * A laid-out day page's content for its questions; null when the book is not laid out. A slot left with no question
 * (every one left out to fit) is not on the page; a panel stays.
 */
function contentOf(input: GenerateInput, w: PageWork, questions: GeneratedQuestion[], examples: (QuestionPackage | null)[] = []): PageContent | null {
  if (!input.book || !w.layout) return null;
  const layoutSlot = (q: GeneratedQuestion) => w.slots.find((x) => x.id === q.slot)!.layoutSlot;
  const keep = w.layout.slots.flatMap((x, k) => (PANEL_SLOTS.includes(x.slot) || questions.some((q) => layoutSlot(q) === k) ? [k] : []));
  return dayPageContent({
    curriculum: input.curriculum, plan: input.plan, day: w.day, page: w.page, layout: { ...w.layout, slots: keep.map((k) => w.layout!.slots[k]) },
    child: input.book.child, workbook: input.number,
    questions: questions.map((q) => ({
      number: q.number, slot: keep.indexOf(layoutSlot(q)), package: q.package, ...(q.check.status === "failed" ? { failed: q.check.reason } : {}),
    })),
    examples: w.panels.flatMap((x, k) => (examples[k] ? [{ slot: keep.indexOf(x.layoutSlot), package: examples[k]! }] : [])),
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

/**
 * Runs `run` on the items, at most `limit` at once, in item order, and stops taking items once `stop` says so. On the
 * first error no new item starts, and every item in flight settles before the error is thrown (#312, R379-2), so
 * nothing of this call is still writing when its caller tries again.
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
 * The book's pages and their numbers, before any AI call: the cover, How + Plan, the days, the back cover, blanks. Each
 * day page with its layout, slots and panels, and each slot planned (#380). The same input always gives the same.
 */
function layOut(input: GenerateInput) {
  const work: PageWork[] = [];
  let number = 2;
  for (const day of input.plan.days) {
    for (const page of day.pages) {
      const layout = input.book ? layoutDayPage(input.curriculum, input.plan, day.day, page) : null;
      const panels = (layout?.slots ?? []).flatMap((x, k): Panel[] => {
        const part = page.parts[x.part];
        const skill = part?.step?.skill ?? part?.skills[0];
        return PANEL_SLOTS.includes(x.slot) && skill ? [{ id: `e${k + 1}`, layoutSlot: k, place: x.slot, skill }] : [];
      });
      work.push({
        number: ++number, day: day.day, page, layout, slots: layout ? layoutSlots(page, layout) : slotsOf(page), panels,
        tries: { used: new Map(), max: Infinity }, calls: { next: 0, kept: new Map() }, solves: new Map(),
      });
    }
  }
  // Each slot's skill, kind of question, numbers and person, planned in book order (#380), so the same skill is not
  // asked the same way page after page and no two questions of a page work one sum.
  if (input.book) planBook(input, work);
  if (input.itemPolicy === "approved-v1") {
    const used = new Set<string>();
    for (const w of work) {
      const pageOps = new Set<string>();
      for (const slot of w.slots) {
        let best = contractFor(input, w, slot);
        for (let candidate = 0; candidate < 128; candidate++) {
          const c = contractFor(input, w, slot, candidate);
          if (!c) break;
          best = c;
          const key = JSON.stringify([c.item.text, c.item.operation, c.item.numbers, c.item.sequence]);
          const op = c.item.operation ? JSON.stringify(c.item.operation) : key;
          if (!used.has(key) && !pageOps.has(op)) { used.add(key); pageOps.add(op); break; }
        }
        slot.contract = best;
      }
    }
  }
  const backCover = number + 1;
  return { work, backCover, total: Math.ceil(backCover / 4) * 4 };
}

/**
 * The fingerprint of the book this input plans (#312, R379-8-2): every day page's number, day, type, layout, panels,
 * and each slot with its place, room, skill, kind, numbers and planned wording. It changes when the curriculum, the
 * layouts or the templates' rooms give another book. It says nothing of the child's name: it is taken with no name
 * (the plan leaves the child's own name out of the people it names, so the real name would show in it).
 */
export function bookOutline(input: GenerateInput): string {
  const { work, total } = layOut(input.book ? { ...input, book: { child: "" } } : input);
  return digestOf({
    number: input.number, level: input.plan.level, total, laidOut: !!input.book, ...(input.itemPolicy === "approved-v1" ? { itemPipeline: { version: 1, examples: ITEM_EXAMPLES } } : {}),
    pages: work.map((w) => ({
      number: w.number, day: w.day, page: w.page.number, type: w.page.type, layout: w.layout, panels: w.panels,
      slots: w.slots.map((x) => ({
        id: x.id, part: x.part.kind, skills: x.part.skills, place: x.place, layoutSlot: x.layoutSlot, aim: x.aim ?? null,
        room: x.place ? roomOf(input, x.place, w.day) ?? null : null, planned: x.planned ?? null, ...(input.itemPolicy === "approved-v1" ? { contract: contractFor(input, w, x) } : {}),
      })),
    })),
  });
}

/** Why a kept day page does not fit the page the plan has at its number (R379-8-2), or null. */
function keptPageProblem(input: GenerateInput, w: PageWork | undefined, p: GeneratedPage): string | null {
  if (!w) return `kept page ${p.number} is not a day page of the plan`;
  if (p.day !== w.day || p.pageOfDay !== w.page.number || p.type !== w.page.type) {
    return `kept page ${p.number} is day ${p.day}, page ${p.pageOfDay} (${p.type}); the plan has day ${w.day}, page ${w.page.number} (${w.page.type}) there`;
  }
  const ids = new Set(w.slots.map((x) => x.id));
  const stray = [...p.questions.map((q) => q.slot), ...(p.leftOut ?? []).map((x) => x.slot)].find((id) => !ids.has(id));
  if (stray) return `kept page ${p.number} has slot ${stray}, which the plan's page does not have`;
  if (!!input.book !== !!p.content) return `kept page ${p.number} ${p.content ? "is" : "is not"} laid out, and the plan's book ${input.book ? "is" : "is not"}`;
  // The page's ID prints the child's name and the workbook number: a name changed since the page was kept would mix two.
  const id = (p.content as { id?: string } | undefined)?.id;
  if (input.book && id !== undefined && !id.startsWith(pageId(input.book.child, input.number, ""))) return `kept page ${p.number} was made for another name or workbook number`;
  return null;
}

/**
 * Generates a draft from a plan and stores it as one unit. Refused, with nothing stored and no AI call, when the input
 * is not sound; refused after generation when the store refuses the draft. Throws ResumeMismatch when a kept page,
 * attempt or call does not fit the plan (R379-8-2).
 */
export async function generateWorkbook(input: GenerateInput, deps: GenerateDeps): Promise<GenerateResult> {
  if (!isUuid(input.workbookId)) return { status: "refused", reason: "the workbook id is not a UUID" };
  if (!isUuid(input.childId)) return { status: "refused", reason: "the child id is not a UUID" };
  if (input.plan.days.length === 0) return { status: "refused", reason: "the plan has no days" };

  const { work, backCover, total } = layOut(input);
  const byNumber = new Map(work.map((w) => [w.number, w]));
  // A resumed run (#312) keeps its stored pages and their tokens; a new token never repeats a kept one (a bounded
  // number of tries; a maker that keeps repeating is caught by draftProblem). Each page starts with the attempts its
  // slots used in earlier calls. Everything kept must fit the plan's pages and slots, else nothing goes on (R379-8-2).
  const kept = new Map((await deps.pages?.load() ?? []).map((p) => [p.number, p]));
  for (const p of kept.values()) {
    const problem = keptPageProblem(input, byNumber.get(p.number), p);
    if (problem) throw new ResumeMismatch(problem);
  }
  const spentBefore = await deps.attempts?.load() ?? new Map<string, number>();
  for (const key of spentBefore.keys()) {
    const [page, id] = [Number(key.slice(0, key.indexOf(":"))), key.slice(key.indexOf(":") + 1)];
    const w = byNumber.get(page);
    if (!w || ![...w.slots, ...w.panels].some((x) => x.id === id)) throw new ResumeMismatch(`the attempts kept for page ${page}, slot ${id} name a slot the plan does not have`);
  }
  for (const w of work) {
    w.tries.max = deps.attempts?.max ?? Infinity;
    for (const id of [...w.slots.map((x) => x.id), ...w.panels.map((x) => x.id)]) {
      const n = spentBefore.get(`${w.number}:${id}`);
      if (n) w.tries.used.set(id, n);
    }
  }
  // The AI calls earlier tries kept of the pages still to write (R379-7-1): each page replays them in order, with
  // their kept solve checks (R379-8-1).
  const open = work.filter((w) => !kept.has(w.number) && w.slots.length > 0);
  if (deps.calls && open.length > 0) {
    const numbers = open.map((w) => w.number);
    const openByNumber = new Map(open.map((w) => [w.number, w]));
    for (const c of await deps.calls.load(numbers)) {
      const w = openByNumber.get(c.page);
      if (!w) throw new ResumeMismatch(`a call kept for page ${c.page} is of a page the plan does not have to write`);
      // Checked before any AI call: a page's first call asks all its slots and panels; a later one some of them. Its
      // exact slots are checked again when it is replayed (writeSlots).
      const ids = new Set([...w.slots, ...w.panels].map((x) => x.id));
      const first: CallAsk = { name: PAGE_CALL, slots: w.slots.map((x) => x.id), panels: w.panels.map((x) => x.id) };
      const ask = c.call.ask as CallAsk | undefined;
      const fits = c.seq === 0 ? sameAsk(ask, first) : !!ask && LATER_CALLS.includes(ask.name) && [...ask.slots, ...ask.panels].every((id) => ids.has(id));
      if (!fits) throw new ResumeMismatch(`page ${w.number}: its kept call ${c.seq} is ${askText(ask)}, which the plan's page does not make`);
      w.calls.kept.set(c.seq, c.call);
    }
    for (const [key, verdict] of await deps.calls.solves(numbers)) openByNumber.get(Number(key.slice(0, key.indexOf(":"))))?.solves.set(key, verdict);
  }
  const used = new Set([...kept.values()].map((p) => p.qrToken));
  const tokens = Array.from({ length: total }, (_, i) => kept.get(i + 1)?.qrToken ?? (() => {
    let t = deps.qrToken();
    for (let tries = 0; used.has(t) && tries < 1000; tries++) t = deps.qrToken();
    used.add(t);
    return t;
  })());
  const book: FitBook = { id: input.workbookId, childId: input.childId, number: input.number, levels: [input.plan.level], profileBuild: input.profileBuild };

  const plain = (n: number, type: BookPageType): GeneratedPage => ({
    number: n, type, dayLabel: null, day: null, pageOfDay: null, qrToken: tokens[n - 1], fit: { status: "not-needed" }, attempts: 0, questions: [],
    ...(input.book ? { content: bookPageContent({ curriculum: input.curriculum, plan: input.plan, child: input.book.child, workbook: input.number, type, number: n }) } : {}),
  });
  // What the days before have asked, for a laid-out book: each page is told it, and a repeat goes to the redo. It
  // changes only between days (#312), so the pages of a day read the same memory however many run at once.
  let memory: BookMemory | null = input.book ? { texts: new Map(), keys: new Map(), shapes: new Map(), shapeText: new Map(), codeShapes: new Map() } : null;
  const finished = new Map<number, GeneratedPage>();
  for (const w of work) if (kept.has(w.number)) finished.set(w.number, kept.get(w.number)!);
  if (finished.size > 0) deps.progress?.(finished.size, work.length);
  const writePage = async (w: PageWork, first: PageCall | null, memory: BookMemory | null): Promise<GeneratedPage> => {
    const qrToken = tokens[w.number - 1];
    const page = { number: w.number, type: w.page.type, dayLabel: `Day ${w.day}`, day: w.day, pageOfDay: w.page.number, qrToken };
    let examples: (QuestionPackage | null)[] = [];
    const check = (questions: GeneratedQuestion[]) => deps.fit.fits(fitPage(w, qrToken, questions, contentOf(input, w, questions, examples)), book);
    let result: GeneratedPage;
    if (w.slots.length === 0 || !first) {
      const content = contentOf(input, w, []);
      result = { ...page, fit: { status: "not-needed" }, attempts: 0, questions: [], ...(content ? { content } : {}), ...(w.layout?.omissions.length ? { omissions: w.layout.omissions } : {}) };
    } else {
      const pass = await firstPass(input, deps, w, memory, first);
      let questions = pass.questions;
      examples = pass.examples;
      let fit = await check(questions);
      let attempts: 1 | 2 = 1;
      const shorter = fit.ok ? null : await shorterRewrite(input, deps, w, questions, shorterNote(input, w, questions, fit.problems), memory);
      if (shorter) {
        questions = shorter;
        fit = await check(questions);
        attempts = 2;
      }
      // Still no room: first pair the tall cards in rows (parent-led pages), then leave out questions one at a time
      // until the page fits; if it never does, keep them all.
      if (!fit.ok) {
        const paired = pairedTall(input, w, questions);
        const pairedFit = paired ? await check(paired) : null;
        if (paired && pairedFit?.ok) {
          questions = paired;
          fit = pairedFit;
        }
      }
      const leftOut: { question: GeneratedQuestion; slot: Slot; reason: string }[] = [];
      let kept = questions;
      let left = fit;
      // A page keeps at least one question: its panels take their sums from its questions.
      while (!left.ok && kept.length > 1) {
        const out = toLeaveOut(kept, left.problems);
        leftOut.push({ question: kept[out.index], slot: w.slots.find((x) => x.id === kept[out.index].slot)!, reason: out.reason });
        kept = renumbered(kept.filter((_, k) => k !== out.index));
        left = await check(kept);
      }
      if (left.ok && leftOut.length > 0) {
        questions = kept;
        fit = left;
      } else leftOut.length = 0;
      const content = contentOf(input, w, questions, examples);
      const omissions = omissionsWith(w, leftOut);
      result = {
        ...page, fit: fit.ok ? { status: "fits" } : { status: "failed", problems: fit.problems }, attempts, questions,
        ...(content ? { content } : {}), ...(omissions.length ? { omissions } : {}),
        ...(leftOut.length ? { leftOut: leftOut.map((x) => ({ slot: x.question.slot, part: x.question.part, text: x.question.package?.text ?? null, reason: x.reason })) } : {}),
      };
    }
    return result;
  };
  // Day by day, in order, so each day's pages know what the days before asked (#312). The first calls of a day's pages
  // run at once (`concurrency`), each told what the days before asked; the rest of each page (its repeats against the
  // book and this day's pages before it, the redo, the fit) runs in page order, and the page is stored then. So the
  // draft is the same at any concurrency, and a resumed day reads what its stored pages asked.
  for (const day of input.plan.days) {
    const pagesOfDay = work.filter((w) => w.day === day.day);
    const before = memory;
    const seen = memory ? cloneMemory(memory) : null;
    const turns = pagesOfDay.map(() => {
      let settle!: (error?: unknown) => void;
      const done = new Promise<void>((resolve, reject) => { settle = (error) => (error === undefined ? resolve() : reject(error)); });
      done.catch(() => undefined);
      return { done, settle };
    });
    await pool(pagesOfDay.map((w, k) => ({ w, k })), deps.concurrency ?? 1, async ({ w, k }) => {
      try {
        const kept = finished.get(w.number);
        const first = kept || w.slots.length === 0 ? null : await pageCall(input, deps, w, before);
        if (k > 0) await turns[k - 1].done;
        const page = kept ?? await writePage(w, first, seen);
        // Every call kept for the page was replayed: one the page never reached is of another plan (R379-8-2).
        const unread = [...w.calls.kept.keys()].filter((seq) => seq >= w.calls.next);
        if (!kept && unread.length > 0) throw new ResumeMismatch(`page ${w.number} has kept call ${unread.join(", ")}, which the plan's page does not make`);
        if (!kept) {
          await deps.pages?.save(page);
          finished.set(w.number, page);
          deps.progress?.(finished.size, work.length);
        }
        if (seen) remember(seen, w.number, page.questions);
        turns[k].settle();
      } catch (error) {
        turns[k].settle(error ?? new Error("a page failed"));
        throw error;
      }
    }, () => deps.stop?.() ?? false);
    if (pagesOfDay.some((w) => !finished.has(w.number))) return { status: "paused", done: finished.size, total: work.length };
    memory = seen;
  }
  // With a page store, the stored pages are the truth (#312, R379-2): the draft is built from them.
  if (deps.pages) {
    const stored = new Map((await deps.pages.load()).map((p) => [p.number, p]));
    for (const w of work) {
      const page = stored.get(w.number);
      if (!page) throw new Error(`day page ${w.number} is not stored`);
      finished.set(w.number, page);
    }
  }
  let pages: GeneratedPage[] = [plain(1, "cover"), plain(2, "how-plan"), ...work.map((w) => finished.get(w.number)!)];
  pages.push(plain(backCover, "back-cover"));
  for (let n = backCover + 1; n <= total; n++) pages.push(plain(n, "blank"));

  let quality: BookQuality | undefined;
  if (input.itemPolicy === "approved-v1") {
    const reviewed = await checkWholeBook(pages, async (page, issues) => {
      const w = byNumber.get(page.number);
      if (!w || !issues.some(i => i.kind === "repeat")) return null;
      const questions = page.questions.map(q => {
        const slot = w.slots.find(s => s.id === q.slot);
        const c = slot ? contractFor(input, w, slot, 2) : null;
        if (!c || c.source !== "code") return q;
        const b = buildPlannedItem(c, c.item, { id: q.package?.id ?? `${input.workbookId}:${page.number}:${q.slot}`, workbookId: input.workbookId, page: page.number, question: q.number, level: input.plan.level, skills: [c.item.skill] });
        return b.check.status === "failed" ? q : { ...q, check: b.check, package: b.package };
      });
      const content = contentOf(input, w, questions);
      const fit = await deps.fit.fits(fitPage(w, page.qrToken, questions, content), book);
      return { ...page, questions, ...(content ? { content } : {}), fit: fit.ok ? { status: "fits" } : { status: "failed", problems: fit.problems } };
    });
    quality = reviewed.quality;
    pages = reviewed.pages.map(p => {
      const issues = quality!.issues.filter(i => i.page === p.number);
      return issues.length ? { ...p, fit: { status: "failed" as const, problems: [...(p.fit.status === "failed" ? p.fit.problems : []), ...issues.map(i => ({ question: null, reason: `whole-book check: ${i.reason}` }))] } } : p;
    });
    // Checkpoints keep pre-review pages. These code-only repairs are deterministic
    // and repeat after a resume without spending another provider call.
  }
  const questions = pages.flatMap((p) => p.questions);
  const draft: GeneratedWorkbook = {
    ...book,
    model: deps.ai.model,
    pages,
    ...(quality ? { quality } : {}),
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

/** Numeric data of items without an operation, including their pictures. Ignore editable words and labels. */
function editNumbers(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(editNumbers);
  if (value && typeof value === "object") return Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).flatMap(([, v]) => editNumbers(v));
  return [];
}

/** Replace only the selected questions of a stored day page. The plan, checks and templates stay binding. */
export async function reviseWorkbookPage(input: GenerateInput, deps: GenerateDeps, page: GeneratedPage,
  change: { question: number | number[] | null; note: string; item?: unknown; items?: Record<number, unknown> }): Promise<GeneratedPage> {
  const w = layOut(input).work.find((x) => x.number === page.number);
  if (!w || !page.content || page.content.kind !== "day") throw new Error("This page has no questions to rewrite.");
  const targets = page.questions.filter((q) => change.question === null || (Array.isArray(change.question) ? change.question.includes(q.number) : q.number === change.question));
  if (!targets.length) throw new Error("This question is unavailable. Reload the page.");
  const which = targets.map((q) => w.slots.findIndex((s) => s.id === q.slot));
  if (which.some((i) => i < 0)) throw new Error("The page plan changed. Prepare a new workbook.");
  const note = change.note.replace(/(?:Whole page|Question \d+): /g, "");
  const keepNumbers = /keep (?:the )?numbers/i.test(note) || !(/\d|\b(?:change|replace|different|new)\b.{0,25}\b(?:numbers|operands|calculation)\b/i.test(note));
  // Keep the current data, including edits from earlier revisions. The note can change its nouns and wording.
  for (let k = 0; k < which.length; k++) {
    const slot = w.slots[which[k]], old = slot.planned;
    const op = targets[k].package?.operation;
    const operands = op && "operands" in op && op.operands.every(v => typeof v === "number") ? op.operands as number[] : null;
    const numbers = operands && op?.kind === "subtract" ? [operands[0] - operands[1], operands[1]] : operands;
    slot.planned = { use: keepNumbers ? numbers : null, spare: null, name: old?.name ?? "Mia", thing: old?.thing ?? "apples",
      names: PEOPLE.filter(name => name !== input.book?.child), things: [...THINGS] };
    delete slot.aim;
  }
  const currentQuestions = targets.map(q => ({ number: q.number, text: q.package?.text ?? null, data: workbookEditItem(q) }));
  const writer = deps.ai;
  deps = { ...deps, ai: { model: writer.model, json: (request, signal) => writer.json({ ...request,
    system: `${request.system} For an edit, read currentQuestions. Keep each question's numbers, operation and data unless the comment explicitly asks to change them.`,
    content: request.content.map(part => part.type === "text" ? { ...part, text: JSON.stringify({ ...JSON.parse(part.text), currentQuestions }) } : part),
  }, signal) } };
  const built: BuiltQuestion[] = [];
  let examples: (QuestionPackage | null)[] = [];
  const manual = change.items ?? (change.item !== undefined ? { [targets[0].number]: change.item } : {});
  const aiWhich = which.filter((_, k) => !Object.hasOwn(manual, targets[k].number));
  const result = aiWhich.length ? await writeSlots(input, deps, w, aiWhich, change.note, "workbook_page_redo",
    change.question === null ? w.panels : [], null,
    page.questions.filter((q) => !targets.includes(q)).flatMap((q) => q.package ? [q.package.text] : []), { skipSolve: true }) : null;
  if (result) examples = result.examples.map((b) => {
    if (b.check.status === "failed") throw new Error(b.check.reason);
    return b.package;
  });
  for (let k = 0; k < targets.length; k++) {
    const q = targets[k], slot = w.slots[which[k]];
    if (!Object.hasOwn(manual, q.number)) { built.push(result!.built[aiWhich.indexOf(which[k])]); continue; }
    const raw = manual[q.number] as { text?: unknown; easier?: { text?: unknown } };
    const b = buildQuestion(raw, { id: q.package?.id ?? `${input.workbookId}:p${page.number}q${q.number}`,
      workbookId: input.workbookId, page: page.number, question: q.number, level: input.plan.level,
      skills: slot.part.skills, signs: levelSigns(input.curriculum, input.plan.level), story: !!slot.place && STORY_CHECK_PLACES.has(slot.place) });
    if (b.package && typeof raw.text === "string") {
      b.package.text = raw.text;
      b.package.textSource = "human";
      if (b.package.easierExample && typeof raw.easier?.text === "string") b.package.easierExample.text = raw.easier.text;
      const codeCheck = checkQuestionPackage(b.package);
      if (codeCheck.status !== "checked") throw new Error("The code cannot derive and check every answer from these fields.");
      const problem = kindProblem(b.package, raw as Record<string, unknown>)
        ?? (slot.place && STORY_CHECK_PLACES.has(slot.place) ? storyProblem(raw.text) : quantityStoryProblem(raw.text));
      if (problem) b.check = { status: "failed", reason: problem };
    }
    built.push(b);
  }
  for (let k = 0; k < built.length; k++) {
    const b = built[k], q = targets[k], slot = w.slots[which[k]];
    if (b.check.status === "failed" || !b.package) throw new Error(b.check.status === "failed" ? b.check.reason : "The question could not be made.");
    b.package = { ...b.package, id: q.package?.id ?? b.package.id,
      ref: { source: "workbook", workbookId: input.workbookId, page: page.number, question: q.number } };
    if (Object.hasOwn(manual, q.number) && b.check.status !== "checked") throw new Error("The code cannot derive every answer from these fields.");
    if (!Object.hasOwn(manual, q.number) && keepNumbers && JSON.stringify(b.package.operation) !== JSON.stringify(q.package?.operation)) throw new Error("The rewrite changed the numbers. Try again and ask to keep the calculation.");
    if (!Object.hasOwn(manual, q.number) && keepNumbers && !q.package?.operation && JSON.stringify(editNumbers([b.package.item?.checks, b.package.item?.figure])) !== JSON.stringify(editNumbers([q.package?.item?.checks, q.package?.item?.figure]))) throw new Error("The rewrite changed the numbers. Try again and ask to keep the calculation.");
    const format = b.package.item?.format;
    if (slot.place && STRICT_SLOTS.includes(slot.place) && format && !SLOT_FORMATS[slot.place]?.includes(format)) throw new Error("The question does not fit this part of the page.");
    const problem = rangeProblem(b.package, input.curriculum, input.plan.level)
      ?? (slot.place === "spot-the-error" ? samProblem(b.package, input.plan.level) : null);
    if (problem) throw new Error(problem);
  }
  await Promise.all([...built, ...examples.filter((p): p is QuestionPackage => p !== null).map((p) => ({ package: p }))].map(async (b) => {
    if (!b.package) return;
    const pkg = b.package;
    const dispatch = () => solveCheck(deps.solver, pkg, deps.solveTimeLimitMs ?? SOLVE_TIME_LIMIT_MS, deps.now);
    const log = deps.editCall ? await deps.editCall("solve", pkg.id, pkg, dispatch) : await dispatch();
    if (log) {
      deps.onSolve?.(log);
      if (log.verdict.status !== "agreed") throw new Error(solveReason(log.verdict));
    }
  }));
  const questions = page.questions.map((q) => {
    const k = targets.indexOf(q);
    return k < 0 ? q : { ...q, package: built[k].package, check: built[k].check };
  });
  // Keep the original slot positions and panels on a question edit. Rebuild only its dependent picture and hints.
  const content = structuredClone(page.content);
  if (change.question === null) {
    const made = contentOf(input, w, questions, examples);
    if (!made || made.kind !== "day") throw new Error("The page could not be laid out.");
    content.blocks = made.blocks;
  } else {
    const { pageFigure } = await import("@/lib/workbook-book");
    for (const block of content.blocks) {
      for (let k = 0; k < targets.length; k++) {
        const number = targets[k].number;
        const at = block.items.indexOf(number);
        if (at < 0) continue;
        const pkg = built[k].package!;
        const figure = pageFigure(pkg.item?.figure);
        if (!block.figures && figure) block.figures = block.items.map(() => null);
        if (block.figures) block.figures[at] = figure;
        if (block.hints) block.hints[at] = null;
        if (block.missing) block.missing = block.missing.filter((m) => m.number !== number);
        if (block.slot === "spot-the-error") {
          const made = contentOf(input, w, questions);
          if (made?.kind === "day") Object.assign(block, made.blocks.find((b) => b.slot === block.slot));
        }
      }
    }
  }
  const next = { ...page, questions, content, fit: { status: "fits" } as PageFit };
  const fit = await deps.fit.fits(fitPage(w, page.qrToken, questions, content), {
    id: input.workbookId, childId: input.childId, number: input.number, levels: [input.plan.level], profileBuild: input.profileBuild,
  });
  if (!fit.ok) throw new Error(`The page does not fit: ${fit.problems.map((p) => p.reason).join(" ")}`);
  return next;
}
