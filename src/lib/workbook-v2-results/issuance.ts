import type { BookRow, IssuedSheetRow } from "./types";

type SheetAttempt = Pick<IssuedSheetRow, "workbookId" | "sheetId" | "attempt">;

export const sheetAttemptKey = (row: SheetAttempt): string => JSON.stringify([row.sheetId, row.attempt]);

/** Legacy duplicate attempts retain the first workbook's issuance. Every book keeps its printed pages. */
export function firstIssuedAttempts<T extends SheetAttempt>(rows: readonly T[], books: readonly BookRow[]): T[] {
  const numbers = new Map(books.map((book) => [book.workbookId, book.number]));
  const issued = new Map<string, T>();
  for (const row of rows) {
    const key = sheetAttemptKey(row);
    const first = issued.get(key);
    if (!first || (numbers.get(row.workbookId) ?? Infinity) < (numbers.get(first.workbookId) ?? Infinity)) issued.set(key, row);
  }
  return [...issued.values()];
}
