// The example book of the fixtures, for tests.
import { validateSnapshot, type Snapshot } from "../bank/snapshot";
import { planBook, type BuildInput } from "../build/build-book";
import { sheetItems } from "../build/items";
import type { BookItem, ColumnFace, Face, PageModel, Region } from "../contract";
import rawBook from "../fixtures/book.json";
import divisionRequest from "../fixtures/book-division.json";
import factsRequest from "../fixtures/book-facts.json";
import placesRequest from "../fixtures/book-place-value.json";
import inventedRequest from "../fixtures/book-invented-topic.json";
import inventedDraftFile from "../fixtures/draft-invented-topic.json";
import inventedSnapshot from "../fixtures/snapshot-invented-topic.json";
import divisionSnapshot from "../fixtures/snapshot-division.json";
import factsSnapshot from "../fixtures/snapshot-facts.json";
import placesSnapshot from "../fixtures/snapshot-place-value.json";
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

function plannedBook(input: BuildInput): GoodBook {
  const plan = planBook(input);
  if (!plan.ok) throw new Error(plan.problems.join("\n"));
  return { pages: plan.pages, items: plan.items };
}

/** The example book of facts, equations with a blank inside and sequences. */
export const factsBook = (): GoodBook => plannedBook({ snapshot: factsSnapshot, book: factsRequest });
/** The example book of divisions, in lines and in brackets. */
export const divisionBook = (): GoodBook => plannedBook({ snapshot: divisionSnapshot, book: divisionRequest });
/** The example book of place value, with both templates of fields. */
export const placesBook = (): GoodBook => plannedBook({ snapshot: placesSnapshot, book: placesRequest });
/** The example book of the invented topic: a sheet of stacks that starts a day, with the time log, and a sheet of bar models. */
export const inventedBook = (): GoodBook => plannedBook({ snapshot: inventedSnapshot, book: inventedRequest });

/** The checked snapshot of the invented topic: three invented sheets in one topic, for tests of results and position. */
export function inventedTopicSnapshot(): Snapshot {
  const result = validateSnapshot(structuredClone(inventedSnapshot));
  if (!result.ok) throw new Error(result.problems.join("\n"));
  return result.snapshot;
}

/** A copy of the draft of the invented topic, with its notes: what the freeze and the bank import read. */
export const inventedDraft = (): Record<string, unknown> => structuredClone(inventedDraftFile);

export const goodBook = (): GoodBook => bookOf();
export const goodPages = (): PageModel[] => goodBook().pages;

/** The stack of a question, for tests of a book that prints nothing else. */
export function stackOf({ face }: { face: Face }): ColumnFace {
  if (face.kind !== "column") throw new Error("not a stack");
  return face;
}

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
      ...page, size: { w: 434, h: 394 },
      regions: [named("mark-tl"), { ...heading, rect, ink: heading.ink.map((ink) => ({ ...ink, rect })) }, ...["label-1", "question-1", "answer-1"].map(named), moved(qr, 340 - qr.rect.x, 300 - qr.rect.y)],
    };
  });
}
