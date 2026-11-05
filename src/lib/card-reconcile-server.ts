import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardRecord, CardRow, CardRows, CardSettle, PendingPlan } from "@/lib/card-reconcile";
import type { Database } from "@/lib/database";
import { adminClient } from "@/lib/supabase-auth";

// The row's seam on the live site: the service-only functions of migration card_row_reconcile.

type Answer = Record<string, unknown>;
const object = (data: unknown): Answer => {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Card row answer unreadable");
  return data as Answer;
};
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const required = (value: unknown): string => {
  if (typeof value !== "string" || !value) throw new Error("Card row answer unreadable");
  return value;
};
const millis = (value: unknown): number => {
  const at = Date.parse(required(value));
  if (Number.isNaN(at)) throw new Error("Card row answer unreadable");
  return at;
};

function readRecord(data: unknown): CardRecord {
  const a = object(data);
  if (a.state === "no_match") return { state: "no_match" };
  if (a.state !== "row") throw new Error("Card row answer unreadable");
  return { state: "row", session: text(a.session), paymentMethod: text(a.payment_method), needsRepair: a.needs_repair === true, recorded: a.recorded === true };
}

function readSettle(data: unknown): CardSettle {
  const a = object(data);
  switch (a.state) {
    case "settled": return { state: "settled" };
    case "flagged": return { state: "flagged" };
    case "newer": return { state: "newer", session: text(a.session), paymentMethod: text(a.payment_method) };
    default: throw new Error("Card row answer unreadable");
  }
}

function readPending(data: unknown): PendingPlan {
  const a = object(data);
  return { key: required(a.key), card: required(a.card), at: millis(a.at) };
}

// The generator types a function's table columns as not null. The session, the card and the record can each be null here.
type RowColumns = Database["public"]["Functions"]["card_update_rows"]["Returns"][number];
const readRow = (r: RowColumns): CardRow => ({
  cardId: r.card_id, customer: r.customer, session: r.session_id, paymentMethod: r.payment_method_id, needsRepair: r.needs_repair,
  pendingPlan: r.pending_plan_key && r.pending_plan_card && r.pending_plan_at ? { key: r.pending_plan_key, card: r.pending_plan_card, at: millis(r.pending_plan_at) } : null,
});

export function supabaseCardRows(db: SupabaseClient<Database>): CardRows {
  return {
    async recordCard(cardId, card) {
      const { data, error } = await db.rpc("record_card_update", {
        p_parent: card.parentId, p_card: cardId, p_session: card.session, p_session_created_at: new Date(card.created * 1000).toISOString(), p_payment_method: card.paymentMethod,
      });
      if (error) throw new Error(`card row record: ${error.message}`);
      return readRecord(data);
    },
    async settleCard(cardId, session, confirmed) {
      const { data, error } = await db.rpc("settle_card_update", { p_card: cardId, p_session: session, p_confirmed: confirmed });
      if (error) throw new Error(`card row settle: ${error.message}`);
      return readSettle(data);
    },
    async cardRow(cardId) {
      const { data, error } = await db.rpc("card_update_rows", { p_card: cardId });
      if (error) throw new Error(`card row read: ${error.message}`);
      return data[0] ? readRow(data[0]) : null;
    },
    async cardRowOfCustomer(customer) {
      const { data, error } = await db.rpc("card_update_rows", { p_customer: customer });
      if (error) throw new Error(`card row read: ${error.message}`);
      return data[0] ? readRow(data[0]) : null;
    },
    async dueCardRows(changedAfter, limit) {
      const { data, error } = await db.rpc("card_update_rows", { p_changed_after: new Date(changedAfter).toISOString(), p_limit: limit });
      if (error) throw new Error(`card rows read: ${error.message}`);
      return data.map(readRow);
    },
    async noteCardChecked(cardId) {
      const { error } = await db.rpc("note_card_checked", { p_card: cardId });
      if (error) throw new Error(`card row note: ${error.message}`);
    },
    async beginPlanStart(cardId, key, card) {
      const { data, error } = await db.rpc("begin_plan_start", { p_card: cardId, p_key: key, p_payment_method: card });
      if (error) throw new Error(`plan start record: ${error.message}`);
      return readPending(data);
    },
    async endPlanStart(cardId, key) {
      const { error } = await db.rpc("end_plan_start", { p_card: cardId, p_key: key });
      if (error) throw new Error(`plan start end: ${error.message}`);
    },
  };
}

/** The rows on the live site, or null without the secret key. */
export function liveCardRows(): CardRows | null {
  const db = adminClient();
  return db && supabaseCardRows(db);
}
