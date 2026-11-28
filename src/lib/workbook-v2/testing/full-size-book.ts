// A full-size synthetic book for the three checks of each book (architecture 11.3, target under 5 s): Book 2 of a weak
// child on an invented level of 64 sheets, with 58 sheets (116 pages and the 4 of the cover, 120 in all). It repeats 3
// sheets of Book 1 with the history of Book 1 (unseen questions first, swapped forms, a new order), then 55 new sheets,
// at 6 pages a day: 19 days of 3 sheets, and the last day one more sheet so the book has an even number of sheets.
// All content is invented; the sheets are copies of the sheets of the invented fixtures under new ids.
import { historyFromBooks, MAX_SHEETS, planNextBook, type BookRequestJson } from "../assemble/plan-book";
import { levelOrder, position, type ChildPosition, type IssuedSheet, type SheetResultRecord } from "../assemble/position";
import { validateSnapshot, type Snapshot } from "../bank/snapshot";
import { bookCheckInput, planBook, wholeBook, type BookPlan } from "../build/build-book";
import type { BookCheckInput } from "../checks/book-input";
import divisionSnapshot from "../fixtures/snapshot-division.json";
import factsSnapshot from "../fixtures/snapshot-facts.json";
import inventedSnapshot from "../fixtures/snapshot-invented-topic.json";
import type { Renderer } from "../renderer";
import { sheetResult, type ItemMark } from "../results/sheet-results";

/** The pages a day of the full-size book. */
export const FULL_SIZE_PAGES_A_DAY = 6;
const SHEETS_OF_LEVEL = 64;
const TOPICS = 16;
const CHILD = "synthetic-weak";
/** Book 1: two days of 4 pages; the child fails the 2nd, 4th and 6th sheets. */
const BOOK_ONE = { pagesPerDay: 4, days: 3, fails: new Set([1, 3, 5]) };

type RawSheet = (typeof factsSnapshot.sheets)[number] | (typeof divisionSnapshot.sheets)[number] | (typeof inventedSnapshot.sheets)[number];

/** The invented level: 16 topics of 4 sheets, each sheet a copy of an invented sheet, with the word problems of the invented topic. */
export function fullSizeSnapshot(): unknown {
  const designs: RawSheet[] = [...inventedSnapshot.sheets, ...factsSnapshot.sheets, ...divisionSnapshot.sheets];
  const sheets = Array.from({ length: SHEETS_OF_LEVEL }, (_, i) => {
    const design = structuredClone(designs[i % designs.length]);
    return { ...design, id: `${design.id}-${i + 1}`, firstPage: 2 * i + 1 };
  });
  const perTopic = SHEETS_OF_LEVEL / TOPICS;
  const topics = Array.from({ length: TOPICS }, (_, t) => ({
    id: `topic-${t + 1}`, code: `3-${t + 1}`, title: `Invented topic ${t + 1}`, sheets: sheets.slice(t * perTopic, (t + 1) * perTopic).map((s) => s.id),
  }));
  return { ...structuredClone(inventedSnapshot), id: "invented-full-size-level-3-v1", topics, sheets };
}

function snapshotOf(raw: unknown): Snapshot {
  const bank = validateSnapshot(structuredClone(raw));
  if (!bank.ok) throw new Error(`The full-size level does not validate:\n${bank.problems.join("\n")}`);
  return bank.snapshot;
}

const qrTexts = (book: number, count: number): string[] => Array.from({ length: 2 * count }, (_, i) => `https://unicalearning.com/tutor/p/${CHILD}-${book}-${i + 1}`);

function request(snapshot: Snapshot, book: number, where: ChildPosition, size: { pagesPerDay: number; days: number }, history?: ReturnType<typeof historyFromBooks>): BookRequestJson {
  const wanted = size.days * (size.pagesPerDay / 2);
  const count = Math.min(where.queue.length, wanted % 2 === 0 ? wanted : wanted + 1);
  const next = planNextBook({ bookId: `${CHILD}-book-${book}`, childId: CHILD, snapshot, position: where, ...size, qrTokens: qrTexts(book, count), ...(history ? { history } : {}) });
  if (!next.ok) throw new Error(`Book ${book} of the full-size child does not plan:\n${next.problems.join("\n")}`);
  return next.request;
}

function planned(snapshot: unknown, book: BookRequestJson): BookPlan {
  const plan = planBook({ snapshot, book });
  if (!plan.ok) throw new Error(`The book ${book.bookId} does not plan:\n${plan.problems.join("\n")}`);
  return plan;
}

/** The input of the full-size book: Book 2 of the weak child, as plain JSON, and its pages a day. Needs no typesetter. */
export function fullSizeBookInput(): { snapshot: unknown; book: BookRequestJson; pagesPerDay: number } {
  const raw = fullSizeSnapshot();
  const snapshot = snapshotOf(raw);
  const start = position({ childId: CHILD }, [], [], [], snapshot);
  if (!start.ok) throw new Error(start.problems.join("\n"));
  const first = request(snapshot, 1, start, BOOK_ONE);
  const one = planned(raw, first);
  const bookId = first.bookId;
  const issued = first.sheets.map(({ sheetId }): IssuedSheet => {
    const pages = one.pages.filter((p) => p.sheetId === sheetId).map((p) => p.page);
    return { bookId, bookNumber: 1, sheetId, attempt: 1, pages: [pages[0], pages[1]] };
  });
  const results = first.sheets.map(({ sheetId }, i): SheetResultRecord => {
    const items = one.items.filter((item) => item.sheetId === sheetId);
    const marks = items.map((item, n): ItemMark => ({ itemId: item.id, firstTry: BOOK_ONE.fails.has(i) && n < Math.ceil(items.length / 4) ? "wrong" : "right" }));
    const outcome = sheetResult(items, marks, { masteryPercent: 90 });
    if (!outcome.ok) throw new Error(outcome.problems.join("\n"));
    return { bookId, sheetId, attempt: 1, result: outcome.result, itemsScored: outcome.itemsScored, mistakes: outcome.mistakes };
  });
  const where = position({ childId: CHILD }, issued, one.pages.map((p) => ({ bookId, pageNumber: p.page })), results, snapshot);
  if (!where.ok) throw new Error(where.problems.join("\n"));
  const history = historyFromBooks([{ record: { bookId }, items: one.items }]);
  const days = Math.floor((MAX_SHEETS - 1) / (FULL_SIZE_PAGES_A_DAY / 2));
  const book = request(snapshot, 2, where, { pagesPerDay: FULL_SIZE_PAGES_A_DAY, days }, history);
  if (book.sheets.length !== MAX_SHEETS || book.sheets.filter((s) => s.attempt === 2).length !== BOOK_ONE.fails.size) {
    throw new Error(`The full-size book must have ${MAX_SHEETS} sheets with ${BOOK_ONE.fails.size} repeats first; it has ${book.sheets.map((s) => `${s.sheetId}/${s.attempt}`).slice(0, 8).join(", ")}.`);
  }
  return { snapshot: raw, book, pagesPerDay: FULL_SIZE_PAGES_A_DAY };
}

/** The full-size book planned and drawn, as the three checks read it, with what made it. */
export async function fullSizeCheckInput(renderer: Renderer): Promise<{ input: BookCheckInput; plan: BookPlan }> {
  const { snapshot, book, pagesPerDay } = fullSizeBookInput();
  const plan = planned(snapshot, book);
  const drawn = await renderer.render(plan.pages);
  return { input: bookCheckInput(plan, drawn, wholeBook(pagesPerDay)), plan };
}

/** The ids of the sheets of the full-size level, in level order. */
export const fullSizeLevelOrder = (): string[] => levelOrder(snapshotOf(fullSizeSnapshot())).map((s) => s.id);
