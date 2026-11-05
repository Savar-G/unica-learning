import "server-only";
import type Stripe from "stripe";
import { CARD_WRITE_MS } from "@/lib/card-lock";
import { RUNNING_PLAN } from "@/lib/parent-plan";

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

/** A Stripe read of a card or a plan while the card lock is held. */
export const CARD_READ: Stripe.RequestOptions = { timeout: 4000, maxNetworkRetries: 1 };
/** A Stripe write of a card while the card lock is held. One attempt, so its longest time is known: see card-lock.ts. */
export const CARD_WRITE: Stripe.RequestOptions = { timeout: CARD_WRITE_MS, maxNetworkRetries: 0 };

/**
 * The card becomes the Customer's default, which a later plan start uses, and the default of each subscription that can
 * still charge, read from the whole list first. `also` names a subscription just made, in case the list does not show it yet.
 * Only the card lock's holder calls this. `canWrite` is tested before each write: past it, this throws and writes nothing more.
 */
export async function writeCardDefault(s: Stripe, customer: string, paymentMethod: string, canWrite: () => boolean, also: readonly string[] = []): Promise<void> {
  const check = () => {
    if (!canWrite()) throw new Error("The card lock is about to end");
  };
  const subscriptions = await customerSubscriptions(s, customer, CARD_READ);
  check();
  await s.customers.update(customer, { invoice_settings: { default_payment_method: paymentMethod } }, CARD_WRITE);
  const running = subscriptions.filter((x) => RUNNING_PLAN.has(x.status)).map((x) => x.id);
  for (const id of new Set([...running, ...also])) {
    check();
    await s.subscriptions.update(id, { default_payment_method: paymentMethod }, CARD_WRITE);
  }
}
