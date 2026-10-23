// Single source for brand and offer facts. The brand name is decided: "Unica Learning" (Savar, 2026-10-08).
export const BRAND = "Unica Learning";

// One plan for now: math only (Savar, 2026-10-11). Reading comes back later. Stored rows can still say "both".
export const PLANS = {
  one: { id: "one", name: "Math", price: 99, note: "Grades 1-7, ages 6-12" },
} as const;

export type PlanId = keyof typeof PLANS;

/**
 * #190 (D-116) switch: whether the child is offered the optional extra round, during the test and again from the report.
 * Off (Cedric, 2026-10-22): an optional "8 more questions?" made the test feel unsure of its own result, so every child
 * gets one set length. The round's code and data stay, so turning this back on restores it.
 */
export const EXTRA_ROUND_OFFERED = false;

/** First-month offer: 30% off the first month, then the full price (Savar, 2026-10-11, D-091). */
export const FIRST_MONTH_OFF = 30;

/** The first month's price for a monthly price, rounded to the cent: 99 -> 69.3. */
export const firstMonth = (price: number) => Math.round(price * (100 - FIRST_MONTH_OFF)) / 100;

/** A CAD amount as the site writes it: whole dollars without cents ("99"), otherwise two decimals ("69.30"). */
export const cad = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** The price with the offer, for alerts and Stripe descriptions: "CAD 99/month, first month CAD 69.30 (30% off)". */
export const priceWithOffer = (price: number) => `CAD ${price}/month, first month CAD ${cad(firstMonth(price))} (${FIRST_MONTH_OFF}% off)`;

// Plain words first (Oct 2026): a parent reading in her second language took the "same box" headline for an online
// program. The headline names the struggle (the topic rotates, sections.tsx) and what Unica does; the lead says how.
export const HERO = {
  title: "Math gets harder when practice doesn't fit. Unica builds a program",
  highlight: "around your child.",
  // The lead opens with the rotating topic in sections.tsx: "From [topic] to long division, ..."
  lead: "a free online test finds the gaps. A new paper workbook follows every two weeks.",
};
