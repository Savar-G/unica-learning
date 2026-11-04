// What a parent sees about one child's plan, from the plan's Stripe subscriptions. Pure, so every state is tested.

/** The Stripe fields the parent's plan page uses. Times are Unix seconds. */
export interface PlanSubscription {
  status: string;
  cancelAtPeriodEnd: boolean;
  trialEnd: number | null;
  periodEnd: number | null;
  /** The monthly price, in cents. */
  cents: number | null;
  created: number;
}

export type ParentPlan =
  /** A saved card, and the free month has not started. */
  | { kind: "not_started" }
  | { kind: "free_month"; firstCharge: string; monthly: number | null }
  | { kind: "paying"; nextCharge: string | null; monthly: number | null }
  /** A payment failed, and Stripe is trying the card again. */
  | { kind: "payment_failed" }
  /** Cancelled, and running to the end of the month. `free` means that no charge was ever made. */
  | { kind: "ending"; endsOn: string | null; free: boolean }
  | { kind: "ended" }
  /** Stripe did not answer. */
  | { kind: "unknown" };

const iso = (seconds: number | null) => (seconds ? new Date(seconds * 1000).toISOString() : null);
const dollars = (cents: number | null) => (cents === null ? null : cents / 100);

/** The Stripe statuses of a plan that can still charge the card. `canceled` and `incomplete_expired` are over. */
export const RUNNING_PLAN: ReadonlySet<string> = new Set(["trialing", "active", "past_due", "unpaid", "paused", "incomplete"]);

export function parentPlan(subscriptions: readonly PlanSubscription[]): ParentPlan {
  if (subscriptions.length === 0) return { kind: "not_started" };
  const running = subscriptions.filter((s) => RUNNING_PLAN.has(s.status)).sort((a, b) => b.created - a.created)[0];
  if (!running) return { kind: "ended" };
  const free = running.status === "trialing";
  const end = free ? running.trialEnd : running.periodEnd;
  if ((free || running.status === "active") && running.cancelAtPeriodEnd) return { kind: "ending", endsOn: iso(end), free };
  if (free && end) return { kind: "free_month", firstCharge: iso(end)!, monthly: dollars(running.cents) };
  if (running.status === "active") return { kind: "paying", nextCharge: iso(end), monthly: dollars(running.cents) };
  return { kind: "payment_failed" };
}

/** Only these states have a plan the cancel button can stop. */
export const canCancel = (plan: ParentPlan) => plan.kind === "free_month" || plan.kind === "paying" || plan.kind === "payment_failed";
