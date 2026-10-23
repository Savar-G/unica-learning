// Single source for brand and offer facts. The brand name is decided: "Unica Learning" (Savar, 2026-10-08).
export const BRAND = "Unica Learning";

// One plan for now: math only (Savar, 2026-10-11). Reading comes back later. Stored rows can still say "both".
export const PLANS = {
  one: { id: "one", name: "Math", price: 79.99, note: "Grades 1-7, ages 6-12" },
} as const;

export type PlanId = keyof typeof PLANS;

/**
 * #190 (D-116) switch: whether the child is offered the optional extra round, during the test and again from the report.
 * Off (Cedric, 2026-10-22): an optional "8 more questions?" made the test feel unsure of its own result, so every child
 * gets one set length. The round's code and data stay, so turning this back on restores it.
 */
export const EXTRA_ROUND_OFFERED = false;

/**
 * Free trial (2026-10-23): the first 14 days, counted from when the first workbook ships, are free; the card is charged
 * on day 14, after a reminder email a few days before. It replaces the 30-day money-back guarantee.
 */
export const TRIAL_DAYS = 14;

/** First-month offer: CAD 50 for the first month, then the full price (Cedric and Savar, 2026-10-23; was 30% off, D-091). */
export const FIRST_MONTH_PRICE = 50;

/** The first month's price for a monthly price: the offer, never more than the price itself. */
export const firstMonth = (price: number) => Math.min(price, FIRST_MONTH_PRICE);

/** A CAD amount as the site writes it: whole dollars without cents ("50"), otherwise two decimals ("79.99"). */
export const cad = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** The price with the offer, for alerts and Stripe descriptions: "CAD 79.99/month, first month CAD 50". */
export const priceWithOffer = (price: number) => `CAD ${cad(price)}/month, first month CAD ${cad(firstMonth(price))}`;

// Plain words first (Oct 2026): a parent reading in her second language took the "same box" headline for an online
// program. The headline names the struggle (the topic rotates, sections.tsx) and what Unica does; the lead says how.
export const HERO = {
  kicker: "A personalized math program for ages 6-12.",
  title: "Unica meets your child",
  highlight: "at their level,",
  after: "and takes them further.",
  // The lead opens with the rotating topic in sections.tsx: "Miss [topic] once and ..."
  lead: "once and every lesson after it gets harder. Unica gives your child a workbook built for where they are.",
};
