import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { feedbackAdmission, type FeedbackProduct, type FeedbackStore, type FeedbackRow } from "@/lib/feedback";
import { notIn } from "@/lib/admin-test-families";

export function feedbackStore(db: SupabaseClient<Database>): FeedbackStore {
  return {
    async submit(parent, input) {
      const { data, error } = await db.rpc("submit_feedback", {
        p_parent: parent, p_request: input.requestId, p_child: input.childId,
        p_product: input.product, p_text: input.text, p_source: input.source,
      });
      if (error) throw new Error(`Feedback write: ${error.code}`);
      return feedbackAdmission(data);
    },
  };
}
/** The admin's own session reads through RLS, with bounded pages and a stable newest-first order. */
/** `hide`: the parent ids left out (the test families, while the admin's "Show test families" switch is off). */
export async function listFeedback(db: SupabaseClient<Database>, product: FeedbackProduct | null, page: number, hide: readonly string[] = []): Promise<{ rows: FeedbackRow[]; more: boolean }> {
  const offset = (page - 1) * 50;
  let query = db.from("feedback").select("id,parent_id,child_id,product,text,source,created_at,status").order("created_at", { ascending: false }).order("id", { ascending: false });
  if (product) query = query.eq("product", product);
  const out = notIn(hide);
  if (out) query = query.not("parent_id", "in", out);
  const { data, error } = await query.range(offset, offset + 50);
  if (error) throw new Error(`Feedback read: ${error.code}`);
  return { rows: data.slice(0, 50), more: data.length > 50 };
}
