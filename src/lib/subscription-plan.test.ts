import { describe, expect, it } from "vitest";
import { firstChargeAt, planTerms } from "@/lib/subscription-plan";

describe("the plan a saved card starts when the first workbook ships (D-139)", () => {
  it("charges CAD 79.99 a month after a 14-day trial, with CAD 29.99 off the first paid month", () => {
    expect(planTerms(79.99)).toEqual({ monthlyCents: 7999, trialDays: 14, firstMonthOffCents: 2999, couponId: "unica_first_month_5000_of_7999" });
  });
  it("keeps an older card's price, with the same CAD 50 first month", () => {
    expect(planTerms(99)).toMatchObject({ monthlyCents: 9900, firstMonthOffCents: 4900, couponId: "unica_first_month_5000_of_9900" });
  });
  it("needs no coupon when the price is not above the offer", () => {
    expect(planTerms(40)).toMatchObject({ monthlyCents: 4000, firstMonthOffCents: 0, couponId: null });
  });
  it("makes the first charge 14 days after the start", () => {
    expect(firstChargeAt(new Date("2026-10-23T18:00:00Z")).toISOString()).toBe("2026-11-06T18:00:00.000Z");
  });
});
