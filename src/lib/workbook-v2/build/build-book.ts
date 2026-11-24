// One input becomes one book, or a list of problems. Everything that decides the book is in the input and in the
// renderer's pinned program and fonts: no network, database, clock, random source or AI. The renderer is the edge: only
// it touches files and starts a program (render/typst.ts). Every check runs before anything is returned.
import { plainCopy } from "../bank/plain";
import { validateSnapshot } from "../bank/snapshot";
import { checkImages } from "../checks/images";
import { checkPage } from "../checks/page-rules";
import { checkPositions, checkTexts } from "../checks/positions";
import { checkPrintedAnswers } from "../checks/printed-answers";
import { checkRendering } from "../checks/rendering";
import { ENGINE_VERSION, type BookItem, type PageModel, type Position } from "../contract";
import { canonicalJson, sha256 } from "../hash";
import { buildPages } from "../layout/build-pages";
import { RenderError, type Renderer, type Rendering } from "../renderer";
import { SHAPES, type ShapeLibrary } from "../shapes";
import { readBookRequest } from "./book-input";
import { sheetItems } from "./items";

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

export async function buildBook(input: BuildInput, renderer: Renderer, shapes: ShapeLibrary = SHAPES): Promise<BuildResult> {
  const bank = validateSnapshot(input.snapshot, shapes);
  if (!bank.ok) return failed(bank.problems);
  const request = plainCopy("The book", input.book);
  if (!request.ok) return failed(request.problems);
  const book = readBookRequest(request.value, bank.snapshot);
  if (Array.isArray(book)) return failed(book);

  const sheets = book.sheets.map((s) => ({ ...s, items: sheetItems(s.sheet, book.childId, s.attempt), levelName: bank.snapshot.level.name }));
  const items = sheets.flatMap((s) => s.items);
  const layout = buildPages(sheets);
  if (!layout.ok) return failed(layout.problems);
  const { pages } = layout;
  const pageProblems = [...checkPrintedAnswers(pages, items, shapes), ...pages.flatMap((page) => checkPage(page, items))];
  if (pageProblems.length > 0) return failed(pageProblems);

  const drawn = await draw(renderer, pages);
  if (typeof drawn === "string") return failed([drawn]);
  const missing = checkRendering(pages, drawn);
  if (missing.length > 0) return failed(missing);
  const drawnProblems = [...checkPositions(pages, drawn.positions), ...checkTexts(pages, drawn.texts), ...checkImages(pages, drawn.images)];
  if (drawnProblems.length > 0) return failed(drawnProblems);

  return {
    status: "built",
    record: {
      bookId: book.bookId,
      engine: ENGINE_VERSION,
      ...renderer.identity,
      snapshot: { id: bank.snapshot.id, hash: bank.hash },
      inputHash: sha256(canonicalJson({ snapshot: bank.hash, book: request.value })),
    },
    pdf: drawn.pdf,
    pages: pages.map((model, i) => ({ model, image: drawn.images[i] })),
    positions: drawn.positions,
    items,
  };
}
