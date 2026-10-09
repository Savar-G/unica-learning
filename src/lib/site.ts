// Single source for brand and offer facts. The brand name is decided: "Unica Learning" (Savar, 2026-10-08).
export const BRAND = "Unica Learning";

export const PLANS = {
  one: { id: "one", name: "One subject", price: 59, note: "Math or reading" },
  both: { id: "both", name: "Math + Reading", price: 99, note: "Both subjects, one plan" },
} as const;

export type PlanId = keyof typeof PLANS;

export const HERO = {
  kicker: "Math and reading workbooks, ages 6-12",
  title: "Your child isn't",
  highlight: "a grade level.",
  lead: "Kids in the same grade are at different levels, move at different speeds, and learn in different ways. So every Unica workbook is made for one child: built around their level, pace, and learning style, then printed and mailed home.",
};
