// What a child has met in earlier books, as plain JSON that a book request may carry: the identity of each printed
// question, book by book, the last attempt of each sheet, and the phrasings of word problems. The build prefers questions
// that the child has not seen, then those seen longest ago. A book with no history is built as before.
import type { FieldReader } from "../bank/fields";
import { isId } from "../bank/fields";
import type { Side } from "../contract";

/** One printed question: its shape and its key (`questionKey`), which two forms of one question share. */
export interface HistoryItem { shape: string; key: string }
/** One earlier book of the child, with its questions in printed order. */
export interface HistoryBook { bookId: string; items: HistoryItem[] }
/** A question of the last attempt of a sheet. `form` is the printed question itself (canonical JSON), so a swapped form differs. */
export interface LastAttemptItem extends HistoryItem { side: Side; rowId: string; form: string }
/** The last attempt of a sheet: its questions, each side in printed order. */
export interface LastAttempt { sheetId: string; attempt: number; items: LastAttemptItem[] }
/** A phrasing of a defined question that the child has read. */
export interface SeenPhrasing { question: string; phrasing: string }

export interface BookHistory {
  /** The earlier books, oldest first. */
  books: HistoryBook[];
  lastAttempts: LastAttempt[];
  seenPhrasings: SeenPhrasing[];
}

/** Bounds that keep a history to the size of a child's books in one level. */
const MOST = { books: 200, items: 10_000, text: 4096 } as const;
const SHAPE_ID = /^[a-z][a-z0-9.-]{0,63}$/;
const isName = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9-]{1,64}$/.test(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length >= 1 && value.length <= MOST.text;

/** A list of up to `most` entries, which may be empty. */
function listOf(r: FieldReader, place: string, fields: Record<string, unknown>, name: string, most: number): unknown[] {
  const value = fields[name];
  if (!Array.isArray(value)) r.problem(place, `${name} must be a list`);
  else if (value.length > most) r.problem(place, `${name} has ${value.length} entries and the limit is ${most}`);
  else return value;
  return [];
}

function readItem(r: FieldReader, place: string, raw: unknown, last: boolean): LastAttemptItem | HistoryItem | null {
  const fields = r.object(place, raw, last ? ["shape", "key", "side", "rowId", "form"] : ["shape", "key"]);
  if (!fields) return null;
  const { shape, key, side, rowId, form } = fields;
  if (typeof shape !== "string" || !SHAPE_ID.test(shape)) r.problem(place, "shape must be the id of a shape");
  if (!isText(key)) r.problem(place, `key must be text of 1 to ${MOST.text} characters`);
  if (!last) return typeof shape === "string" && SHAPE_ID.test(shape) && isText(key) ? { shape, key } : null;
  if (side !== "front" && side !== "back") r.problem(place, "side must be front or back");
  if (!isId(rowId)) r.problem(place, "rowId must use only small letters, digits and dashes");
  if (!isText(form)) r.problem(place, `form must be text of 1 to ${MOST.text} characters`);
  const good = typeof shape === "string" && SHAPE_ID.test(shape) && isText(key) && (side === "front" || side === "back") && isId(rowId) && isText(form);
  return good ? { shape, key, side, rowId, form } : null;
}

function readBook(r: FieldReader, raw: unknown, index: number): HistoryBook | null {
  const place = `The history, book ${index + 1}`;
  const fields = r.object(place, raw, ["bookId", "items"]);
  if (!fields) return null;
  if (!isName(fields.bookId)) r.problem(place, "bookId must use only letters, digits and dashes");
  const items = listOf(r, place, fields, "items", MOST.items).map((item, i) => readItem(r, `${place}, item ${i + 1}`, item, false));
  return isName(fields.bookId) && items.every((i) => i !== null) ? { bookId: fields.bookId, items } : null;
}

function readLastAttempt(r: FieldReader, raw: unknown, index: number): LastAttempt | null {
  const place = `The history, last attempt ${index + 1}`;
  const fields = r.object(place, raw, ["sheetId", "attempt", "items"]);
  if (!fields) return null;
  if (!isId(fields.sheetId)) r.problem(place, "sheetId must use only small letters, digits and dashes");
  const attempt = r.count(place, fields, "attempt");
  const items = listOf(r, place, fields, "items", MOST.items).map((item, i) => readItem(r, `${place}, item ${i + 1}`, item, true) as LastAttemptItem | null);
  return isId(fields.sheetId) && attempt !== null && items.every((i) => i !== null) ? { sheetId: fields.sheetId, attempt, items } : null;
}

function readPhrasing(r: FieldReader, raw: unknown, index: number): SeenPhrasing | null {
  const place = `The history, seen phrasing ${index + 1}`;
  const fields = r.object(place, raw, ["question", "phrasing"]);
  if (!fields) return null;
  const { question, phrasing } = fields;
  for (const [name, value] of [["question", question], ["phrasing", phrasing]] as const) if (!isId(value)) r.problem(place, `${name} must use only small letters, digits and dashes`);
  return isId(question) && isId(phrasing) ? { question, phrasing } : null;
}

/** The history of a book request, or null with a problem for each place that is wrong. */
export function readHistory(r: FieldReader, raw: unknown): BookHistory | null {
  const before = r.problems.length;
  const fields = r.object("The history", raw, ["books", "lastAttempts", "seenPhrasings"]);
  if (!fields) return null;
  const books = listOf(r, "The history", fields, "books", MOST.books).map((b, i) => readBook(r, b, i));
  const lastAttempts = listOf(r, "The history", fields, "lastAttempts", MOST.items).map((a, i) => readLastAttempt(r, a, i));
  const seenPhrasings = listOf(r, "The history", fields, "seenPhrasings", MOST.items).map((p, i) => readPhrasing(r, p, i));
  r.unique("book", books.map((b) => b?.bookId ?? null), "The history");
  r.unique("sheet of a last attempt", lastAttempts.map((a) => a?.sheetId ?? null), "The history");
  r.unique("seen phrasing", seenPhrasings.map((p) => (p ? `${p.question}/${p.phrasing}` : null)), "The history");
  if (r.problems.length > before) return null;
  return { books: books as HistoryBook[], lastAttempts: lastAttempts as LastAttempt[], seenPhrasings: seenPhrasings as SeenPhrasing[] };
}

/** What one sheet needs of a history: how recent each question is, and its last attempt. */
export interface SheetHistory {
  /** For each `<shape> <key>`, the place of the last earlier book that printed it: more is more recent. */
  recency: ReadonlyMap<string, number>;
  last: LastAttempt | null;
}

export const historyKey = (shape: string, key: string): string => `${shape} ${key}`;

export function sheetHistory(history: BookHistory, sheetId: string): SheetHistory {
  const recency = new Map<string, number>();
  history.books.forEach((book, place) => { for (const { shape, key } of book.items) recency.set(historyKey(shape, key), place); });
  return { recency, last: history.lastAttempts.find((a) => a.sheetId === sheetId) ?? null };
}

/** The seen phrasings in the form of `StoryLimits.seen`: `<question>/<phrasing>`. */
export const seenPhrasingIds = (history: BookHistory | null): string[] => (history ? history.seenPhrasings.map((p) => `${p.question}/${p.phrasing}`) : []);
