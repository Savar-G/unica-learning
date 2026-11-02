import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database";
import type { DeliveryReceipt, DeliveryStore } from "@/lib/workbook-delivery";
import { isUuid } from "@/lib/workbook-content";

type ReceiptRow = Tables<"workbook_delivery_receipts">;
export function deliveryFromRow(r: ReceiptRow): DeliveryReceipt {
  return { workbookId: r.workbook_id, parentId: r.parent_id, childId: r.child_id, number: r.number,
    deliveredAt: new Date(r.delivered_at).toISOString(), localTime: r.local_time,
    timeZone: r.zone_override ? r.time_zone : { zone: r.time_zone, override: false },
    recordedAt: new Date(r.recorded_at).toISOString(), actorId: r.actor_id, auditId: r.audit_id };
}

/** Pass the current session. The RPC checks live admin membership; reads use RLS. */
export function workbookDeliveryStore(db: SupabaseClient<Database>): DeliveryStore {
  return {
    async receipt(id) {
      if (!isUuid(id)) return null;
      const { data, error } = await db.from("workbook_delivery_receipts").select("*").eq("workbook_id", id).maybeSingle();
      if (error) throw new Error(`delivery read: ${error.message}`);
      return data ? deliveryFromRow(data) : null;
    },
    async confirm(input) {
      const zone = input.timeZone;
      const { data, error } = await db.rpc("confirm_workbook_delivery", {
        p_workbook: input.workbookId, p_child: input.childId, p_number: input.number,
        p_delivered: input.deliveredAt, p_local: input.localTime,
        p_zone: typeof zone === "string" ? zone : zone.zone, p_override: typeof zone === "string",
      });
      if (error) throw new Error(`delivery confirm: ${error.message}`);
      const a = data as { status?: string; reason?: string; receipt?: ReceiptRow } | null;
      if (a?.status === "confirmed" && a.receipt?.workbook_id) return { status: "confirmed", receipt: deliveryFromRow(a.receipt) };
      if (a?.status === "refused" && typeof a.reason === "string") return { status: "refused", reason: a.reason };
      throw new Error("delivery confirm: unexpected answer");
    },
  };
}
