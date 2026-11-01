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
// Pure TypeScript: no Next.js, React, network, database, clock or randomness (the caller passes the QR token maker).
import { BC_SKILL_MAP } from "@/lib/assessment";
import { withTimeLimit, type AiClient } from "@/lib/ai-client";
import { checkQuestionPackage, type QuestionPackage } from "@/lib/question-package";
import { isQrToken, isUuid } from "@/lib/workbook-content";
import type { Curriculum } from "@/lib/workbook-curriculum";
import { buildQuestion, ITEMS_SCHEMA, kindProblem, relationWordings, type BuiltQuestion, type QuestionCheck } from "@/lib/workbook-generator-items";
import { isOneMoreLessSkill } from "@/lib/number-words";
import {
  bookPageContent, dayPageContent, layoutDayPage, mistakesFor, levelSigns, rangeProblem, samFix, samProblem, skillRange, slotRanges, PANEL_SLOTS, SLOT_FORMATS, STRICT_SLOTS,
  type DayLayout, type NumberRange,
} from "@/lib/workbook-book";
import type { Omission, PageContent, SlotName } from "@/lib/workbook-page";
import type { PageType, PlannedPage, PlannedPart, WorkbookPlan } from "@/lib/workbook-plan";
import type { DraftPage } from "@/lib/workbook-render";
import { textRoom } from "@/lib/workbook-template";

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
  /** The skill and the kind of question code chose for the slot (#380): the skill's kinds in turn through the book. */
  aim?: { skill: string; kind: QuestionKind; orElse: QuestionKind[] };
  /**
   * The numbers and the person code chose for the slot (#380, round 5), planned across the whole book: `use`, a pair no
   * other slot of the page has and the book has not used for this kind, if it can; `spare`, another such pair for a redo
   * after a repeat; `name`, a person's name (never Sam, the child of Spot the error).
   */
  planned?: {
    use: number[] | null; spare: number[] | null; name: string | null; say?: string | null; spareSay?: string | null;
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

/** People's names, a girl's and a boy's in turn, so a pronoun can follow. Never Sam: Sam is the child of Spot the error. */
const GIRLS = ["Mia", "Ava", "Lia", "Ana", "Pia", "Ivy", "Nia", "Eva", "Rosa", "Tara", "Gia", "Amy", "Lily", "June"];
const BOYS = ["Ben", "Leo", "Tom", "Raj", "Eli", "Gus", "Dan", "Kai", "Omar", "Max", "Ian", "Jon", "Ali", "Ned"];
const PEOPLE = GIRLS.flatMap((g, i) => [g, BOYS[i]]);
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

/** Things a story counts, in turn through the book (a page never has one twice). */
const THINGS = ["shells", "apples", "cars", "stickers", "hats", "cups", "bugs", "kites", "rocks", "plums", "ducks", "boats", "socks", "books", "leaves", "eggs", "balls", "buttons", "beads", "shoes", "bells", "pens"];

/**
 * What a wording asks (round 6): put together, take away, a missing part, compare (how many more), or read the
 * ten-frame (how many more fill it). A slot of several cards spreads its cards across them.
 */
type Action = "join" | "separate" | "part" | "compare" | "frame";

/**
 * A wording code plans (round 5): {a} and {b} are the planned numbers, {t} their total, {name} the planned person,
 * {thing} the planned thing. `op` is what it works on them: add [a, b], subtract [t, b] or missing-addend [a, t];
 * `ten`, a missing part to 10 (the numbers become a and 10 - a); `figure`, the picture it names.
 */
interface Frame {
  f: string;
  act: Action;
  op: PlannedDoes["operation"]["kind"];
  figure?: "ten-frame" | "dots";
  shows?: "part" | "total";
  ten?: true;
}

const join = (f: string, figure?: Frame["figure"]): Frame => ({ f, act: "join", op: "add", ...(figure ? { figure } : {}) });
const away = (f: string, figure?: Frame["figure"]): Frame => ({ f, act: "separate", op: "subtract", ...(figure ? { figure } : {}) });
const part = (f: string, figure?: Frame["figure"]): Frame => ({ f, act: "part", op: "missing-addend", ...(figure ? { figure, shows: "part" as const } : {}) });
const more = (f: string): Frame => ({ f, act: "compare", op: "missing-addend" });
const tenFrame = (f: string): Frame => ({ f, act: "frame", op: "missing-addend", figure: "ten-frame", shows: "part", ten: true });

/**
 * The wordings code plans for each kind of question, each a whole short question a parent reads aloud ("How many in
 * all?", "How many are left?"; round 6), the setup kept short to make room. A take-away and a compare only where the
 * skill has met subtraction; on 1 more and 1 less (step), wordings about the step only.
 */
function framesFor(kind: QuestionKind, step: boolean, subtraction: boolean): Frame[] {
  const sub = (frames: Frame[]) => (subtraction ? frames : []);
  switch (kind) {
    case "story":
      return [
        join("{a} {thing} and {b} more. How many in all?"),
        join("{a} {thing} here, {b} there. How many in all?"),
        join("{a} {thing}. {name} adds {b}. How many now?"),
        join("{name} picks {a} {thing}, then {b}. How many now?"),
        join("{name} has {a} {thing} and gets {b}. How many now?"),
        ...sub([
          away("{t} {thing}. {name} takes {b}. How many are left?"),
          away("{t} {thing}. {b} go away. How many are left?"),
          away("{name} has {t} {thing} and gives {b} away. How many now?"),
          away("{t} {thing}. {name} hides {b}. How many are left?"),
        ]),
        ...(step ? [] : [
          part("{name} has {a} {thing}. How many more make {t}?"),
          part("{a} {thing} in a box. How many more make {t}?"),
          part("{a} {thing} now. How many more make {t}?"),
          ...sub([
            more("{a} cats and {t} dogs. How many more dogs?"), more("{a} red {thing}, {t} blue. How many more blue?"),
            more("{a} big {thing}, {t} small. How many more small?"),
          ]),
        ]),
      ];
    case "picture":
      return [
        join("Ten-frame: {a} and {b}. How many in all?", "ten-frame"),
        join("{a} dots and {b} dots. How many in all?", "dots"),
        join("{a} dots, then {b} more. How many now?", "dots"),
        join("{a} and {b} on the ten-frame. How many in all?", "ten-frame"),
        join("Ten-frame: {a}, then {b} more. How many now?", "ten-frame"),
        join("{a} dots and {b} more dots. How many now?", "dots"),
        join("Count the dots: {a} and {b}. How many in all?", "dots"),
        ...sub([away("{t} dots. Take away {b}. How many are left?", "ten-frame"), away("{t} dots. {b} hop off. How many are left?", "ten-frame")]),
        ...(step ? [] : [
          tenFrame("Ten-frame: {a} dots. How many more make 10?"),
          tenFrame("{a} dots. How many boxes are empty?"),
          tenFrame("Ten-frame: {a} dots. How many to fill it?"),
          part("{a} dots. How many more make {t}?", "ten-frame"),
          part("{a} dots. How many more dots make {t}?", "ten-frame"),
        ]),
      ];
    case "fact":
      return step
        ? [
          join("What is {b} more than {a}?"), join("{a} and {b} more is what?"), join("What number is {b} more than {a}?"),
          ...sub([away("What is {b} less than {t}?"), away("{t} take away {b} is what?"), away("What number is {b} less than {t}?")]),
        ]
        : [join("{a} + {b} = ?"), join("What is {a} + {b}?"), join("{a} and {b} make what?"), join("Add {a} and {b}. What do you get?")];
    case "missing-part":
      return [
        part("{name} has {a} {thing}. How many more make {t}?"),
        part("{a} and how many more make {t}?"),
        part("{a} + ? = {t}"),
        part("{t} {thing}: {a} are red. How many are not red?"),
        part("What do you add to {a} to make {t}?"),
        part("{a} {thing} in a box. How many more make {t}?"),
        part("How far is {a} from {t}?"),
        tenFrame("Ten-frame: {a} dots. How many more make 10?"),
        ...sub([more("{a} cats and {t} dogs. How many more dogs?"), more("{name} has {a}. Ben has {t}. How many more has Ben?")]),
      ];
    default:
      return [];
  }
}

/** The numbers a wording works on a planned pair: a and 10 - a for a missing part to 10 (null when a is not 1 to 9). */
const framePair = (frame: Frame, pair: number[]): number[] | null => (frame.ten ? (pair[0] >= 1 && pair[0] <= 9 ? [pair[0], 10 - pair[0]] : null) : pair);

/** What a wording works on its numbers [a, b]: its operation and picture. */
function frameDoes(frame: Frame, [a, b]: number[]): PlannedDoes {
  const t = a + b;
  const operands: [number, number] = frame.op === "add" ? [a, b] : frame.op === "subtract" ? [t, b] : [a, t];
  return { operation: { kind: frame.op, operands }, figure: frame.figure ?? null, figureShows: frame.shows ?? null };
}

/** A thing (or dots) counted after the number 1, which takes its singular. */
const PLURAL_AFTER_1 = new RegExp(`\\b1 ((?:red |blue )?)(dots|cats|dogs|${THINGS.join("|")})\\b`, "g");
/** The wordings of a sequence (missing numbers), with no number in them. */
const SEQUENCE_FRAMES = [
  "Fill in the missing numbers.", "What numbers are missing?", "Count up. Fill in the boxes.", "Write the numbers that go in the gaps.",
  "Count on. Which numbers are missing?", "Find the missing numbers in the count.", "Count on. Write the numbers you skip.",
];
/** One of each thing: after the number 1 a story counts one shell, not 1 shells. */
const ONE: Record<string, string> = { leaves: "leaf", shoes: "shoe", boxes: "box" };
const singular = (w: string) => ONE[w] ?? w.replace(/s$/, "");

/** A wording filled in: the numbers, the name, the pronoun it takes and the thing (one thing after 1). */
function fillFrame(frame: string, pair: number[], name: string, thing: string): string {
  const [a, b] = pair;
  const they = BOYS.includes(name) ? "He" : "She";
  // "Ben" is the other person of a compare: another boy's name when the planned person is Ben.
  const other = name === "Ben" ? "Leo" : "Ben";
  return frame.replaceAll("Ben", other).replaceAll("{a}", String(a)).replaceAll("{b}", String(b)).replaceAll("{t}", String(a + b))
    .replaceAll("{name}", name).replaceAll("{They}", they).replaceAll("{thing}", thing)
    .replace(PLURAL_AFTER_1, (_, colour: string, w: string) => `1 ${colour}${singular(w)}`)
    .replace(/\b1 more come\b/, "1 more comes").replace(/\b1 go away\b/, "1 goes away").replace(/\b1 are red\b/, "1 is red")
    .replace(/\b1 boxes are\b/, "1 box is");
}

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
        pair = ranked[0]?.p ?? null;
        spare = ranked.find((x) => pair && bond(x.p) !== bond(pair))?.p ?? null;
        if (pair) {
          used.set(`${group(numbered.kind)}|${pair}`, (used.get(`${group(numbered.kind)}|${pair}`) ?? 0) + 1);
          pagePairs.add(bond(pair));
          if (spare) pagePairs.add(bond(spare));
        }
      }
      const name = slot.place === "spot-the-error" ? null : people[person++ % people.length];
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
        const pick = (pairNow: number[] | null, thingNow: string, not: number[] | null = null) => {
          if (!pairNow) return null;
          // A page of stories takes stories and pictures only, never a bare "9 + ? = 10".
          const frames = kindsHere.flatMap((k, o) => framesFor(k, step, range.subtraction).map((f) => ({ f, k, o })))
            .filter((x) => !storyPlace || /\{thing\}|\{name\}|dots|cats|[Tt]en-frame/.test(x.f.f));
          const fills = frames.map((x, j) => ({ ...x, j, n: frameUse.get(x.f.f) ?? 0, a: acts.get(x.f.act) ?? 0 }))
            .filter((x) => !pageFrames.has(x.f.f))
            .sort((a, b) => Number(a.a >= cap) - Number(b.a >= cap) || a.o - b.o || a.a - b.a || (bookActs.get(a.f.act) ?? 0) - (bookActs.get(b.f.act) ?? 0)
              || a.n - b.n || hashOf(`${slot.id}:${w.number}:${a.j}`) - hashOf(`${slot.id}:${w.number}:${b.j}`))
            .flatMap((x) => {
              const numbers = framePair(x.f, pairNow);
              if (!numbers || numbers[0] + numbers[1] > range.max) return [];
              // A missing part to 10 changes the numbers: never to a pair another slot of the page (or `not`) has.
              if (bond(numbers) !== bond(pairNow) && (pagePairs.has(bond(numbers)) || (not && bond(numbers) === bond(not)))) return [];
              return [{ frame: x.f, kind: x.k, numbers, said: fillFrame(x.f.f, numbers, name, thingNow) }];
            })
            .filter((x) => x.said.length <= room && !said.has(x.said) && !pageShapes.has(shapeOf(x.said)) && withinShapes(x.said));
          return fills[0] ?? null;
        };
        const chosen = pick(pair, things[thing % things.length]);
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
          thing++;
          // A missing part to 10 works a and 10 - a: those are the slot's numbers now.
          if (pair && chosen.numbers.join() !== pair.join()) {
            pair = chosen.numbers;
            pagePairs.add(bond(pair));
          }
        }
        // The spare's wording is for a redo only: it takes no frame from the page's other slots.
        const other = pick(spare, things[(thing + 7) % things.length], pair);
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
      slot.planned = { use: pair, spare, name, say, spareSay, does, spareDoes };
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
  "Copy: short plain sentences a child can read; Canadian English (Mom, metre, litre, colour); money in Canadian dollars and cents; never a school grade, a brand name, or a prompt to scan or call anyone; no last names.",
  "Room: a slot may give its room: the most characters its question text has room for on the printed page (characters), in lines of about perLine characters. Count the characters of the text, spaces included, and stay within it: the page has no room for more, and nothing is shrunk to fit. Say it short: '3 cars. 2 more come. How many now?', not a long story. On a card (lines 2), writing lines (written-reason) or a tall picture (number-line, base-ten) take the place of a line: then write one line at most. A ten-frame on a card is taller than its answer box: with a ten-frame, write one line. A written-reason card's lines take as much room as 2 lines of text, so a page of cards has at most 2 written-reason items. For another question with no number answer (Equal? Which has more?), use draw ('Draw 3 dots and 3 dots. Circle the bigger group.'): a parent checks it and it takes the room of an answer box. A write-number item always needs an operation.",
  "Vary: every page is written alone, and other days practise the same skills. So no two questions of a page are the same, and each slot gives a vary number: make it one of the item's numbers (its first number, its total or its count) when the rules allow, so the pages of different days differ.",
  "Pictures must show what the text says. A dots picture of a subtraction crosses out the dots taken away: use it only for take-away, never to compare two groups (how many more red than blue? has no picture). A missing part's picture shows only the part given. There is no five-frame picture: a five-frame question has no picture.",
  "Aim: a slot may give its aim: a skill and a kind of question code chose for it (what the kind means is in means). Write that kind of question on that skill. Only when that kind cannot ask that skill, use the first kind of orElse that can, or another of the slot's skills.",
  "Relation format: give numbers (one number, or two) and relation: kind less-than (to: [the benchmark], as 'Is 7 less than 5?'), closer (to: [two benchmarks], as 'Is 8 close to 0 or 10?', never halfway), equal (two numbers: 'Equal or not?'), more or fewer (two numbers and labels: one short word for each, as cats and dogs: 'Who has more?'). Code writes the choices the child circles and the answer; the text never says the answer. No < or > signs.",
  "A picture of a missing part shows the part given or the total: say which in figureShows ('Mia has 3. How many more make 8?' shows the part, 3; 'Ten-frame: 8 dots. 5 and how many more?' shows the total, 8). Any number the text says the picture shows ('8 dots', 'Ten-frame: 8') is what code draws.",
  "One question per item: the text never holds a worked fact or a second task ('5 and 0 more is 5. Show 6.' is not a question). A draw item says what to draw and never asks how many, which number or who; ask which has more with a relation item.",
  "Used up: the request may list usedUp, shapes of question the book already asks 3 times: each an example and its words (the question's lowercase words in order, without numbers, names or other capitalised words). Outside practice, write no question whose lowercase words are exactly one of them: use other words or another kind of question, not only other numbers or names.",
  "Planned: a slot may give planned numbers and a name, chosen by code across the whole book so its questions differ. Build the item on the numbers [a, b]: a sum is a + b; a take-away starts at a + b and takes b away; a missing part has the part a and the total a + b; a picture shows a and b (or a + b in all); 1 more than a is a + 1; a relation uses a (and b); Sam's sum in Spot the error is a + b (or a + b take away b). Keep to them unless a rule of the slot forbids it; then change as little as you can. A person in the question is the planned name. Never name anyone Sam outside Spot the error: Sam is the child whose work Spot the error shows. Planned say is the wording code chose for the slot, with those numbers, that name and a thing to count, so the book's questions do not all sound alike: write the question text as say, word for word, unless a rule of the slot forbids it (then change as few words as you can). Its operation, picture, wrong answers and easier example are of that text: 'Mia has 3 shells. How many more make 8?' is missing-addend [3, 8]; 'Ten-frame: 3 and 4. How many in all?' is add 3 + 4 with a ten-frame. With say, planned gives its operation (kind and operands), figure and figureShows: use exactly those. Code checks that the text names the numbers the operation works: an operation of other numbers fails.",
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
  "Before you write an easier example, work out both answers: the easier example's answer is a different number from the question's answer. For a missing part, easier means a smaller missing part (fewer to count on) with a total no larger, so its answer differs: for 3 + ? = 5 (answer 2) it is 3 + ? = 4 (answer 1), never 2 + ? = 4 (answer 2 again); for 'How far is 7 from 10?' (answer 3) it is 'How far is 9 from 10?' (answer 1). So ask a missing part of 2 or more: a missing part of 1 has no easier example. Every item with an operation has an easier example; for the smallest sums take a smaller number: 1 + 1 for 2 + 1, 1 + 0 for 1 + 1.",
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

function pageRequest(input: GenerateInput, w: PageWork, slots: Slot[], note: string | null, panels: Panel[] = [], memory: BookMemory | null = null, pageTexts: string[] = []) {
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
    level: `U${plan.level}`,
    lead: plan.lead,
    instructions: page.instructions,
    day,
    page: page.number,
    pageType: page.type,
    parts,
    slots: slots.map((s) => {
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
async function callAi(deps: GenerateDeps, name: string, request: unknown, ids: string[] = []): Promise<{ items: Map<string, unknown>; error: string | null }> {
  const ask = () => withTimeLimit(deps.timeLimitMs ?? TIME_LIMIT_MS, (signal) =>
    deps.ai.json({ name, system: SYSTEM, content: [{ type: "text", text: JSON.stringify(request) }], schema: ITEMS_SCHEMA, effort: "medium" }, signal));
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
    const out = await ask().catch(() => { resent = true; return ask(); });
    const items = new Map<string, unknown>();
    read(out, items);
    // An answer that leaves out slots it was asked for is incomplete, like one that is not JSON: sent once more (if it
    // was not already), and the slots it gave are kept.
    if (!resent && ids.some((id) => !items.has(id))) read(await ask().catch(() => null), items);
    return { items, error: null };
  } catch (e) {
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
  const at = place === "warm-up" ? undefined : memory?.keys.get(key);
  if (at !== undefined) return `it repeats a question already asked on page ${at} ("${p.text}"): write a different question`;
  const shape = shapeOf(p.text);
  // A relation's words are code's (round 6): only its page must not ask it twice in the same words.
  const onPages = place && !PRACTICE_PLACES.has(place) && shape && !isRelation(p) ? memory?.shapes.get(shape) ?? [] : [];
  if (onPages.length >= SHAPE_MOST) return `the book already asks this kind of question ${onPages.length} times (pages ${[...new Set(onPages)].join(", ")}): ask another kind of question`;
  for (const s of siblings) {
    if (dupKey(s.package) === key) return `it is the same as question ${s.number} on this page ("${s.package.text}")`;
    // The same words twice on a page read as one question asked again, whatever the numbers behind them (round 6).
    if (plainText(s.package.text) === plainText(p.text)) return `its text is the same as question ${s.number}'s on this page ("${s.package.text}"): word it another way`;
    const op = opKey(p);
    if (op && op === opKey(s.package)) return `it works the same sum as question ${s.number} on this page ("${s.package.text}")`;
    const [a, b] = [numbersIn(p.text), numbersIn(s.package.text)];
    if (place && REVIEW_PLACES.has(place) && a.length > 0 && a.length === b.length && plainText(p.text).replace(/\d+/g, "#") === plainText(s.package.text).replace(/\d+/g, "#")
      && a.filter((x, i) => x !== b[i]).length <= 1) return `it differs from question ${s.number} on this page ("${s.package.text}") only by one number: ask another kind of question`;
    if (place && !PRACTICE_PLACES.has(place) && shape && shape === shapeOf(s.package.text)) return `it asks the same kind of question as question ${s.number} on this page ("${s.package.text}") with other numbers or names: ask another kind of question`;
  }
  return null;
}

/** A relation item: its text is code's (round 6). */
const isRelation = (p: QuestionPackage) => (p.item?.checks ?? []).some((c) => c.kind === "relation");

/** Adds a finished page's questions to what the book has asked. */
function remember(memory: BookMemory, page: number, questions: GeneratedQuestion[]) {
  for (const q of questions) {
    if (!q.package) continue;
    if (!memory.keys.has(dupKey(q.package))) memory.keys.set(dupKey(q.package), page);
    const shape = shapeOf(q.package.text);
    if (shape && q.place && !PRACTICE_PLACES.has(q.place) && q.check.status !== "failed" && !isRelation(q.package)) {
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
}

/** Writes the page's slots at `which` (indexes) in one AI call and builds each; never throws. */
async function writeSlots(input: GenerateInput, deps: GenerateDeps, w: PageWork, which: number[], note: string | null, name: string, panels: Panel[] = [], memory: BookMemory | null = null, pageTexts: string[] = []) {
  const asked = which.map((i) => w.slots[i]);
  const out = await callAi(deps, name, pageRequest(input, w, asked, note, panels, memory, pageTexts), [...asked.map((x) => x.id), ...panels.map((x) => x.id)]);
  const missing = (id: string) => (out.items.size ? ` (it answered slots ${[...out.items.keys()].join(", ")}, not ${id})` : " (its answer held no items)");
  // Each panel's worked example: of its own skill, one code can show worked out, in the level's numbers.
  const examples = panels.map((x) => {
    const b = buildQuestion(shortSequence(out.items.get(x.id), input.plan.level), {
      id: `${input.workbookId}:d${w.day}p${w.page.number}${x.id}`, workbookId: input.workbookId, page: w.number, question: 1, level: input.plan.level, skills: [x.skill],
      signs: levelSigns(input.curriculum, input.plan.level),
    });
    if (out.error && !out.items.has(x.id)) b.check = { status: "failed", reason: `the AI gave no answer: ${out.error}` };
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
    const b = buildQuestion(shortSequence(out.items.get(slot.id), input.plan.level), {
      id: `${input.workbookId}:d${w.day}p${w.page.number}s${slot.id}`,
      workbookId: input.workbookId, page: w.number, question: i + 1, level: input.plan.level, skills: slot.part.skills,
      signs: levelSigns(input.curriculum, input.plan.level),
      ...(slot.place ? { room: roomOf(input, slot.place, w.day)?.characters } : {}), variant: w.number + i,
    });
    // Sam is only Spot the error's child: anyone else named Sam takes the slot's planned name.
    if (b.package && slot.place && slot.place !== "spot-the-error") b.package = withoutSam(b.package, slot.planned?.name ?? null);
    if (out.error && !out.items.has(slot.id)) b.check = { status: "failed", reason: `the AI gave no answer: ${out.error}` };
    else if (!out.items.has(slot.id) && b.check.status === "failed") b.check = { status: "failed", reason: `${b.check.reason}${missing(slot.id)}` };
    // A slot with a layout of its own takes only its format: another would not lay out there.
    const format = b.package?.item?.format;
    if (slot.place && STRICT_SLOTS.includes(slot.place) && b.check.status !== "failed" && format && !SLOT_FORMATS[slot.place]?.includes(format)) {
      b.check = { status: "failed", reason: `the ${slot.place} place takes the ${SLOT_FORMATS[slot.place]!.join(" or ")} format, not ${format}` };
    }
    // Spot the error shows Sam's wrong steps, built by code: the shown wrong answer must be a mistake code can show.
    if (slot.place === "spot-the-error" && b.check.status !== "failed" && b.package) {
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
  // A relation's text is code's (round 6): of its wordings, one whose words no other question of the page has.
  const taken = new Set(pageTexts.map(shapeOf));
  built.forEach((b, k) => {
    if (!b.package) return;
    const wordings = relationWordings(b.package);
    if (wordings.length > 0 && taken.has(shapeOf(b.package.text))) {
      const place = w.slots[which[k]].place;
      const room = (place ? roomOf(input, place, w.day)?.characters : null) ?? Infinity;
      const free = wordings.find((x) => !taken.has(shapeOf(x)) && x.length <= room);
      if (free) b.package = { ...b.package, text: free };
    }
    taken.add(shapeOf(b.package.text));
  });
  return { built, examples };
}

/**
 * A question given its slot's planned wording by code (round 6), or null: when the AI's text failed as a repeat of its
 * page or book but its item works the planned operation (with the planned picture), code's wording of the same item.
 * The rewritten question is checked again in full; null when it would fail.
 */
function withPlannedWording(input: GenerateInput, b: BuiltQuestion, slot: Slot): BuiltQuestion | null {
  const say = slot.planned?.say;
  const does = slot.planned?.does;
  const p = b.package;
  if (!say || !does || !p?.operation || p.text === say) return null;
  if (p.operation.kind !== does.operation.kind || JSON.stringify(p.operation.operands) !== JSON.stringify(does.operation.operands)) return null;
  if (does.figure && p.item?.figure?.kind !== does.figure) return null;
  const pkg: QuestionPackage = { ...p, text: say };
  const check = checkQuestionPackage(pkg);
  if (check.status === "failed" || kindProblem(pkg, {}) || rangeProblem(pkg, input.curriculum, input.plan.level)) return null;
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
  if (!room || b.check.status === "failed" || !b.package) return null;
  const id = w.slots[i].id;
  const n = b.package.text.length;
  if (n > room.characters) {
    return { length: n, note: `Slot ${id} is sound but too long for its place: its text has ${n} characters and its room is ${room.characters}. Write the same kind of question again, on the same skill, in at most ${room.characters} characters (a short sentence or two: '5 cars. 3 more come. How many now?').` };
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
async function firstPass(input: GenerateInput, deps: GenerateDeps, w: PageWork, memory: BookMemory | null): Promise<{ questions: GeneratedQuestion[]; examples: (QuestionPackage | null)[] }> {
  const all = w.slots.map((_, i) => i);
  const first = await writeSlots(input, deps, w, all, null, "workbook_page", w.panels, memory);
  const built = first.built;
  built.forEach((b, i) => {
    markRepeat(b, w.slots[i].place, memory, siblingsOf(built, i));
    // A repeat whose item is the planned one takes the planned wording from code, with no AI call (round 6).
    built[i] = rewordRepeat(input, b, w.slots[i], memory, siblingsOf(built, i));
  });
  const examples = first.examples;
  const questions = all.map((i) => generated(w, i, built[i], 1));
  const failed = all.filter((i) => built[i].check.status === "failed");
  const long = input.book ? all.flatMap((i) => {
    const over = overRoom(input, w, i, built[i]);
    return over ? [{ i, ...over }] : [];
  }) : [];
  const failedPanels = w.panels.flatMap((_, k) => (examples[k].check.status === "failed" ? [k] : []));
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
      let fresh = redo.built[k];
      markRepeat(fresh, w.slots[i].place, memory, siblingsOf(built, built.length, i));
      fresh = rewordRepeat(input, fresh, redoWork.slots[i], memory, siblingsOf(built, built.length, i));
      const wasLong = long.find((x) => x.i === i);
      // A long question keeps its first version unless the redo is sound and shorter.
      if (wasLong && (fresh.check.status === "failed" || !fresh.package || !!overRoom(input, w, i, fresh) && fresh.package.text.length >= wasLong.length)) {
        questions[i] = generated(w, i, built[i], 2);
        return;
      }
      built[i] = fresh;
      questions[i] = generated(w, i, built[i], 2);
    });
    failedPanels.forEach((k, j) => { examples[k] = redo.examples[j]; });
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
 * rewrite never puts a failed question in place of a sound one, nor a longer one in place of a shorter.
 */
async function shorterRewrite(input: GenerateInput, deps: GenerateDeps, w: PageWork, previous: GeneratedQuestion[], note: string, memory: BookMemory | null): Promise<GeneratedQuestion[]> {
  const all = previous.map((_, i) => i);
  const { built } = await writeSlots(input, deps, w, all, note, "workbook_page_shorter", [], memory);
  // Each question is compared with the ones the page keeps before it (whichever version they keep), so two shorter
  // versions never come back as copies of each other.
  const chosen: GeneratedQuestion[] = [];
  for (const i of all) {
    const old = previous[i];
    const attempts = (old.attempts + 1) as GeneratedQuestion["attempts"];
    const before = chosen.flatMap((q, j) => (q.package && q.check.status !== "failed" ? [{ number: j + 1, package: q.package }] : []));
    markRepeat(built[i], w.slots[i].place, memory, before);
    const fresh = generated(w, i, built[i], attempts);
    const keepOld = sound(old) !== sound(fresh) ? sound(old) : textLength(fresh) > textLength(old);
    let pick: GeneratedQuestion = keepOld ? { ...old, attempts } : fresh;
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
      const panels = (layout?.slots ?? []).flatMap((x, k): Panel[] => {
        const part = page.parts[x.part];
        const skill = part?.step?.skill ?? part?.skills[0];
        return PANEL_SLOTS.includes(x.slot) && skill ? [{ id: `e${k + 1}`, layoutSlot: k, place: x.slot, skill }] : [];
      });
      work.push({ number: ++number, day: day.day, page, layout, slots: layout ? layoutSlots(page, layout) : slotsOf(page), panels });
    }
  }
  // Each slot's skill, kind of question, numbers and person, planned in book order (#380), so the same skill is not
  // asked the same way page after page and no two questions of a page work one sum.
  if (input.book) planBook(input, work);
  const backCover = number + 1;
  const total = Math.ceil(backCover / 4) * 4;
  const tokens = Array.from({ length: total }, () => deps.qrToken());
  const book: FitBook = { id: input.workbookId, childId: input.childId, number: input.number, levels: [input.plan.level], profileBuild: input.profileBuild };

  const plain = (n: number, type: BookPageType): GeneratedPage => ({
    number: n, type, dayLabel: null, day: null, pageOfDay: null, qrToken: tokens[n - 1], fit: { status: "not-needed" }, attempts: 0, questions: [],
    ...(input.book ? { content: bookPageContent({ curriculum: input.curriculum, plan: input.plan, child: input.book.child, workbook: input.number, type, number: n }) } : {}),
  });
  let done = 0;
  // What the book has asked so far, for a laid-out book: each page is told it, and a repeat goes to the redo.
  const memory: BookMemory | null = input.book ? { texts: new Map(), keys: new Map(), shapes: new Map(), shapeText: new Map() } : null;
  const writePage = async (w: PageWork): Promise<GeneratedPage> => {
    const qrToken = tokens[w.number - 1];
    const page = { number: w.number, type: w.page.type, dayLabel: `Day ${w.day}`, day: w.day, pageOfDay: w.page.number, qrToken };
    let examples: (QuestionPackage | null)[] = [];
    const check = (questions: GeneratedQuestion[]) => deps.fit.fits(fitPage(w, qrToken, questions, contentOf(input, w, questions, examples)), book);
    let result: GeneratedPage;
    if (w.slots.length === 0) {
      const content = contentOf(input, w, []);
      result = { ...page, fit: { status: "not-needed" }, attempts: 0, questions: [], ...(content ? { content } : {}), ...(w.layout?.omissions.length ? { omissions: w.layout.omissions } : {}) };
    } else {
      const pass = await firstPass(input, deps, w, memory);
      let questions = pass.questions;
      examples = pass.examples;
      let fit = await check(questions);
      let attempts: 1 | 2 = 1;
      if (!fit.ok) {
        questions = await shorterRewrite(input, deps, w, questions, shorterNote(input, w, questions, fit.problems), memory);
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
      if (memory) remember(memory, w.number, questions);
      result = {
        ...page, fit: fit.ok ? { status: "fits" } : { status: "failed", problems: fit.problems }, attempts, questions,
        ...(content ? { content } : {}), ...(omissions.length ? { omissions } : {}),
        ...(leftOut.length ? { leftOut: leftOut.map((x) => ({ slot: x.question.slot, part: x.question.part, text: x.question.package?.text ?? null, reason: x.reason })) } : {}),
      };
    }
    deps.progress?.(++done, work.length);
    return result;
  };
  // Day by day, in order, so each day's pages know what the days before asked; a day's pages run at once.
  const dayPages: GeneratedPage[] = [];
  for (const day of input.plan.days) dayPages.push(...await pool(work.filter((w) => w.day === day.day), deps.concurrency ?? 1, writePage));
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
