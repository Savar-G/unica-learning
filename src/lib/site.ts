// Single source for brand and offer facts. The brand name is decided: "Unica Learning" (Savar, 2026-10-08).
export const BRAND = "Unica Learning";

export const PLANS = {
  one: { id: "one", name: "One subject", price: 59, note: "Math or reading" },
  both: { id: "both", name: "Math + Reading", price: 99, note: "Both subjects, one plan" },
} as const;

export type PlanId = keyof typeof PLANS;

export const HERO = {
  kicker: "Same grade. Different levels. Different pace.",
  lead: "Every child learns at a different level and a different pace. So every Unica workbook is made for one child: yours. Math and reading, mailed home, and each new book starts where your child needs it.",
};
