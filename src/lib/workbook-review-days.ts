// This module is used only by the review sample script. Real workbook plans never call it.
import type { WorkbookPlan } from "@/lib/workbook-plan";

export function reviewDays(plan: WorkbookPlan, selected?: string): WorkbookPlan {
  if (selected === undefined) return plan;
  const days = selected.split(",").map(Number);
  if (!days.length || days.some(d => !Number.isInteger(d) || d < 1 || d > 10) || new Set(days).size !== days.length)
    throw new Error("Review days must be different day numbers from 1 to 10.");
  if (days.some(d => !plan.days.some(p => p.day === d))) throw new Error("A review day is absent from the plan.");
  return { ...plan, days: plan.days.filter(d => days.includes(d.day)) };
}
