// Where a child is in a level, computed each time from what happened and never stored: the sheets that are issued, the
// pages whose scans were accepted and the results of the sheets. Pure: the same history always gives the same queue.
import type { Snapshot, SnapshotSheet } from "../bank/snapshot";
import { SHEET_RESULTS, type SheetResultKind } from "../results/sheet-results";

export interface ChildState { childId: string; startSheetId?: string }
/** One attempt of a sheet in a book. `pages` are its front and back page numbers in that book; `reason` is required for attempt 2 and later (`"repeat"` or `"unscanned"`) and optional (`"new"`) for attempt 1. */
export interface IssuedSheet { bookId: string; bookNumber: number; sheetId: string; attempt: number; pages: [number, number]; reason?: QueueReason }
/** A page of a book whose scan was accepted. The same page scanned again counts one time. */
export interface ScanReceipt { bookId: string; pageNumber: number }
export interface SheetResultRecord { bookId: string; sheetId: string; attempt: number; result: SheetResultKind; itemsScored: number; mistakes: number }

/** "repeat": a proven fail. "unscanned": a sheet with no result whose book came back with less than half of its pages. */
export type QueueReason = "repeat" | "unscanned" | "new";
export const QUEUE_REASONS: readonly QueueReason[] = ["repeat", "unscanned", "new"];
/** Full-book page scan coverage, including any retired sheets no longer in the active snapshot. */
export interface BookScanCoverage { issuedPages: number; scannedPages: number }
export interface QueueEntry { sheetId: string; attempt: number; reason: QueueReason }
/** A sheet with no result that counts as passed until its marks arrive. */
export interface AssumedPass { sheetId: string; attempt: number; bookId: string }
/** For Maya, never printed: a sheet that has failed this many times. */
export interface MayaNudge { sheetId: string; failedAttempts: number }

export interface ChildPosition {
  ok: true;
  childId: string;
  /** Repeats first, in the order of the level, then the sheets that were never issued, in the order of the level. */
  queue: QueueEntry[];
  done: string[];
  assumedPassed: AssumedPass[];
  teamNotices: string[];
  mayaNudges: MayaNudge[];
}
export type PositionOutcome = ChildPosition | { ok: false; problems: string[] };

/** A sheet that has failed this many times gets a nudge to Maya. */
export const NUDGE_AFTER_FAILS = 3;

const isName = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9-]{1,64}$/.test(value);
const isCount = (value: unknown, min: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min;

/** The sheets of a level in the order of its topics and of the sheets in each topic. */
export const levelOrder = (snapshot: Snapshot): SnapshotSheet[] => [...snapshot.sheets.values()];

/** Each problem of the history, or none. */
function problemsOf(state: ChildState, issued: readonly IssuedSheet[], receipts: readonly ScanReceipt[], results: readonly SheetResultRecord[], snapshot: Snapshot): string[] {
  const problems: string[] = [];
  const tell = (text: string) => { if (!problems.includes(text)) problems.push(text); };
  if (!isName(state.childId)) tell("The child id must use only letters, digits and dashes.");
  if (state.startSheetId !== undefined && !snapshot.sheets.has(state.startSheetId)) tell(`The level has no start sheet ${JSON.stringify(state.startSheetId)}.`);
  const numberOf = new Map<string, number>();
  const bookOf = new Map<number, string>();
  const attempts = new Set<string>();
  const pages = new Set<string>();
  for (const s of issued) {
    const at = `The issued sheet ${JSON.stringify(s.sheetId)}, attempt ${JSON.stringify(s.attempt)}`;
    if (!isName(s.bookId)) tell(`${at}: the book id must use only letters, digits and dashes.`);
    if (!isCount(s.bookNumber, 1)) tell(`${at}: the book number must be a whole number, 1 or more.`);
    if (!snapshot.sheets.has(s.sheetId)) tell(`${at}: the level has no such sheet.`);
    if (!isCount(s.attempt, 1)) tell(`${at}: the attempt must be a whole number, 1 or more.`);
    if (s.reason !== undefined && !QUEUE_REASONS.includes(s.reason)) tell(`${at}: reason must be new, repeat or unscanned.`);
    else if (s.attempt === 1 && s.reason !== undefined && s.reason !== "new") tell(`${at}: attempt 1 cannot have reason ${JSON.stringify(s.reason)}.`);
    else if (isCount(s.attempt, 2) && (s.reason === undefined || s.reason === "new")) tell(`${at}: attempt ${s.attempt} must have reason "repeat" or "unscanned".`);
    const pair = Array.isArray(s.pages) && s.pages.length === 2 && s.pages.every((p) => isCount(p, 1)) && s.pages[0] !== s.pages[1];
    if (!pair) tell(`${at}: pages must be two different page numbers.`);
    if (numberOf.has(s.bookId) && numberOf.get(s.bookId) !== s.bookNumber) tell(`The book "${s.bookId}" has more than one book number.`);
    if (bookOf.has(s.bookNumber) && bookOf.get(s.bookNumber) !== s.bookId) tell(`The book number ${s.bookNumber} names more than one book.`);
    numberOf.set(s.bookId, s.bookNumber);
    bookOf.set(s.bookNumber, s.bookId);
    const attempt = `${s.sheetId} ${s.attempt}`;
    if (attempts.has(attempt)) tell(`${at}: this attempt is issued more than once.`);
    attempts.add(attempt);
    for (const page of pair ? s.pages : []) {
      if (pages.has(`${s.bookId} ${page}`)) tell(`The book "${s.bookId}" has the page ${page} more than once.`);
      pages.add(`${s.bookId} ${page}`);
    }
  }
  // The attempts of a sheet start at 1 with no gaps and follow the books: a later attempt is in a later book.
  for (const sheet of snapshot.sheets.keys()) {
    const own = issued.filter((s) => s.sheetId === sheet && isCount(s.attempt, 1)).sort((a, b) => a.attempt - b.attempt);
    own.forEach((s, i) => {
      if (s.attempt !== i + 1) tell(`The sheet "${sheet}": attempts must start at 1 with no gaps.`);
      if (i > 0 && !(s.bookNumber > own[i - 1].bookNumber)) tell(`The sheet "${sheet}": attempt ${s.attempt} must be in a later book than attempt ${own[i - 1].attempt}.`);
    });
  }
  for (const r of receipts) {
    if (!isName(r.bookId) || !isCount(r.pageNumber, 1) || !pages.has(`${r.bookId} ${r.pageNumber}`)) {
      tell(`The scan of page ${JSON.stringify(r.pageNumber)} of the book ${JSON.stringify(r.bookId)} is of no issued page.`);
    }
  }
  const resulted = new Set<string>();
  for (const r of results) {
    const at = `The result of the sheet ${JSON.stringify(r.sheetId)}, attempt ${JSON.stringify(r.attempt)}`;
    if (!issued.some((s) => s.bookId === r.bookId && s.sheetId === r.sheetId && s.attempt === r.attempt)) tell(`${at}: the book ${JSON.stringify(r.bookId)} did not issue this attempt.`);
    if (resulted.has(`${r.sheetId} ${r.attempt}`)) tell(`${at}: this attempt has more than one result.`);
    resulted.add(`${r.sheetId} ${r.attempt}`);
    if (!SHEET_RESULTS.includes(r.result)) tell(`${at}: the result must be mastered, repeat or unknown.`);
    if (!isCount(r.itemsScored, 0) || !isCount(r.mistakes, 0) || r.mistakes > r.itemsScored) tell(`${at}: itemsScored and mistakes must be whole numbers, with no more mistakes than scored questions.`);
  }
  return problems;
}

/**
 * The position of a child. For each sheet from the start sheet on, in the order of the level, its latest attempt decides:
 *
 * 1. "mastered": the sheet is done.
 * 2. "repeat": the next attempt is due, also when the result came late and a later book has moved on.
 * 3. "unknown" or no result: when less than half of the pages of the book of that attempt were scanned, the sheet repeats
 *    one time, with a notice for the team. A sheet that already repeated for this reason, or a book with half or more of
 *    its pages scanned, counts as passed until its marks arrive.
 *
 * A sheet with NUDGE_AFTER_FAILS or more failed attempts gets a nudge to Maya.
 */
export function position(
  state: ChildState,
  issued: readonly IssuedSheet[],
  receipts: readonly ScanReceipt[],
  results: readonly SheetResultRecord[],
  snapshot: Snapshot,
  bookCoverage?: ReadonlyMap<string, BookScanCoverage>,
): PositionOutcome {
  const problems = problemsOf(state, issued, receipts, results, snapshot);
  if (bookCoverage) {
    for (const [bookId, cov] of bookCoverage) {
      if (!isCount(cov.issuedPages, 2) || cov.issuedPages % 2 !== 0 || !isCount(cov.scannedPages, 0) || cov.scannedPages > cov.issuedPages) {
        problems.push(`The scan coverage of the book ${JSON.stringify(bookId)} is invalid.`);
      }
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  const order = levelOrder(snapshot);
  const start = state.startSheetId === undefined ? 0 : order.findIndex((s) => s.id === state.startSheetId);
  const resultOf = (sheetId: string, attempt: number) => results.find((r) => r.sheetId === sheetId && r.attempt === attempt)?.result;
  const issuedPages = (bookId: string) => bookCoverage?.get(bookId)?.issuedPages ?? 2 * issued.filter((s) => s.bookId === bookId).length;
  const scannedPages = (bookId: string) => bookCoverage?.get(bookId)?.scannedPages ?? new Set(receipts.filter((r) => r.bookId === bookId).map((r) => r.pageNumber)).size;

  const outcome: ChildPosition = { ok: true, childId: state.childId, queue: [], done: [], assumedPassed: [], teamNotices: [], mayaNudges: [] };
  const fresh: QueueEntry[] = [];
  for (const { id } of order.slice(start)) {
    const attempts = issued.filter((s) => s.sheetId === id).sort((a, b) => a.attempt - b.attempt);
    const latest = attempts.at(-1);
    if (!latest) {
      fresh.push({ sheetId: id, attempt: 1, reason: "new" });
      continue;
    }
    const failed = attempts.filter((s) => resultOf(id, s.attempt) === "repeat").length;
    if (failed >= NUDGE_AFTER_FAILS) outcome.mayaNudges.push({ sheetId: id, failedAttempts: failed });
    const result = resultOf(id, latest.attempt);
    if (result === "mastered") outcome.done.push(id);
    else if (result === "repeat") outcome.queue.push({ sheetId: id, attempt: latest.attempt + 1, reason: "repeat" });
    else {
      // Every attempt 2+ carries a durable reason, so late results on earlier attempts never alter whether an unscanned repeat was already used.
      const repeatedOnce = attempts.some((s) => s.reason === "unscanned");
      const [scanned, pages] = [scannedPages(latest.bookId), issuedPages(latest.bookId)];
      if (scanned * 2 < pages && !repeatedOnce) {
        outcome.queue.push({ sheetId: id, attempt: latest.attempt + 1, reason: "unscanned" });
        outcome.teamNotices.push(`Sheet "${id}", attempt ${latest.attempt} (book ${latest.bookNumber}): ${scanned} of ${pages} pages of the book were scanned, so attempt ${latest.attempt + 1} repeats the sheet one time.`);
      } else outcome.assumedPassed.push({ sheetId: id, attempt: latest.attempt, bookId: latest.bookId });
    }
  }
  outcome.queue.push(...fresh);
  return outcome;
}
