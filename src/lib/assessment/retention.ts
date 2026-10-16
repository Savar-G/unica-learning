// The retention rules (#191, spec #181; updates D-085). Pure: the worker reads Stripe and the database, then asks
// this module what to do. The same rules run twice: before a family is frozen (read only, also in dry mode), and
// again with fresh reads after the freeze. Only the second answer can start a deletion.

/** One Stripe subscription. `endedAt` is Stripe's `ended_at` as ISO, or null. */
export interface SubscriptionFact { status: string; endedAt: string | null }

/** What Stripe holds for one customer of the family, plus the site's record of a saved card for that customer. */
export interface CustomerPayments {
  /** A card is saved: on the site's record, as a payment method, or through a finished Checkout. */
  savedCard: boolean;
  /** Every subscription of the customer, in any status. */
  subscriptions: SubscriptionFact[];
}

/** A booking tied to the confirmed account email. Stripe must also match the booking reference. */
export interface BookingLink { email: string; ref: string }

/** A report card setup or an old booking. A null booking link is unresolved and must keep the family. */
export interface FamilyCard { customer: string | null; saved: boolean; booking?: BookingLink | null }

/** A family as the database knows it, before Stripe is asked. */
export interface RetentionFamily {
  cards: FamilyCard[];
  /** The latest test activity across all the family's children (ISO), or null when no child started a test. */
  lastTestAt: string | null;
}

export interface RetentionFacts {
  /** The latest test activity across all the family's children (ISO), or null when no child started a test. */
  lastTestAt: string | null;
  /** One entry per Stripe customer of the family; empty when Stripe has nothing. "unknown" when Stripe did not answer. */
  payments: CustomerPayments[] | "unknown";
}

export type RetentionDecision =
  | { action: "delete"; rule: "free_test" }
  /** `endedAt`: the latest subscription end in Stripe, which the database checks again before the freeze. */
  | { action: "delete"; rule: "former_customer"; endedAt: string }
  /** Customer: a live subscription, or a saved card that waits for the first workbook. Others: their deadline is later. */
  | { action: "keep"; reason: "customer" | "former_customer" | "free_test" | "no_test" }
  | { action: "unknown" };

const UNKNOWN: RetentionDecision = { action: "unknown" };
/** Stripe statuses after which a subscription can never charge again. */
const ENDED = "canceled";
/** The first payment failed and the subscription never started: it does not make the family a customer or a former one. */
const NEVER_STARTED = "incomplete_expired";
/** Every status that can still charge. A status Stripe adds later is unknown, so the family is kept. */
const LIVE = new Set(["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]);

/** Calendar months in UTC. A day that the target month does not have becomes its last day (31 August + 6 = 28 February). */
export function addUtcMonths(time: number, months: number): number {
  const d = new Date(time);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, days));
  return d.getTime();
}

const time = (iso: string | null) => (iso === null ? null : Date.parse(iso));

/**
 * The decision for one family that is not in the deletion queue. Any doubt keeps the family:
 * - Stripe did not answer, a status is new, an end date is missing, or a date does not parse: unknown.
 * - A live subscription, or a saved card with no subscription yet: a customer, kept.
 * - Only ended subscriptions: a former customer, deleted 6 months after the latest end, including with later tests.
 * - Nothing in Stripe and no saved card: a free-test family, deleted 12 months after the latest test activity.
 */
export function retentionDecision(facts: RetentionFacts, now: number): RetentionDecision {
  if (facts.payments === "unknown") return UNKNOWN;
  let ended: number | null = null;
  let endedAt = "";
  let customer = false, doubt = false;
  for (const payments of facts.payments) {
    const counted = payments.subscriptions.filter((s) => s.status !== NEVER_STARTED);
    for (const s of counted) {
      if (LIVE.has(s.status)) { customer = true; continue; }
      const end = time(s.endedAt);
      if (s.status !== ENDED || end === null || !Number.isFinite(end)) { doubt = true; continue; }
      if (ended === null || end > ended) { ended = end; endedAt = new Date(end).toISOString(); }
    }
    if (counted.length === 0 && payments.savedCard) customer = true;
  }
  // A customer is certain whatever else Stripe holds, so the family is kept (and not left frozen as unknown).
  if (customer) return { action: "keep", reason: "customer" };
  const lastTest = time(facts.lastTestAt);
  if (doubt || !Number.isFinite(now) || (lastTest !== null && !Number.isFinite(lastTest))) return UNKNOWN;
  if (ended !== null) {
    const due = addUtcMonths(ended, 6);
    return now >= due ? { action: "delete", rule: "former_customer", endedAt } : { action: "keep", reason: "former_customer" };
  }
  if (lastTest === null) return { action: "keep", reason: "no_test" };
  return now >= addUtcMonths(lastTest, 12) ? { action: "delete", rule: "free_test" } : { action: "keep", reason: "free_test" };
}
