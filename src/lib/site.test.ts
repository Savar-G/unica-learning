import { describe, expect, it } from "vitest";
import { cad, firstMonth, priceWithOffer } from "@/lib/site";

describe("the first-month offer (2026-10-23, was D-091)", () => {
  it("charges CAD 50 for the first month, never more than the monthly price", () => {
    expect(firstMonth(79.99)).toBe(50);
    expect(firstMonth(40)).toBe(40);
  });
  it("writes whole dollars without cents and other amounts with two decimals", () => {
    expect(cad(50)).toBe("50");
    expect(cad(79.99)).toBe("79.99");
    expect(cad(69.3)).toBe("69.30");
  });
  it("states both prices for alerts and Stripe", () => {
    expect(priceWithOffer(79.99)).toBe("CAD 79.99/month, first month CAD 50");
  });
});
