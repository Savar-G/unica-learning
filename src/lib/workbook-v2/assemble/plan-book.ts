// The request of a child's next book: the first sheets of the queue, an even number of them, each day starting on its
// first sheet, with a QR text for each page and the child's history. Pure: the caller gives the ids and the QR texts, and
// the result is plain JSON for `planBook` and `buildBook`.
import { plainCopy } from "../bank/plain";
import type { Snapshot } from "../bank/snapshot";
import type { BookHistory, HistoryItem, LastAttempt, SeenPhrasing } from "../build/book-history";
import { readBookRequest } from "../build/book-input";
import type { BuiltBook } from "../build/build-book";
import { checkPageFrame } from "../checks/page-rules";
import type { BookItem } from "../contract";
import { canonicalJson } from "../hash";
import { buildPages } from "../layout/build-pages";
import { SHAPES, type Shape, type ShapeLibrary } from "../shapes";
import { questionKey } from "../shapes/shape";
import { STORY_SHAPE_ID, storyShape, type StoryQuestion } from "../shapes/story";
import type { ChildPosition, QueueEntry, QueueReason } from "./position";

/** The pages of a cover: front, inside front with the plan, inside back, back. */
export const COVER_PAGES = 4;
/** The most pages of a printed book, its cover included (product spec 7.2). */
export const MAX_TOTAL_PAGES = 120;
/** The most sheets of a book: 58 sheets are 116 pages, and with the cover 120. */
export const MAX_SHEETS = (MAX_TOTAL_PAGES - COVER_PAGES) / 2;

export interface BookSheetJson { sheetId: string; attempt: number; qr: { front: string; back: string }; startsDay?: true }
/** A book request as plain JSON, as `readBookRequest` reads it. */
export interface BookRequestJson { bookId: string; childId: string; sheets: BookSheetJson[]; region?: string; scenario?: string; history?: BookHistory }

export interface BookSize {
  /** Pages a day: an even number, so that a day is whole sheets. */
  pagesPerDay: number;
  /** Days in the book. Optional when `sheetsCount` is given; when both are given, they must agree. */
  days?: number;
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
const QUEUE_REASONS: readonly QueueReason[] = ["repeat", "unscanned", "new"];
const show = (value: unknown): string => {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return String(value);
  return JSON.stringify(value) ?? String(value);
};

function positionProblems(position: unknown): string[] {
  if (typeof position !== "object" || position === null || Array.isArray(position)) return ["The position must be a valid position result."];
  const candidate = position as Record<string, unknown>;
  if (candidate.ok !== true) {
    if (Array.isArray(candidate.problems) && candidate.problems.every((p) => typeof p === "string") && candidate.problems.length > 0) return candidate.problems;
    return ["The position failed and cannot be used to plan a book."];
  }
  if (!Array.isArray(candidate.queue)) return ["The position must have a queue list."];
  const problems: string[] = [];
  candidate.queue.forEach((entry, i) => {
    const at = `The queue entry ${i + 1}`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      problems.push(`${at}: must be an object.`);
      return;
    }
    const { sheetId, attempt, reason } = entry as Record<string, unknown>;
    if (typeof sheetId !== "string" || sheetId.length === 0) problems.push(`${at}: sheetId must be text.`);
    if (!isCount(attempt, 1)) problems.push(`${at}: attempt must be a whole number, 1 or more.`);
    if (typeof reason !== "string" || !QUEUE_REASONS.includes(reason as QueueReason)) problems.push(`${at}: reason must be new, repeat or unscanned.`);
    else if (attempt === 1 && reason !== "new") problems.push(`${at}: attempt 1 cannot have reason ${show(reason)}.`);
    else if (isCount(attempt, 2) && reason === "new") problems.push(`${at}: attempt ${attempt} must have reason "repeat" or "unscanned".`);
  });
  return problems;
}

/** Validates book size inputs and returns `{ wanted, days }` or the list of problems. */
function readBookSize({ pagesPerDay, days, sheetsCount }: BookSize): { wanted: number; days: number } | string[] {
  const problems: string[] = [];
  if (!isCount(pagesPerDay, 2) || pagesPerDay % 2 !== 0) problems.push(`Pages a day must be an even whole number, 2 or more, not ${show(pagesPerDay)}.`);
  if (days !== undefined && !isCount(days, 1)) problems.push(`Days must be a whole number, 1 or more, not ${show(days)}.`);
  if (sheetsCount !== undefined && !isCount(sheetsCount, 1)) problems.push(`The sheets of a book must be a whole number, 1 or more, not ${show(sheetsCount)}.`);
  if (days === undefined && sheetsCount === undefined) problems.push("Either days or sheetsCount must be given.");
  if (problems.length > 0) return problems;
  const perDay = pagesPerDay / 2;
  if (days !== undefined && sheetsCount !== undefined && sheetsCount !== perDay * days) {
    return [`The sheets of a book (${sheetsCount}) must match pagesPerDay × days / 2 (${perDay * days}).`];
  }
  if (days === undefined && sheetsCount !== undefined && sheetsCount % perDay !== 0) {
    return [`The sheets of a book (${sheetsCount}) must be a multiple of ${perDay} (${pagesPerDay} pages a day).`];
  }
  const wanted = sheetsCount ?? perDay * (days as number);
  if (wanted > MAX_SHEETS) return [`A book has at most ${MAX_SHEETS} sheets (${2 * MAX_SHEETS} pages and ${COVER_PAGES} cover pages, ${MAX_TOTAL_PAGES} in all), and this one asks for ${wanted}.`];
  return { wanted, days: days ?? wanted / perDay };
}

/**
 * The sheets of the next book: the first of the queue, up to the size. A book has an even number of sheets, so that its
 * pages and the 4 pages of its cover are a multiple of 4 with no blank page: an odd count takes one more sheet of the
 * queue, and refuses when the queue has no more sheets to make an even book.
 */
export function nextBookSheets(position: ChildPosition, size: BookSize): QueueEntry[] | string[] {
  const posProblems = positionProblems(position);
  if (posProblems.length > 0) return posProblems;
  const parsed = readBookSize(size);
  if (Array.isArray(parsed)) return parsed;
  const taken = position.queue.slice(0, parsed.wanted);
  if (taken.length === 0) return ["The queue has 0 sheets, and a book needs an even number of sheets, 2 or more."];
  if (taken.length % 2 === 0) return taken;
  if (position.queue.length > taken.length && taken.length + 1 <= MAX_SHEETS) return position.queue.slice(0, taken.length + 1);
  return [`The queue has ${position.queue.length} ${position.queue.length === 1 ? "sheet" : "sheets"}, and a book needs an even number of sheets, 2 or more.`];
}

/**
 * The day of a sheet, from 1: each day has `pagesPerDay / 2` sheets. A sheet past the last day (one that makes the count
 * even) belongs to the last day.
 */
export const dayOf = (index: number, pagesPerDay: number, days: number): number => Math.min(Math.floor(index / (pagesPerDay / 2)), days - 1) + 1;

/** Whether a sheet starts a day: the first sheet of its day. */
const startsDay = (index: number, pagesPerDay: number, days: number): boolean => index === 0 || dayOf(index, pagesPerDay, days) !== dayOf(index - 1, pagesPerDay, days);

/** The request of the next book, which `planBook` accepts, or every problem. */
export function planNextBook(input: NextBookInput): NextBook {
  const size = readBookSize(input);
  if (Array.isArray(size)) return { ok: false, problems: size };
  const sheets = nextBookSheets(input.position, input);
  if (typeof sheets[0] === "string") return { ok: false, problems: sheets as string[] };
  const chosen = sheets as QueueEntry[];
  const tokens = input.qrTokens;
  if (!Array.isArray(tokens) || tokens.length !== 2 * chosen.length) {
    return { ok: false, problems: [`The book has ${chosen.length} sheets, so it needs exactly ${2 * chosen.length} QR texts, and it has ${Array.isArray(tokens) ? tokens.length : 0}.`] };
  }
  if (input.position.childId !== input.childId) return { ok: false, problems: [`The position is of the child "${input.position.childId}", not "${input.childId}".`] };
  const raw: BookRequestJson = {
    bookId: input.bookId,
    childId: input.childId,
    sheets: chosen.map((entry, i) => ({
      sheetId: entry.sheetId, attempt: entry.attempt, qr: { front: tokens[2 * i], back: tokens[2 * i + 1] },
      ...(startsDay(i, input.pagesPerDay, size.days) ? { startsDay: true as const } : {}),
    })),
    ...(input.region === undefined ? {} : { region: input.region }),
    ...(input.scenario === undefined ? {} : { scenario: input.scenario }),
    ...(input.history === undefined ? {} : { history: input.history }),
  };
  // The engine reads only a plain copy and checks frame layout rules (QR fit, spine/margin zones, marks, footer, time log), so anything `planBook` would refuse on the frame is refused here.
  const plain = plainCopy("The book", raw);
  if (!plain.ok) return plain;
  const read = readBookRequest(plain.value, input.snapshot);
  if (Array.isArray(read)) return { ok: false, problems: read };
  const layout = buildPages(read.sheets.map((s) => ({ ...s, items: [], levelName: input.snapshot.level.name })));
  if (!layout.ok) return layout;
  const sheetsById = new Map(read.sheets.map((s) => [s.sheet.id, s.sheet]));
  const layoutProblems = layout.pages.flatMap((page) => {
    const places = sheetsById.get(page.sheetId)?.[page.side].template.sides[page.side].places ?? [];
    return checkPageFrame(page, places.map((p) => p.slot));
  });
  return layoutProblems.length > 0 ? { ok: false, problems: layoutProblems } : { ok: true, request: plain.value as BookRequestJson, sheets: chosen };
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
