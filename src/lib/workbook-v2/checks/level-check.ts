// Check 3 of each book, the level (architecture 11.3): every sheet belongs to the child's level (its snapshot); the pages
// print the planned sheets in their order, front then back, and only the first page of a day has a time log; in a whole
// planned book the sheets are in the order of the snapshot with repeats first, and each day has the pages a day set for
// this book (product spec 7.2). The order is the place of a sheet in the snapshot: no level is named or compared.
import { dayLengths, isWholeDay } from "../assemble/plan-book";
import type { PageModel, Side } from "../contract";
import { pagesPerDayOf, type BookCheckData, type BookCheckOptions, type CheckedSheet } from "./book-input";
import { tailOf } from "./blank";
import { finder, BOOK_PLACE, NONE, pagePlace, type BookFinding, type Place } from "./findings";

const SIDES: readonly Side[] = ["front", "back"];
const timeLogOf = (page: PageModel) => page.captures.find((c) => c.kind === "time-log");

type LevelInput = Pick<BookCheckData, "snapshot" | "sheets" | "pages" | "items"> & BookCheckOptions;

/** What the level check finds wrong with a book. */
export function checkLevel(input: LevelInput): BookFinding[] {
  const { snapshot, sheets, pages, items } = input;
  const pagesPerDay = pagesPerDayOf(input);
  const found: BookFinding[] = [];
  const tell = finder("level", found);
  const rank = new Map([...snapshot.sheets.keys()].map((id, i) => [id, i]));
  // The front page of each planned sheet, found by its sheet and attempt (`pageOrder` checks that it is in its place).
  const frontAt = (k: number): PageModel | undefined => pages.find((p) => p.sheetId === sheets[k]?.sheet.id && p.attempt === sheets[k]?.attempt && p.side === "front");
  const placeAt = (k: number, slot = "page"): Place => {
    const page = frontAt(k);
    return page ? pagePlace(page, slot) : { sheet: sheets[k]?.sheet.id ?? NONE, page: NONE, slot };
  };
  const outside = `is not a sheet of the snapshot "${snapshot.id}" of the child's level`;

  sheets.forEach(({ sheet }, k) => { if (!rank.has(sheet.id)) tell("in-level", placeAt(k), `the sheet ${outside}`); });
  const told = new Set(sheets.map((s) => s.sheet.id));
  for (const page of pages) {
    if (rank.has(page.sheetId) || told.has(page.sheetId)) continue;
    told.add(page.sheetId);
    tell("in-level", pagePlace(page), `the page's sheet ${outside}`);
  }
  for (const item of items) {
    if (rank.has(item.sheetId) || told.has(item.sheetId)) continue;
    told.add(item.sheetId);
    tell("in-level", { sheet: item.sheetId, page: NONE, slot: `slot-${item.number}` }, `the question's sheet ${outside}`);
  }
  pageOrder(sheets, pages, tell);
  if (pagesPerDay === undefined) return found;

  // Repeats first, each part in the order of the snapshot.
  let newSeen = false;
  let lastRepeat = -1;
  let lastNew = -1;
  sheets.forEach(({ sheet, attempt }, k) => {
    const at = rank.get(sheet.id);
    if (at === undefined) return;
    if (attempt >= 2) {
      if (newSeen) tell("repeats-first", placeAt(k), `attempt ${attempt} of this sheet comes after a new sheet, and repeats come first`);
      if (at <= lastRepeat) tell("order", placeAt(k), "this repeat comes after a repeat of a sheet that is later in the level");
      lastRepeat = Math.max(lastRepeat, at);
    } else {
      newSeen = true;
      if (at <= lastNew) tell("order", placeAt(k), "this new sheet comes after a new sheet that is later in the level");
      lastNew = Math.max(lastNew, at);
    }
  });

  // Pages a day: each day has pagesPerDay / 2 sheets; the last day may have one more, so that a book has an even number of sheets.
  if (!Number.isSafeInteger(pagesPerDay) || pagesPerDay < 2 || pagesPerDay % 2 !== 0) {
    tell("pages-a-day", BOOK_PLACE, `pages a day must be an even whole number, 2 or more, and it is ${pagesPerDay}`);
    return found;
  }
  sheets.forEach((one, k) => { if (k === 0 && !one.startsDay) tell("pages-a-day", placeAt(k), "the first sheet of the book must start a day"); });
  const lengths = dayLengths(sheets.map((s) => s.startsDay));
  let start = 0;
  lengths.forEach((length, d) => {
    const first = start;
    start += length;
    // The rule of a day is the planner's (assemble/plan-book.ts).
    if (isWholeDay(length, d === lengths.length - 1, sheets.length, pagesPerDay)) return;
    const front = frontAt(first);
    const log = front ? timeLogOf(front) : undefined;
    tell("pages-a-day", placeAt(first, log ? tailOf(log.id) : "page"), `day ${d + 1} has ${2 * length} pages, and this book has ${pagesPerDay} pages a day`);
  });
  return found;
}

/**
 * The pages print the planned sheets in their order, the front then the back of each, and only the front of a sheet that
 * starts a day has a time log. The days and the order of the plan are only true of the book when its pages follow them.
 */
function pageOrder(sheets: readonly CheckedSheet[], pages: readonly PageModel[], tell: ReturnType<typeof finder>): void {
  const wanted = sheets.flatMap((one) => SIDES.map((side) => ({ ...one, side })));
  if (pages.length !== wanted.length) tell("page-order", BOOK_PLACE, `the book has ${pages.length} pages, and its ${sheets.length} planned sheets have ${wanted.length}`);
  pages.forEach((page, i) => {
    const plan = wanted[i];
    if (!plan) return;
    if (page.sheetId !== plan.sheet.id || page.attempt !== plan.attempt || page.side !== plan.side) {
      tell("page-order", pagePlace(page), `page ${i + 1} of the book prints the ${page.side} of attempt ${page.attempt} of "${page.sheetId}", and the plan has the ${plan.side} of attempt ${plan.attempt} of "${plan.sheet.id}" there`);
      return;
    }
    const log = timeLogOf(page);
    const starts = plan.side === "front" && plan.startsDay;
    if (starts && !log) tell("day-start", pagePlace(page), "the first page of a day has no time log");
    if (!starts && log) tell("day-start", pagePlace(page, tailOf(log.id)), "a page that does not start a day has a time log");
  });
}
