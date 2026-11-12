import { describe, expect, it } from "vitest";
import { resultCopy } from "@/lib/booking-result";

// The thank-you states after the public launch (#82). The old booking dialog is gone, but its Stripe return URLs can
// still arrive. Each state keeps its own meaning; the next step is the free online math assessment at /start.

const text = (c: ReturnType<typeof resultCopy>) => `${c.title} ${c.lead}`;

describe("a card that Stripe confirmed", () => {
  it("from an old booking: says the card is saved and nothing was charged, then offers the online math assessment", () => {
    const c = resultCopy({ card: "saved", fromReport: false });
    expect(c.title).toBe("Your card is saved.");
    expect(c.lead).toMatch(/You have not been charged\./);
    expect(c.lead).toMatch(/free online math assessment/);
    expect(text(c)).not.toMatch(/arrange/);
    expect(c.next).toEqual({ href: "/start", label: "Take free assessment" });
  });

  it("from the report: goes back to the account and asks for no new assessment", () => {
    const c = resultCopy({ card: "saved", fromReport: true });
    expect(c.lead).toMatch(/report stays in your account/);
    expect(text(c)).not.toMatch(/assessment/);
    expect(c.next.href).toBe("/account");
  });
});

describe("a card that could not be checked", () => {
  it("claims nothing, sends the parent to support, and does not invite a second card attempt", () => {
    const c = resultCopy({ card: "unconfirmed", fromReport: false });
    expect(c.title).toBe("We could not check whether your card was added.");
    expect(c.support).toBe(true);
    expect(text(c)).not.toMatch(/saved|add your card|Add card/);
    expect(c.next.href).toBe("/");
  });
});

describe("an old booking's card page, cancelled", () => {
  it("says no card was added and nothing was charged, and offers the assessment instead of the plan form", () => {
    const c = resultCopy({ card: "cancelled", fromReport: false });
    expect(c.title).toBe("Your card was not added.");
    expect(c.lead).toMatch(/Nothing was charged\./);
    expect(text(c)).not.toMatch(/saved|plan/);
    expect(c.next).toEqual({ href: "/start", label: "Take free assessment" });
  });
});

describe("a visit with no card return", () => {
  it("invents no success", () => {
    const c = resultCopy({ card: null, fromReport: false });
    expect(c.title).toBe("Thank you for your interest.");
    expect(text(c)).not.toMatch(/saved|received|waitlist/);
    expect(c.next.href).toBe("/start");
  });
});
