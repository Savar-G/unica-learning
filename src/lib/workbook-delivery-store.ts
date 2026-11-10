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

type Identity = { workbook_id: string; parent_id: string; child_id: string; number: number };
/** A correction counts only for its own receipt: the same workbook, family, child and book number. */
const sameBook = (c: Identity, r: Identity) => c.workbook_id === r.workbook_id && c.parent_id === r.parent_id && c.child_id === r.child_id && c.number === r.number;

/** Ids per `in` filter, so a request URL stays short. */
const IDS = 100;
/** Rows per page: PostgREST caps each response. */
const ROWS = 500;

/**
 * When each of these workbooks was delivered, by the same rule as `receipt` (the workbook detail): the latest
 * correction's time when there is one, else the receipt's; a latest correction of another book gives no delivery.
 * Two requests per 100 workbooks (receipts and corrections), for lists. Workbooks with no receipt are not in the map.
 */
export async function deliveredTimes(db: SupabaseClient<Database>, workbookIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(workbookIds)].filter(isUuid);
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += IDS) {
    const chunk = ids.slice(i, i + IDS);
    const corrections = async () => {
      const rows: (Identity & { delivered_at: string; audit_id: number })[] = [];
      for (let from = 0; ; from += ROWS) {
        const { data, error } = await db.from("workbook_delivery_corrections").select("workbook_id, parent_id, child_id, number, delivered_at, audit_id")
          .in("workbook_id", chunk).order("workbook_id").order("audit_id", { ascending: false }).range(from, from + ROWS - 1);
        if (error) throw new Error(`delivery correction read: ${error.message}`);
        rows.push(...data);
        if (data.length < ROWS) return rows;
      }
    };
    const [receipts, fixes] = await Promise.all([
      db.from("workbook_delivery_receipts").select("workbook_id, parent_id, child_id, number, delivered_at").in("workbook_id", chunk).then(({ data, error }) => {
        if (error) throw new Error(`delivery read: ${error.message}`);
        return data;
      }),
      corrections(),
    ]);
    const latest = new Map<string, Identity & { delivered_at: string; audit_id: number }>();
    for (const c of fixes) if (!latest.has(c.workbook_id) || latest.get(c.workbook_id)!.audit_id < c.audit_id) latest.set(c.workbook_id, c);
    for (const r of receipts) {
      const c = latest.get(r.workbook_id);
      if (c && !sameBook(c, r)) continue;
      out.set(r.workbook_id, new Date((c ?? r).delivered_at).toISOString());
    }
  }
  return out;
}

/** Pass the current session. The RPC checks live admin membership; reads use RLS. */
export function workbookDeliveryStore(db: SupabaseClient<Database>): DeliveryStore {
  const store: DeliveryStore = {
    async receipt(id) {
      if (!isUuid(id)) return null;
      const { data, error } = await db.from("workbook_delivery_receipts").select("*").eq("workbook_id", id).maybeSingle();
      if (error) throw new Error(`delivery read: ${error.message}`);
      if (!data || data.workbook_id !== id) return null;
      const original = deliveryFromRow(data);
      const correction = await db.from("workbook_delivery_corrections").select("*").eq("workbook_id", id).order("audit_id", { ascending: false }).limit(1).maybeSingle();
      if (correction.error) throw new Error(`delivery correction read: ${correction.error.message}`);
      const c = correction.data;
      // Validate the latest row after selecting it. Never ignore a mismatched correction and use an older receipt.
      if (c && !sameBook(c, data)) return null;
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
