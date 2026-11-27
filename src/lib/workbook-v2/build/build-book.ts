// One input becomes one book, or a list of problems. Everything that decides the book is in the input and in the
// renderer's pinned program and fonts: no network, database, clock, random source or AI. The renderer is the edge: only
// it touches files and starts a program (render/typst.ts). Every check runs before anything is returned.
import { plainCopy } from "../bank/plain";
import { validateSnapshot, type Snapshot, type TemplateLibrary } from "../bank/snapshot";
import { checkBook, formatFinding, type BookCheckInput, type BookCheckOptions, type BookFinding, type CheckedSheet } from "../checks/book-checks";
import { tailOf } from "../checks/blank";
import { finder, itemPlaces, pagePlace, placeNamer, withoutPage } from "../checks/findings";
import { pageCountFindings } from "../checks/layout-check";
import { checkLevel } from "../checks/level-check";
import { checkPage } from "../checks/page-rules";
import { checkAnswerForms, checkPrintedAnswers, printedAnswerProblem, regionsByItem } from "../checks/printed-answers";
import { ENGINE_VERSION, type BookItem, type PageModel, type Position, type Side } from "../contract";
import { canonicalJson, sha256 } from "../hash";
import { buildPages, type PlannedSheet } from "../layout/build-pages";
import { TEMPLATES } from "../layout/templates";
import { RenderError, type Renderer, type Rendering } from "../renderer";
import { SHAPES, type ShapeLibrary } from "../shapes";
import { bindSheet } from "../themes/sheets";
import { seenPhrasingIds, sheetHistory, type BookHistory } from "./book-history";
import { readBookRequest } from "./book-input";
import { repeatNotices, sheetItems } from "./items";

export { PART_OF_BOOK, wholeBook, type BookCheckOptions } from "../checks/book-checks";

/** Both parts are data from a file or a store; the build reads and checks them. */
export interface BuildInput { snapshot: unknown; book: unknown }

/** What made a book. A replay compares it. */
export type BookRecord = Renderer["identity"] & {
  bookId: string;
  engine: string;
  snapshot: { id: string; hash: string };
  /** Covers the hash of the snapshot and the book request. */
  inputHash: string;
};

export interface BuiltBook {
  status: "built";
  record: BookRecord;
  pdf: Uint8Array;
  pages: { model: PageModel; image: Uint8Array }[];
  positions: Position[];
  /** Every printed question with its answer. */
  items: BookItem[];
  /** What a person should know of a book that is good: the rows that had to repeat a question. */
  notices: string[];
}

/**
 * A book that stops: its problems in plain words, and the findings when a check of its pages stopped it (each names its
 * check, sheet, page and slot, and the problems are these findings in plain words).
 */
export type BuildResult = BuiltBook | { status: "failed"; problems: string[]; findings?: BookFinding[] };

const failed = (problems: string[], findings: readonly BookFinding[] = []): BuildResult =>
  (findings.length > 0 ? { status: "failed", problems: [...new Set(findings.map(formatFinding))], findings: [...findings] } : { status: "failed", problems });

async function draw(renderer: Renderer, pages: readonly PageModel[]): Promise<Rendering | string> {
  try {
    return await renderer.render(pages);
  } catch (error) {
    if (error instanceof RenderError) return error.message;
    throw error;
  }
}

/** What a book prints, before a typesetter draws it. */
export interface BookPlan {
  ok: true;
  bookId: string;
  snapshot: { id: string; hash: string };
  inputHash: string;
  items: BookItem[];
  pages: PageModel[];
  notices: string[];
  /** What the three checks of each book read of the input: the snapshot, the sheets in printed order, and the history. */
  source: { snapshot: Snapshot; sheets: CheckedSheet[]; history: BookHistory | null };
}

/** A plan that stops has its problems in plain words and, when its pages were made, the findings that name each place. */
type Stopped = { ok: false; problems: string[]; findings?: BookFinding[] };
type PagePlan = { ok: true; pages: PageModel[] } | Stopped;

/**
 * The checks of `planPages` that read made pages, as findings that name their check, sheet, page and slot: the second
 * computation of each answer, the rules of each page, and the time log of the first page of each day.
 */
function pageFindings(pages: readonly PageModel[], items: readonly BookItem[], shapes: ShapeLibrary, startsDay: (page: PageModel) => boolean): BookFinding[] {
  const found: BookFinding[] = [];
  const placeOf = itemPlaces(pages, items);
  const regions = regionsByItem(pages);
  for (const item of items) {
    const problem = printedAnswerProblem(item, regions.get(item.id) ?? [], shapes);
    if (problem) finder("source", found)("answer-twice", placeOf(item), `question ${item.number} (${problem.rows.join(" ")}): ${problem.problem}`);
  }
  const named = placeNamer(pages);
  for (const page of pages) for (const problem of checkPage(page, items)) finder("layout", found)("page-rule", named(problem, page), withoutPage(problem));
  for (const page of pages) {
    const log = page.captures.find((c) => c.kind === "time-log");
    if (startsDay(page) && !log) finder("level", found)("day-start", pagePlace(page), "the first page of a day has no time log");
    if (!startsDay(page) && log) finder("level", found)("day-start", pagePlace(page, tailOf(log.id)), "a page that does not start a day has a time log");
  }
  return found;
}

/** The page models of some sheets with their questions, with every check that needs no drawing. `sides` are the sides to look at. */
export function planPages(sheets: readonly PlannedSheet[], shapes: ShapeLibrary, sides: readonly Side[] = ["front", "back"]): PagePlan {
  const items = sheets.flatMap((s) => s.items);
  const formless = checkAnswerForms(items, shapes);
  if (formless.length > 0) return { ok: false, problems: formless };
  const layout = buildPages(sheets);
  if (!layout.ok) return layout;
  const pages = layout.pages.filter((page) => sides.includes(page.side));
  const startsDay = new Map(sheets.map((s) => [`${s.sheet.id}/${s.attempt}`, s.startsDay === true]));
  const logProblems = pages.flatMap((page) => {
    const wanted = page.side === "front" && startsDay.get(`${page.sheetId}/${page.attempt}`) === true;
    const has = page.captures.some((c) => c.kind === "time-log");
    if (wanted && !has) return [`Page ${page.page}: the first page of a day must have a time log.`];
    if (!wanted && has) return [`Page ${page.page}: a page that does not start a day must not have a time log.`];
    return [];
  });
  const problems = [...checkPrintedAnswers(pages, items, shapes), ...pages.flatMap((page) => checkPage(page, items)), ...logProblems];
  if (problems.length === 0) return { ok: true, pages };
  const wantsLog = (page: PageModel) => page.side === "front" && startsDay.get(`${page.sheetId}/${page.attempt}`) === true;
  return { ok: false, problems, findings: pageFindings(pages, items, shapes, wantsLog) };
}

/** The questions and the page models of a book, with every check that needs no drawing. */
export function planBook(input: BuildInput, shapes: ShapeLibrary = SHAPES, templates: TemplateLibrary = TEMPLATES): BookPlan | Stopped {
  const stop = (problems: string[]) => ({ ok: false as const, problems });
  const bank = validateSnapshot(input.snapshot, shapes, templates);
  if (!bank.ok) return bank;
  const request = plainCopy("The book", input.book);
  if (!request.ok) return request;
  const book = readBookRequest(request.value, bank.snapshot);
  if (Array.isArray(book)) return stop(book);

  const { stories } = bank.snapshot;
  const { history } = book;
  const seen = seenPhrasingIds(history);
  const sheets = book.sheets.map((s) => {
    const sheet = stories && book.stories ? bindSheet(s.sheet, stories, book.stories, seen) : s.sheet;
    return { ...s, sheet, items: sheetItems(sheet, book.childId, s.attempt, history && sheetHistory(history, s.sheet.id)), levelName: bank.snapshot.level.name };
  });
  const layout = planPages(sheets, shapes);
  if (!layout.ok) return layout;
  const items = sheets.flatMap((s) => s.items);
  const inputHash = sha256(canonicalJson({ snapshot: bank.hash, book: request.value }));
  return {
    ok: true, bookId: book.bookId, snapshot: { id: bank.snapshot.id, hash: bank.hash }, inputHash, items, pages: layout.pages, notices: sheets.flatMap((s) => repeatNotices(s.sheet, s.items)),
    source: { snapshot: bank.snapshot, sheets: sheets.map(({ sheet, attempt, startsDay }) => ({ sheet, attempt, startsDay })), history },
  };
}

/**
 * The rules of a whole book that need no drawing, as findings: its page count with the cover, the order of its sheets and
 * its days at `pagesPerDay`. A caller that publishes refuses a book with any before it writes anything; the build checks
 * them again with the drawing.
 */
export function wholeBookFindings(plan: BookPlan, pagesPerDay: number): BookFinding[] {
  const { snapshot, sheets } = plan.source;
  return [...pageCountFindings(plan.pages, true), ...checkLevel({ snapshot, sheets, pages: plan.pages, items: plan.items, book: "whole", pagesPerDay })];
}

/** What the three checks of each book read of a planned book and its drawing. */
export function bookCheckInput(plan: BookPlan, drawn: Rendering, options: BookCheckOptions, shapes: ShapeLibrary = SHAPES): BookCheckInput {
  return { ...plan.source, items: plan.items, pages: plan.pages, drawn, shapes, ...options };
}

/**
 * The book of an input, or every problem. Every check that needs no drawing runs first; then the three checks of each
 * book (source, layout, level) stop a wrong book. `checks` says what the input is: a whole planned book with its pages a
 * day (`wholeBook`), whose page count, order and days are checked too, or, only for fixtures and tests, a part of a book
 * (`PART_OF_BOOK`). There is no default: a caller that publishes must say that its book is whole.
 */
export async function buildBook(input: BuildInput, renderer: Renderer, checks: BookCheckOptions, shapes: ShapeLibrary = SHAPES): Promise<BuildResult> {
  const plan = planBook(input, shapes);
  if (!plan.ok) return failed(plan.problems, plan.findings);
  const { pages, items } = plan;
  const drawn = await draw(renderer, pages);
  if (typeof drawn === "string") return failed([drawn]);
  const findings = checkBook(bookCheckInput(plan, drawn, checks, shapes));
  if (findings.length > 0) return failed([], findings);

  return {
    status: "built",
    record: {
      bookId: plan.bookId,
      engine: ENGINE_VERSION,
      ...renderer.identity,
      snapshot: plan.snapshot,
      inputHash: plan.inputHash,
    },
    pdf: drawn.pdf,
    pages: pages.map((model, i) => ({ model, image: drawn.images[i] })),
    positions: drawn.positions,
    items,
    notices: plan.notices,
  };
}
