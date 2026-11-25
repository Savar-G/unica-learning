// The example book of the fixtures, for tests.
import { validateSnapshot } from "../bank/snapshot";
import { sheetItems } from "../build/items";
import type { BookItem, PageModel, Region } from "../contract";
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

const moved = (region: Region, dx: number, dy: number): Region =>
  ({ ...region, rect: { ...region.rect, x: region.rect.x + dx, y: region.rect.y + dy }, ink: region.ink.map((ink) => ({ ...ink, rect: { ...ink.rect, x: ink.rect.x + dx, y: ink.rect.y + dy } })) });

/** A corner of each example page: its heading, one scan mark, one question and its QR code. Drawing takes a fifth of the time. */
export function smallPages(): PageModel[] {
  return goodPages().map((page) => {
    const named = (name: string): Region => {
      const found = page.regions.find((r) => r.id.endsWith(`/${name}`));
      if (!found) throw new Error(`no ${name}`);
      return found;
    };
    const qr = named("qr");
    const heading = named("heading");
    const rect = { ...heading.rect, w: 300 };
    return {
      ...page, size: { w: 420, h: 370 },
      regions: [named("mark-tl"), { ...heading, rect, ink: heading.ink.map((ink) => ({ ...ink, rect })) }, ...["label-1", "question-1", "answer-1"].map(named), moved(qr, 340 - qr.rect.x, 300 - qr.rect.y)],
    };
  });
}
