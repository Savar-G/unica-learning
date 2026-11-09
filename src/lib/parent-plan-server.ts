import "server-only";
import type Stripe from "stripe";
import { sendEmail } from "@/lib/email-delivery";
import { parentPlan, type KnownPlan, type ParentPlan, type PlanSubscription } from "@/lib/parent-plan";
import { cancelPlan, stripe, type CancelPlanOutcome } from "@/lib/stripe";
import { customerSubscriptions } from "@/lib/stripe-subscriptions";
import { adminClient } from "@/lib/supabase-auth";
import { finishControl } from "@/lib/plan-controls-server";

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
  const subscriptions = await customerSubscriptions(s, customer, READ);
  const states = await Promise.all(subscriptions.map(async (subscription) => {
    const state = planSubscription(subscription);
    if ((subscription.status === "paused" || subscription.status === "active") && subscription.schedule) {
      const schedule = await s.subscriptionSchedules.retrieve(typeof subscription.schedule === "string" ? subscription.schedule : subscription.schedule.id, {}, READ);
      const pause = schedule.pause_schedules?.[0];
      state.pauseResume = pause?.resume?.status.type === "scheduled" ? pause.resume.resume_at : null;
      if (subscription.status === "active" && pause?.pause.pause_at === state.periodEnd
        && pause.pause.status.type === "scheduled" && pause.resume?.status.type === "scheduled"
        && pause.resume.settings.billing_cycle_anchor === "resume_at") state.nextCharge = pause.resume.resume_at;
    }
    return state;
  }));
  return parentPlan(states);
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
  | { ok: false; error: "not_found" | "unavailable" | "pending" };

/** Cancels the plan of this parent's card setup. A card setup of another family answers not_found. */
export async function cancelFamilyPlan(parent: string, cardId: string): Promise<CancelFamilyPlan> {
  const db = adminClient();
  const s = stripe();
  if (!db || !s) return { ok: false, error: "unavailable" };
  const { data, error } = await db.from("card_setups").select("stripe_customer_id, child:children!inner(first_name)")
    .eq("id", cardId).eq("parent_id", parent).maybeSingle();
  if (error) return { ok: false, error: "unavailable" };
  if (!data?.stripe_customer_id) return { ok: false, error: "not_found" };
  const admission = await db.rpc("admit_plan_cancel", { p_parent: parent, p_card: cardId });
  if (admission.error) throw new Error(`plan cancel admission: ${admission.error.message}`);
  if (typeof admission.data !== "string" || !admission.data) return { ok: false, error: "pending" };
  const operation = admission.data, child = data.child.first_name;
  let attemptedWrite = false;
  let result: CancelPlanOutcome;
  try {
    result = await cancelPlan(s, data.stripe_customer_id, () => { attemptedWrite = true; });
  } catch (e) {
    // No command went to Stripe: nothing can still change the plan, so the operation closes and the parent can retry.
    // After a command, the open operation and its family hold stay until the team proves every command ended.
    if (!attemptedWrite) await finishOrAlert(db, operation, "refused", cardId, child, "a cancellation could not read the plan and could not be released");
    else await planCancelCheckAlert(cardId, child, operation, "a cancellation command has an unknown result");
    throw e;
  }
  await finishOrAlert(db, operation, result.ok ? "applied" : "refused", cardId, child, "a cancellation result could not be saved");
  return result.ok ? { ...result, child } : result;
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

/** Closes the operation. When the close fails, the operation stays open and blocks Cancel, so the team hears and the error goes on. */
async function finishOrAlert(db: NonNullable<ReturnType<typeof adminClient>>, operation: string, state: "applied" | "refused", cardId: string, child: string, why: string) {
  try {
    await finishControl(db, operation, state);
  } catch (e) {
    await planCancelCheckAlert(cardId, child, operation, `${why} (${state})`);
    throw e;
  }
}

/** Tells the team that a cancellation operation stays open and needs their check. Never throws: a failed alert is logged. */
async function planCancelCheckAlert(cardId: string, child: string, operation: string, why: string) {
  try {
    const to = process.env.SIGNUP_NOTIFY_EMAIL;
    if (!to) { console.error("[plan] cancel check alert has no address", operation); return; }
    const outcome = await sendEmail({
      sender: { to: "savar" }, to, subject: `Plan cancellation needs a check: ${child}`,
      text: [`For ${child}, ${why}.`, `Card setup: ${cardId}`, `Operation: ${operation}`,
        "The operation and the family hold stay open, and the parent's Cancel answers pending.",
        "Check every Stripe command for this customer before you close the operation. See docs/plan-controls.md."].join("\n"),
    });
    if (outcome.status !== "sent") console.error("[plan] cancel check alert failed", outcome.status, operation);
  } catch (e) {
    console.error("[plan] cancel check alert failed", e instanceof Error ? e.message : "failed", operation);
  }
}
