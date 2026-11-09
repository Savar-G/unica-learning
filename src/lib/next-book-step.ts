// The automatic caller of prepareNextBook (#476): the /api/next-book-prepare cron route, every 15 minutes. It is its own
// route, not a step of /api/reminders: it reads the plan gate, and no email sender may reach it.
//
// The due candidates, oldest first by their anchor time:
//   (a) a #475 trigger claim with no snapshot chain yet          anchor: the claim time
//   (b) a live revision-1 chain that is not frozen, not planned
//       or not admitted yet                                      anchor: its prepare_from
//   (c) a #628 backstop hold with no held snapshot row yet       anchor: the hold time
// The step reads them in pages through a keyset cursor (anchor, kind, id), each page strictly after the last, so equal
// times never hold it on one page. It checks each one's access (the release mode, the test list and its test_accounts
// mark, the child's open plan) right before its writes. Only an item that passes uses one of the NEXT_BOOK_STEP_LIMIT slots: a
// skipped item never does, so older families the release leaves out cannot keep a newer released family waiting. It
// keeps reading until 20 items were prepared, the candidates run out, or less than NEXT_BOOK_STEP_RESERVE_MS is left.
//
// Why oldest first with a limit of 20 does not block later work for long: (a) and (c) leave the list on their first call
// (the claim becomes a chain, the hold gets its row). A waiting chain costs one cheap read and returns at once, and it
// stops waiting by the freeze deadline, 30 minutes after its claim (PREPARATION_LIMIT_MS). So the head of the list turns
// over within about two runs, and the items behind it are reached.
//
// One deadline covers the whole step: the step's time less NEXT_BOOK_STEP_ANSWER_MS. Every candidate read, access read
// and item races it under one AbortSignal. At the deadline the signal aborts, the step stops and answers with what it
// did: it never holds the route's answer past endAt. Its later database requests (a client that never retries) and a
// late planner answer are refused, and each write it already made is one atomic, re-entrant step, so the next run
// continues it from what the store kept.
//
// A failed or cut first read ends the step for this run with no writes: it is tried again next run, never treated as
// done. A failed later read ends the step with the items already prepared kept. An error on one item is counted, and the
// step goes on to the next item. The answer holds counts only.
import "server-only";
import type { NextBookPlanner, NextBookTrigger, PrepareOutcome } from "./next-book-snapshot";
import { isUuid } from "./workbook-content";

export const NEXT_BOOK_STEP_LIMIT = 20;
/** No new item starts with less than this left of the step's time. */
export const NEXT_BOOK_STEP_RESERVE_MS = 8_000;
/** The step's deadline ends this long before endAt, so the route can still answer by then. */
export const NEXT_BOOK_STEP_ANSWER_MS = 1_000;
/** Candidates per read. */
export const NEXT_BOOK_STEP_PAGE = 50;

export interface NextBookStepEnvironment {
  NEXT_BOOK_PREPARE_ENABLED?: string;
  WORKBOOK_SCAN_TEST_PARENT_IDS?: string;
}

/**
 * The release switch NEXT_BOOK_PREPARE_ENABLED. Unset or any other value: off.
 * - "test-only": only the parents in WORKBOOK_SCAN_TEST_PARENT_IDS that are still marked in test_accounts.
 * - "families": those, and real families whose child has an open plan.
 * A malformed parent list is off in both modes. In "families" mode the list may be empty.
 */
export type NextBookRelease = { mode: "test-only" | "families"; testParents: readonly string[] };

export function nextBookRelease(env: NextBookStepEnvironment): NextBookRelease | null {
  const mode = env.NEXT_BOOK_PREPARE_ENABLED;
  if (mode !== "test-only" && mode !== "families") return null;
  const raw = env.WORKBOOK_SCAN_TEST_PARENT_IDS ?? "";
  const testParents = raw.trim() === "" ? [] : raw.split(",").map(s => s.trim());
  if (testParents.length > 20 || testParents.some(id => !isUuid(id)) || new Set(testParents).size !== testParents.length) return null;
  if (mode === "test-only" && testParents.length === 0) return null;
  return { mode, testParents };
}

export type NextBookDueKind = "claim" | "chain" | "hold";

/** Where a candidate sits in the due order: its anchor time in microseconds (as the database keeps it), kind and id. */
export interface NextBookDueCursor {
  anchorUs: number;
  kind: NextBookDueKind;
  /** The claim id, the snapshot id, or the held book and its zero-padded delivery audit (holdId). */
  id: string;
}
export interface NextBookDueItem extends NextBookDueCursor {
  /** The source book 1. One step prepares each book at most once. */
  workbookId: string;
  parentId: string;
  childId: string;
  trigger: NextBookTrigger;
}

/** A hold's id: its book, then the delivery audit padded so the text order is the number order. */
export const holdId = (workbookId: string, deliveryAuditId: number) => `${workbookId}:${String(deliveryAuditId).padStart(19, "0")}`;

/** One page of candidates, in due order. `next`: the following page starts strictly after it; null: no more. */
export interface NextBookDuePage { items: NextBookDueItem[]; next: NextBookDueCursor | null }

/**
 * The due candidates, a page at a time: those strictly after `after` (all when null), in due order, at most `size` from
 * each source. `parents`, when set, limits them to those families before the size. Requests stop when `signal` aborts.
 * Throws on a failed or cut read.
 */
export interface NextBookDueReader {
  page(input: { size: number; after: NextBookDueCursor | null; parents: readonly string[] | null; signal?: AbortSignal }): Promise<NextBookDuePage>;
}

export const KIND_ORDER: Record<NextBookDueKind, number> = { chain: 0, claim: 1, hold: 2 };
/** Oldest first; at the same time a chain before a claim before a hold, then by id. */
export function dueOrder(a: NextBookDueCursor, b: NextBookDueCursor): number {
  return a.anchorUs - b.anchorUs || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
const cursorOf = ({ anchorUs, kind, id }: NextBookDueCursor): NextBookDueCursor => ({ anchorUs, kind, id });

export type PrepareCall = (trigger: NextBookTrigger, now: number) => Promise<PrepareOutcome>;

export interface NextBookStepDeps {
  release: NextBookRelease | null;
  /** nextBookPlanner() in production; tests pass a fake. */
  planner: NextBookPlanner | null;
  /**
   * The prepare call around this planner. Null when the rest of the wiring is missing (no service key).
   * With the step's signal: every request and wait it makes must stop when the signal aborts.
   */
  prepare(planner: NextBookPlanner, signal?: AbortSignal): PrepareCall | null;
  reader: NextBookDueReader;
  /** test_accounts still marks this listed parent. Read again before each item. */
  testAccount(parentId: string, signal: AbortSignal): Promise<boolean>;
  /** The child's plan is open (childPlanAccess). Read again before each item. */
  openPlan(input: { parentId: string; childId: string }, signal: AbortSignal): Promise<boolean>;
  time: { now(): number; endAt: number };
}

export type NextBookStepResult =
  | { status: "off" }
  | { status: "planner-not-ready" }
  | { status: "read-failed" }
  | { status: "ran"; due: number; prepared: number; skipped: number; errors: number; outOfTime: boolean; timedOut: boolean;
    readFailed: boolean; outcomes: Record<string, number> };

const outcomeKey = (o: PrepareOutcome) => o.status === "refused" ? `refused:${o.reason}` : o.status;

/** May this family's item be prepared now? Checked right before the item's writes. */
async function released(item: NextBookDueItem, release: NextBookRelease, deps: NextBookStepDeps, signal: AbortSignal): Promise<boolean> {
  if (release.testParents.includes(item.parentId) && await deps.testAccount(item.parentId, signal)) return true;
  return release.mode === "families" && await deps.openPlan({ parentId: item.parentId, childId: item.childId }, signal);
}

class Deadline extends Error {}

/** The work's answer, or a throw once the signal aborts (also when the work ends after the abort). */
export async function untilAborted<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let stop: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    stop = () => reject(new Deadline());
    signal.addEventListener("abort", stop, { once: true });
  });
  const run = work();
  run.catch(() => {});
  try { return await Promise.race([run, aborted]); }
  finally { signal.removeEventListener("abort", stop); signal.throwIfAborted(); }
}

/** A planner whose answer is refused once the step's signal aborts, so no plan is saved after the deadline. */
const plannerUntilAborted = (planner: NextBookPlanner, signal: AbortSignal): NextBookPlanner =>
  ({ plan: input => untilAborted(() => planner.plan(input), signal) });

export async function runNextBookStep(deps: NextBookStepDeps): Promise<NextBookStepResult> {
  const release = deps.release;
  if (!release) return { status: "off" };
  const planner = deps.planner;
  // Before any read or write: no claim is turned into a chain and no hold row is written without a planner.
  if (!planner || !deps.prepare(planner)) return { status: "planner-not-ready" };
  const left = () => deps.time.endAt - deps.time.now();
  const result = { status: "ran" as const, due: 0, prepared: 0, skipped: 0, errors: 0, outOfTime: false, timedOut: false, readFailed: false,
    outcomes: {} as Record<string, number> };
  if (left() < NEXT_BOOK_STEP_RESERVE_MS) return { ...result, outOfTime: true };
  // The one deadline: every read and every item below races it, and its signal stops their requests.
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new Deadline()), Math.max(0, left() - NEXT_BOOK_STEP_ANSWER_MS));
  const signal = deadline.signal;
  const guard = <T>(work: () => Promise<T>) => untilAborted(work, signal);
  const call = deps.prepare(plannerUntilAborted(planner, signal), signal);
  const parents = release.mode === "test-only" ? release.testParents : null;
  const seenBooks = new Set<string>();
  let after: NextBookDueCursor | null = null, first = true;
  try {
    if (!call) { result.errors++; return result; }
    read: while (result.prepared < NEXT_BOOK_STEP_LIMIT) {
      if (left() < NEXT_BOOK_STEP_RESERVE_MS) { result.outOfTime = true; break; }
      let page: NextBookDuePage;
      try {
        page = await guard(() => deps.reader.page({ size: NEXT_BOOK_STEP_PAGE, after, parents, signal }));
      } catch {
        if (signal.aborted) { result.timedOut = true; result.outOfTime = true; break; }
        if (first) return { status: "read-failed" };
        result.readFailed = true;
        break;
      }
      first = false;
      for (const item of [...page.items].sort(dueOrder)) {
        // Strictly after the cursor; and a claim prepared earlier this run is a chain now: one call per book.
        if ((after && dueOrder(item, after) <= 0) || seenBooks.has(item.workbookId)) continue;
        if (left() < NEXT_BOOK_STEP_RESERVE_MS) { result.outOfTime = true; break read; }
        seenBooks.add(item.workbookId);
        result.due++;
        try {
          if (!await guard(() => released(item, release, deps, signal))) { result.skipped++; continue; }
          const outcome = await guard(() => call(item.trigger, deps.time.now()));
          result.prepared++;
          const key = outcomeKey(outcome);
          result.outcomes[key] = (result.outcomes[key] ?? 0) + 1;
        } catch {
          if (signal.aborted) { result.timedOut = true; result.outOfTime = true; break read; }
          result.errors++;
        }
        if (result.prepared >= NEXT_BOOK_STEP_LIMIT) break read;
      }
      if (page.next === null) break;
      // A reader must move on: a cursor that does not is a fault, never a reason to read the same page again.
      if (after && dueOrder(page.next, after) <= 0) { result.readFailed = true; break; }
      after = cursorOf(page.next);
    }
    return result;
  } finally {
    clearTimeout(timer);
    // Nothing the step started may go on after it answers.
    if (!signal.aborted) deadline.abort(new Deadline());
  }
}
