import { describe, expect, it } from "vitest";
import { cleanDetails, cleanParent } from "@/lib/account";

const details = { name: " Priya Shah ", postal: "v6b1a1", source: { utm_source: "flyer" } };

describe("cleanParent: email and password signup", () => {
  it("needs a password of at least 8 characters", () => {
    expect(cleanParent({ ...details, email: "P@x.ca", password: "1234567" })).toBeNull();
    expect(cleanParent({ ...details, email: "P@x.ca", password: "12345678" })).toMatchObject({ email: "p@x.ca", password: "12345678" });
  });
});

describe("cleanDetails: finishing an account made with Google", () => {
  it("cleans the name, postal code and source, and needs no password or email", () => {
    expect(cleanDetails(details)).toEqual({ name: "Priya Shah", postal: "V6B1A1", source: { utm_source: "flyer" } });
  });
  it("rejects a short name or a postal code outside Canada", () => {
    expect(cleanDetails({ ...details, name: "P" })).toBeNull();
    expect(cleanDetails({ ...details, postal: "90210" })).toBeNull();
  });
});
