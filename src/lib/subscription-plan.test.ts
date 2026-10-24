import { describe, expect, it } from "vitest";
import { firstChargeAt, planPrice, planTerms } from "@/lib/subscription-plan";

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

describe("the monthly price a saved card's plan starts at", () => {
  it("is today's CAD 79.99 for a card saved at the new price", () => {
    expect(planPrice(79.99, "one")).toBe(79.99);
  });
  it("is today's lower price for a card saved under an older offer", () => {
    expect(planPrice(99, "one")).toBe(79.99);
  });
  it("never goes above the price the card was saved for", () => {
    expect(planPrice(59, "one")).toBe(59);
  });
  it("keeps the saved price of a plan that is no longer offered", () => {
    expect(planPrice(229, "both")).toBe(229);
  });
});
