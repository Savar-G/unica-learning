import "server-only";
import type Stripe from "stripe";
import type { CustomerPayments, SubscriptionFact } from "@/lib/assessment";

// Read-only Stripe facts for the retention rules (#191). The restricted key `unica-retention-worker` reads Checkout
// Sessions, Payment Methods and Subscriptions. These reads change nothing, so dry mode can use them too.

type Options = () => Stripe.RequestOptions;

/** More subscriptions than this on one customer is not a state the rules know: the read fails, so the family stays. */
const SUBSCRIPTION_PAGES = 10;

const customerOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : value?.id ?? null);

async function subscriptionsOf(s: Stripe, customer: string, options: Options): Promise<SubscriptionFact[]> {
  const facts: SubscriptionFact[] = [];
  let after: string | undefined;
  for (let page = 0; page < SUBSCRIPTION_PAGES; page++) {
    const list = await s.subscriptions.list({ customer, status: "all", limit: 100, starting_after: after }, options());
    for (const sub of list.data) {
      if (customerOf(sub.customer) !== customer) throw new Error("Subscription scope changed");
      // Stripe's `ended_at`, in seconds. A canceled subscription without one is unknown to the rules.
      facts.push({ status: sub.status, endedAt: typeof sub.ended_at === "number" ? new Date(sub.ended_at * 1000).toISOString() : null });
    }
    if (!list.has_more) return facts;
    const next = list.data.at(-1)?.id;
    if (!next || next === after) throw new Error("Subscription pagination did not advance");
    after = next;
  }
  throw new Error("Too many subscriptions");
}

/**
 * What Stripe holds for one customer now: every subscription, and whether a card is saved (an attached payment
 * method, or a finished Checkout). Every started read is awaited; any failure rejects, which the rules treat as unknown.
 */
export async function readCustomerPayments(s: Stripe, customer: string, options: Options): Promise<CustomerPayments> {
  const [complete, methods, subscriptions] = await Promise.allSettled([
    (async () => s.checkout.sessions.list({ customer, status: "complete", limit: 1 }, options()))(),
    (async () => s.paymentMethods.list({ customer, limit: 1 }, options()))(),
    subscriptionsOf(s, customer, options),
  ]);
  if (complete.status === "rejected" || methods.status === "rejected" || subscriptions.status === "rejected") throw new Error("Payment read failed");
  if (complete.value.data.some((r) => customerOf(r.customer) !== customer) || methods.value.data.some((r) => customerOf(r.customer) !== customer)) {
    throw new Error("Payment scope changed");
  }
  return { savedCard: complete.value.data.length > 0 || methods.value.data.length > 0, subscriptions: subscriptions.value };
}

/** Authenticate the real live-mode key through the read permissions the rules need, before any claim. */
export async function verifyRetentionKey(s: Stripe): Promise<void> {
  const options = { timeout: 30_000, maxNetworkRetries: 0 };
  const [sessions, subscriptions] = await Promise.allSettled([
    (async () => s.checkout.sessions.list({ status: "open", limit: 1 }, options))(),
    (async () => s.subscriptions.list({ status: "all", limit: 1 }, options))(),
  ]);
  if (sessions.status === "rejected" || subscriptions.status === "rejected") throw Error("Worker provider unavailable");
  if ([...sessions.value.data, ...subscriptions.value.data].some((r) => r.livemode !== true)) throw Error("Worker provider mode unavailable");
}
