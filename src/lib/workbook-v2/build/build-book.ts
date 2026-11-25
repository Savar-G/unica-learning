// One input becomes one book, or a list of problems. Everything that decides the book is in the input and in the
// renderer's pinned program and fonts: no network, database, clock, random source or AI. The renderer is the edge: only
// it touches files and starts a program (render/typst.ts). Every check runs before anything is returned.
import { plainCopy } from "../bank/plain";
import { validateSnapshot, type TemplateLibrary } from "../bank/snapshot";
import { checkImages } from "../checks/images";
import { checkPage } from "../checks/page-rules";
import { checkPositions, checkTexts } from "../checks/positions";
import { checkPrintedAnswers } from "../checks/printed-answers";
import { checkRendering } from "../checks/rendering";
import { ENGINE_VERSION, type BookItem, type PageModel, type Position } from "../contract";
import { canonicalJson, sha256 } from "../hash";
import { buildPages } from "../layout/build-pages";
import { TEMPLATES } from "../layout/templates";
import { RenderError, type Renderer, type Rendering } from "../renderer";
import { SHAPES, type ShapeLibrary } from "../shapes";
import { readBookRequest } from "./book-input";
import { repeatNotices, sheetItems } from "./items";

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

export type BuildResult = BuiltBook | { status: "failed"; problems: string[] };

const failed = (problems: string[]): BuildResult => ({ status: "failed", problems });

async function draw(renderer: Renderer, pages: readonly PageModel[]): Promise<Rendering | string> {
  try {
    return await renderer.render(pages);
  } catch (error) {
    if (error instanceof RenderError) return error.message;
    throw error;
  }
}

/** What a book prints, before a typesetter draws it. */
interface BookPlan {
  ok: true;
  bookId: string;
  snapshot: { id: string; hash: string };
  inputHash: string;
  items: BookItem[];
  pages: PageModel[];
  notices: string[];
}

/** The questions and the page models of a book, with every check that needs no drawing. */
export function planBook(input: BuildInput, shapes: ShapeLibrary = SHAPES, templates: TemplateLibrary = TEMPLATES): BookPlan | { ok: false; problems: string[] } {
  const stop = (problems: string[]) => ({ ok: false as const, problems });
  const bank = validateSnapshot(input.snapshot, shapes, templates);
  if (!bank.ok) return bank;
  const request = plainCopy("The book", input.book);
  if (!request.ok) return request;
  const book = readBookRequest(request.value, bank.snapshot);
  if (Array.isArray(book)) return stop(book);

  const sheets = book.sheets.map((s) => ({ ...s, items: sheetItems(s.sheet, book.childId, s.attempt), levelName: bank.snapshot.level.name }));
  const items = sheets.flatMap((s) => s.items);
  const layout = buildPages(sheets);
  if (!layout.ok) return layout;
  const { pages } = layout;
  const problems = [...checkPrintedAnswers(pages, items, shapes), ...pages.flatMap((page) => checkPage(page, items))];
  if (problems.length > 0) return stop(problems);
  const inputHash = sha256(canonicalJson({ snapshot: bank.hash, book: request.value }));
  return { ok: true, bookId: book.bookId, snapshot: { id: bank.snapshot.id, hash: bank.hash }, inputHash, items, pages, notices: sheets.flatMap((s) => repeatNotices(s.sheet, s.items)) };
}

export async function buildBook(input: BuildInput, renderer: Renderer, shapes: ShapeLibrary = SHAPES): Promise<BuildResult> {
  const plan = planBook(input, shapes);
  if (!plan.ok) return failed(plan.problems);
  const { pages, items } = plan;
  const drawn = await draw(renderer, pages);
  if (typeof drawn === "string") return failed([drawn]);
  const missing = checkRendering(pages, drawn);
  if (missing.length > 0) return failed(missing);
  const drawnProblems = [...checkPositions(pages, drawn.positions), ...checkTexts(pages, drawn.texts), ...checkImages(pages, drawn.images)];
  if (drawnProblems.length > 0) return failed(drawnProblems);

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
