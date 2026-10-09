// Single source for brand and offer facts. The brand name is a placeholder (DESIGN.md D1).
export const BRAND = "Pagewise";

export const PLANS = {
  one: { id: "one", name: "One subject", price: 59, note: "Math or reading" },
  both: { id: "both", name: "Math + Reading", price: 99, note: "Both subjects, one plan" },
} as const;

export type PlanId = keyof typeof PLANS;

export const HERO = {
  subtitle: "Same grade. Different levels. Different pace.",
  lead: "Personalized math and reading workbooks, made for your child and matched to their level and gaps. Mailed home and adapted after every book.",
  // Kept for the page metadata description (src/lib/metadata.ts).
  sub: "Math and reading workbooks made for your child, mailed home, and adapted after every book.",
};
