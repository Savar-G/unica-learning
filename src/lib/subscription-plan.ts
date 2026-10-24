// The paid plan a saved card starts when the first workbook ships (D-139): a monthly Stripe subscription with the free
// first month (a trial), then the full price each month. Pure, so its numbers are tested; stripe.ts sends it.
import { PLANS, TRIAL_DAYS, type PlanId } from "@/lib/site";

/** The one Stripe product every plan's price belongs to; created on first use. */
export const PLAN_PRODUCT = { id: "unica_math", name: "Unica Learning math program" } as const;

export interface PlanTerms {
  /** The monthly price, in cents. */
  monthlyCents: number;
  trialDays: number;
}

const cents = (dollars: number) => Math.round(dollars * 100);

/**
 * The monthly price a saved card's plan starts at: the price the card was saved for, or today's price for that plan when
 * it is lower (2026-10-24). A card saved under an older offer (CAD 99) gets today's CAD 79.99, and a later price rise
 * never raises what a family agreed to.
 */
export function planPrice(saved: number, plan: string): number {
  const current = Object.hasOwn(PLANS, plan) ? PLANS[plan as PlanId].price : null;
  return current !== null && current < saved ? current : saved;
}

/** The subscription terms for a monthly price: the free first month, then the full price. */
export function planTerms(price: number): PlanTerms {
  return { monthlyCents: cents(price), trialDays: TRIAL_DAYS };
}

/** The day the trial ends and the first charge is made, from the start time. */
export const firstChargeAt = (start: Date, trialDays = TRIAL_DAYS) => new Date(start.getTime() + trialDays * 86_400_000);
