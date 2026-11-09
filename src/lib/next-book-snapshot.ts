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

// ---------------------------------------------------------------------------------------------------------------------
// The consumer (#476). Re-entrant: call it again with the same trigger after "waiting", after a lost answer or after a
// restart; every step reads back what the store kept and continues from there.

export type NextBookTrigger =
  /** A #475 claim: day7_scanned or delivery_backstop. */
  | { kind: "claim"; triggerId: string }
  /** A #475 backstop hold (no accepted scan at the backstop, #628). */
  | { kind: "backstop-hold"; workbookId: string; deliveryAuditId: number }
  /** The admin's "Prepare from snapshot" on a delivered Book 1. */
  | { kind: "admin"; workbookId: string; actor: SnapshotActor }
  /** Continue one stored revision (a refresh after refreshNextBookSnapshot, or a restart). */
  | { kind: "snapshot"; snapshotId: string };

export type PrepareOutcome =
  | { status: "waiting"; snapshotId: string; until: number }
  | { status: "held"; snapshotId: string | null; reason: "no-accepted-scans-at-backstop" | "no-marked-scans" }
  | { status: "unsupported-source-book" }
  /** Planned: a refresh (it starts no run), or revision 1 whose run waits for the child's active run. */
  | { status: "planned"; snapshotId: string; revision: number; admission: "refresh" | "busy" | "stalled" }
  | { status: "queued"; snapshotId: string; runId: string }
  | { status: "refused"; reason: string; snapshotId?: string };

/** What the capture reads for one revision. requestId is the snapshot id; the cutoff is the freeze time. */
export interface CaptureRequest {
  snapshotId: string;
  parentId: string;
  childId: string;
  workbookId: string;
  printedRevision: string;
  scope: "day7" | "backstop" | "later-book";
  cutoff: number;
}
export type CaptureAnswer =
  | { status: "captured"; sources: FrozenWorkbookSourcesV2; fence: HistoryFence; snapshot: ProgressSnapshot; history: ProgressHistory;
    held: readonly { reason: HeldReason; original: ProgressOriginal }[] }
  /** The book has no marked scan at all (#628): never advance or repeat by plan. Nothing is recorded; try again later. */
  | { status: "held"; reason: "no-marked-scans" }
  | { status: "unavailable"; reason: string };
export interface NextBookCapture { (request: CaptureRequest): Promise<CaptureAnswer> }

export interface NextBookDeps {
  store: NextBookSnapshotStore;
  capture: NextBookCapture;
  planner: NextBookPlanner;
  run: RunLimits;
}

const refusedOutcome = (reason: string, snapshotId?: string): PrepareOutcome => snapshotId ? { status: "refused", reason, snapshotId } : { status: "refused", reason };
const scopeOf = (row: NextBookSnapshotRecord): { kind: SnapshotScopeKind; request: CaptureRequest["scope"] } =>
  row.revision > 1 ? { kind: "refresh", request: "later-book" } : row.reason === "day7_scanned" ? { kind: "day7", request: "day7" } : { kind: "backstop", request: "backstop" };

type Freeze = { ok: true; row: NextBookSnapshotRecord } | { ok: false; outcome: PrepareOutcome };

/** Wait (revision 1 only) for the captured marking jobs or the 30-minute deadline, then capture and freeze once. */
async function freeze(row: NextBookSnapshotRecord, deps: Pick<NextBookDeps, "store" | "capture">, now: number): Promise<Freeze> {
  if (row.held) return { ok: false, outcome: { status: "held", snapshotId: row.id, reason: row.held.reason } };
  if (row.frozen) return { ok: true, row };
  // A clock a little behind the database's cannot freeze before the window opened.
  const at = Math.max(now, row.prepareFrom);
  // A refresh reads what is marked now: pending marks stay pending and are not waited on.
  const jobs = row.revision === 1 ? await deps.store.jobs(row.id) : [];
  if (preparationState(row.prepareFrom, at, jobs) === "waiting") {
    return { ok: false, outcome: { status: "waiting", snapshotId: row.id, until: row.prepareFrom + PREPARATION_LIMIT_MS } };
  }
  const scope = scopeOf(row);
  const captured = await deps.capture({ snapshotId: row.id, parentId: row.parentId, childId: row.childId, workbookId: row.workbookId,
    printedRevision: row.printedRevision, scope: scope.request, cutoff: at });
  if (captured.status === "held") return { ok: false, outcome: { status: "held", snapshotId: row.id, reason: captured.reason } };
  if (captured.status !== "captured") return { ok: false, outcome: refusedOutcome(`capture-${captured.reason}`, row.id) };
  if (captured.snapshot.parentId !== row.parentId || captured.snapshot.childId !== row.childId || captured.snapshot.cutoff !== at
    || !captured.snapshot.scope.some(s => s.workbookId === row.workbookId && s.printedRevision === row.printedRevision)) {
    return { ok: false, outcome: refusedOutcome("capture-mismatch", row.id) };
  }
  const days = [...captured.snapshot.scope.find(s => s.workbookId === row.workbookId)!.days].sort((a, b) => a - b);
  const printed = captured.sources.books.find(b => b.book.id === row.workbookId)?.book.print_manifest?.days.map(d => d.day) ?? [];
  const payload: FrozenPayload = plainJson({
    frozenAt: at,
    scope: { kind: scope.kind, request: scope.request, cutoff: at, days, heldDays: [...new Set(printed)].filter(d => !days.includes(d)).sort((a, b) => a - b),
      jobs: { captured: jobs.length, waiting: jobs.filter(j => j === "waiting").length, deadlineReached: at - row.prepareFrom >= PREPARATION_LIMIT_MS } },
    sources: captured.sources, historyFence: captured.fence, snapshot: captured.snapshot, history: captured.history,
    ...freezeEvidence(captured.snapshot, captured.history, captured.held),
  });
  if (!validatePlannerEvidence({ history: payload.history, evidence: payload.ledger }, [])) return { ok: false, outcome: refusedOutcome("invalid-ledger", row.id) };
  // The first freeze wins. A concurrent caller gets that freeze back, never its own.
  const saved = await deps.store.save(row.id, payload, snapshotHash(payload));
  if (saved.status !== "ok") return { ok: false, outcome: refusedOutcome(saved.reason, row.id) };
  return { ok: true, row: saved.snapshot };
}

/** Plan a frozen revision once, check consumed against the ledger, and keep the plan. */
async function planOnce(row: NextBookSnapshotRecord, deps: NextBookDeps): Promise<Freeze> {
  if (!row.frozen || row.snapshotHash !== snapshotHash(row.frozen)) return { ok: false, outcome: refusedOutcome("snapshot-hash-mismatch", row.id) };
  if (row.plan) return { ok: true, row };
  const frozen = frozenView(row)!;
  const answer = await deps.planner.plan(structuredClone({ snapshot: frozen.snapshot, history: frozen.history, frozen }));
  if (!answer.ok) return { ok: false, outcome: refusedOutcome(`planner-${answer.reason}`, row.id) };
  if (!validatePlannerEvidence(frozen, answer.consumed)) return { ok: false, outcome: refusedOutcome("consumed-outside-ledger", row.id) };
  if (!/^[0-9a-f]{64}$/.test(answer.planHash) || !answer.held.every(h => typeof h?.key === "string" && typeof h.reason === "string")) {
    return { ok: false, outcome: refusedOutcome("invalid-plan", row.id) };
  }
  const plan: SavedPlan = plainJson({ planHash: answer.planHash, planInput: answer.planningInput,
    consumed: answer.consumed.map(({ key, version }) => ({ key, version })), held: answer.held.map(({ key, reason }) => ({ key, reason })) });
  const saved = await deps.store.savePlan(row.id, plan);
  if (saved.status === "ok") return { ok: true, row: saved.snapshot };
  if (saved.reason === "plan-conflict") {
    // Another caller saved its plan first (a planner that is not deterministic). The stored plan is the one used.
    const kept = await deps.store.read(row.id);
    if (kept?.plan) return { ok: true, row: kept };
  }
  return { ok: false, outcome: refusedOutcome(saved.reason, row.id) };
}

async function advance(row: NextBookSnapshotRecord, deps: NextBookDeps, now: number, by: SnapshotActor | null): Promise<PrepareOutcome> {
  if (row.runId) return { status: "queued", snapshotId: row.id, runId: row.runId };
  const frozen = await freeze(row, deps, now);
  if (!frozen.ok) return frozen.outcome;
  const planned = await planOnce(frozen.row, deps);
  if (!planned.ok) return planned.outcome;
  const r = planned.row;
  if (r.revision > 1) return { status: "planned", snapshotId: r.id, revision: r.revision, admission: "refresh" };
  const admitted = await deps.store.admit(r.id, by ?? r.actor, deps.run);
  if (admitted.status === "started") return { status: "queued", snapshotId: r.id, runId: admitted.runId };
  if (admitted.status === "refused") return refusedOutcome(admitted.reason, r.id);
  // The child's active run (or a stalled one start_workbook_run takes up) comes first; prepare again after it.
  return { status: "planned", snapshotId: r.id, revision: r.revision, admission: admitted.status };
}

/**
 * Trigger -> one chain -> bounded wait -> freeze -> planner -> consumed check -> one run. Only Book 1 -> book 2:
 * a later source book answers unsupported-source-book and queues nothing. Decides no learning policy.
 */
export async function prepareNextBook(trigger: NextBookTrigger, deps: NextBookDeps, now: number): Promise<PrepareOutcome> {
  if (!Number.isSafeInteger(now)) return refusedOutcome("invalid-clock");
  let answer: StoreAnswer | HoldAnswer;
  if (trigger.kind === "claim") answer = await deps.store.claim({ triggerId: trigger.triggerId });
  else if (trigger.kind === "admin") answer = await deps.store.claim({ workbookId: trigger.workbookId, actor: trigger.actor });
  else if (trigger.kind === "backstop-hold") answer = await deps.store.hold(trigger.workbookId, trigger.deliveryAuditId);
  else {
    const row = await deps.store.read(trigger.snapshotId);
    answer = row ? { status: "ok", snapshot: row } : { status: "refused", reason: "snapshot-not-found" };
  }
  if (answer.status === "refused") return answer.reason === "unsupported-source-book" ? { status: "unsupported-source-book" } : refusedOutcome(answer.reason);
  if (answer.status === "held") return { status: "held", snapshotId: answer.snapshot.id, reason: "no-accepted-scans-at-backstop" };
  return advance(answer.snapshot, deps, now, trigger.kind === "admin" ? trigger.actor : null);
}

// ---------------------------------------------------------------------------------------------------------------------
// The three calls for the planner owner (#476, D-308).

export type NextBookSnapshotRead =
  | { ok: true; snapshot: FrozenNextBookSnapshot; draftId: string | null; planInput: PlanInput | null; planHash: string | null;
    consumed: SavedPlan["consumed"] | null; plannerHeld: SavedPlan["held"] | null; runId: string | null }
  | { ok: false; reason: "not-found" | "held" | "not-frozen" | "hash-mismatch" };

/** The frozen row with plan_input, as the worker reads it for a run whose snapshot_id is set. */
export async function readNextBookSnapshot(store: NextBookSnapshotStore, snapshotId: string): Promise<NextBookSnapshotRead> {
  const row = await store.read(snapshotId);
  if (!row) return { ok: false, reason: "not-found" };
  if (row.held) return { ok: false, reason: "held" };
  if (!row.frozen) return { ok: false, reason: "not-frozen" };
  if (row.snapshotHash !== snapshotHash(row.frozen)) return { ok: false, reason: "hash-mismatch" };
  return { ok: true, snapshot: frozenView(row)!, draftId: row.draftId, planInput: row.plan?.planInput ?? null, planHash: row.plan?.planHash ?? null,
    consumed: row.plan?.consumed ?? null, plannerHeld: row.plan?.held ?? null, runId: row.runId };
}

export type NewEvidence = { ok: true; days: number[]; pages: number; items: number } | { ok: false; reason: "not-found" | "not-frozen" | "evidence-regressed" | "invalid-evidence" };

/**
 * Marks of the source book that this snapshot did not already hold: a result first marked after the freeze, a pending item
 * since marked, a parent's later change, and early Days 8-10 a Day 7 snapshot held for later. Results of other steps the
 * snapshot saw (held outside the sample) are not new until their version changes. "New marks since this draft".
 */
export async function newEvidenceSince(store: NextBookSnapshotStore, snapshotId: string): Promise<NewEvidence> {
  const row = await store.read(snapshotId);
  if (!row) return { ok: false, reason: "not-found" };
  if (!row.frozen) return { ok: false, reason: "not-frozen" };
  const seen = [...row.frozen.ledger, ...row.frozen.held.filter(h => h.reason === "outside-sample")];
  try { return { ok: true, ...evidenceDelta(seen, await store.evidence(snapshotId)) }; }
  catch (e) { return { ok: false, reason: e instanceof Error && e.message === "evidence-regressed" ? "evidence-regressed" : "invalid-evidence" }; }
}

export type RefreshAnswer =
  | { ok: true; snapshotId: string; revision: number; newSnapshot: ProgressSnapshot; newHistory: ProgressHistory; frozen: FrozenNextBookSnapshot }
  | { ok: false; reason: string };

/**
 * D-308 "Update with new marks": revision n+1 of the chain that made this draft, frozen at `now` over every marked day of the
 * current book. Refused after "Approve for print", after a source change, and with no new marks. A retry continues the
 * revision it made. Plan it with prepareNextBook({ kind: "snapshot", snapshotId }); a refresh starts no run.
 */
export async function refreshNextBookSnapshot(draftId: string, actor: SnapshotActor, deps: Pick<NextBookDeps, "store" | "capture">,
  now: number): Promise<RefreshAnswer> {
  if (!Number.isSafeInteger(now)) return { ok: false, reason: "invalid-clock" };
  const latest = await deps.store.latestForDraft(draftId);
  if (!latest) return { ok: false, reason: "draft-not-found" };
  let target = latest;
  if (latest.revision === 1 || latest.plan) {
    if (!latest.frozen) return { ok: false, reason: "not-frozen" };
    const fresh = await newEvidenceSince(deps.store, latest.id);
    if (!fresh.ok) return fresh;
    if (fresh.items === 0) return { ok: false, reason: "no-new-evidence" };
    const taken = await deps.store.retake(latest.id, draftId, actor);
    if (taken.status !== "ok") return { ok: false, reason: taken.reason };
    target = taken.snapshot;
  }
  let row: NextBookSnapshotRecord;
  if (target.frozen) {
    // Already frozen by an earlier call: the store still checks the draft is not approved before handing it back.
    const again = await deps.store.save(target.id, target.frozen, target.snapshotHash ?? "");
    if (again.status !== "ok") return { ok: false, reason: again.reason };
    row = again.snapshot;
  } else {
    const frozen = await freeze(target, deps, now);
    if (!frozen.ok) return { ok: false, reason: frozen.outcome.status === "refused" ? frozen.outcome.reason : frozen.outcome.status };
    row = frozen.row;
  }
  if (!row.frozen || row.snapshotHash !== snapshotHash(row.frozen)) return { ok: false, reason: "snapshot-hash-mismatch" };
  return { ok: true, snapshotId: row.id, revision: row.revision, newSnapshot: row.frozen.snapshot, newHistory: row.frozen.history, frozen: frozenView(row)! };
}
