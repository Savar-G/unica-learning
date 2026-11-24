// The example book of the fixtures, for tests.
import { validateSnapshot } from "../bank/snapshot";
import { sheetItems } from "../build/items";
import type { BookItem, PageModel } from "../contract";
import rawBook from "../fixtures/book.json";
import rawSnapshot from "../fixtures/snapshot.json";
import { buildPages } from "../layout/build-pages";

export interface GoodBook { pages: PageModel[]; items: BookItem[] }

export function goodBook(): GoodBook {
  const result = validateSnapshot(structuredClone(rawSnapshot));
  if (!result.ok) throw new Error(result.problems.join("\n"));
  const [request] = rawBook.sheets;
  const sheet = result.snapshot.sheets.get(request.sheetId);
  if (!sheet) throw new Error("no sheet");
  const { items } = sheetItems(sheet, rawBook.childId, request.attempt);
  const built = buildPages([{ sheet, levelName: result.snapshot.level.name, attempt: request.attempt, qr: request.qr, items }]);
  if (!built.ok) throw new Error(built.problems.join("\n"));
  return { pages: built.pages, items };
}

export const goodPages = (): PageModel[] => goodBook().pages;
