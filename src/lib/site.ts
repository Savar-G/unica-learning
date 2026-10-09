// Single source for brand and offer facts. The brand name is decided: "Unica Learning" (Savar, 2026-10-08).
export const BRAND = "Unica Learning";

export const PLANS = {
  one: { id: "one", name: "One subject", price: 59, note: "Math or reading" },
  both: { id: "both", name: "Math + Reading", price: 99, note: "Both subjects, one plan" },
} as const;

export type PlanId = keyof typeof PLANS;

export const HERO = {
  kicker: "Personalized math and reading workbooks, mailed home. Ages 6-12.",
  title: "Schools and tutoring programs put every child in",
  highlight: "the same box.",
  // The lead is JSX in sections.tsx: it carries the rotating topic word.
};
