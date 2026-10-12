import { describe, expect, it } from "vitest";
import { cleanDetails } from "@/lib/account";

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
