import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { Database } from "@/lib/database";
import type { AdminSession } from "@/lib/admin-store";
import { CANCEL_CHECK_AGE_MS } from "@/lib/plan-cancel-recovery-server";
import { CARD_READ, customerSubscriptions, planCancelApplied } from "@/lib/stripe-subscriptions";

export async function openFamilyCancels(admin: AdminSession, parent: string) {
  const { data, error } = await admin.db.rpc("admin_open_plan_cancels", { p_parent: parent });
  if (error) return null;
  return data ?? [];
}

/** Reads only. The service-only close checks the parent and operation again under their locks. */
export async function checkOpenCancel(db: SupabaseClient<Database>, client: Stripe, parent: string, operation: string, now = Date.now()) {
  const { data: row, error } = await db.from("plan_control_operations").select("id,parent_id,card_setup_id,created_at")
    .eq("parent_id", parent).eq("id", operation).eq("kind", "cancel").eq("state", "open").maybeSingle();
  if (error) return { ok: false as const, error: "unavailable" };
  if (!row) return { ok: false as const, error: "not_found" };
  if (!Number.isFinite(Date.parse(row.created_at)) || Date.parse(row.created_at) > now - CANCEL_CHECK_AGE_MS) return { ok: false as const, error: "too_soon" };
  const card = await db.from("card_setups").select("stripe_customer_id").eq("id", row.card_setup_id).eq("parent_id", parent).maybeSingle();
  if (card.error || !card.data?.stripe_customer_id) return { ok: false as const, error: "unavailable" };
  let state: "applied" | "refused";
  try {
    const plans = (await customerSubscriptions(client, card.data.stripe_customer_id, CARD_READ)).filter(p => p.status !== "incomplete_expired");
    if (plans.some(p => !p.id || typeof p.status !== "string")) throw Error("Stripe plan unreadable");
    // An older canceled subscription must not hide a current running subscription. No subscription means nothing was canceled.
    state = plans.length > 0 && plans.every(planCancelApplied)
      ? "applied" : "refused";
  } catch { return { ok: false as const, error: "stripe_unavailable" }; }
  const closed = await db.rpc("close_plan_cancel", { p_parent: parent, p_id: operation, p_state: state });
  if (closed.error) return { ok: false as const, error: "unavailable" };
  if (closed.data !== true) return { ok: false as const, error: "not_found" };
  return { ok: true as const, state };
}
