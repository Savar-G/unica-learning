import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { ParentWorkbookAnswerSource } from "@/lib/parent-workbook-answers";
import { workbookDeliveryStore } from "@/lib/workbook-delivery-store";
import { workbookStore } from "@/lib/workbook-store";

/** The current parent's session supplies every read. Explicit identity filters precede the package read. */
export function parentWorkbookAnswerSource(session: SupabaseClient<Database>, parent: string): ParentWorkbookAnswerSource {
  return {
    async child(id) {
      const { data, error } = await session.from("children").select("id, parent_id, first_name").eq("id", id).eq("parent_id", parent).maybeSingle();
      if (error) throw new Error("Answer key child read failed");
      return data ? { id: data.id, parentId: data.parent_id, firstName: data.first_name } : null;
    },
    async workbook(id) {
      const { data, error } = await session.from("workbooks").select("id, parent_id, child_id, number, status").eq("id", id).eq("parent_id", parent).eq("status", "shipped").maybeSingle();
      if (error) throw new Error("Answer key workbook read failed");
      return data ? { id: data.id, parentId: data.parent_id, childId: data.child_id, number: data.number, status: data.status } : null;
    },
    async delivery(id) {
      const receipt = await workbookDeliveryStore(session).receipt(id);
      if (!receipt) return null;
      return { workbookId: receipt.workbookId, parentId: receipt.parentId, childId: receipt.childId, number: receipt.number, deliveredAt: receipt.deliveredAt };
    },
    content: id => workbookStore(session).workbook(id),
  };
}
