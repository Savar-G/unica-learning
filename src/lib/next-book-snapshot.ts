// #476 (S12), D-308. The next-book snapshot: one chain per delivered Book 1, reached by the Day 7 claim, the backstop
// claim or the admin action. Revision 1 freezes the evidence for the book 2 draft; revisions 2+ are the D-308 refresh
// before "Approve for print". The store seam (`NextBookSnapshotStore`) owns every durable decision with the same
// refusals in SQL (supabase/migrations/20261108233000_next_book_snapshots.sql) and in memory.
//
// This module decides nothing about learning: no mastery threshold, repeat, review or level. The planner is a seam.
import "server-only";
import type { ProgressHistory, ProgressOriginal, ProgressSnapshot } from "./workbook-progress";
import type { FrozenWorkbookSourcesV2 } from "./workbook-progress-source";
import type { HistoryFence } from "./workbook-progress-history";
import type { PlanInput, WorkbookPlan } from "./workbook-plan";
import type { ItemIdentity } from "./scan-observation";
import { sourceHash } from "./workbook-progress-hash";

export type SnapshotReason = "day7_scanned" | "delivery_backstop" | "admin_prepare";
/** day7: current-book Days 1-7 (Days 8-10 held for later). backstop: every accepted day. refresh: every marked day. */
export type SnapshotScopeKind = "day7" | "backstop" | "refresh";
export type HeldReason = "outside-days" | "outside-sample" | "after-cutoff";

/** One canonical item `(workbook_id, printed_revision, page_id, item_id)` at its effective result version. */
export interface SnapshotEvidence {
  key: string;
  version: number;
  day: number;
  pageId: string;
}
/** In the required sample, but with no final result at the cutoff: still pending, or never scanned (missing). */
export interface PendingEvidence { key: string; day: number; pageId: string; reason: "pending" | "missing" }
/** A result the snapshot saw and kept for a later book. */
export interface HeldEvidence extends SnapshotEvidence { reason: HeldReason }
export interface SnapshotActor { id: string; email: string | null }

/** What one freeze stores. The hash covers exactly this JSON. */
export interface FrozenPayload {
  frozenAt: number;
  scope: {
    kind: SnapshotScopeKind;
    /** The preview request scope the capture used. */
    request: "day7" | "backstop" | "later-book";
    cutoff: number;
    /** Source-book days inside this snapshot, and printed days held for a later book. */
    days: number[];
    heldDays: number[];
    /** The bounded wait over the captured marking jobs (revision 1 only). */
    jobs: { captured: number; waiting: number; deadlineReached: boolean };
  };
  sources: FrozenWorkbookSourcesV2;
  historyFence: HistoryFence;
  snapshot: ProgressSnapshot;
  history: ProgressHistory;
  /** Everything the planner may consume: final results in scope. */
  ledger: SnapshotEvidence[];
  pending: PendingEvidence[];
  held: HeldEvidence[];
}

export interface SavedPlan {
  planHash: string;
  planInput: PlanInput;
  consumed: { key: string; version: number }[];
  held: { key: string; reason: string }[];
}

/** One row of `next_book_snapshots`, as the store returns it. */
export interface NextBookSnapshotRecord {
  id: string;
  triggerId: string | null;
  reason: SnapshotReason;
  parentId: string;
  childId: string;
  workbookId: string;
  number: number;
  printedRevision: string;
  triggerAt: number;
  /** The 30-minute window starts here: the claim time for revision 1, the retake time for a refresh. */
  prepareFrom: number;
  revision: number;
  draftId: string | null;
  receiptIds: string[];
  deliveryAuditId: number | null;
  held: { reason: "no-accepted-scans-at-backstop"; at: number } | null;
  actor: SnapshotActor | null;
  frozen: FrozenPayload | null;
  snapshotHash: string | null;
  plan: SavedPlan | null;
  runId: string | null;
  createdAt: number;
}

/** What the planner receives with the snapshot and history: the frozen row, with its provenance. */
export interface FrozenNextBookSnapshot {
  id: string;
  triggerId: string | null;
  reason: SnapshotReason;
  revision: number;
  sourceWorkbookId: string;
  sourcePrintedRevision: string;
  frozenAt: number;
  scope: FrozenPayload["scope"];
  snapshot: ProgressSnapshot;
  history: ProgressHistory;
  sources: FrozenWorkbookSourcesV2;
  historyFence: HistoryFence;
  /** The consumed ledger: the only items `consumed` may name, each at this version. */
  evidence: readonly SnapshotEvidence[];
  pending: readonly PendingEvidence[];
  heldForLater: readonly HeldEvidence[];
}

export type PlannerAnswer =
  | { ok: true; planningInput: PlanInput; plan: WorkbookPlan; consumed: Array<{ key: string; version: number }>; held: Array<{ key: string; reason: string }>; planHash: string }
  | { ok: false; reason: string };
export interface NextBookPlanner {
  plan(input: { snapshot: ProgressSnapshot; history: ProgressHistory; frozen: FrozenNextBookSnapshot }): Promise<PlannerAnswer>;
}

export type StoreAnswer = { status: "ok"; snapshot: NextBookSnapshotRecord } | { status: "refused"; reason: string };
export type HoldAnswer = StoreAnswer | { status: "held"; snapshot: NextBookSnapshotRecord };
export type AdmitAnswer =
  | { status: "started"; runId: string; existing: boolean }
  | { status: "busy" | "stalled"; runId: string }
  | { status: "refused"; reason: string };
export interface RunLimits { maxAttempts: number; staleSeconds: number }

/**
 * Every write is one atomic, idempotent decision, refused the same way in SQL and in memory:
 * - claim: revision 1 for a claim, or (admin) the book's claim, else an admin_prepare chain; always the one live chain.
 * - hold: #628, record the held chain when the backstop found no accepted scan; a live chain wins.
 * - save: freeze once; a later save returns the first freeze. Refused after approval for a refresh.
 * - savePlan: once per revision; the same plan again is a retry; consumed must lie inside the ledger.
 * - retake: revision n+1 for the draft the chain made; refused after approval, a source change or for an old revision.
 * - admit: one run per chain from revision 1's plan, through start_workbook_run's rules.
 */
export interface NextBookSnapshotStore {
  claim(source: { triggerId: string } | { workbookId: string; actor: SnapshotActor }): Promise<StoreAnswer>;
  hold(workbookId: string, deliveryAuditId: number): Promise<HoldAnswer>;
  save(id: string, frozen: FrozenPayload, hash: string): Promise<StoreAnswer>;
  savePlan(id: string, plan: SavedPlan): Promise<StoreAnswer>;
  retake(id: string, draftId: string, actor: SnapshotActor): Promise<StoreAnswer>;
  admit(id: string, by: SnapshotActor | null, limits: RunLimits): Promise<AdmitAnswer>;
  read(id: string): Promise<NextBookSnapshotRecord | null>;
  /** The latest live revision of the chain whose run made this draft. */
  latestForDraft(draftId: string): Promise<NextBookSnapshotRecord | null>;
  /** The captured marking jobs of the row's receipts. A job that no longer exists (photo deleted) is not waited on. */
  jobs(id: string): Promise<("finished" | "waiting")[]>;
  /** Every marked (not pending) result of the row's source book now, on dated pages. */
  evidence(id: string): Promise<SnapshotEvidence[]>;
}

export const PREPARATION_LIMIT_MS = 30 * 60 * 1000;
export const itemKey = (i: Pick<ItemIdentity, "workbookId" | "printedRevision" | "pageId" | "itemId">) =>
  JSON.stringify([i.workbookId, i.printedRevision, i.pageId, i.itemId]);
/** JSON as Postgres jsonb keeps it: no undefined, no functions. Hash and compare only this form. */
export const plainJson = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export const snapshotHash = (frozen: FrozenPayload) => sourceHash(plainJson(frozen));

/** The captured set is fixed at admission. A missing or blocked job waits only until the deadline. */
export function preparationState(triggerAt: number, now: number, jobs: readonly ("finished" | "waiting")[]): "waiting" | "ready" {
  if (!Number.isSafeInteger(triggerAt) || !Number.isSafeInteger(now) || now < triggerAt) throw Error("invalid-clock");
  return jobs.includes("waiting") && now - triggerAt < PREPARATION_LIMIT_MS ? "waiting" : "ready";
}

/** Reject duplicate identities and any version the frozen history did not hold. */
export function validatePlannerEvidence(frozen: Pick<FrozenNextBookSnapshot, "history" | "evidence">, used: readonly { key: string; version: number }[]): boolean {
  const available = new Map<string, number>();
  for (const original of frozen.history.originals) {
    const effective = original.changes.at(-1) ?? original.first;
    const key = itemKey(effective.observation.identity);
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
export function evidenceDelta(used: readonly { key: string; version: number }[], current: readonly SnapshotEvidence[]): {
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

/** The frozen row as the planner and the planner owner read it. Null until frozen. */
export function frozenView(row: NextBookSnapshotRecord): FrozenNextBookSnapshot | null {
  const f = row.frozen;
  if (!f) return null;
  return { id: row.id, triggerId: row.triggerId, reason: row.reason, revision: row.revision, sourceWorkbookId: row.workbookId,
    sourcePrintedRevision: row.printedRevision, frozenAt: f.frozenAt, scope: f.scope, snapshot: f.snapshot, history: f.history,
    sources: f.sources, historyFence: f.historyFence, evidence: f.ledger, pending: f.pending, heldForLater: f.held };
}

/** Split the captured history into the consumable ledger, the pending items and the held-for-later results. */
export function freezeEvidence(snapshot: ProgressSnapshot, history: ProgressHistory,
  held: readonly { reason: HeldReason; original: ProgressOriginal }[]): Pick<FrozenPayload, "ledger" | "pending" | "held"> {
  const effective = (o: ProgressOriginal) => (o.changes.at(-1) ?? o.first).observation;
  const ledger: SnapshotEvidence[] = [], pending: PendingEvidence[] = [], seen = new Set<string>();
  for (const original of history.originals) {
    const o = effective(original), key = itemKey(o.identity);
    seen.add(key);
    if (o.state === "pending" || o.state === "parent-pending") pending.push({ key, day: original.day, pageId: o.identity.pageId, reason: "pending" });
    else ledger.push({ key, version: o.resultVersion, day: original.day, pageId: o.identity.pageId });
  }
  for (const item of snapshot.requiredSample ?? []) {
    const key = itemKey(item.expected.identity);
    if (!seen.has(key)) pending.push({ key, day: item.day, pageId: item.expected.identity.pageId, reason: "missing" });
  }
  const kept = held.map(({ reason, original }) => {
    const o = effective(original);
    return { key: itemKey(o.identity), version: o.resultVersion, day: original.day, pageId: o.identity.pageId, reason };
  });
  const order = <T extends { key: string }>(rows: T[]) => rows.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  return { ledger: order(ledger), pending: order(pending), held: order(kept) };
}
