// The three checks of each book (architecture 11.3; target under 5 s): source, layout and level. A book that fails stops
// with the list of findings, and each finding names its check, sheet, page and slot. Content fit was proved at the freeze,
// so a layout finding in a book is an engine fault, and replay reproduces it.
import type { BookCheckInput } from "./book-input";
import type { BookFinding } from "./findings";
import { checkLayout } from "./layout-check";
import { checkLevel } from "./level-check";
import { checkSource } from "./source-check";

export type { BookCheckInput, BookCheckOptions, CheckedSheet } from "./book-input";
export { formatFinding, type BookFinding } from "./findings";
export { checkLayout } from "./layout-check";
export { checkLevel } from "./level-check";
export { checkSource } from "./source-check";

/** Each check of a book on its own, in the order that they run, so that a caller can time each one. */
export const BOOK_CHECK_STEPS = {
  source: (input: BookCheckInput): BookFinding[] => checkSource(input),
  layout: (input: BookCheckInput): BookFinding[] => checkLayout({ ...input, wholeBook: input.pagesPerDay !== undefined }),
  level: (input: BookCheckInput): BookFinding[] => checkLevel(input),
} as const;

/** Every finding of the three checks of a book: an empty list for a good book. */
export function checkBook(input: BookCheckInput): BookFinding[] {
  return [...BOOK_CHECK_STEPS.source(input), ...BOOK_CHECK_STEPS.layout(input), ...BOOK_CHECK_STEPS.level(input)];
}
