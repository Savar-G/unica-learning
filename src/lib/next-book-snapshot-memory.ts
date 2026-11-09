// In-memory NextBookSnapshotStore for tests (#476). Each call yields once, then decides atomically, so concurrent callers
// interleave between calls the way separate transactions do, never inside one. Refusals match the SQL functions in
// supabase/migrations/20261109050245_next_book_snapshots.sql (save_next_book_plan as replaced by
// 20261109213000_next_book_plan_shape.sql); start_workbook_run is modelled as one active run per
// child (busy), without its stalled-run takeover. Like Postgres, the clock may be finer than a millisecond: records show
// times truncated to milliseconds, as the Supabase adapter reads them, and a freeze is compared at milliseconds.
import type { AdmitAnswer, FrozenPayload, HoldAnswer, NextBookSnapshotRecord, NextBookSnapshotStore, SavedPlan, SnapshotActor,
  SnapshotEvidence, StoreAnswer } from "./next-book-snapshot";
import { consumedShape, heldShape, plainJson, PREPARATION_LIMIT_MS } from "./next-book-snapshot";

export interface MemoryBook { id: string; parentId: string; childId: string; number: number; status: "draft" | "approved" | "printed" | "shipped"; printedRevision: string | null }
export interface MemoryClaim {
  id: string; workbookId: string; parentId: string; childId: string; number: number; printedRevision: string;
  reason: "day7_scanned" | "delivery_backstop"; claimedAt: number; receiptIds: string[]; deliveryAuditId: number;
}
export interface MemoryHold { workbookId: string; deliveryAuditId: number; printedRevision: string; heldAt: number; backstopAt: number }
export interface MemoryReceipt { id: string; workbookId: string; printedRevision: string; photoRevision: string; acceptedAt: number }
export interface MemoryRun {
  id: string; parentId: string; childId: string; number: number; status: "queued" | "running" | "done" | "failed" | "stale";
  draftId: string | null; snapshotId: string | null; startedBy: string | null;
}
export interface MemoryNextBookState {
  books: MemoryBook[];
  /** Workbook ids with a confirmed-delivery receipt. */
  deliveries: Set<string>;
  claims: MemoryClaim[];
  holds: MemoryHold[];
  receipts: MemoryReceipt[];
  /** Marking job state by photo revision. */
  jobs: Map<string, "finished" | "waiting">;
  /** Current marked results, by source workbook. */
  marks: (SnapshotEvidence & { workbookId: string })[];
  admins: Set<string>;
  /** public.test_accounts: the parents marked as a test family. */
  testAccounts: Set<string>;
  deletingParents: Set<string>;
  deletedChildren: Set<string>;
  drafts: Map<string, { parentId: string; childId: string }>;
  runs: MemoryRun[];
  snapshots: NextBookSnapshotRecord[];
  audit: { action: string; detail: Record<string, unknown> }[];
}

const HASH = /^[0-9a-f]{64}$/;
/** The fields a saved plan's entries may have (save_next_book_plan, migration 20261109213000_next_book_plan_shape). */
const CONSUMED_KEYS = ["key", "version", "firstVersion", "correctionIds"], HELD_KEYS = ["key", "reason", "skill", "step", "version"];
const clone = <T>(v: T): T => structuredClone(v);
const refused = (reason: string) => ({ status: "refused" as const, reason });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function memoryNextBookSnapshots(clock: () => number = Date.now) {
  const state: MemoryNextBookState = { books: [], deliveries: new Set(), claims: [], holds: [], receipts: [], jobs: new Map(), marks: [],
    admins: new Set(), testAccounts: new Set(), deletingParents: new Set(), deletedChildren: new Set(), drafts: new Map(), runs: [], snapshots: [], audit: [] };
  let ids = 0;
  // UUIDs, as the database's ids are (the capture's source request requires one): 5 marks a snapshot, 7 a run.
  const id = (prefix: "snapshot" | "run") => `00000000-0000-4000-8${prefix === "snapshot" ? 5 : 7}00-${String(++ids).padStart(12, "0")}`;
  const yieldTurn = () => new Promise<void>(resolve => setTimeout(resolve, 0));
  const ok = (s: NextBookSnapshotRecord): StoreAnswer => ({ status: "ok", snapshot: clone(s) });
  /** The exact prepare_from, finer than the record's millisecond value, as the database keeps it. */
  const exactFrom = new Map<string, number>();
  const ms = (t: number) => Math.floor(t);
  const live = (workbookId: string, revision: number) => state.snapshots.find(s => s.workbookId === workbookId && s.revision === revision && !s.held);

  function sourceProblem(workbookId: string, printedRevision: string | null): string | null {
    const w = state.books.find(b => b.id === workbookId);
    if (!w) return "source-not-found";
    if (w.number !== 1) return "unsupported-source-book";
    if (w.status !== "shipped" || w.printedRevision === null || w.printedRevision !== printedRevision) return "source-changed";
    if (state.deletedChildren.has(w.childId)) return "child-unavailable";
    if (state.books.some(n => n.childId === w.childId && n.number > w.number && state.deliveries.has(n.id))) return "source-changed";
    return null;
  }
  function draftProblem(draftId: string, parentId: string, childId: string): string | null {
    const d = state.drafts.get(draftId);
    if (!d || d.parentId !== parentId || d.childId !== childId) return "draft-not-found";
    if (state.books.some(b => b.id === draftId && b.status !== "draft")) return "already-approved";
    return null;
  }
  const writable = (parentId: string) => !state.deletingParents.has(parentId);
  function insert(row: Omit<NextBookSnapshotRecord, "id" | "createdAt" | "frozen" | "snapshotHash" | "plan" | "runId">): NextBookSnapshotRecord {
    const s: NextBookSnapshotRecord = { ...row, triggerAt: ms(row.triggerAt), prepareFrom: ms(row.prepareFrom), id: id("snapshot"),
      createdAt: ms(clock()), frozen: null, snapshotHash: null, plan: null, runId: null };
    exactFrom.set(s.id, row.prepareFrom);
    state.snapshots.push(s);
    return s;
  }

  const store: NextBookSnapshotStore = {
    async claim(source) {
      await yieldTurn();
      const viaTrigger = "triggerId" in source;
      let claim = viaTrigger ? state.claims.find(c => c.id === source.triggerId) : undefined;
      if (viaTrigger && !claim) return refused("trigger-not-found");
      if (!viaTrigger && (!source.workbookId || !source.actor?.id)) return refused("invalid-request");
      const bookId = claim?.workbookId ?? (source as { workbookId: string }).workbookId;
      const w = state.books.find(b => b.id === bookId);
      if (!w) return refused("source-not-found");
      if (!writable(w.parentId)) return refused("family-unavailable");
      const actor = viaTrigger ? null : (source as { actor: SnapshotActor }).actor;
      if (actor && !state.admins.has(actor.id)) return refused("admin-required");
      const problem = sourceProblem(w.id, w.printedRevision);
      if (problem) return refused(problem);
      const existing = live(w.id, 1);
      if (existing) return ok(existing);
      claim ??= state.claims.find(c => c.workbookId === w.id);
      const base = { parentId: w.parentId, childId: w.childId, workbookId: w.id, number: w.number, printedRevision: w.printedRevision!,
        revision: 1, draftId: null, held: null, actor };
      if (claim) {
        if (claim.printedRevision !== w.printedRevision) return refused("source-changed");
        return ok(insert({ ...base, triggerId: claim.id, reason: claim.reason, triggerAt: claim.claimedAt, prepareFrom: claim.claimedAt,
          receiptIds: [...claim.receiptIds], deliveryAuditId: claim.deliveryAuditId }));
      }
      if (!state.deliveries.has(w.id)) return refused("missing-delivery");
      const receipts = state.receipts.filter(r => r.workbookId === w.id && r.printedRevision === w.printedRevision)
        .sort((a, b) => a.acceptedAt - b.acceptedAt || (a.id < b.id ? -1 : 1)).map(r => r.id);
      if (!receipts.length) return refused("no-accepted-scans");
      const at = clock();
      return ok(insert({ ...base, triggerId: null, reason: "admin_prepare", triggerAt: at, prepareFrom: at, receiptIds: receipts, deliveryAuditId: null }));
    },

    async hold(workbookId, deliveryAuditId): Promise<HoldAnswer> {
      await yieldTurn();
      const w = state.books.find(b => b.id === workbookId);
      if (!w) return refused("source-not-found");
      if (!writable(w.parentId)) return refused("family-unavailable");
      const problem = sourceProblem(w.id, w.printedRevision);
      if (problem) return refused(problem);
      const existing = live(w.id, 1);
      if (existing) return ok(existing);
      if (state.claims.some(c => c.workbookId === w.id)) return refused("claimed");
      const h = state.holds.find(x => x.workbookId === w.id && x.deliveryAuditId === deliveryAuditId);
      if (!h || h.printedRevision !== w.printedRevision) return refused("hold-not-found");
      const held = state.snapshots.find(s => s.workbookId === w.id && s.held && s.deliveryAuditId === deliveryAuditId)
        ?? insert({ triggerId: null, reason: "delivery_backstop", parentId: w.parentId, childId: w.childId, workbookId: w.id, number: w.number,
          printedRevision: w.printedRevision!, triggerAt: h.backstopAt, prepareFrom: h.heldAt, revision: 1, draftId: null, receiptIds: [],
          deliveryAuditId, held: { reason: "no-accepted-scans-at-backstop", at: h.heldAt }, actor: null });
      return { status: "held", snapshot: clone(held) };
    },

    async save(snapshotId, frozen: FrozenPayload, hash) {
      await yieldTurn();
      const s = state.snapshots.find(x => x.id === snapshotId);
      if (!s) return refused("snapshot-not-found");
      if (!writable(s.parentId)) return refused("family-unavailable");
      if (s.draftId) { const p = draftProblem(s.draftId, s.parentId, s.childId); if (p) return refused(p); }
      if (s.frozen) return ok(s);
      if (s.held) return refused("held");
      const problem = sourceProblem(s.workbookId, s.printedRevision);
      if (problem) return refused(problem);
      const kind = s.revision > 1 ? "refresh" : s.reason === "day7_scanned" ? "day7" : "backstop";
      const f = plainJson(frozen);
      const keys = f.ledger?.map(l => l.key) ?? [];
      if (!HASH.test(hash) || typeof f.frozenAt !== "number" || f.scope?.kind !== kind || !f.sources || !f.historyFence || !f.snapshot || !f.history
        || !Array.isArray(f.ledger) || !Array.isArray(f.pending) || !Array.isArray(f.held)
        || f.snapshot.parentId !== s.parentId || f.snapshot.childId !== s.childId || f.sources.parentId !== s.parentId || f.sources.childId !== s.childId
        || f.historyFence.parentId !== s.parentId || f.historyFence.childId !== s.childId
        || f.ledger.some(l => typeof l.key !== "string" || !Number.isSafeInteger(l.version) || l.version < 1) || new Set(keys).size !== keys.length
        || !Number.isSafeInteger(f.frozenAt) || f.frozenAt < ms(exactFrom.get(s.id)!) || f.frozenAt > clock() + 60_000) return refused("invalid-snapshot");
      s.frozen = f; s.snapshotHash = hash;
      return ok(s);
    },

    async savePlan(snapshotId, plan: SavedPlan) {
      await yieldTurn();
      const s = state.snapshots.find(x => x.id === snapshotId);
      if (!s) return refused("snapshot-not-found");
      if (!writable(s.parentId)) return refused("family-unavailable");
      if (s.draftId) { const p = draftProblem(s.draftId, s.parentId, s.childId); if (p) return refused(p); }
      const p = plainJson(plan);
      if (s.plan) return same(s.plan, p) ? ok(s) : refused("plan-conflict");
      if (!s.frozen) return refused("not-frozen");
      const problem = sourceProblem(s.workbookId, s.printedRevision);
      if (problem) return refused(problem);
      if (!HASH.test(p.planHash) || !p.planInput || typeof p.planInput !== "object" || !Array.isArray(p.consumed) || !Array.isArray(p.held)
        || p.held.some(h => !h || typeof h !== "object" || Object.keys(h).some(k => !HELD_KEYS.includes(k)) || !heldShape(h))) return refused("invalid-plan");
      const ledger = new Map(s.frozen.ledger.map(l => [l.key, l.version]));
      const keys = new Set<string>();
      for (const c of p.consumed) {
        if (!c || typeof c !== "object" || Object.keys(c).some(k => !CONSUMED_KEYS.includes(k)) || !consumedShape(c)
          || ledger.get(c.key) !== c.version || keys.has(c.key)) return refused("consumed-outside-ledger");
        keys.add(c.key);
      }
      s.plan = p;
      return ok(s);
    },

    async retake(snapshotId, draftId, actor) {
      await yieldTurn();
      const s = state.snapshots.find(x => x.id === snapshotId && !x.held);
      if (!s) return refused("snapshot-not-found");
      if (!draftId || !actor?.id) return refused("invalid-request");
      if (!writable(s.parentId)) return refused("family-unavailable");
      if (!state.admins.has(actor.id)) return refused("admin-required");
      const d = draftProblem(draftId, s.parentId, s.childId);
      if (d) return refused(d);
      const first = live(s.workbookId, 1);
      const run = first?.runId ? state.runs.find(r => r.id === first.runId && r.draftId === draftId) : undefined;
      if (!run) return refused("draft-mismatch");
      const problem = sourceProblem(s.workbookId, s.printedRevision);
      if (problem) return refused(problem);
      const latest = Math.max(...state.snapshots.filter(x => x.workbookId === s.workbookId && !x.held).map(x => x.revision));
      if (latest === s.revision + 1) return ok(live(s.workbookId, latest)!);
      if (latest !== s.revision) return refused("stale-revision");
      if (!s.plan) return refused("not-planned");
      const receipts = state.receipts.filter(r => r.workbookId === s.workbookId && r.printedRevision === s.printedRevision)
        .sort((a, b) => a.acceptedAt - b.acceptedAt || (a.id < b.id ? -1 : 1)).map(r => r.id);
      const n = insert({ triggerId: s.triggerId, reason: s.reason, parentId: s.parentId, childId: s.childId, workbookId: s.workbookId,
        number: s.number, printedRevision: s.printedRevision, triggerAt: s.triggerAt, prepareFrom: clock(), revision: s.revision + 1,
        draftId, receiptIds: receipts, deliveryAuditId: s.deliveryAuditId, held: null, actor: clone(actor) });
      state.audit.push({ action: "snapshot-retaken", detail: { snapshotId: n.id, revision: n.revision, from: s.id, runId: run.id } });
      return ok(n);
    },

    async admit(snapshotId, by, limits): Promise<AdmitAnswer> {
      await yieldTurn();
      const s = state.snapshots.find(x => x.id === snapshotId);
      if (!s) return refused("snapshot-not-found");
      if (!writable(s.parentId)) return refused("family-unavailable");
      if (s.runId) return { status: "started", runId: s.runId, existing: true };
      // Decided in this one turn, as under the test row lock (FOR SHARE) that a removal of the mark waits for.
      if (limits.testOnly && !state.testAccounts.has(s.parentId)) return refused("test-families-only");
      if (s.held) return refused("held");
      if (s.revision !== 1) return refused("refresh-does-not-start-run");
      if (!s.plan) return refused("not-planned");
      const problem = sourceProblem(s.workbookId, s.printedRevision);
      if (problem) return refused(problem);
      if (state.books.some(b => b.childId === s.childId && b.number > s.number)) return refused("next-book-exists");
      if (!Number.isSafeInteger(limits.maxAttempts) || !Number.isSafeInteger(limits.staleSeconds)) return refused("invalid-request");
      const active = state.runs.find(r => r.childId === s.childId && (r.status === "queued" || r.status === "running"));
      if (active) return { status: "busy", runId: active.id };
      const number = Math.max(0, ...state.books.filter(b => b.childId === s.childId).map(b => b.number)) + 1;
      if (number !== s.number + 1) return refused("next-book-exists");
      const run: MemoryRun = { id: id("run"), parentId: s.parentId, childId: s.childId, number, status: "queued", draftId: null,
        snapshotId: s.id, startedBy: by?.id ?? null };
      state.runs.push(run);
      s.runId = run.id;
      state.audit.push({ action: "snapshot-run-admitted", detail: { snapshotId: s.id, planHash: s.plan.planHash, reason: s.reason, runId: run.id } });
      return { status: "started", runId: run.id, existing: false };
    },

    async read(snapshotId) {
      await yieldTurn();
      const s = state.snapshots.find(x => x.id === snapshotId);
      return s ? clone(s) : null;
    },

    async latestForDraft(draftId) {
      await yieldTurn();
      const run = state.runs.find(r => r.draftId === draftId && r.snapshotId);
      const first = run && state.snapshots.find(s => s.id === run.snapshotId);
      if (!first) return null;
      const chain = state.snapshots.filter(s => s.workbookId === first.workbookId && !s.held).sort((a, b) => b.revision - a.revision);
      return clone(chain[0]);
    },

    async jobs(snapshotId) {
      await yieldTurn();
      const s = state.snapshots.find(x => x.id === snapshotId);
      if (!s) return [];
      return s.receiptIds.flatMap(r => {
        const receipt = state.receipts.find(x => x.id === r);
        const job = receipt && state.jobs.get(receipt.photoRevision);
        return job ? [job] : [];
      });
    },

    async evidence(snapshotId) {
      await yieldTurn();
      const s = state.snapshots.find(x => x.id === snapshotId);
      if (!s) return [];
      return clone(state.marks.filter(m => m.workbookId === s.workbookId).map(({ key, version, day, pageId }) => ({ key, version, day, pageId })));
    },
  };

  return {
    state, store,
    /** The run made its draft (what the worker does): the draft exists and the run is done. */
    finishRun(runId: string, draftId: string) {
      const run = state.runs.find(r => r.id === runId)!;
      run.draftId = draftId; run.status = "done";
      state.drafts.set(draftId, { parentId: run.parentId, childId: run.childId });
    },
    /** "Approve for print": the draft becomes an approved workbook row. */
    approve(draftId: string) {
      const d = state.drafts.get(draftId)!;
      const run = state.runs.find(r => r.draftId === draftId)!;
      state.books.push({ id: draftId, parentId: d.parentId, childId: d.childId, number: run.number, status: "approved", printedRevision: null });
    },
    /** The latest moment a captured job can still hold the freeze, from a window start. */
    deadline: (from: number) => from + PREPARATION_LIMIT_MS,
  };
}
