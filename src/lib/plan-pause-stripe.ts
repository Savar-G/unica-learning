import "server-only";
import type Stripe from "stripe";
import type { PauseOperation, PausePlan, PauseProvider } from "@/lib/plan-pause";
import { CARD_READ, CARD_WRITE, customerSubscriptions, refusedByStripe } from "@/lib/stripe-subscriptions";
import { planNotOver } from "@/lib/card-reconcile";

const id = (value: string | { id: string } | null) => typeof value === "string" ? value : value?.id ?? null;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

/** No mode migration, collection pause, future anchor preview API or new trial for a paid plan. */
function supported(s: Stripe.Subscription): PausePlan | null {
  const item = s.items.data[0];
  if (s.cancel_at_period_end || s.cancel_at || s.schedule || s.pause_collection || s.collection_method !== "charge_automatically" || s.items.data.length !== 1
    || item?.price.recurring?.interval !== "month" || item.price.recurring.interval_count !== 1 || item.price.recurring.usage_type !== "licensed"
    || item.quantity !== 1 || item.price.currency !== "cad") return null;
  if (s.status === "trialing" && s.trial_end && s.metadata.trial_start_reason === "workbook_delivered") return { id: s.id, kind: "trial", chargeAt: iso(s.trial_end) };
  if (s.status === "active" && s.billing_mode?.type === "flexible" && item.current_period_end) return { id: s.id, kind: "paid", chargeAt: iso(item.current_period_end) };
  return null;
}

/** The resolver verifies current ownership for every read and write. Provider ids never come from the browser. */
export function stripePauses(s: Stripe, customerOf: (parent: string, card: string) => Promise<string | null>): PauseProvider {
  async function current(parent: string, card: string) {
    const customer = await customerOf(parent, card);
    if (!customer) return null;
    const subscriptions = await customerSubscriptions(s, customer, CARD_READ);
    if (subscriptions.some(plan => id(plan.customer) !== customer)) throw new Error("Pause subscription scope changed");
    const plans = subscriptions.filter(x => planNotOver(x.status));
    return plans.length === 1 ? plans[0] : null;
  }
  async function recover(parent: string, card: string, operation: PauseOperation) {
    const plan = await current(parent, card), q = operation.quote;
    if (plan?.id !== q.subscription) return false;
    if (q.kind === "trial") return plan.metadata.plan_pause_key === operation.id && plan.trial_end === Date.parse(q.chargeAt) / 1000;
    const scheduleId = id(plan.schedule);
    if (scheduleId) {
      const schedule = await s.subscriptionSchedules.retrieve(scheduleId, {}, CARD_READ);
      if (scheduleMatches(schedule, operation)) return true;
    }
    // A schedule can finish and detach before the parent checks the lost response.
    let after: string | undefined;
    for (let page = 0; page < 10; page++) {
      const schedules = await s.subscriptionSchedules.list({ customer: id(plan.customer)!, limit: 100, starting_after: after }, CARD_READ);
      if (schedules.data.some(schedule => scheduleMatches(schedule, operation))) return true;
      if (schedules.has_more === false) return false;
      const next = schedules.data.at(-1)?.id;
      if (schedules.has_more !== true || !next || next === after) throw new Error("Pause schedule list unreadable");
      after = next;
    }
    throw new Error("Too many pause schedules");
  }
  return {
    async plan(parent, card) { const plan = await current(parent, card); return plan ? supported(plan) : null; },
    recover,
    async apply(parent, card, operation) {
      const plan = await current(parent, card), q = operation.quote;
      const before = plan && supported(plan);
      if (!before || before.id !== q.subscription || before.kind !== q.kind || before.chargeAt !== q.previousCharge) return "refused";
      // No command has started yet. A stale renewal cannot create an immediate or past-dated pause.
      if (Date.parse(q.previousCharge) <= Date.now()) return "refused";
      const options = { ...CARD_WRITE, idempotencyKey: `plan-pause-${operation.id}` };
      try {
        if (q.kind === "trial") {
          const after = await s.subscriptions.update(q.subscription, {
            trial_end: Date.parse(q.chargeAt) / 1000, proration_behavior: "none", metadata: { plan_pause_key: operation.id },
          }, options);
          return after.metadata?.plan_pause_key === operation.id && after.trial_end === Date.parse(q.chargeAt) / 1000 ? "applied" : "pending";
        }
        const schedule = await s.subscriptionSchedules.create({
          from_subscription: q.subscription,
          metadata: { plan_pause_key: operation.id },
          pause_schedules: [{
            pause: { pause_at: { type: "timestamp", timestamp: Date.parse(q.previousCharge) / 1000 }, settings: {
              type: "subscription", invoicing_behavior: "pending_invoice_item",
              bill_for: { outstanding_usage_through: { type: "none" }, unused_time_from: { type: "none" } },
            } },
            resume: { resume_at: { type: "timestamp", timestamp: Date.parse(q.chargeAt) / 1000 }, settings: {
              billing_cycle_anchor: "resume_at", payment_behavior: "resume_on_payment_success", proration_behavior: "none",
            } },
          }],
        }, options);
        return scheduleMatches(schedule, operation) ? "applied" : "pending";
      } catch (error) { return refusedByStripe(error) ? "refused" : "pending"; }
    },
  };
}

function scheduleMatches(schedule: Stripe.SubscriptionSchedule, operation: PauseOperation): boolean {
  const pause = schedule.pause_schedules?.[0], q = operation.quote;
  return schedule.metadata?.plan_pause_key === operation.id && id(schedule.subscription ?? schedule.released_subscription) === q.subscription
    && schedule.pause_schedules?.length === 1 && !!pause?.key
    && pause.pause.pause_at === Date.parse(q.previousCharge) / 1000 && pause.resume?.resume_at === Date.parse(q.chargeAt) / 1000
    && pause.resume.settings.billing_cycle_anchor === "resume_at" && pause.resume.settings.payment_behavior === "resume_on_payment_success"
    && pause.resume.settings.proration_behavior === "none";
}
