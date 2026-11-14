// D-308 (#476) on the service client. The routes check the admin session first; this wires the snapshot store, the
// existing approval (approveDraft) and the audit note of an approval anyway.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { nextBookSnapshotStore } from "./next-book-snapshot-store";
import { draftNewMarks, type ApprovalCheckDeps, type ApprovalNote, type DraftNewMarks } from "./next-book-refresh";
import { approveDraft, type ShipActor } from "./workbook-ship";
import { workbookShipStore } from "./workbook-ship-store";

/** The run page's check: the marks this next-book draft's pages were not drawn from. Never throws: a failed read is "unavailable". */
export async function draftNewMarksOnServer(db: SupabaseClient<Database>, draftId: string): Promise<DraftNewMarks> {
  try { return await draftNewMarks(nextBookSnapshotStore(db), draftId); }
  catch { return { kind: "unavailable" }; }
}

export const APPROVAL_NOTE_MIGRATION = "20261113233859_workbook_approved_with_new_marks";

/**
 * The "approved-with-new-marks" audit entry. The service role may only read public.workbook_audit, so the entry needs the
 * function note_workbook_approved_with_new_marks of migration APPROVAL_NOTE_MIGRATION, which is not applied and not in
 * database.types.ts yet. Until then this writes nothing and says so: it logs the note and throws, so the approval
 * stands with `noted: false`. After the migration and `npm run db:types`, call db.rpc with that function here.
 */
async function noteApprovedWithNewMarks(n: ApprovalNote): Promise<void> {
  console.error(`[workbook ship] audit note needs migration ${APPROVAL_NOTE_MIGRATION}`, n.draftId, JSON.stringify(n.detail));
  throw new Error(`approval note: needs migration ${APPROVAL_NOTE_MIGRATION}`);
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
    note: noteApprovedWithNewMarks,
  };
}
