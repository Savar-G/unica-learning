import { describe, expect, it } from "vitest";
import { cad, firstMonth, priceWithOffer } from "@/lib/site";

describe("the first-month offer (D-091)", () => {
  it("takes 30% off the first month, to the cent", () => {
    expect(firstMonth(99)).toBe(69.3);
    expect(firstMonth(139)).toBe(97.3);
  });
  it("writes whole dollars without cents and other amounts with two decimals", () => {
    expect(cad(99)).toBe("99");
    expect(cad(69.3)).toBe("69.30");
  });
  it("states both prices for alerts and Stripe", () => {
    expect(priceWithOffer(99)).toBe("CAD 99/month, first month CAD 69.30 (30% off)");
  });
});
