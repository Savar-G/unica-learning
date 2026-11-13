// D-308 (#476) on the service client. The routes and the run page check the admin session first; this wires the
// snapshot store, the existing approval (approveDraft) and the audit note of an approval anyway.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { nextBookSnapshotStore } from "./next-book-snapshot-store";
import { draftNewMarks, type ApprovalCheckDeps, type ApprovalNote, type DraftNewMarks } from "./next-book-refresh";
import { approveDraft, type ShipActor } from "./workbook-ship";
import { workbookShipStore } from "./workbook-ship-store";

/** The run page's notice: the marks this next-book draft did not use. Never throws: a failed read is "unavailable". */
export async function draftNewMarksOnServer(db: SupabaseClient<Database>, draftId: string): Promise<DraftNewMarks> {
  try { return await draftNewMarks(nextBookSnapshotStore(db), draftId); }
  catch { return { kind: "unavailable" }; }
}

type UntypedRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * Writes the "approved-with-new-marks" audit entry through note_workbook_approved_with_new_marks (migration
 * 20261113233859_workbook_approved_with_new_marks.sql). The function is not in database.types.ts until that migration is
 * applied and the types are generated again; then call db.rpc directly. Throws when the note was not written.
 */
async function noteApprovedWithNewMarks(db: SupabaseClient<Database>, n: ApprovalNote): Promise<void> {
  const rpc = db.rpc.bind(db) as unknown as UntypedRpc;
  const { data, error } = await rpc("note_workbook_approved_with_new_marks", {
    p_draft: n.draftId, p_by: n.actor.id, p_by_email: n.actor.email, p_detail: n.detail,
  });
  if (error) throw new Error(`approval note: ${error.message}`);
  if ((data as { status?: unknown } | null)?.status !== "noted") throw new Error("approval note refused");
}

export function approvalCheckDeps(db: SupabaseClient<Database>, o: { runId: string; revision: number; actor: ShipActor }): ApprovalCheckDeps {
  return {
    store: nextBookSnapshotStore(db),
    async draftOf(runId) {
      const run = await db.from("workbook_runs").select("draft_id").eq("id", runId).maybeSingle();
      if (run.error) throw new Error(`approval run read: ${run.error.message}`);
      return run.data?.draft_id ?? null;
    },
    approve: () => approveDraft(workbookShipStore(db), o),
    note: n => noteApprovedWithNewMarks(db, n),
  };
}
