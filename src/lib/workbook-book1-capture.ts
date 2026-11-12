// #870 The Book 1 baseline after approval, and its repair. After an admin approves a Book 1 draft (and the approval has
// committed), the approve route calls settleBook1Baseline once. The reminders run (/api/reminders) calls
// reconcileBook1Baselines for the approved Book 1 revisions that still have no baseline and no pending row.
//
// Rules:
// - The approval and the capture are separate transactions. A capture that fails, or whose answer is lost, changes
//   nothing else: the approval stands, and the next reminders run tries again.
// - One baseline per (draft, revision). Its id comes from that key (book1BaselineId), so a retry after a lost answer is a
//   duplicate of the same record. When a baseline already binds the key (whatever its id, for example an exact-recovery
//   baseline made by hand), nothing is stored and that baseline is returned. A baseline is never replaced.
// - Here the capture uses only the run frame's planning capture (#472), and only on the build that planned the book
//   (frame.versions.build equals this deploy's commit). The record copies the planned steps as curriculumFor gives them,
//   and code outside the curriculum version (the watch-out check, watch-out.ts) shapes them: another build could copy
//   other steps under the same version. Another build records planned-on-another-build; the local recovery copies the
//   steps of the frame's own build. The build check runs last: every other proof refuses first, and a book that already
//   has activity says activity-before-boundary, so the pending reason is the most specific one.
// - A frame with no planning capture needs the pinned planner and Git (src/lib/workbook-book1-pinned.ts), which a Vercel
//   function does not have: the reconcile records it once as pending recovery (public.workbook_book1_baseline_pending),
//   and scripts/book1-baseline-recover.ts recovers it on a Mac.
// - A refusal that can change by itself (the service is unavailable, a race) is not recorded: the next run tries again.
//   Every other refusal is recorded once with its reason, so the run does not try it every 15 minutes. Each try is
//   counted before it starts, and the due list puts the least recently tried first: a revision that never settles
//   cannot keep a later Book 1 from its turn.
//
// No Next.js, React or clock. The Supabase seams are in src/lib/workbook-book1-capture-server.ts.
import "server-only";
import { createHash } from "node:crypto";
import { captureBook1Baseline, type Book1CaptureDeps, type StoredBook1Baseline } from "./workbook-book1-store";

/** One approved Book 1 draft revision to bind, with the admin who approved it (the save checks the admin). */
export interface Book1CaptureTarget { runId: string; draftId: string; revision: number; parentId: string; childId: string; actorId: string }

export interface Book1PendingStore {
  /** The baseline that binds (draft, revision), whatever its id, or null. */
  existing(draftId: string, revision: number): Promise<{ id: string; runId: string } | null>;
  /** Approved Book 1 revisions with no baseline and no pending row: the least recently tried first, then the oldest approval. */
  due(limit: number): Promise<Book1CaptureTarget[]>;
  /** Counts one try of the revision before its capture starts, so a capture that throws or hangs still moves it back. */
  tried(target: Book1CaptureTarget): Promise<void>;
  /** Records the revision as pending recovery; the first reason stays. "baseline": a baseline binds it, nothing stored. */
  pending(target: Book1CaptureTarget, reason: string): Promise<"saved" | "duplicate" | "baseline" | "refused">;
}

/** The site's capture: today's code, and the commit of this deploy (null when unknown: nothing is saved). */
export type Book1SiteDeps = Omit<Book1CaptureDeps, "recovery" | "beforeSave"> & {
  build: string | null;
  /** Whether any mark, learning event or scan receipt of the book exists: the save would refuse activity-before-boundary. */
  activity?(draftId: string): Promise<boolean>;
};

export type Book1Settled =
  | { status: "saved" | "duplicate" | "existing"; baseline: StoredBook1Baseline }
  /** Not stored, and not recorded: the next reminders run tries again. */
  | { status: "retry"; reason: string }
  /** Recorded as pending recovery (or, with recordPending off, refused for good). */
  | { status: "pending" | "refused"; reason: string };

/** Refusals that can change with no one acting: the service, the admin row or a race. They are tried again. */
const RETRY = new Set(["unavailable", "conflict", "saved-baseline-unavailable", "deploy-build-unknown"]);

/** The baseline id of (draft, revision): the same key always gives the same id. */
export function book1BaselineId(draftId: string, revision: number): string {
  const h = createHash("sha256").update(`workbook_book1_baselines:${draftId.toLowerCase()}:${revision}`, "utf8").digest("hex");
  // The shape of a version 5 (name-based) UUID: the version digit 5 and the variant bits 10.
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The pending reason for a refusal, in the shape the table takes. A frame with no planning capture says so. */
export function pendingReason(refusal: string): string {
  if (refusal === "planning-recovery-unavailable") return "planning-capture-missing";
  const r = refusal.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return r || "refused";
}

/**
 * Binds one approved Book 1 revision to its baseline, from the run frame's planning capture. `deps` must not hold
 * recovery: recovery is local. With `recordPending`, a refusal that does not change by itself is recorded once.
 */
export async function settleBook1Baseline(deps: Book1SiteDeps, store: Book1PendingStore, t: Book1CaptureTarget,
  o: { recordPending: boolean }): Promise<Book1Settled> {
  const bound = await store.existing(t.draftId, t.revision);
  if (bound) {
    const scope = { parentId: t.parentId, childId: t.childId, runId: bound.runId, draftId: t.draftId };
    const baseline = await deps.repository.read(t.actorId, scope, bound.id);
    // A baseline binds the key but cannot be read now: store nothing, try again later.
    return baseline ? { status: "existing", baseline } : { status: "retry", reason: "existing-baseline-unreadable" };
  }
  const result = await captureBook1Baseline({ draft: deps.draft, frame: deps.frame, repository: deps.repository, curricula: deps.curricula,
    beforeSave: () => siteGate(deps, t) },
    { id: book1BaselineId(t.draftId, t.revision), actorId: t.actorId, parentId: t.parentId, childId: t.childId, runId: t.runId, revision: t.revision });
  if (result.status !== "refused") return result;
  if (RETRY.has(result.reason)) return { status: "retry", reason: result.reason };
  if (!o.recordPending) return { status: "refused", reason: result.reason };
  const reason = pendingReason(result.reason);
  const recorded = await store.pending(t, reason);
  if (recorded === "baseline") {
    // A baseline was saved between the two reads (a local recovery): return it.
    return settleBook1Baseline(deps, store, t, { recordPending: false });
  }
  if (recorded === "refused") return { status: "retry", reason: "pending-refused" };
  return { status: "pending", reason };
}

/**
 * The site's last checks before a save, after the planning proof and the record held: a book with activity cannot be
 * saved by anyone, so that reason comes first; then the build that planned the book must be this deploy's.
 */
async function siteGate(deps: Book1SiteDeps, t: Book1CaptureTarget): Promise<string | null> {
  if (await deps.activity?.(t.draftId)) return "activity-before-boundary";
  const framed = await deps.frame(t.runId);
  if (!deps.build) return "deploy-build-unknown";
  if (framed?.frame.versions.build !== deps.build) return "planned-on-another-build";
  return null;
}

export interface Book1ReconcileResult { due: number; saved: number; existing: number; pending: number; retry: number; failed: number }

/**
 * The repair step of the reminders run: up to `limit` due revisions, one after the other. One revision's failure (a
 * throw) is counted and never stops the others or the run.
 */
export async function reconcileBook1Baselines(deps: Book1SiteDeps, store: Book1PendingStore,
  o: { limit: number; inTime?: () => boolean }): Promise<Book1ReconcileResult> {
  const due = await store.due(o.limit);
  const r: Book1ReconcileResult = { due: due.length, saved: 0, existing: 0, pending: 0, retry: 0, failed: 0 };
  for (const t of due) {
    if (o.inTime && !o.inTime()) break;
    try {
      await store.tried(t);
      const s = await settleBook1Baseline(deps, store, t, { recordPending: true });
      if (s.status === "saved" || s.status === "duplicate") r.saved++;
      else if (s.status === "existing") r.existing++;
      else if (s.status === "pending") r.pending++;
      else r.retry++;
    } catch {
      r.failed++;
    }
  }
  return r;
}
