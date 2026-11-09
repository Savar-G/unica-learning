import "server-only";
import Stripe from "stripe";
import { CardWriteRefused, type CardStripe, type PlanCard } from "@/lib/card-reconcile";

/** More subscriptions than these pages hold is not a state the plan rules know: the read throws. */
const SUBSCRIPTION_PAGES = 10;

/**
 * All of one customer's subscriptions, on every page. Throws when Stripe does not answer or when it cannot read the
 * whole list: an answer from part of the list could hide a running plan, so a plan could not be cancelled, or a second
 * one could start.
 */
export async function customerSubscriptions(s: Stripe, customer: string, options?: Stripe.RequestOptions): Promise<Stripe.Subscription[]> {
  const subscriptions: Stripe.Subscription[] = [];
  let after: string | undefined;
  for (let page = 0; page < SUBSCRIPTION_PAGES; page++) {
    const list = await s.subscriptions.list({ customer, status: "all", limit: 100, starting_after: after }, options);
    if (typeof list.has_more !== "boolean") throw new Error("Subscription pagination unreadable");
    subscriptions.push(...list.data);
    if (!list.has_more) return subscriptions;
    const next = list.data.at(-1)?.id;
    if (!next || next === after) throw new Error("Subscription pagination did not advance");
    after = next;
  }
  throw new Error("Too many subscriptions");
}

/** A Stripe read of a card or a plan: about 9 seconds at most. */
export const CARD_READ: Stripe.RequestOptions = { timeout: 4000, maxNetworkRetries: 1 };
/** A Stripe write of a card or a plan. One attempt, so its longest time is known. */
export const CARD_WRITE: Stripe.RequestOptions = { timeout: 15_000, maxNetworkRetries: 0 };

/** The Cancel command and its recovery use the same status and promised end. */
export function planCancelTerms(plan: Stripe.Subscription) {
  const atPeriodEnd = plan.status === "trialing" || plan.status === "active";
  const end = atPeriodEnd
    ? (plan.trial_end && plan.status === "trialing" ? plan.trial_end : plan.items.data[0]?.current_period_end) ?? null
    : null;
  return { atPeriodEnd, end };
}

/** A future date alone does not prove Cancel: another renewal or scheduled resume must not survive it. */
export function planCancelApplied(plan: Stripe.Subscription): boolean {
  // Cancel releases the controlling schedule before it ends the subscription.
  if (plan.schedule) return false;
  if (plan.status === "canceled") return true;
  if (plan.cancel_at_period_end !== true && plan.cancel_at == null) return false;
  const { atPeriodEnd, end } = planCancelTerms(plan);
  if (!atPeriodEnd || !end || !Number.isSafeInteger(end) || end <= 0 || plan.pause_collection) return false;
  // A conflicting date must not override the promised trial or paid-period end.
  if (plan.cancel_at != null && plan.cancel_at !== end) return false;
  return plan.cancel_at_period_end === true || plan.cancel_at === end;
}

/** Deletion ends both the subscription and its schedule, so no scheduled resume survives it. */
export async function cancelSubscriptionNow(s: Stripe, plan: Stripe.Subscription, options: Stripe.RequestOptions): Promise<void> {
  const schedule = typeof plan.schedule === "string" ? plan.schedule : plan.schedule?.id;
  if (schedule) {
    const cancelled = await s.subscriptionSchedules.cancel(schedule, { invoice_now: false, prorate: false }, options);
    if (cancelled.status !== "canceled") throw new Error("Subscription schedule cancellation unconfirmed");
  } else {
    await s.subscriptions.cancel(plan.id, { invoice_now: false, prorate: false }, options);
  }
}

/**
 * True only when Stripe said no, so nothing happened. A timeout, a lost connection, a 5xx, a 429 and a 409 leave the outcome
 * unknown, and so does a key reused with other fields, as the key's first request may have worked.
 */
export function refusedByStripe(e: unknown): boolean {
  if (!(e instanceof Stripe.errors.StripeError) || e instanceof Stripe.errors.StripeIdempotencyError) return false;
  const status = e.statusCode ?? 0;
  return status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429;
}

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : value?.id ?? null);

/** A subscription as the card comparison reads it. */
export function planCard(x: Stripe.Subscription): PlanCard {
  return {
    id: x.id, status: x.status, defaultCard: idOf(x.default_payment_method), startKey: x.metadata?.start_key ?? null,
    ...(x.metadata?.start_reason === "paid_restart" ? { paidRestart: true } : {}),
    firstCharge: x.trial_end ? new Date(x.trial_end * 1000).toISOString() : (x.metadata?.start_reason === "family_window_ended" || x.metadata?.start_reason === "paid_restart") && Number.isFinite(x.created) ? new Date(x.created * 1000).toISOString() : null,
  };
}

const writing = async (write: () => Promise<unknown>) => {
  try {
    await write();
  } catch (e) {
    throw refusedByStripe(e) ? new CardWriteRefused(e instanceof Error ? e.message : "Stripe refused the write") : e;
  }
};

/** Stripe as the card comparison's seam. */
export function stripeCards(s: Stripe): CardStripe {
  return {
    async cardState(customer) {
      // A customer this key cannot see is one nothing here can charge: deleted, or a test-mode customer on the live key.
      const found = await s.customers.retrieve(customer, {}, CARD_READ).catch((e: unknown) => {
        if (e instanceof Stripe.errors.StripeError && e.statusCode === 404) return null;
        throw e;
      });
      if (!found || found.deleted) return { gone: true, customerDefault: null, plans: [] };
      const subscriptions = await customerSubscriptions(s, customer, CARD_READ);
      return { gone: false, customerDefault: idOf(found.invoice_settings?.default_payment_method), plans: subscriptions.map(planCard) };
    },
    setSubscriptionCard: (subscription, card) => writing(() => s.subscriptions.update(subscription, { default_payment_method: card }, CARD_WRITE)),
    setCustomerCard: (customer, card) => writing(() => s.customers.update(customer, { invoice_settings: { default_payment_method: card } }, CARD_WRITE)),
  };
}
