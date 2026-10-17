import { describe, expect, it } from "vitest";
import { cleanDetails, signInFailure } from "@/lib/account";

const details = { name: " Priya Shah ", postal: "v6b1a1", source: { utm_source: "flyer" } };

describe("cleanDetails: finishing an account made with Google", () => {
  it("cleans the name, postal code and source, and needs no password or email", () => {
    expect(cleanDetails(details)).toEqual({ name: "Priya Shah", postal: "V6B1A1", source: { utm_source: "flyer" } });
  });
  it("keeps only the known source keys, and a visit_id only when it is a random ID", () => {
    const source = {
      referrer: "https://www.facebook.com/", utm_source: "meta", utm_medium: "paid", utm_campaign: "oct", utm_content: "photo-led", ref: "x",
      gclid: "Cj0K", fbclid: "IwAR1", visit_id: "3F2B8C1E-9D4A-4F6B-8E2C-1A2B3C4D5E6F", email: "a@b.c", cta: "hero", junk: "y",
    };
    expect(cleanDetails({ ...details, source })?.source).toEqual({
      referrer: "https://www.facebook.com/", utm_source: "meta", utm_medium: "paid", utm_campaign: "oct", utm_content: "photo-led", ref: "x",
      gclid: "Cj0K", fbclid: "IwAR1", visit_id: "3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f",
    });
    expect(cleanDetails({ ...details, source: { utm_source: "meta", visit_id: "not-an-id" } })?.source).toEqual({ utm_source: "meta" });
    expect(cleanDetails({ ...details, source: { utm_source: "x".repeat(400), fbclid: 5 as unknown as string } })?.source).toEqual({ utm_source: "x".repeat(300) });
    expect(cleanDetails({ ...details, source: "nope" as unknown as Record<string, string> })?.source).toEqual({});
  });
  it("rejects a short name or a postal code outside Canada", () => {
    expect(cleanDetails({ ...details, name: "P" })).toBeNull();
    expect(cleanDetails({ ...details, postal: "90210" })).toBeNull();
  });
});

describe("signInFailure: what the sign-in form tells the parent", () => {
  it("treats a wrong password and an unknown email the same", () => {
    expect(signInFailure({ status: 400, code: "invalid_credentials" })).toBe("no_match");
    expect(signInFailure({ status: 400 })).toBe("no_match");
  });
  it("asks the parent to wait after too many tries", () => {
    expect(signInFailure({ status: 429, code: "over_request_rate_limit" })).toBe("too_many");
  });
  it("does not blame the password when Auth or the network fails", () => {
    expect(signInFailure({ status: 500, code: "unexpected_failure" })).toBe("unavailable");
    expect(signInFailure({ status: 0 })).toBe("unavailable");
  });
});
