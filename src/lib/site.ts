// Single source for brand and offer facts. The brand name is decided: "Unica Learning" (Savar, 2026-10-08).
export const BRAND = "Unica Learning";

// One plan for now: math only (Savar, 2026-10-11). Reading comes back later. Stored rows can still say "both".
export const PLANS = {
  one: { id: "one", name: "Math", price: 99, note: "Grades 1-7, ages 6-12" },
} as const;

export type PlanId = keyof typeof PLANS;

export const HERO = {
  kicker: "A personalized math and reading learning program for ages 6-12.",
  title: "Schools and tutoring programs put every child in",
  highlight: "the same box.",
  // The lead is JSX in sections.tsx: it carries the rotating topic word.
};
