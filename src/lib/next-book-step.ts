// The automatic caller of prepareNextBook (#476): one step of the /api/reminders run, every 15 minutes.
//
// One read builds the due list, oldest first by its anchor time, at most NEXT_BOOK_STEP_LIMIT items:
//   (a) a #475 trigger claim with no snapshot chain yet          anchor: the claim time
//   (b) a live revision-1 chain that is not frozen, not planned
//       or not admitted yet                                      anchor: its prepare_from
//   (c) a #628 backstop hold with no held snapshot row yet       anchor: the hold time
// Each item is then prepared in that order, until less than NEXT_BOOK_STEP_RESERVE_MS of the step's time is left.
//
// Why oldest first with a limit of 20 does not block later work for long: (a) and (c) leave the list on their first call
// (the claim becomes a chain, the hold gets its row). A waiting chain costs one cheap read and returns at once, and it
// stops waiting by the freeze deadline, 30 minutes after its claim (PREPARATION_LIMIT_MS). So the head of the list turns
// over within about two runs, and the items behind it are reached.
//
// A failed or truncated read ends the step for this run with no writes: it is tried again next run, never treated as
// done. An error on one item is counted, and the step goes on to the next item. The answer holds counts only.
import "server-only";
import type { NextBookPlanner, NextBookTrigger, PrepareOutcome } from "./next-book-snapshot";
import { isUuid } from "./workbook-content";

export const NEXT_BOOK_STEP_LIMIT = 20;
/** No new item starts with less than this left of the step's time. */
export const NEXT_BOOK_STEP_RESERVE_MS = 8_000;

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
  /** A stable tie-break: the claim id, the snapshot id, or the held book id. */
  id: string;
  parentId: string;
  childId: string;
  trigger: NextBookTrigger;
}

/**
 * The due list in one read. `parents`, when set, limits it to those families before the limit, so families the release
 * leaves out never fill the list. Throws on a failed or truncated read.
 */
export interface NextBookDueReader {
  due(input: { limit: number; parents: readonly string[] | null }): Promise<NextBookDueItem[]>;
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
  /** The prepare call around this planner. Null when the rest of the wiring is missing (no service key, no selection). */
  prepare(planner: NextBookPlanner): PrepareCall | null;
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
  | { status: "ran"; due: number; prepared: number; skipped: number; errors: number; outOfTime: boolean; outcomes: Record<string, number> };

const outcomeKey = (o: PrepareOutcome) => o.status === "refused" ? `refused:${o.reason}` : o.status;

/** May this family's item be prepared now? Checked right before the item's writes. */
async function released(item: NextBookDueItem, release: NextBookRelease, deps: NextBookStepDeps): Promise<boolean> {
  if (release.testParents.includes(item.parentId) && await deps.testAccount(item.parentId)) return true;
  return release.mode === "families" && await deps.openPlan({ parentId: item.parentId, childId: item.childId });
}

export async function runNextBookStep(deps: NextBookStepDeps): Promise<NextBookStepResult> {
  const release = deps.release;
  if (!release) return { status: "off" };
  // Before any read or write: no claim is turned into a chain and no hold row is written without a planner.
  const prepare = deps.planner ? deps.prepare(deps.planner) : null;
  if (!prepare) return { status: "planner-not-ready" };
  if (deps.time.endAt - deps.time.now() < NEXT_BOOK_STEP_RESERVE_MS) {
    return { status: "ran", due: 0, prepared: 0, skipped: 0, errors: 0, outOfTime: true, outcomes: {} };
  }
  let due: NextBookDueItem[];
  try {
    due = await deps.reader.due({ limit: NEXT_BOOK_STEP_LIMIT, parents: release.mode === "test-only" ? release.testParents : null });
  } catch {
    return { status: "read-failed" };
  }
  // The reader orders and limits; do it again so a reader can never widen the step.
  due = [...due].sort(dueOrder).slice(0, NEXT_BOOK_STEP_LIMIT);
  const outcomes: Record<string, number> = {};
  let prepared = 0, skipped = 0, errors = 0, outOfTime = false;
  for (const item of due) {
    if (deps.time.endAt - deps.time.now() < NEXT_BOOK_STEP_RESERVE_MS) { outOfTime = true; break; }
    try {
      if (!await released(item, release, deps)) { skipped++; continue; }
      const outcome = await prepare(item.trigger, deps.time.now());
      prepared++;
      const key = outcomeKey(outcome);
      outcomes[key] = (outcomes[key] ?? 0) + 1;
    } catch {
      errors++;
    }
  }
  return { status: "ran", due: due.length, prepared, skipped, errors, outOfTime, outcomes };
}
