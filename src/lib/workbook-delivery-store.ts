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
  const store: DeliveryStore = {
    async receipt(id) {
      if (!isUuid(id)) return null;
      const { data, error } = await db.from("workbook_delivery_receipts").select("*").eq("workbook_id", id).maybeSingle();
      if (error) throw new Error(`delivery read: ${error.message}`);
      if (!data) return null;
      const original = deliveryFromRow(data);
      const correction = await db.from("workbook_delivery_corrections").select("*").eq("workbook_id", id).order("audit_id", { ascending: false }).limit(1).maybeSingle();
      if (correction.error) throw new Error(`delivery correction read: ${correction.error.message}`);
      const c = correction.data;
      return c ? { ...original, originalDeliveredAt: original.deliveredAt, deliveredAt: new Date(c.delivered_at).toISOString(), localTime: c.local_time,
        correction: { id: c.id, reason: c.reason, deliveredAt: new Date(c.delivered_at).toISOString(), recordedAt: new Date(c.recorded_at).toISOString(), actorId: c.actor_id, auditId: c.audit_id, previousDeliveredAt: new Date(c.previous_delivered_at).toISOString() } } : original;
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
      if (a?.status === "confirmed" && a.receipt?.workbook_id) {
        const receipt = await store.receipt(input.workbookId);
        if (receipt) return { status: "confirmed", receipt };
      }
      if (a?.status === "refused" && typeof a.reason === "string") return { status: "refused", reason: a.reason };
      throw new Error("delivery confirm: unexpected answer");
    },
    async correct(input) {
      const zone = input.timeZone;
      const { data, error } = await db.rpc("correct_workbook_delivery", {
        p_workbook: input.workbookId, p_child: input.childId, p_number: input.number,
        p_delivered: input.deliveredAt, p_local: input.localTime, p_zone: typeof zone === "string" ? zone : zone.zone,
        p_override: typeof zone === "string", p_reason: input.reason, p_request: input.requestId, p_expected_audit: input.expectedAuditId,
      });
      if (error) throw new Error(`delivery correction: ${error.message}`);
      const a = data as { status?: string; reason?: string } | null;
      if (a?.status === "refused" && typeof a.reason === "string") return { status: "refused", reason: a.reason };
      if (a?.status === "corrected") {
        const receipt = await store.receipt(input.workbookId);
        if (receipt) return { status: "confirmed", receipt };
      }
      throw new Error("delivery correction: unexpected answer");
    },
  };
  return store;
}
