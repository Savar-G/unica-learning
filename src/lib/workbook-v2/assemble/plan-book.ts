// The request of a child's next book: the first sheets of the queue, an even number of them, each day starting on its
// first sheet, with a QR text for each page and the child's history. Pure: the caller gives the ids and the QR texts, and
// the result is plain JSON for `planBook` and `buildBook`.
import type { Snapshot } from "../bank/snapshot";
import type { BookHistory, HistoryItem, LastAttempt, SeenPhrasing } from "../build/book-history";
import { readBookRequest } from "../build/book-input";
import type { BuiltBook } from "../build/build-book";
import type { BookItem } from "../contract";
import { canonicalJson } from "../hash";
import { SHAPES, type Shape, type ShapeLibrary } from "../shapes";
import { questionKey } from "../shapes/shape";
import { STORY_SHAPE_ID, storyShape, type StoryQuestion } from "../shapes/story";
import type { ChildPosition, QueueEntry } from "./position";

/** The most sheets of a book: 120 pages. */
export const MAX_SHEETS = 60;

export interface BookSheetJson { sheetId: string; attempt: number; qr: { front: string; back: string }; startsDay?: true }
/** A book request as plain JSON, as `readBookRequest` reads it. */
export interface BookRequestJson { bookId: string; childId: string; sheets: BookSheetJson[]; region?: string; scenario?: string; history?: BookHistory }

export interface BookSize {
  /** Pages a day: an even number, so that a day is whole sheets. */
  pagesPerDay: number;
  days: number;
  /** The sheets of the book, when the caller gives them; else pagesPerDay × days / 2. */
  sheetsCount?: number;
}

export interface NextBookInput extends BookSize {
  bookId: string;
  childId: string;
  snapshot: Snapshot;
  position: ChildPosition;
  /** The QR text of each page, two for each sheet, front then back: exactly 2 × the sheets of the book. */
  qrTokens: readonly string[];
  region?: string;
  scenario?: string;
  history?: BookHistory;
}

export type NextBook = { ok: true; request: BookRequestJson; sheets: QueueEntry[] } | { ok: false; problems: string[] };

const isCount = (n: unknown, min: number): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= min;

/**
 * The sheets of the next book: the first of the queue, up to the size. A book has an even number of sheets, so that its
 * pages and the 4 pages of its cover are a multiple of 4 with no blank page: an odd count takes one more sheet of the
 * queue, or one fewer when the queue has no more.
 */
export function nextBookSheets(position: ChildPosition, { pagesPerDay, days, sheetsCount }: BookSize): QueueEntry[] | string[] {
  const problems: string[] = [];
  if (!isCount(pagesPerDay, 2) || pagesPerDay % 2 !== 0) problems.push(`Pages a day must be an even whole number, 2 or more, not ${JSON.stringify(pagesPerDay)}.`);
  if (!isCount(days, 1)) problems.push(`Days must be a whole number, 1 or more, not ${JSON.stringify(days)}.`);
  if (sheetsCount !== undefined && !isCount(sheetsCount, 1)) problems.push(`The sheets of a book must be a whole number, 1 or more, not ${JSON.stringify(sheetsCount)}.`);
  if (problems.length > 0) return problems;
  const wanted = sheetsCount ?? (pagesPerDay / 2) * days;
  if (wanted > MAX_SHEETS) return [`A book has at most ${MAX_SHEETS} sheets (${2 * MAX_SHEETS} pages), and this one asks for ${wanted}.`];
  const taken = position.queue.slice(0, wanted);
  const even = taken.length % 2 === 0 ? taken : position.queue.length > taken.length ? position.queue.slice(0, taken.length + 1) : taken.slice(0, -1);
  if (even.length === 0) return [`The queue has ${position.queue.length} ${position.queue.length === 1 ? "sheet" : "sheets"}, and a book needs an even number of sheets, 2 or more.`];
  return even;
}

/**
 * Whether a sheet starts a day: the first sheet of each day of `pagesPerDay / 2` sheets. A sheet past the last day (one
 * that makes the count even) belongs to the last day.
 */
const startsDay = (index: number, pagesPerDay: number, days: number): boolean => index % (pagesPerDay / 2) === 0 && index / (pagesPerDay / 2) < days;

/** The request of the next book, which `readBookRequest` accepts, or every problem. */
export function planNextBook(input: NextBookInput): NextBook {
  const sheets = nextBookSheets(input.position, input);
  if (typeof sheets[0] === "string") return { ok: false, problems: sheets as string[] };
  const chosen = sheets as QueueEntry[];
  const tokens = input.qrTokens;
  if (!Array.isArray(tokens) || tokens.length !== 2 * chosen.length) {
    return { ok: false, problems: [`The book has ${chosen.length} sheets, so it needs exactly ${2 * chosen.length} QR texts, and it has ${Array.isArray(tokens) ? tokens.length : 0}.`] };
  }
  if (input.position.childId !== input.childId) return { ok: false, problems: [`The position is of the child "${input.position.childId}", not "${input.childId}".`] };
  const request: BookRequestJson = {
    bookId: input.bookId,
    childId: input.childId,
    sheets: chosen.map((entry, i) => ({
      sheetId: entry.sheetId, attempt: entry.attempt, qr: { front: tokens[2 * i], back: tokens[2 * i + 1] },
      ...(startsDay(i, input.pagesPerDay, input.days) ? { startsDay: true as const } : {}),
    })),
    ...(input.region === undefined ? {} : { region: input.region }),
    ...(input.scenario === undefined ? {} : { scenario: input.scenario }),
    ...(input.history === undefined ? {} : { history: input.history }),
  };
  // The engine reads the request as any other: a book that it would refuse is refused here, with the same words.
  const read = readBookRequest(request, input.snapshot);
  return Array.isArray(read) ? { ok: false, problems: read } : { ok: true, request, sheets: chosen };
}

function shapeOf(id: string, shapes: ShapeLibrary): Shape {
  const shape = id === STORY_SHAPE_ID ? (storyShape as Shape) : shapes.get(id);
  if (!shape) throw new Error(`a built book has a question of the unknown shape "${id}"`);
  return shape;
}

/**
 * The history of a child from its earlier books, oldest first: each book's question identities in printed order, the last
 * attempt of each sheet with its questions on each side in printed order, and the phrasings of word problems it read.
 * It needs only the id of each book and its items, whose ids name their sheet and attempt (`<sheet>/<attempt>/...`).
 */
export function historyFromBooks(books: readonly { record: Pick<BuiltBook["record"], "bookId">; items: readonly BookItem[] }[], shapes: ShapeLibrary = SHAPES): BookHistory {
  const last = new Map<string, LastAttempt>();
  const phrasings = new Map<string, SeenPhrasing>();
  const history: BookHistory = { books: [], lastAttempts: [], seenPhrasings: [] };
  for (const book of books) {
    const items: HistoryItem[] = book.items.map((item) => ({ shape: item.shape, key: questionKey(shapeOf(item.shape, shapes), item.question) }));
    history.books.push({ bookId: book.record.bookId, items });
    const attempts = new Map<string, number>();
    for (const item of book.items) attempts.set(item.sheetId, Math.max(Number(item.id.split("/")[1]), attempts.get(item.sheetId) ?? 0));
    for (const [sheetId, attempt] of attempts) {
      if ((last.get(sheetId)?.attempt ?? 0) > attempt) continue;
      const own = book.items.flatMap((item, i) => (item.sheetId === sheetId && item.id.startsWith(`${sheetId}/${attempt}/`) ? [{ item, key: items[i].key }] : []));
      last.set(sheetId, { sheetId, attempt, items: own.map(({ item, key }) => ({ shape: item.shape, key, side: item.side, rowId: item.rowId, form: canonicalJson(item.question) })) });
    }
    for (const item of book.items.filter((i) => i.shape === STORY_SHAPE_ID)) {
      const { question, phrasing } = item.question as StoryQuestion;
      phrasings.set(`${question}/${phrasing}`, { question, phrasing });
    }
  }
  return { ...history, lastAttempts: [...last.values()], seenPhrasings: [...phrasings.values()] };
}
