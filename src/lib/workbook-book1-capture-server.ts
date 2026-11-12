// #870 The Supabase seams of src/lib/workbook-book1-capture.ts, with the secret key (the baseline and pending functions
// are service-only). The approve route calls captureBook1AfterApproval; the reminders run calls reconcileBook1BaselinesNow.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { isUuid } from "./workbook-content";
import { reconcileBook1Baselines, settleBook1Baseline, type Book1PendingStore, type Book1ReconcileResult, type Book1Settled, type Book1SiteDeps } from "./workbook-book1-capture";
import { book1BaselineRepository, book1BaselineSql, type Book1CaptureDeps } from "./workbook-book1-store";
import { workbookShipStore } from "./workbook-ship-store";

/** Due revisions one reminders run takes. Each capture reads a whole draft, so the step stays small. */
export const BOOK1_RECONCILE_LIMIT = 3;

/** What the capture reads: the draft as approval reads it, the run's frame row, and the baseline functions. */
export function book1CaptureDeps(db: SupabaseClient<Database>): Omit<Book1CaptureDeps, "recovery"> {
  return {
    draft: (runId) => workbookShipStore(db).draftForApproval(runId),
    async frame(runId) {
      if (!isUuid(runId)) return null;
      const { data, error } = await db.from("workbook_run_frames").select("run_id, created_at, frame").eq("run_id", runId).maybeSingle();
      if (error) throw new Error("book1-frame-read");
      return data ? { reference: `workbook_run_frames:${data.run_id}`, createdAt: data.created_at, frame: data.frame } : null;
    },
    repository: book1BaselineRepository(book1BaselineSql(db)),
  };
}

/** The site's capture deps: book1CaptureDeps and this deploy's commit, the same source a run frame's versions.build uses. */
export function book1SiteDeps(db: SupabaseClient<Database>): Book1SiteDeps {
  return { ...book1CaptureDeps(db), build: process.env.VERCEL_GIT_COMMIT_SHA || null };
}

export function book1PendingStore(db: SupabaseClient<Database>): Book1PendingStore {
  return {
    async existing(draftId, revision) {
      const { data, error } = await db.from("workbook_book1_baselines").select("id, run_id").eq("draft_id", draftId).eq("draft_revision", revision).maybeSingle();
      if (error) throw new Error("book1-baseline-read");
      return data ? { id: data.id, runId: data.run_id } : null;
    },
    async due(limit) {
      const { data, error } = await db.rpc("due_workbook_book1_baselines", { p_limit: limit });
      if (error || !Array.isArray(data)) throw new Error("book1-due-read");
      return data.map((r) => ({ runId: r.run_id, draftId: r.draft_id, revision: r.revision, parentId: r.parent_id, childId: r.child_id, actorId: r.actor_id }));
    },
    async tried(t) {
      const { data, error } = await db.rpc("note_workbook_book1_baseline_try", { p_draft: t.draftId, p_revision: t.revision });
      if (error || (data as { status?: unknown } | null)?.status !== "noted") throw new Error("book1-try-write");
    },
    async pending(t, reason) {
      const { data, error } = await db.rpc("record_workbook_book1_baseline_pending", { p_run: t.runId, p_draft: t.draftId, p_revision: t.revision, p_reason: reason });
      if (error) throw new Error("book1-pending-write");
      const status = (data as { status?: unknown } | null)?.status;
      if (status === "saved" || status === "duplicate" || status === "baseline" || status === "refused") return status;
      throw new Error("book1-pending-answer");
    },
  };
}

/**
 * After an approval has committed: tries the Book 1 baseline once. Never throws and never changes the approval. A
 * book that is not Book 1 is skipped. A failure is left to the reminders run.
 */
export async function captureBook1AfterApproval(db: SupabaseClient<Database>, o: { runId: string; revision: number; actorId: string }): Promise<Book1Settled | { status: "skipped" }> {
  try {
    const { data: run, error } = await db.from("workbook_runs").select("parent_id, child_id, number, draft_id").eq("id", o.runId).maybeSingle();
    if (error) throw new Error("book1-run-read");
    if (!run || run.number !== 1 || !run.draft_id) return { status: "skipped" };
    const target = { runId: o.runId, draftId: run.draft_id, revision: o.revision, parentId: run.parent_id, childId: run.child_id, actorId: o.actorId };
    const settled = await settleBook1Baseline(book1SiteDeps(db), book1PendingStore(db), target, { recordPending: false });
    if (settled.status === "retry" || settled.status === "refused") console.info("[book1 baseline] not captured at approval", o.runId, settled.reason);
    return settled;
  } catch (e) {
    console.error("[book1 baseline] capture at approval failed", o.runId, e instanceof Error ? e.message : String(e));
    return { status: "retry", reason: "error" };
  }
}

/** The reminders run's repair step. Never throws: a failure is one count in the answer. */
export async function reconcileBook1BaselinesNow(db: SupabaseClient<Database>, o: { inTime?: () => boolean } = {}): Promise<Book1ReconcileResult | { error: "run_failed" }> {
  try {
    return await reconcileBook1Baselines(book1SiteDeps(db), book1PendingStore(db), { limit: BOOK1_RECONCILE_LIMIT, inTime: o.inTime });
  } catch (e) {
    console.error("[book1 baseline] reconcile failed", e instanceof Error ? e.message : String(e));
    return { error: "run_failed" };
  }
}
