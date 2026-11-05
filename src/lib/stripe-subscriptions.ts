import "server-only";
import type Stripe from "stripe";

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
