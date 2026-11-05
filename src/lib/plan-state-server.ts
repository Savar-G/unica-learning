import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { Database } from "@/lib/database";
import { customerPlan } from "@/lib/parent-plan-server";
import { planColumns, planFromColumns, type PlanOwner, type PlanProvider, type PlanSave, type PlanStates, type PlanStateStore } from "@/lib/plan-state";
import { stripe } from "@/lib/stripe";
import { adminClient } from "@/lib/supabase-auth";

// The plan state module's seams (src/lib/plan-state.ts) for the live site: child_plan_states and card_setups in
// Supabase, read and written with the secret key, and Stripe's subscriptions.

const OWNER_COLUMNS = "parent_id, child_id, stripe_customer_id, card_saved_at";
const STATE_COLUMNS = "kind, next_charge_at, ends_at, monthly_cents, ending_free, event_at, event_id";
const SAVES: readonly PlanSave[] = ["stored", "older", "duplicate", "no_match"];

type OwnerRow = { parent_id: string; child_id: string; stripe_customer_id: string | null; card_saved_at: string | null };
const ownerOf = (row: OwnerRow | null): PlanOwner | null => (row?.stripe_customer_id
  ? { parentId: row.parent_id, childId: row.child_id, customer: row.stripe_customer_id, cardSaved: row.card_saved_at !== null }
  : null);

/** Stripe as the plan provider. Without a key it cannot tell, so every read throws. */
export function stripePlanProvider(client: Stripe | null): PlanProvider {
  return {
    async plan(customer) {
      if (!client) throw new Error("No Stripe key");
      return customerPlan(client, customer);
    },
  };
}

/** child_plan_states and card_setups as the plan state store. */
export function supabasePlanStore(db: SupabaseClient<Database>): PlanStateStore {
  return {
    async ownerOfCustomer(customer) {
      const { data, error } = await db.from("card_setups").select(OWNER_COLUMNS).eq("stripe_customer_id", customer).maybeSingle();
      if (error) throw new Error(`Card row read failed: ${error.message}`);
      return ownerOf(data);
    },
    async ownerOfChild({ parentId, childId }) {
      const { data, error } = await db.from("card_setups").select(OWNER_COLUMNS).eq("child_id", childId).eq("parent_id", parentId).maybeSingle();
      if (error) throw new Error(`Card row read failed: ${error.message}`);
      return ownerOf(data);
    },
    async load({ parentId, childId }) {
      const { data, error } = await db.from("child_plan_states").select(STATE_COLUMNS).eq("child_id", childId).eq("parent_id", parentId).maybeSingle();
      if (error) throw new Error(`Plan state read failed: ${error.message}`);
      if (!data) return null;
      const plan = planFromColumns(data);
      // The table's checks allow no row that reads as unknown.
      if (plan.kind === "unknown") throw new Error("Plan state row does not fit its kind");
      return { plan, eventAt: data.event_at, eventId: data.event_id };
    },
    async takeReadOrder() {
      const { data, error } = await db.rpc("take_plan_read_order");
      if (error) throw new Error(`Plan read order failed: ${error.message}`);
      if (!Number.isSafeInteger(data)) throw new Error("Plan read order is not a whole number");
      return data;
    },
    async save(customer, { plan, eventAt, eventId, readOrder }) {
      const columns = planColumns(plan);
      const { data, error } = await db.rpc("save_child_plan_state", {
        p_customer: customer, p_kind: columns.kind, p_next_charge_at: columns.next_charge_at, p_ends_at: columns.ends_at,
        p_monthly_cents: columns.monthly_cents, p_ending_free: columns.ending_free, p_event_at: eventAt, p_event_id: eventId, p_read_order: readOrder,
      });
      if (error) throw new Error(`Plan state write failed: ${error.message}`);
      const outcome = SAVES.find((s) => s === data);
      if (!outcome) throw new Error("Plan state write gave an answer the site does not know");
      return outcome;
    },
  };
}

/** The module's seams on the live site, or null without the secret key or the Stripe key. */
export function livePlanStates(): PlanStates | null {
  const db = adminClient();
  const client = stripe();
  if (!db || !client) return null;
  return { store: supabasePlanStore(db), provider: stripePlanProvider(client) };
}
