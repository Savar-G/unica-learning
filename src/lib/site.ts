// Single source for brand and offer facts. The brand name is decided: "Unica Learning" (Savar, 2026-10-08).
export const BRAND = "Unica Learning";

// One plan for now: math only (Savar, 2026-10-11). Reading comes back later. Stored rows can still say "both".
export const PLANS = {
  one: { id: "one", name: "Math", price: 99, note: "Grades 1-7, ages 6-12" },
} as const;

export type PlanId = keyof typeof PLANS;

/** First-month offer: 30% off the first month, then the full price (Savar, 2026-10-11, D-091). */
export const FIRST_MONTH_OFF = 30;

/** The first month's price for a monthly price, rounded to the cent: 99 -> 69.3. */
export const firstMonth = (price: number) => Math.round(price * (100 - FIRST_MONTH_OFF)) / 100;

/** A CAD amount as the site writes it: whole dollars without cents ("99"), otherwise two decimals ("69.30"). */
export const cad = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** The price with the offer, for alerts and Stripe descriptions: "CAD 99/month, first month CAD 69.30 (30% off)". */
export const priceWithOffer = (price: number) => `CAD ${price}/month, first month CAD ${cad(firstMonth(price))} (${FIRST_MONTH_OFF}% off)`;

export const HERO = {
  kicker: "A personalized math and reading learning program for ages 6-12.",
  title: "Schools and tutoring programs put every child in",
  highlight: "the same box.",
  // The lead is JSX in sections.tsx: it carries the rotating topic word.
};
