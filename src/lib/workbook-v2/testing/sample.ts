// The example book of the fixtures, for tests.
import { validateSnapshot } from "../bank/snapshot";
import { sheetItems } from "../build/items";
import type { BookItem, PageModel } from "../contract";
import rawBook from "../fixtures/book.json";
import rawSnapshot from "../fixtures/snapshot.json";
import { buildPages } from "../layout/build-pages";
import { SHAPES, type ShapeLibrary } from "../shapes";

export interface GoodBook { pages: PageModel[]; items: BookItem[] }

/** The pages and items of the example book, with no check of them, when it has other shapes or another child. */
export function bookOf({ shapes = SHAPES, childId = rawBook.childId }: { shapes?: ShapeLibrary; childId?: string } = {}): GoodBook {
  const result = validateSnapshot(structuredClone(rawSnapshot), shapes);
  if (!result.ok) throw new Error(result.problems.join("\n"));
  const [request] = rawBook.sheets;
  const sheet = result.snapshot.sheets.get(request.sheetId);
  if (!sheet) throw new Error("no sheet");
  const items = sheetItems(sheet, childId, request.attempt);
  const built = buildPages([{ sheet, levelName: result.snapshot.level.name, attempt: request.attempt, qr: request.qr, items }]);
  if (!built.ok) throw new Error(built.problems.join("\n"));
  return { pages: built.pages, items };
}

export const goodBook = (): GoodBook => bookOf();
export const goodPages = (): PageModel[] => goodBook().pages;
