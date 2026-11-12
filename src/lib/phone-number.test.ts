import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/phone-number";

describe("phone numbers", () => {
  it.each([["(604) 555-0123", "+16045550123"], ["+1 212 555 0123", "+12125550123"]])("normalizes %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
  it.each(["604", "1234567890", "+44 20 7946 0958", "604 555 0123 ext 4", "+1 604 555 0123 x4", "call 6045550123", ""]) ("rejects %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});
