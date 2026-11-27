// Check 3 of each book, the level (architecture 11.3): every sheet belongs to the child's level (its snapshot); in a whole
// planned book the sheets are in the order of the snapshot with repeats first, and each day has the pages a day set for
// this book (product spec 7.2). The order is the place of a sheet in the snapshot: no level is named or compared.
import type { PageModel } from "../contract";
import type { BookCheckInput } from "./book-input";
import { tailOf } from "./blank";
import { finder, BOOK_PLACE, NONE, pagePlace, type BookFinding, type Place } from "./findings";

/** What the level check finds wrong with a book. */
export function checkLevel({ snapshot, sheets, pages, items, pagesPerDay }: Pick<BookCheckInput, "snapshot" | "sheets" | "pages" | "items" | "pagesPerDay">): BookFinding[] {
  const found: BookFinding[] = [];
  const tell = finder("level", found);
  const rank = new Map([...snapshot.sheets.keys()].map((id, i) => [id, i]));
  const frontOf = (id: string, attempt: number): PageModel | undefined => pages.find((p) => p.sheetId === id && p.attempt === attempt && p.side === "front");
  const placeOf = (id: string, attempt: number, slot = "page"): Place => {
    const page = frontOf(id, attempt);
    return page ? pagePlace(page, slot) : { sheet: id, page: NONE, slot };
  };
  const outside = `is not a sheet of the snapshot "${snapshot.id}" of the child's level`;

  for (const { sheet, attempt } of sheets) if (!rank.has(sheet.id)) tell("in-level", placeOf(sheet.id, attempt), `the sheet ${outside}`);
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
  if (pagesPerDay === undefined) return found;

  // Repeats first, each part in the order of the snapshot.
  let newSeen = false;
  let lastRepeat = -1;
  let lastNew = -1;
  for (const { sheet, attempt } of sheets) {
    const at = rank.get(sheet.id);
    if (at === undefined) continue;
    if (attempt >= 2) {
      if (newSeen) tell("repeats-first", placeOf(sheet.id, attempt), `attempt ${attempt} of this sheet comes after a new sheet, and repeats come first`);
      if (at <= lastRepeat) tell("order", placeOf(sheet.id, attempt), "this repeat comes after a repeat of a sheet that is later in the level");
      lastRepeat = Math.max(lastRepeat, at);
    } else {
      newSeen = true;
      if (at <= lastNew) tell("order", placeOf(sheet.id, attempt), "this new sheet comes after a new sheet that is later in the level");
      lastNew = Math.max(lastNew, at);
    }
  }

  // Pages a day: each day has pagesPerDay / 2 sheets; the last day may have one more, so that a book has an even number of sheets.
  if (!Number.isSafeInteger(pagesPerDay) || pagesPerDay < 2 || pagesPerDay % 2 !== 0) {
    tell("pages-a-day", BOOK_PLACE, `pages a day must be an even whole number, 2 or more, and it is ${pagesPerDay}`);
    return found;
  }
  const perDay = pagesPerDay / 2;
  const days: (typeof sheets)[number][][] = [];
  sheets.forEach((one, i) => {
    if (i === 0 && !one.startsDay) tell("pages-a-day", placeOf(one.sheet.id, one.attempt), "the first sheet of the book must start a day");
    if (one.startsDay || days.length === 0) days.push([one]);
    else days[days.length - 1].push(one);
  });
  const total = sheets.length;
  const evenByOne = total % 2 === 0 && (total - 1) % perDay === 0 && (total - 1) % 2 === 1;
  days.forEach((day, d) => {
    const isLast = d === days.length - 1;
    if (day.length === perDay || (isLast && evenByOne && day.length === perDay + 1)) return;
    const [first] = day;
    const log = frontOf(first.sheet.id, first.attempt)?.captures.find((c) => c.kind === "time-log");
    tell("pages-a-day", placeOf(first.sheet.id, first.attempt, log ? tailOf(log.id) : "page"), `day ${d + 1} has ${2 * day.length} pages, and this book has ${pagesPerDay} pages a day`);
  });
  return found;
}
