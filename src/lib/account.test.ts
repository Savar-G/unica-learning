import { describe, expect, it } from "vitest";
import { cleanDetails, signInFailure } from "@/lib/account";

const details = { name: " Priya Shah ", postal: "v6b1a1", source: { utm_source: "flyer" } };

describe("cleanDetails: finishing an account made with Google", () => {
  it("cleans the name, postal code and source, and needs no password or email", () => {
    expect(cleanDetails(details)).toEqual({ name: "Priya Shah", postal: "V6B1A1", source: { utm_source: "flyer" } });
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
