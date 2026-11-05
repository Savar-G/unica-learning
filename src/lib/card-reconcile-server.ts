import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardRecord, CardRow, CardRows, CardSettle, PlanEmail, PlanStart, PlanStartState } from "@/lib/card-reconcile";
import type { Database } from "@/lib/database";
import { adminClient } from "@/lib/supabase-auth";

// The row's seam on the live site: the service-only functions of migrations card_row_reconcile and plan_starts.

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

const START_STATES: readonly PlanStartState[] = ["open", "started", "other", "refused", "team_ended"];
const EMAIL_STATES: readonly PlanEmail[] = ["none", "pending", "sent", "unknown"];
const ALERT_STATES: readonly NonNullable<PlanStart["alert"]>[] = ["sending", "sent", "unknown"];
const startState = (value: unknown): PlanStartState => {
  const found = START_STATES.find((s) => s === value);
  if (!found) throw new Error("Card row answer unreadable");
  return found;
};
const emailState = (value: unknown): PlanEmail => {
  const found = EMAIL_STATES.find((s) => s === value);
  if (!found) throw new Error("Card row answer unreadable");
  return found;
};
const alertState = (value: unknown): PlanStart["alert"] => {
  if (value === null || value === undefined) return null;
  const found = ALERT_STATES.find((s) => s === value);
  if (!found) throw new Error("Card row answer unreadable");
  return found;
};
const generationOf = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new Error("Card row answer unreadable");
  return value;
};
const isoOrNull = (value: unknown): string | null => (typeof value === "string" && value ? new Date(millis(value)).toISOString() : null);

function readStart(data: unknown): PlanStart {
  const a = object(data);
  return {
    generation: generationOf(a.generation), key: required(a.key), card: required(a.card), at: millis(a.at), state: startState(a.state),
    subscription: text(a.subscription), firstCharge: isoOrNull(a.first_charge), finished: a.finished_at ? millis(a.finished_at) : null,
    email: emailState(a.email), alert: alertState(a.alert),
  };
}

// The generator types a function's table columns as not null. The session, the card and the whole start can each be null here.
type RowColumns = Database["public"]["Functions"]["card_recovery_rows"]["Returns"][number];
const readRow = (r: RowColumns): CardRow => ({
  cardId: r.card_id, customer: r.customer, session: r.session_id, paymentMethod: r.payment_method_id, needsRepair: r.needs_repair,
  ...(r.deletion_queued ? { deletionQueued: true } : {}),
  planStart: r.start_key ? readStart({
    generation: r.start_generation, key: r.start_key, card: r.start_card, at: r.start_at, state: r.start_state, subscription: r.start_subscription,
    first_charge: r.start_first_charge, finished_at: r.start_finished_at, email: r.start_email, alert: r.start_alert,
  }) : null,
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
      const { data, error } = await db.rpc("card_recovery_rows", { p_card: cardId });
      if (error) throw new Error(`card row read: ${error.message}`);
      return data[0] ? readRow(data[0]) : null;
    },
    async cardRowOfCustomer(customer) {
      const { data, error } = await db.rpc("card_recovery_rows", { p_customer: customer });
      if (error) throw new Error(`card row read: ${error.message}`);
      return data[0] ? readRow(data[0]) : null;
    },
    async dueCardRows(changedAfter, limit) {
      const { data, error } = await db.rpc("card_recovery_rows", { p_changed_after: new Date(changedAfter).toISOString(), p_limit: limit });
      if (error) throw new Error(`card rows read: ${error.message}`);
      return data.map(readRow);
    },
    async noteCardChecked(cardId) {
      const { error } = await db.rpc("note_card_checked", { p_card: cardId });
      if (error) throw new Error(`card row note: ${error.message}`);
    },
    async admitPlanStart(cardId, generation, key, card) {
      const { data, error } = await db.rpc("admit_plan_start", { p_card: cardId, p_generation: generation, p_key: key, p_payment_method: card });
      if (error) throw new Error(`plan start admission: ${error.message}`);
      return readStart(data);
    },
    async finishPlanStart(cardId, generation, outcome) {
      const { data, error } = await db.rpc("finish_plan_start", {
        p_card: cardId, p_generation: generation, p_state: outcome.state,
        p_subscription: outcome.state === "refused" ? null : outcome.subscription,
        p_first_charge: outcome.state === "started" ? outcome.firstCharge : null,
        p_email: outcome.state === "started" && outcome.email,
      });
      if (error) throw new Error(`plan start finish: ${error.message}`);
      if (typeof data !== "boolean") throw new Error("Card row answer unreadable");
    },
    async notePlanEmail(cardId, generation, state) {
      const { error } = await db.rpc("note_plan_start_email", { p_card: cardId, p_generation: generation, p_state: state });
      if (error) throw new Error(`plan start email: ${error.message}`);
    },
    async claimPlanAlert(cardId, generation) {
      const { data, error } = await db.rpc("claim_plan_start_alert", { p_card: cardId, p_generation: generation });
      if (error) throw new Error(`plan start alert: ${error.message}`);
      return data === true;
    },
    async notePlanAlert(cardId, generation, note) {
      const { error } = await db.rpc("note_plan_start_alert", { p_card: cardId, p_generation: generation, p_state: note.state, p_email_id: note.emailId ?? null, p_error: note.error ?? null });
      if (error) throw new Error(`plan start alert note: ${error.message}`);
    },
    async teamEndPlanStart(cardId, generation, admin) {
      const { data, error } = await db.rpc("team_end_plan_start", { p_card: cardId, p_generation: generation, p_admin: admin });
      if (error) throw new Error(`plan start team end: ${error.message}`);
      return data === true;
    },
  };
}

/** The rows on the live site, or null without the secret key. */
export function liveCardRows(): CardRows | null {
  const db = adminClient();
  return db && supabaseCardRows(db);
}
