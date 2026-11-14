// Single source for brand and offer facts. The brand name is decided: "Unica Learning" (Savar, 2026-10-08).
export const BRAND = "Unica Learning";

// Social profiles: the footer icons and the Organization `sameAs` read from here. Order is display order.
export const SOCIAL_LINKS = [
  { id: "instagram", label: "Instagram", href: "https://www.instagram.com/unicalearning/" },
  { id: "facebook", label: "Facebook", href: "https://www.facebook.com/profile.php?id=61595239304716" },
  { id: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/company/unica-learning/" },
] as const;

// One plan for now: math only (Savar, 2026-10-11). Reading comes back later. Stored rows can still say "both".
// The price also lives in SQL, as cents literals (7999 and 5999) in the family plan functions: a price change here alone
// would be capped by the database with no error. Change both; src/lib/plan-price-sql.test.ts fails when they differ.
export const PLANS = {
  one: { id: "one", name: "Math", price: 79.99, note: "K to Grade 9, ages 5 to 14" },
} as const;

/** Monthly price for every child after the first on the same family plan. Also in SQL as 5999: see PLANS above. */
export const ADDITIONAL_CHILD_PRICE = 59.99;

export type PlanId = keyof typeof PLANS;

/**
 * Free first month (Cedric, 2026-10-24; was 2 free weeks then CAD 50 for the first month, 2026-10-23): the first 30 days,
 * counted from when the first workbook arrives at your home, are free; the card is charged the full price on day 30, after Stripe's reminder
 * email 7 days before, then every month. It replaces the 30-day money-back guarantee.
 */
export const TRIAL_DAYS = 30;

/**
 * End of the free-month offer (Cedric, 2026-10-26), shown in pricing as a limited-time offer. Keep it true: end the
 * free month on this date, or change the date here (and on the ads) before it passes.
 */
export const OFFER_ENDS = "Nov 30";

/** A CAD amount as the site writes it: whole dollars without cents ("99"), otherwise two decimals ("79.99"). */
export const cad = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** The price with the offer, for alerts and Stripe descriptions: "CAD 79.99/month, first month free". */
export const priceWithOffer = (price: number) => `CAD ${cad(price)}/month, first month free`;

// Plain words first (Oct 2026): a parent reading in her second language took the "same box" headline for an online
// program. The headline says what Unica does; the lead names the struggle and says how (D-215: plain lead, no topic chip).
// D-318: the headline names the product and the subject ("personalized math program"), the words parents search for;
// the kicker gives the ages and grades instead.
// D-321: the lead says what Unica does (paper workbook, phone-scan marking, AI Teaching Assistant).
// D-340: the headline names an outcome ("made for your child to excel"), with "your child" and "excel." both marked, and the lead keeps only the three core facts.
export const HERO = {
  kicker: "For ages 5 to 14, Kindergarten to Grade 9.",
  title: "A personalized math program made for",
  child: "your child",
  join: "to",
  highlight: "excel.",
  lead: "Unica mails you paper workbooks. You scan the pages with your phone, we mark them, and an AI Teaching Assistant helps when they're stuck.",
};
