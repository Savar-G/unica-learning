// What the three checks of each book read: the snapshot of the child's level, the sheets of the book in printed order, the
// child's history, the items and page models, and what the typesetter drew. All of it is data; nothing is read again.
import type { Snapshot, SnapshotSheet } from "../bank/snapshot";
import type { BookHistory } from "../build/book-history";
import type { BookItem, PageModel } from "../contract";
import type { Rendering } from "../renderer";
import type { ShapeLibrary } from "../shapes";

/** A sheet of the book: the rows that made its questions (word problems bound to the book's theme), its attempt, and whether it starts a day. */
export interface CheckedSheet { sheet: SnapshotSheet; attempt: number; startsDay: boolean }

export interface BookCheckOptions {
  /**
   * The pages a day of a whole planned book (product spec 7.2). Given, the rules of a whole book run too: its pages and
   * the 4 pages of its cover are a multiple of 4 and at most 120, its sheets are in level order with repeats first, and each day has
   * this many pages.
   */
  pagesPerDay?: number;
}

export interface BookCheckInput extends BookCheckOptions {
  snapshot: Snapshot;
  sheets: readonly CheckedSheet[];
  history: BookHistory | null;
  items: readonly BookItem[];
  pages: readonly PageModel[];
  drawn: Rendering;
  shapes: ShapeLibrary;
}
