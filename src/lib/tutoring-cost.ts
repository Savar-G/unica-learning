export type TutoringCostInput = { hourlyRate: number; hoursPerWeek: number; weeks: number; extraFees: number };

/** One child's quote over the selected weeks. Fees apply once, not once per week. */
export function tutoringCost({ hourlyRate, hoursPerWeek, weeks, extraFees }: TutoringCostInput): { lessons: number; total: number } | null {
  if (![hourlyRate, hoursPerWeek, weeks, extraFees].every(Number.isFinite)
    || hourlyRate < 0 || hourlyRate > 1000 || hoursPerWeek < 0.25 || hoursPerWeek > 40 || !Number.isInteger(hoursPerWeek * 4)
    || !Number.isInteger(weeks) || weeks < 1 || weeks > 52 || extraFees < 0 || extraFees > 10000
    || Math.round(hourlyRate * 100) / 100 !== hourlyRate || Math.round(extraFees * 100) / 100 !== extraFees) return null;
  const lessons = Math.round(Math.round(hourlyRate * 100) * hoursPerWeek * weeks);
  return { lessons: lessons / 100, total: (lessons + Math.round(extraFees * 100)) / 100 };
}
