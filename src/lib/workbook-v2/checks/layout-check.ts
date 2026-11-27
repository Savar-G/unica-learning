// Check 2 of each book, the layout (architecture 11.3, 11.4): no fit assertion fired (text measure, positions, places,
// page rules), no ink in an answer area, reach box, spine zone or margin, the pages with the cover a multiple of 4 and at
// most 120, and the QR code read from each page image equals its payload. Each problem names its page and slot.
import { COVER_PAGES, MAX_TOTAL_PAGES } from "../assemble/plan-book";
import type { BookItem, PageModel, Region } from "../contract";
import type { Rendering } from "../renderer";
import { tailOf } from "./blank";
import { finder, BOOK_PLACE, NONE, pagePlace, type BookFinding, type Place } from "./findings";
import { flowProblems, textProblem } from "./fit";
import { pageImageProblems } from "./images";
import { checkPage, regionName } from "./page-rules";
import { checkPdf } from "./pdf";
import { checkPlaces } from "./place-value";
import { checkPositions } from "./positions";
import { renderingProblems } from "./rendering";
import { placeTexts } from "./texts";

/** A whole book has its pages and the 4 of its cover in sheets of 4 pages (saddle stitch). */
const PAGES_A_FOLD = 4;

export interface LayoutCheckInput {
  pages: readonly PageModel[];
  items: readonly BookItem[];
  drawn: Rendering;
  /** A whole planned book: with its cover, its pages are a multiple of 4 and at most 120. */
  wholeBook: boolean;
}

const withoutPage = (message: string): string => message.replace(/^Page \d+: /, "");
const QUOTED = /"([^"]+)"/g;

/** The page and slot of the first rectangle that a problem names in quotes, by its whole id or by its name on `within`. */
function regionPlace(message: string, ids: ReadonlyMap<string, { page: PageModel; region: Region }>, within: PageModel | null): Place | null {
  for (const [, quoted] of message.matchAll(QUOTED)) {
    const byId = ids.get(quoted);
    if (byId) return pagePlace(byId.page, tailOf(byId.region.id));
    const own = within?.regions.find((r) => tailOf(r.id) === quoted);
    if (within && own) return pagePlace(within, quoted);
  }
  return null;
}

/** The page count of a book with its cover. */
function checkPageCount(pages: readonly PageModel[], wholeBook: boolean, tell: ReturnType<typeof finder>): void {
  const total = pages.length + COVER_PAGES;
  const counted = `the book has ${pages.length} pages and ${COVER_PAGES} cover pages, ${total} in all`;
  if (pages.length === 0) tell("page-count", BOOK_PLACE, "the book has no pages");
  if (wholeBook && total > MAX_TOTAL_PAGES) tell("page-count", BOOK_PLACE, `${counted}, and a book has at most ${MAX_TOTAL_PAGES}`);
  if (wholeBook && total % PAGES_A_FOLD !== 0) tell("page-count", BOOK_PLACE, `${counted}, which is not a multiple of ${PAGES_A_FOLD}`);
}

/** What the layout check finds wrong with a book. */
export function checkLayout({ pages, items, drawn, wholeBook }: LayoutCheckInput): BookFinding[] {
  const found: BookFinding[] = [];
  const tell = finder("layout", found);
  checkPageCount(pages, wholeBook, tell);
  const drawing = renderingProblems(pages, drawn);
  for (const { page, problem } of drawing) tell("typesetter", page ? pagePlace(page) : BOOK_PLACE, problem);
  if (drawing.length > 0) return found;

  const ids = new Map(pages.flatMap((page) => page.regions.map((region) => [region.id, { page, region }] as const)));
  const byNumber = (message: string): PageModel | null => pages.find((p) => message.startsWith(`Page ${p.page}: `)) ?? null;
  const named = (message: string, page: PageModel | null = byNumber(message)): Place => regionPlace(message, ids, page) ?? (page ? pagePlace(page) : BOOK_PLACE);

  // Layer 1: each text is drawn where the model puts it, once, with all the room that it wants.
  const placed = placeTexts(pages, drawn.texts);
  for (const problem of [...placed.problems, ...checkPositions(pages, drawn.positions)]) tell("fit", named(problem), problem);
  for (const one of placed.texts) {
    const problem = textProblem(one);
    if (problem) tell("fit", pagePlace(one.page, tailOf(one.region.id)), `the text "${one.ink.text}" of ${regionName(one.region)} ${problem}`);
  }
  for (const flow of placed.flows) for (const problem of flowProblems(flow)) tell("fit", pagePlace(flow.page, tailOf(flow.region.id)), problem);
  for (const page of pages) {
    for (const problem of checkPage(page, items)) tell("page-rule", named(problem, page), withoutPage(problem));
    const own = { texts: placed.texts.filter((t) => t.page === page), flows: [], problems: [] };
    for (const problem of checkPlaces([page], items, own)) {
      const number = /^Page \d+: question (\d+) /.exec(problem)?.[1];
      tell("fit", number ? named(`"slot-${number}"`, page) : pagePlace(page), withoutPage(problem));
    }
  }
  for (const problem of checkPdf(pages, placed, drawn.pdf)) {
    const page = byNumber(problem);
    tell("pdf", page ? pagePlace(page) : BOOK_PLACE, withoutPage(problem));
  }

  // Layers 2 and 3, and the QR code: each page image read back on its own.
  pages.forEach((page, i) => { for (const { rule, slot, problem } of pageImageProblems(page, drawn.images[i])) tell(rule, pagePlace(page, slot), problem); });
  return found.map((f) => (f.page === NONE ? { ...f, sheet: NONE, slot: NONE } : f));
}
