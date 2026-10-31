import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { draftProblem, GENERATED_DRAFT_VERSION, type WorkbookDraftStore } from "@/lib/workbook-generator";

// The draft store (#311) in Supabase (migration add_workbook_drafts): one row per generator run, the whole draft as
// jsonb with its counts beside it. Pass a client with the secret key: the service role may only read and insert; admins
// read; parents read nothing. A save reads the child's parent, then inserts the row in one statement: the whole draft
// or nothing. A draft id already used (23505) or a child that is gone (23503) is refused; the family write fence
// (55000) is refused too. Tests use src/lib/workbook-draft-memory.ts, which keeps the same refusals. No Next.js or React.

export function workbookDraftStore(admin: SupabaseClient<Database>): WorkbookDraftStore {
  return {
    async save(draft) {
      const problem = draftProblem(draft);
      if (problem) return { status: "refused", reason: problem };
      const child = await admin.from("children").select("parent_id").eq("id", draft.childId).maybeSingle();
      if (child.error) throw new Error(`workbook draft child load: ${child.error.message}`);
      if (!child.data) return { status: "refused", reason: "the child is not known" };
      const { error } = await admin.from("workbook_drafts").insert({
        id: draft.id, parent_id: child.data.parent_id, child_id: draft.childId, number: draft.number, levels: draft.levels,
        model: draft.model, profile_build: draft.profileBuild, schema_version: GENERATED_DRAFT_VERSION, draft,
        pages: draft.counts.pages, questions: draft.counts.questions, failed: draft.counts.failed,
        not_checked: draft.counts.notChecked, failed_pages: draft.counts.failedPages,
      });
      if (!error) return { status: "saved", draftId: draft.id };
      if (error.code === "23505") return { status: "refused", reason: "the draft id is already used" };
      if (error.code === "23503") return { status: "refused", reason: "the child is not known" };
      if (error.code === "55000") return { status: "refused", reason: "the family is being deleted" };
      throw new Error(`workbook draft save: ${error.message}`);
    },
    async draft(id) {
      const { data, error } = await admin.from("workbook_drafts").select("schema_version, draft").eq("id", id).maybeSingle();
      if (error) throw new Error(`workbook draft load: ${error.message}`);
      if (!data) return null;
      if (data.schema_version !== GENERATED_DRAFT_VERSION) throw new Error(`workbook draft load: shape version ${data.schema_version} is not ${GENERATED_DRAFT_VERSION}`);
      return data.draft;
    },
  };
}
