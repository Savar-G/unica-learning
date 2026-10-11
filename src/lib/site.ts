// Single source for brand and offer facts. The brand name is decided: "Unica Learning" (Savar, 2026-10-08).
export const BRAND = "Unica Learning";

export const PLANS = {
  one: { id: "one", name: "One subject", price: 139, note: "Math or reading" },
  both: { id: "both", name: "Math + Reading", price: 229, note: "Both subjects, one plan" },
} as const;

export type PlanId = keyof typeof PLANS;

export const HERO = {
  kicker: "A personalized math and reading learning program for ages 6-12.",
  title: "Schools and tutoring programs put every child in",
  highlight: "the same box.",
  // The lead is JSX in sections.tsx: it carries the rotating topic word.
};
