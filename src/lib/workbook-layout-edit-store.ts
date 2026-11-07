import type { SupabaseClient } from "@supabase/supabase-js";
import { toJson, type Database } from "@/lib/database";
import { workbookEditStore } from "@/lib/workbook-edit-store";
import type { LayoutEditStore } from "@/lib/workbook-layout-edit";

export function workbookLayoutEditStore(db: SupabaseClient<Database>): LayoutEditStore {
  const base = workbookEditStore(db);
  return {
    async claim(id, lease) {
      const claim = await db.rpc("claim_workbook_layout_edit", { p_id: id, p_lease: lease });
      if (claim.error) throw new Error(claim.error.message);
      if (!claim.data) return null;
      const row = await db.from("workbook_edits").select("draft_id,base_revision,layout_plan").eq("id", id).single();
      if (row.error) throw new Error(row.error.message);
      if (!row.data.layout_plan) throw new Error("The reviewed layout request is unavailable.");
      return { draftId: row.data.draft_id, revision: row.data.base_revision, plan: row.data.layout_plan };
    },
    load: base.load, frame: base.frame, checkpoints: base.checkpoints, checkpoint: base.checkpoint,
    async finish(id, lease, result) {
      const good = "rendering" in result;
      const response = await db.rpc("finish_workbook_layout_edit", { p_id: id, p_lease: lease,
        p_rendering: good ? toJson(result.rendering) : null, p_results: good ? toJson(result.results) : null,
        p_error: good ? null : result.error });
      if (response.error) throw new Error(response.error.message);
      const value = response.data;
      return !!value && typeof value === "object" && !Array.isArray(value) && value.status === "done";
    },
  };
}
