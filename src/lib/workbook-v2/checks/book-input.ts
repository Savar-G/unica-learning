// What the three checks of each book read: the snapshot of the child's level, the sheets of the book in printed order, the
// child's history, the items and page models, and what the typesetter drew. All of it is data; nothing is read again.
import type { Snapshot, SnapshotSheet } from "../bank/snapshot";
import type { BookHistory } from "../build/book-history";
import type { BookItem, PageModel } from "../contract";
import type { Rendering } from "../renderer";
import type { ShapeLibrary } from "../shapes";

/** A sheet of the book: the rows that made its questions (word problems bound to the book's theme), its attempt, and whether it starts a day. */
export interface CheckedSheet { sheet: SnapshotSheet; attempt: number; startsDay: boolean }

/**
 * What a book is. A whole planned book (the normal case, and the only one that is published) has the pages a day set for
 * it (product spec 7.2), and the rules of a whole book run too: its pages and the 4 pages of its cover are a multiple of 4
 * and at most 120, its sheets are in level order with repeats first, and each day has this many pages. A part of a book
 * (a fixture or a test of some sheets) says so: it skips only those rules.
 */
export type BookCheckOptions = { book: "whole"; pagesPerDay: number } | { book: "part" };

/** A whole planned book with this many pages a day. */
export const wholeBook = (pagesPerDay: number): BookCheckOptions => ({ book: "whole", pagesPerDay });
/** Some sheets that are not a whole book: a fixture or a test. */
export const PART_OF_BOOK: BookCheckOptions = { book: "part" };

/** The pages a day of a whole book, or undefined for a part of a book. */
export const pagesPerDayOf = (options: BookCheckOptions): number | undefined => (options.book === "whole" ? options.pagesPerDay : undefined);

export interface BookCheckData {
  snapshot: Snapshot;
  sheets: readonly CheckedSheet[];
  history: BookHistory | null;
  items: readonly BookItem[];
  pages: readonly PageModel[];
  drawn: Rendering;
  shapes: ShapeLibrary;
}

export type BookCheckInput = BookCheckData & BookCheckOptions;
