import type { SupabaseClient } from "@supabase/supabase-js";
import { toJson, type Database } from "@/lib/database";
import { curriculumFor } from "@/lib/workbook-curriculum";
import type { WorkbookEditStore, WorkbookEdit, ReviewComment, EditCheckpoint } from "@/lib/workbook-edit";
import type { GeneratedWorkbook } from "@/lib/workbook-generator";
import type { DraftRendering } from "@/lib/workbook-job";
import type { RenderProblem } from "@/lib/workbook-render";
import { workbookRunStore } from "@/lib/workbook-job-store";

type Row = Database["public"]["Tables"]["workbook_edits"]["Row"];
export const editFromRow = (r: Row): WorkbookEdit => ({ id: r.id, draftId: r.draft_id, revision: r.base_revision,
  runner: r.runner as WorkbookEdit["runner"], status: r.status as WorkbookEdit["status"],
  error: r.error, createdAt: r.created_at, lease: r.lease });
export const commentFromRow = (r: Database["public"]["Tables"]["workbook_comments"]["Row"]): ReviewComment => ({
  id: r.id, draftId: r.draft_id, revision: r.revision, page: r.page_number, question: r.question_number,
  x: r.x, y: r.y, note: r.note, item: r.item, actor: { id: r.actor_id, email: r.actor_email }, createdAt: r.created_at,
  status: r.status as ReviewComment["status"], error: r.error, batchId: r.batch_id, before: r.before_value, after: r.after_value,
});
const checked = <T>(r: { data: T; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data; };

export function workbookEditStore(db: SupabaseClient<Database>): WorkbookEditStore {
  return {
    async checkpoints(id) {
      const row = checked(await db.from("workbook_edits").select("checkpoints").eq("id", id).single());
      return Object.values(row?.checkpoints ?? {}) as unknown as EditCheckpoint[];
    },
    async checkpoint(id, lease, result) { return checked(await db.rpc("checkpoint_workbook_edit", { p_id: id, p_lease: lease, p_page: result.number, p_result: toJson(result) })) === true; },
    async release(id, lease) { return checked(await db.rpc("release_workbook_edit", { p_id: id, p_lease: lease })) === true; },
    async comments(id) {
      return checked(await db.from("workbook_comments").select("*").eq("batch_id", id).eq("status", "sent").order("created_at"))?.map(commentFromRow) ?? [];
    },
    async claim(id, lease, runner) {
      if (!checked(await db.rpc("claim_workbook_edit", { p_id: id, p_lease: lease, p_runner: runner }))) return null;
      const row = checked(await db.from("workbook_edits").select("*").eq("id", id).single());
      return row ? editFromRow(row) : null;
    },
    async load(id) {
      const d = checked(await db.from("workbook_drafts").select("draft,parent_id").eq("id", id).single());
      const r = checked(await db.from("workbook_draft_revisions").select("*").eq("draft_id", id).order("revision", { ascending: false }).limit(1).single());
      const run = checked(await db.from("workbook_runs").select("id").eq("draft_id", id).single());
      if (!d || !r || !run) return null;
      const frame = await workbookRunStore(db).frame(run.id);
      const draft = (r.content ?? d.draft) as GeneratedWorkbook;
      const curriculum = frame ? curriculumFor(frame.curriculum) : null;
      if (!frame || !curriculum) throw new Error("The page plan is unavailable. Prepare a new workbook.");
      const cover = draft.pages.find((p) => p.content?.kind === "cover")?.content;
      return { draft, parentId: d.parent_id, revision: r.revision, rendering: r.rendering as DraftRendering | null,
        problems: r.render_problems as RenderProblem[],
        input: { workbookId: id, childId: draft.childId, number: draft.number, profileBuild: draft.profileBuild,
          plan: frame.plan, curriculum, book: { child: cover?.kind === "cover" ? cover.child : "Child" } } };
    },
    async finish(id, lease, result) {
      const good = "draft" in result;
      return checked(await db.rpc("finish_workbook_edit", { p_id: id, p_lease: lease,
        p_content: good ? toJson(result.draft) : null, p_rendering: good ? toJson(result.rendering) : null,
        p_problems: good ? toJson(result.problems) : toJson(result.problems ?? []), p_error: good ? null : result.error,
      })) as unknown as Awaited<ReturnType<WorkbookEditStore["finish"]>>;
    },
  };
}
