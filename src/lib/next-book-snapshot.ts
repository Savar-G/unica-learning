// Primitives for the next-book snapshot. Durable admission and source loading are separate server responsibilities.
import type { ProgressHistory, ProgressSnapshot } from "./workbook-progress";
import type { FrozenWorkbookSourcesV2 } from "./workbook-progress-source";
import type { HistoryFence } from "./workbook-progress-history";
import type { PlanInput, WorkbookPlan } from "./workbook-plan";

export interface SnapshotEvidence {
  key: string;
  version: number;
  day: number;
  pageId: string;
}

export interface FrozenNextBookSnapshot {
  id: string;
  triggerId: string;
  revision: number;
  sourceWorkbookId: string;
  sourcePrintedRevision: string;
  frozenAt: number;
  snapshot: ProgressSnapshot;
  history: ProgressHistory;
  sources: FrozenWorkbookSourcesV2;
  historyFence: HistoryFence;
  evidence: readonly SnapshotEvidence[];
  pending: readonly string[];
  heldForLater: readonly string[];
}

export interface NextBookPlanner {
  plan(input: { snapshot: ProgressSnapshot; history: ProgressHistory; frozen: FrozenNextBookSnapshot }): Promise<
    | { ok: true; planningInput: PlanInput; plan: WorkbookPlan; consumed: Array<{ key: string; version: number }>; held: Array<{ key: string; reason: string }>; planHash: string }
    | { ok: false; reason: string }
  >;
}

export const PREPARATION_LIMIT_MS = 30 * 60 * 1000;

/** The captured set is fixed at admission. A missing or blocked job waits only until the deadline. */
export function preparationState(triggerAt: number, now: number, jobs: readonly ("finished" | "waiting")[]): "waiting" | "ready" {
  if (!Number.isSafeInteger(triggerAt) || !Number.isSafeInteger(now) || now < triggerAt) throw Error("invalid-clock");
  return jobs.includes("waiting") && now - triggerAt < PREPARATION_LIMIT_MS ? "waiting" : "ready";
}

/** Reject duplicate identities and any version the frozen history did not hold. */
export function validatePlannerEvidence(frozen: FrozenNextBookSnapshot, used: readonly { key: string; version: number }[]): boolean {
  const available = new Map<string, number>();
  for (const original of frozen.history.originals) {
    const effective = original.changes.at(-1) ?? original.first;
    const identity = effective.observation.identity;
    const key = JSON.stringify([identity.workbookId, identity.printedRevision, identity.pageId, identity.itemId]);
    if (available.has(key)) return false;
    available.set(key, effective.observation.resultVersion);
  }
  const ledger = new Map<string, number>();
  for (const entry of frozen.evidence) {
    if (ledger.has(entry.key) || available.get(entry.key) !== entry.version) return false;
    ledger.set(entry.key, entry.version);
  }
  const seen = new Set<string>();
  return used.every(({ key, version }) => {
    if (seen.has(key) || !Number.isSafeInteger(version) || version < 1 || ledger.get(key) !== version) return false;
    seen.add(key);
    return true;
  });
}

/** Compare canonical item versions. The caller supplies only marked, current-book evidence. */
export function newEvidenceSince(used: readonly { key: string; version: number }[], current: readonly SnapshotEvidence[]): {
  days: number[]; pages: number; items: number;
} {
  const previous = new Map(used.map(({ key, version }) => [key, version]));
  const seen = new Set<string>();
  const changed = current.filter(({ key, version }) => {
    if (seen.has(key) || !Number.isSafeInteger(version) || version < 1) throw Error("invalid-evidence");
    seen.add(key);
    const prior = previous.get(key);
    if (prior !== undefined && version < prior) throw Error("evidence-regressed");
    return prior === undefined || version > prior;
  });
  return { days: [...new Set(changed.map(({ day }) => day))].sort((a, b) => a - b),
    pages: new Set(changed.map(({ pageId }) => pageId)).size, items: changed.length };
}
