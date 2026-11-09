// The automatic caller of prepareNextBook (#476): one step of the /api/reminders run, every 15 minutes.
//
// The due candidates, oldest first by their anchor time:
//   (a) a #475 trigger claim with no snapshot chain yet          anchor: the claim time
//   (b) a live revision-1 chain that is not frozen, not planned
//       or not admitted yet                                      anchor: its prepare_from
//   (c) a #628 backstop hold with no held snapshot row yet       anchor: the hold time
// The step reads them in pages and checks each one's access (the release mode, the test list and its test_accounts mark,
// the child's open plan) right before its writes. Only an item that passes uses one of the NEXT_BOOK_STEP_LIMIT slots: a
// skipped item never does, so older families the release leaves out cannot keep a newer released family waiting. It
// keeps reading until 20 items were prepared, the candidates run out, or less than NEXT_BOOK_STEP_RESERVE_MS is left.
//
// Why oldest first with a limit of 20 does not block later work for long: (a) and (c) leave the list on their first call
// (the claim becomes a chain, the hold gets its row). A waiting chain costs one cheap read and returns at once, and it
// stops waiting by the freeze deadline, 30 minutes after its claim (PREPARATION_LIMIT_MS). So the head of the list turns
// over within about two runs, and the items behind it are reached.
//
// Each item gets the rest of the step's time, less NEXT_BOOK_STEP_ANSWER_MS, as its deadline. At the deadline its signal
// aborts, the step stops and answers with what it did: it never holds the reminders answer past endAt. The aborted item's later database requests
// and its planner answer are refused, and each write it already made is one atomic, re-entrant step, so the next run
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
/** An item's deadline ends this long before the step's, so the reminders run can still answer by endAt. */
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
export interface NextBookDueItem {
  kind: NextBookDueKind;
  /** Claim time (claim), prepare_from (chain) or hold time (hold), in milliseconds. */
  anchor: number;
  /** A stable tie-break: the claim id, the snapshot id, or the held book and its delivery audit. */
  id: string;
  /** The source book 1. One step prepares each book at most once. */
  workbookId: string;
  parentId: string;
  childId: string;
  trigger: NextBookTrigger;
}

/** One page of candidates, oldest first. `next` is where the following page starts (anchor at or after it); null: no more. */
export interface NextBookDuePage { items: NextBookDueItem[]; next: number | null }

/**
 * The due candidates, a page at a time: those with an anchor at or after `from` (all when null), oldest first, at most
 * `size`. `parents`, when set, limits them to those families before the size. Throws on a failed or cut read.
 */
export interface NextBookDueReader {
  page(input: { size: number; from: number | null; parents: readonly string[] | null }): Promise<NextBookDuePage>;
}

const KIND_ORDER: Record<NextBookDueKind, number> = { chain: 0, claim: 1, hold: 2 };
/** Oldest first; at the same time a chain before a claim before a hold, then by id. */
export function dueOrder(a: NextBookDueItem, b: NextBookDueItem): number {
  return a.anchor - b.anchor || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export type PrepareCall = (trigger: NextBookTrigger, now: number) => Promise<PrepareOutcome>;

export interface NextBookStepDeps {
  release: NextBookRelease | null;
  /** nextBookPlanner() in production; tests pass a fake. */
  planner: NextBookPlanner | null;
  /**
   * The prepare call around this planner. Null when the rest of the wiring is missing (no service key, no selection).
   * Per item it gets that item's signal: every request and wait it makes must stop when the signal aborts.
   */
  prepare(planner: NextBookPlanner, signal?: AbortSignal): PrepareCall | null;
  reader: NextBookDueReader;
  /** test_accounts still marks this listed parent. Read again before each item. */
  testAccount(parentId: string): Promise<boolean>;
  /** The child's plan is open (childPlanAccess). Read again before each item. */
  openPlan(input: { parentId: string; childId: string }): Promise<boolean>;
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
async function released(item: NextBookDueItem, release: NextBookRelease, deps: NextBookStepDeps): Promise<boolean> {
  if (release.testParents.includes(item.parentId) && await deps.testAccount(item.parentId)) return true;
  return release.mode === "families" && await deps.openPlan({ parentId: item.parentId, childId: item.childId });
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

/** A planner whose answer is refused once the item's signal aborts, so no plan is saved after the deadline. */
const plannerUntilAborted = (planner: NextBookPlanner, signal: AbortSignal): NextBookPlanner =>
  ({ plan: input => untilAborted(() => planner.plan(input), signal) });

/** Run one item until it ends or the deadline passes. "deadline": its signal aborted and the step must stop. */
async function withDeadline(prepare: PrepareCall, trigger: NextBookTrigger, now: number, ms: number, controller: AbortController): Promise<PrepareOutcome | "deadline"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"deadline">(resolve => { timer = setTimeout(() => { controller.abort(new Deadline()); resolve("deadline"); }, Math.max(0, ms)); });
  const work = prepare(trigger, now);
  // After the deadline the item's own promise may still reject (its requests are aborted); that is expected.
  work.catch(() => {});
  try { return await Promise.race([work, late]); }
  finally { clearTimeout(timer); }
}

export async function runNextBookStep(deps: NextBookStepDeps): Promise<NextBookStepResult> {
  const release = deps.release;
  if (!release) return { status: "off" };
  const planner = deps.planner;
  // Before any read or write: no claim is turned into a chain and no hold row is written without a planner.
  if (!planner || !deps.prepare(planner)) return { status: "planner-not-ready" };
  const left = () => deps.time.endAt - deps.time.now();
  const result = { status: "ran" as const, due: 0, prepared: 0, skipped: 0, errors: 0, outOfTime: false, timedOut: false, readFailed: false,
    outcomes: {} as Record<string, number> };
  const parents = release.mode === "test-only" ? release.testParents : null;
  const seenBooks = new Set<string>();
  let from: number | null = null, first = true;
  read: while (result.prepared < NEXT_BOOK_STEP_LIMIT) {
    if (left() < NEXT_BOOK_STEP_RESERVE_MS) { result.outOfTime = true; break; }
    let page: NextBookDuePage;
    try {
      page = await deps.reader.page({ size: NEXT_BOOK_STEP_PAGE, from, parents });
    } catch {
      if (first) return { status: "read-failed" };
      result.readFailed = true;
      break;
    }
    first = false;
    for (const item of [...page.items].sort(dueOrder)) {
      // A page starts at the last one's anchor, and a claim prepared earlier this run is a chain now: one call per book.
      if (seenBooks.has(item.workbookId) || (from !== null && item.anchor < from)) continue;
      if (left() < NEXT_BOOK_STEP_RESERVE_MS) { result.outOfTime = true; break read; }
      seenBooks.add(item.workbookId);
      result.due++;
      try {
        if (!await released(item, release, deps)) { result.skipped++; continue; }
      } catch {
        result.errors++;
        continue;
      }
      const controller = new AbortController();
      const call = deps.prepare(plannerUntilAborted(planner, controller.signal), controller.signal);
      if (!call) { result.errors++; continue; }
      try {
        const outcome = await withDeadline(call, item.trigger, deps.time.now(), left() - NEXT_BOOK_STEP_ANSWER_MS, controller);
        if (outcome === "deadline") { result.timedOut = true; result.outOfTime = true; break read; }
        result.prepared++;
        const key = outcomeKey(outcome);
        result.outcomes[key] = (result.outcomes[key] ?? 0) + 1;
      } catch {
        result.errors++;
      }
      if (result.prepared >= NEXT_BOOK_STEP_LIMIT) break read;
    }
    // No more candidates, or a page that could not move on (more than a page at one instant): stop for this run.
    if (page.next === null || page.next === from) break;
    from = page.next;
  }
  return result;
}
