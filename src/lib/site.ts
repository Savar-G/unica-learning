// Single source for brand and offer facts. The brand name is decided: "Unica Learning" (Savar, 2026-10-08).
export const BRAND = "Unica Learning";

export const PLANS = {
  one: { id: "one", name: "One subject", price: 59, note: "Math or reading" },
  both: { id: "both", name: "Math + Reading", price: 99, note: "Both subjects, one plan" },
} as const;

export type PlanId = keyof typeof PLANS;

export const HERO = {
  eyebrow: "The future of learning is on paper.",
  sub: "Math and reading workbooks made for your child, mailed home, and adapted after every book.",
};
