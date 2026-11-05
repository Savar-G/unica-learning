import "server-only";
import type Stripe from "stripe";
import { sendEmail } from "@/lib/email-delivery";
import { parentPlan, type KnownPlan, type ParentPlan, type PlanSubscription } from "@/lib/parent-plan";
import { cancelPlan, stripe, type CancelPlanOutcome } from "@/lib/stripe";
import { customerSubscriptions } from "@/lib/stripe-subscriptions";
import { adminClient } from "@/lib/supabase-auth";

// A parent's plans. Every read starts from the signed-in parent's id, so a parent reaches only their own Stripe
// customers. The customer id stays on the server: the browser sends only the card setup's id.

export interface ChildPlan {
  cardId: string;
  childName: string;
  plan: ParentPlan;
}

const READ = { timeout: 4000, maxNetworkRetries: 1 };

function planSubscription(s: Stripe.Subscription): PlanSubscription {
  const item = s.items.data[0];
  return {
    status: s.status, cancelAtPeriodEnd: s.cancel_at_period_end, trialEnd: s.trial_end, created: s.created,
    periodEnd: item?.current_period_end ?? null, cents: item?.price.unit_amount ?? null, endedAt: s.ended_at,
  };
}

/**
 * What Stripe says about one customer's plan now, from all of the customer's subscriptions. Throws when Stripe does not
 * answer or when it cannot read the whole list: an answer from part of the list could hide a running plan.
 */
export async function customerPlan(s: Stripe, customer: string): Promise<KnownPlan> {
  return parentPlan((await customerSubscriptions(s, customer, READ)).map(planSubscription));
}

/** One entry per child with a saved card. Null when the store cannot answer. */
export async function familyPlans(parent: string): Promise<ChildPlan[] | null> {
  const db = adminClient();
  if (!db) return null;
  const { data, error } = await db.from("card_setups").select("id, stripe_customer_id, child:children!inner(first_name, created_at)")
    .eq("parent_id", parent).not("card_saved_at", "is", null);
  if (error) return null;
  const s = stripe();
  const rows = [...(data ?? [])].sort((a, b) => a.child.created_at.localeCompare(b.child.created_at));
  return Promise.all(rows.map(async (row) => {
    const entry = { cardId: row.id, childName: row.child.first_name };
    if (!s || !row.stripe_customer_id) return { ...entry, plan: { kind: "unknown" } as const };
    try {
      return { ...entry, plan: await customerPlan(s, row.stripe_customer_id) };
    } catch (e) {
      console.error("[plan] Stripe read failed", e instanceof Error ? e.message : "failed");
      return { ...entry, plan: { kind: "unknown" } as const };
    }
  }));
}

export type CancelFamilyPlan =
  | (Extract<CancelPlanOutcome, { ok: true }> & { child: string })
  | Extract<CancelPlanOutcome, { ok: false }>
  | { ok: false; error: "not_found" | "unavailable" };

/** Cancels the plan of this parent's card setup. A card setup of another family answers not_found. */
export async function cancelFamilyPlan(parent: string, cardId: string): Promise<CancelFamilyPlan> {
  const db = adminClient();
  const s = stripe();
  if (!db || !s) return { ok: false, error: "unavailable" };
  const { data, error } = await db.from("card_setups").select("stripe_customer_id, child:children!inner(first_name)")
    .eq("id", cardId).eq("parent_id", parent).maybeSingle();
  if (error) return { ok: false, error: "unavailable" };
  if (!data?.stripe_customer_id) return { ok: false, error: "not_found" };
  const result = await cancelPlan(s, data.stripe_customer_id);
  return result.ok ? { ...result, child: data.child.first_name } : result;
}

/** Tells the team, so that no further workbook is prepared for this child. Sends nothing without an address. */
export async function planCancelledAlert(cardId: string, child: string, endsAt: string | null) {
  const to = process.env.SIGNUP_NOTIFY_EMAIL;
  if (!to) return;
  const outcome = await sendEmail({
    sender: { to: "savar" }, to, subject: `Plan cancelled: ${child}`,
    text: [`A parent cancelled ${child}'s plan from their account.`, endsAt ? `The plan ends: ${endsAt}` : "The plan ended now, after a failed payment.", `Card setup: ${cardId}`, "Do not prepare another workbook for this child."].join("\n"),
  });
  if (outcome.status !== "sent") console.error("[plan] cancel alert failed", outcome.status);
}
