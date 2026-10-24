import { describe, expect, it } from "vitest";
import { firstChargeAt, planTerms } from "@/lib/subscription-plan";

describe("the plan a saved card starts when the first workbook ships (D-139)", () => {
  it("charges the full CAD 79.99 a month after a free first month of 30 days", () => {
    expect(planTerms(79.99)).toEqual({ monthlyCents: 7999, trialDays: 30 });
  });
  it("keeps an older card's price", () => {
    expect(planTerms(99)).toEqual({ monthlyCents: 9900, trialDays: 30 });
  });
  it("makes the first charge 30 days after the start", () => {
    expect(firstChargeAt(new Date("2026-10-23T18:00:00Z")).toISOString()).toBe("2026-11-22T18:00:00.000Z");
  });
});
