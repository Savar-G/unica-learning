// D-308 (#476) on the service client. The routes check the admin session first; this wires the snapshot store, the
// existing approval (approveDraft) and the audit note of an approval anyway.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJson, type Database } from "./database";
import { nextBookSnapshotStore } from "./next-book-snapshot-store";
import { draftNewMarks, type ApprovalCheckDeps, type ApprovalNote, type DraftNewMarks } from "./next-book-refresh";
import { approveDraft, type ShipActor } from "./workbook-ship";
import { workbookShipStore } from "./workbook-ship-store";

/** The run page's check: the marks this next-book draft's pages were not drawn from. Never throws: a failed read is "unavailable". */
export async function draftNewMarksOnServer(db: SupabaseClient<Database>, draftId: string): Promise<DraftNewMarks> {
  try { return await draftNewMarks(nextBookSnapshotStore(db), draftId); }
  catch { return { kind: "unavailable" }; }
}

/**
 * The "approved-with-new-marks" audit entry. The service role may only read public.workbook_audit, so it is written by
 * the service function note_workbook_approved_with_new_marks (migration 20261114011147), which accepts it only for a
 * draft that already has its approval entry. A refusal or an error throws: the approval stands with `noted: false`.
 */
function noteApprovedWithNewMarks(db: SupabaseClient<Database>) {
  return async (n: ApprovalNote): Promise<void> => {
    const { data, error } = await db.rpc("note_workbook_approved_with_new_marks", {
      p_draft: n.draftId, p_by: n.actor.id, p_by_email: n.actor.email ?? "", p_detail: toJson(n.detail),
    });
    if (error) throw new Error(`approval note: ${error.message}`);
    const answer = data as { status?: string; reason?: string } | null;
    if (answer?.status !== "noted") throw new Error(`approval note refused: ${answer?.reason ?? "no answer"}`);
  };
}

export function approvalCheckDeps(db: SupabaseClient<Database>, o: { runId: string; revision: number; actor: ShipActor }): ApprovalCheckDeps {
  return {
    store: nextBookSnapshotStore(db),
    async runDraft(runId) {
      const run = await db.from("workbook_runs").select("draft_id, snapshot_id").eq("id", runId).maybeSingle();
      if (run.error) throw new Error(`approval run read: ${run.error.message}`);
      return run.data?.draft_id ? { draftId: run.data.draft_id, snapshotId: run.data.snapshot_id } : null;
    },
    approve: () => approveDraft(workbookShipStore(db), o),
    note: noteApprovedWithNewMarks(db),
  };
}
