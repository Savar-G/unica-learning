// What a v2 book job is asked for, checked before anything is written, and the allocation it saves before the build: the
// workbook id, a QR token for each page and the time, with the engine's input hash. The engine makes no id, token or date;
// this adapter does, from the clock and random source the job is given.
import { isUuid } from "@/lib/workbook-content";
import { COVER_PAGES, dayLengths, MAX_TOTAL_PAGES, wrongDay } from "@/lib/workbook-v2/assemble/plan-book";
import { formatFinding } from "@/lib/workbook-v2/checks/findings";
import { planBook, wholeBookFindings, type BookCheckOptions } from "@/lib/workbook-v2/build/build-book";
import type { AllocationCandidate, AllocationRecord, BookInputJson, PublishRequest } from "./types";

/** The most pages a book may have, and the count a book's pages are a multiple of (architecture 11.3). */
/** The most pages of a printed book with its cover, and its pages and cover come in sheets of 4 (assemble/plan-book.ts). */
export const MAX_PAGES = MAX_TOTAL_PAGES;
export const PAGE_MULTIPLE = 4;
/** A request key: what the caller keeps to try the same book again. */
export const REQUEST_KEY = /^[A-Za-z0-9:_-]{8,120}$/;
/** A QR token of a v2 page: 24 URL-safe characters (18 random bytes). */
export const V2_QR_TOKEN = /^[A-Za-z0-9_-]{24}$/;

/** The text of a page's QR code: the desk link of the page, as a v1 page prints it. */
export const pageLink = (token: string) => `https://unicalearning.com/tutor/p/${token}`;

/** The engine's book request for an allocation. */
export function bookInput(request: PublishRequest, workbookId: string, qrTokens: readonly string[]): BookInputJson {
  return {
    bookId: workbookId, childId: request.childId,
    sheets: request.sheets.map((s, i) => ({ sheetId: s.sheetId, attempt: s.attempt, startsDay: s.startsDay, qr: { front: pageLink(qrTokens[2 * i]), back: pageLink(qrTokens[2 * i + 1]) } })),
    ...(request.region === undefined ? {} : { region: request.region }),
    ...(request.scenario === undefined ? {} : { scenario: request.scenario }),
  };
}

const isWhole = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** What is wrong with a request's own fields, or null. The engine checks the snapshot and the sheets. */
export function requestProblem(r: PublishRequest): string | null {
  if (typeof r.requestKey !== "string" || !REQUEST_KEY.test(r.requestKey)) return "the request key is not 8 to 120 letters, digits, :, _ or -";
  if (!isUuid(r.childId)) return "the child id is not a UUID";
  if (!Array.isArray(r.sheets) || r.sheets.length === 0) return "the book has no sheets";
  const total = r.sheets.length * 2 + COVER_PAGES;
  if (total % PAGE_MULTIPLE !== 0 || total > MAX_PAGES) return `the pages of a book and the ${COVER_PAGES} of its cover are a multiple of ${PAGE_MULTIPLE}, up to ${MAX_PAGES}, and this book has ${total}`;
  let day = 0;
  for (const [i, s] of r.sheets.entries()) {
    if (!isWhole(s.day, 1, 100) || typeof s.startsDay !== "boolean") return `sheet ${i + 1} has no day`;
    if (s.startsDay !== (s.day !== day) || (s.startsDay && s.day !== day + 1)) return `sheet ${i + 1}: each day starts with its first sheet, and the days follow in order`;
    day = s.day;
  }
  const pagesPerDay = pagesPerDayOf(r);
  if (!isWhole(pagesPerDay, 2, MOST_PAGES_A_DAY) || pagesPerDay % 2 !== 0) return `pages a day is an even whole number from 2 to ${MOST_PAGES_A_DAY}, and this book has ${pagesPerDay}`;
  // The rule of a day is the planner's (assemble/plan-book.ts): pagesPerDay / 2 sheets, and the last day may have one more for an even book.
  const lengths = dayLengths(r.sheets.map((s) => s.startsDay));
  const wrong = wrongDay(lengths, pagesPerDay);
  if (wrong >= 0) return `day ${wrong + 1} has ${lengths[wrong]} ${lengths[wrong] === 1 ? "sheet" : "sheets"}, and at ${pagesPerDay} pages a day each day has ${pagesPerDay / 2} (the last day may have one more, so that the book has an even number of sheets)`;
  return null;
}

/** A day has at most 10 sheets (20 pages). */
const MOST_PAGES_A_DAY = 20;

/** The pages a day of a request: the number that it sets, or else twice the sheets of its first day. */
export const pagesPerDayOf = (r: PublishRequest): number => r.pagesPerDay ?? 2 * r.sheets.filter((s) => s.day === 1).length;

/** The levels of a snapshot: its level name as a number, U1 to U30. */
function levelsOf(levelName: string): number[] | null {
  const n = Number(levelName);
  return Number.isInteger(n) && n >= 1 && n <= 30 ? [n] : null;
}

export interface AllocationSource { workbookId: string; qrTokens: string[]; allocatedAt: string; parentId: string }

/**
 * The allocation of a request, with every check of the book that needs no drawing: a book that cannot be built is refused
 * here, before anything is written.
 */
export function allocationOf(request: PublishRequest, source: AllocationSource): { ok: true; candidate: AllocationCandidate } | { ok: false; problems: string[] } {
  const problem = requestProblem(request);
  if (problem) return { ok: false, problems: [problem] };
  if (source.qrTokens.length !== request.sheets.length * 2 || !source.qrTokens.every((t) => V2_QR_TOKEN.test(t)) || new Set(source.qrTokens).size !== source.qrTokens.length) {
    return { ok: false, problems: ["each page needs its own QR token"] };
  }
  const book = bookInput(request, source.workbookId, source.qrTokens);
  const plan = planBook({ snapshot: request.snapshot, book });
  if (!plan.ok) return { ok: false, problems: plan.problems };
  const snapshot = request.snapshot as { level: { name: string } };
  const levels = levelsOf(snapshot.level.name);
  if (!levels) return { ok: false, problems: ["the level of the snapshot is not U1 to U30"] };
  const pagesPerDay = pagesPerDayOf(request);
  // A published book is a whole book: one that breaks its page count, order or days is refused before it is allocated.
  const whole = wholeBookFindings(plan, pagesPerDay);
  if (whole.length > 0) return { ok: false, problems: [...new Set(whole.map(formatFinding))] };
  const allocation: AllocationRecord = {
    format: 1, snapshotId: plan.snapshot.id, snapshotHash: plan.snapshot.hash, levels, pagesPerDay,
    book, days: request.sheets.map((s) => s.day), qrTokens: source.qrTokens,
  };
  return {
    ok: true,
    candidate: {
      childId: request.childId, workbookId: source.workbookId, requestKey: request.requestKey, inputHash: plan.inputHash,
      inputPath: `${source.parentId}/${source.workbookId}/${plan.inputHash}.json`, allocatedAt: source.allocatedAt, allocation,
    },
  };
}

/**
 * The saved input of a book: the snapshot and the book request, as canonical JSON, and what the book is for its checks
 * (a whole book with its pages a day). Replay builds from it. An input saved before `checks` was kept has none, and is
 * checked as a part of a book.
 */
export interface SavedInput { format: 1; snapshot: unknown; book: BookInputJson; checks?: BookCheckOptions }
