// What the three checks of each book (architecture 11.3) say about a wrong book. A finding names the check, the sheet,
// the page and the slot, so that a person goes straight to the place, and replay reproduces it. "none" stands only for a
// problem of the whole book, such as its page count.
import type { BookItem, PageModel } from "../contract";
import { tailOf } from "./blank";

export const BOOK_CHECKS = ["source", "layout", "level"] as const;
export type BookCheck = (typeof BOOK_CHECKS)[number];

/** The place of a problem of the whole book: no sheet, page or slot. */
export const NONE = "none" as const;

/**
 * One problem of a book. `slot` is the short name of a rectangle of the page ("slot-3", "answer-3", "qr"), of a zone
 * ("spine-zone", "margin"), "page" for a problem of a whole page, or "none" for a problem of the whole book.
 */
export interface BookFinding {
  check: BookCheck;
  /** The rule of the check that failed, such as "snapshot-item", "blank-zone-ink" or "pages-a-day". */
  rule: string;
  sheet: string;
  page: number | typeof NONE;
  slot: string;
  /** The problem in plain words, with no place: the place is in the other fields. */
  message: string;
}

const TITLES: Readonly<Record<BookCheck, string>> = { source: "Source", layout: "Layout", level: "Level" };

/** A finding in plain words that names its check, sheet, page and slot. */
export function formatFinding({ check, sheet, page, slot, message }: BookFinding): string {
  const text = message.endsWith(".") ? message : `${message}.`;
  return `${TITLES[check]} check, sheet "${sheet}", page ${page}, slot "${slot}": ${text}`;
}

/** Where a problem is: a page and a slot of it, or the whole book. */
export interface Place { sheet: string; page: number | typeof NONE; slot: string }

export const BOOK_PLACE: Place = { sheet: NONE, page: NONE, slot: NONE };

export const pagePlace = (page: PageModel, slot = "page"): Place => ({ sheet: page.sheetId, page: page.page, slot });

/** The id of the page of an item: its id without the number of the question (`<sheet>/<attempt>/<side>`). */
export const pageIdOf = (item: Pick<BookItem, "id">): string => item.id.slice(0, item.id.lastIndexOf("/"));

/** The attempt of an item, from its id. */
export const attemptOf = (item: Pick<BookItem, "id">): number => Number(item.id.split("/")[1]);

/** The page and the slot of each item, by its id. An item with no page names its sheet only. */
export function itemPlaces(pages: readonly PageModel[], items: readonly BookItem[]): (item: BookItem) => Place {
  const byPage = new Map(pages.map((page) => [page.id, page]));
  const slots = new Map<string, string>();
  for (const region of pages.flatMap((p) => p.regions)) if (region.role === "slot" && region.item !== null) slots.set(region.item, tailOf(region.id));
  const known = new Map(items.map((item) => {
    const page = byPage.get(pageIdOf(item));
    const slot = slots.get(item.id) ?? `slot-${item.number}`;
    return [item.id, page ? pagePlace(page, slot) : { sheet: item.sheetId, page: NONE, slot }] as const;
  }));
  return (item) => known.get(item.id) ?? { sheet: item.sheetId, page: NONE, slot: `slot-${item.number}` };
}

/** Makes the findings of one check. */
export const finder = (check: BookCheck, into: BookFinding[]) => (rule: string, place: Place, message: string): void => { into.push({ check, rule, ...place, message }); };
