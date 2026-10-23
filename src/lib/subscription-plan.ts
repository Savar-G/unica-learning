// The paid plan a saved card starts when the first workbook ships (D-139): a monthly Stripe subscription with the free
// trial, then the first month at the offer price, then the full price. Pure, so its numbers are tested; stripe.ts sends it.
import { FIRST_MONTH_PRICE, TRIAL_DAYS, firstMonth } from "@/lib/site";

/** The one Stripe product every plan's price belongs to; created on first use. */
export const PLAN_PRODUCT = { id: "unica_math", name: "Unica Learning math program" } as const;

export interface PlanTerms {
  /** The monthly price, in cents. */
  monthlyCents: number;
  trialDays: number;
  /** Taken off the first paid month, in cents; 0 when the price is not above the offer. */
  firstMonthOffCents: number;
  /** The coupon's id, the same for every family on this price, so it is created once. */
  couponId: string | null;
}

const cents = (dollars: number) => Math.round(dollars * 100);

/**
 * The subscription terms for a monthly price. The coupon runs for one month from the start: the trial's free invoice
 * comes inside that month, and so does the first paid invoice on day `trialDays`, so only that one is discounted.
 */
export function planTerms(price: number): PlanTerms {
  const off = cents(price) - cents(firstMonth(price));
  return {
    monthlyCents: cents(price),
    trialDays: TRIAL_DAYS,
    firstMonthOffCents: off,
    couponId: off > 0 ? `unica_first_month_${cents(FIRST_MONTH_PRICE)}_of_${cents(price)}` : null,
  };
}

/** The day the trial ends and the first charge is made, from the start time. */
export const firstChargeAt = (start: Date, trialDays = TRIAL_DAYS) => new Date(start.getTime() + trialDays * 86_400_000);
