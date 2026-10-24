import { describe, expect, it } from "vitest";
import { TRIAL_DAYS, cad, priceWithOffer } from "@/lib/site";

describe("the offer: first month free (2026-10-24; was 2 free weeks and CAD 50, and before that D-091)", () => {
  it("gives the first 30 days free", () => {
    expect(TRIAL_DAYS).toBe(30);
  });
  it("writes whole dollars without cents and other amounts with two decimals", () => {
    expect(cad(50)).toBe("50");
    expect(cad(79.99)).toBe("79.99");
    expect(cad(69.3)).toBe("69.30");
  });
  it("states the price and the free month for alerts and Stripe", () => {
    expect(priceWithOffer(79.99)).toBe("CAD 79.99/month, first month free");
  });
});
