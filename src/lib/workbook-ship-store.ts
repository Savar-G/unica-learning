import type { SupabaseClient } from "@supabase/supabase-js";
import { toJson, type Database } from "@/lib/database";
import { QUESTION_PACKAGE_VERSION } from "@/lib/question-package";
import { isUuid, workbookProblem } from "@/lib/workbook-content";
import { READABLE_DRAFT_VERSIONS, type GeneratedWorkbook } from "@/lib/workbook-generator";
import type { DraftRendering } from "@/lib/workbook-job";
import type { RenderProblem } from "@/lib/workbook-render";
import type { MarkResult, WorkbookShipStore } from "@/lib/workbook-ship";
import { teachingFrame } from "@/lib/workbook-teaching-frame";
import { workbookPlanRefusal } from "@/lib/workbook-plan-refusal";

// The ship store (#314) in Supabase (migration workbook_ship). Pass a client with the secret key: approve_workbook_draft
// and mark_workbook are service-only. The draft's current revision is its latest; its content is the revision's own
// (#313 edits), else the draft row's (revision 1). Tests use src/lib/workbook-ship-memory.ts. No Next.js or React.

const answerOf = (data: unknown) => data as { status?: unknown; reason?: unknown; workbookId?: unknown; to?: unknown; at?: unknown; firstShipped?: unknown } | null;

export function workbookShipStore(db: SupabaseClient<Database>): WorkbookShipStore {
  return {
    async draftForApproval(runId) {
      if (!isUuid(runId)) return null;
      const run = await db.from("workbook_runs").select("status, draft_id").eq("id", runId).maybeSingle();
      if (run.error) throw new Error(`approval run load: ${run.error.message}`);
      if (!run.data?.draft_id) return null;
      const draftId = run.data.draft_id;
      const [draft, revision, frame] = await Promise.all([
        db.from("workbook_drafts").select("schema_version, draft").eq("id", draftId).maybeSingle(),
        db.from("workbook_draft_revisions").select("revision, content, rendering, render_problems").eq("draft_id", draftId)
          .order("revision", { ascending: false }).limit(1).maybeSingle(),
        db.from("workbook_run_frames").select("frame").eq("run_id", runId).maybeSingle(),
      ]);
      const error = draft.error ?? revision.error ?? frame.error;
      if (error) throw new Error(`approval draft load: ${error.message}`);
      if (!draft.data || !revision.data) return null;
      const content = (revision.data.content ?? draft.data.draft) as GeneratedWorkbook;
      return {
        runId, runDone: run.data.status === "done", draftId, revision: revision.data.revision,
        oldFormat: !READABLE_DRAFT_VERSIONS.includes(draft.data.schema_version),
        draft: content,
        rendering: revision.data.rendering as DraftRendering | null,
        renderProblems: revision.data.render_problems as RenderProblem[],
        frame: frame.data ? teachingFrame(frame.data.frame) : null,
      };
    },

    async approve({ draftId, revision, workbook, actor }) {
      const problem = workbookProblem(workbook);
      if (problem) return { status: "refused", reason: problem };
      const { data, error } = await db.rpc("approve_workbook_draft", {
        p_draft: draftId, p_revision: revision, p_workbook: toJson(workbook), p_schema_version: QUESTION_PACKAGE_VERSION,
        p_by: actor.id, p_by_email: actor.email,
      });
      if (error) {
        if (error.code === "55000") return { status: "refused", reason: workbookPlanRefusal(error.message, "approve") };
        throw new Error(`workbook approve: ${error.message}`);
      }
      const a = answerOf(data);
      if (a?.status === "approved" && typeof a.workbookId === "string") return { status: "approved", workbookId: a.workbookId };
      if (a?.status === "refused" && typeof a.reason === "string") return { status: "refused", reason: a.reason };
      throw new Error("workbook approve: unexpected answer");
    },

    async mark({ workbookId, to, actor }): Promise<MarkResult> {
      if (!isUuid(workbookId)) return { status: "not-found" };
      const { data, error } = await db.rpc("mark_workbook", { p_workbook: workbookId, p_to: to, p_by: actor.id, p_by_email: actor.email });
      if (error) {
        if (error.code === "55000") return { status: "refused", reason: workbookPlanRefusal(error.message, to) };
        throw new Error(`workbook mark: ${error.message}`);
      }
      const a = answerOf(data);
      if (a?.status === "marked" && (a.to === "printed" || a.to === "shipped") && typeof a.at === "string" && typeof a.firstShipped === "boolean") {
        return { status: "marked", to: a.to, at: new Date(a.at).toISOString(), firstShipped: a.firstShipped };
      }
      if (a?.status === "refused" && typeof a.reason === "string") {
        return a.reason === "the workbook is not known" ? { status: "not-found" } : { status: "refused", reason: a.reason };
      }
      throw new Error("workbook mark: unexpected answer");
    },
  };
}
