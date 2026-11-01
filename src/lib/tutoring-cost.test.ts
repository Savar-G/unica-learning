import { describe, expect, it } from "vitest";
import { tutoringCost } from "@/lib/tutoring-cost";

const quote = { hourlyRate: 60, hoursPerWeek: 1, weeks: 4, extraFees: 0 };

describe("tutoring quote totals", () => {
  it("uses the selected weeks, including a five-week period", () => {
    expect(tutoringCost(quote)).toEqual({ lessons: 240, total: 240 });
    expect(tutoringCost({ ...quote, weeks: 5 })).toEqual({ lessons: 300, total: 300 });
  });
  it("adds fees once and handles quarter-hour lessons and cents", () => {
    expect(tutoringCost({ hourlyRate: 39.99, hoursPerWeek: 1.25, weeks: 3, extraFees: 25.5 })).toEqual({ lessons: 149.96, total: 175.46 });
  });
  it("allows free lessons without hiding fees", () => {
    expect(tutoringCost({ ...quote, hourlyRate: 0, extraFees: 10 })).toEqual({ lessons: 0, total: 10 });
  });
  it("handles the largest supported quote", () => {
    expect(tutoringCost({ hourlyRate: 1000, hoursPerWeek: 40, weeks: 52, extraFees: 10000 })).toEqual({ lessons: 2080000, total: 2090000 });
  });
  it("rejects fractional-cent money without rejecting valid cent amounts", () => {
    expect(tutoringCost({ ...quote, hourlyRate: 60.005, hoursPerWeek: 40, weeks: 52 })).toBeNull();
    expect(tutoringCost({ ...quote, extraFees: 25.505 })).toBeNull();
    for (const hourlyRate of [0.01, 0.07, 0.29, 1.01, 39.99, 79.99]) {
      expect(tutoringCost({ ...quote, hourlyRate, extraFees: 0.29 })).not.toBeNull();
    }
  });
  it("rejects invalid and incomplete numeric inputs", () => {
    for (const field of Object.keys(quote) as (keyof typeof quote)[]) {
      for (const bad of [NaN, Infinity, -Infinity, -1]) expect(tutoringCost({ ...quote, [field]: bad })).toBeNull();
    }
    for (const weeks of [0, 1.5, 53]) expect(tutoringCost({ ...quote, weeks })).toBeNull();
    for (const hoursPerWeek of [0, 0.1, 0.3, 1.3, 41]) expect(tutoringCost({ ...quote, hoursPerWeek })).toBeNull();
    expect(tutoringCost({ ...quote, hourlyRate: 1001 })).toBeNull();
    expect(tutoringCost({ ...quote, extraFees: 10001 })).toBeNull();
  });
});
