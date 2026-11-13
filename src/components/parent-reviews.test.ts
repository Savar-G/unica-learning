import { describe, expect, it } from "vitest";
import { PARENT_REVIEWS } from "./parent-reviews";

// D-338: the home page names no competitor brand (D-074) and shows no star ratings or counts.
describe("parent reviews", () => {
  it("names no competitor brand", () => {
    for (const { quote } of PARENT_REVIEWS) expect(quote).not.toMatch(/kumon|mathnasium|sylvan|oxford learning|ixl|prodigy/i);
  });
  it("labels each quote by role only", () => {
    for (const { who } of PARENT_REVIEWS) expect(who).toMatch(/^(Mom|Parent|Aunt)\b/);
  });
  it("keeps the same-age line last", () => {
    expect(PARENT_REVIEWS.at(-1)?.quote).toBe("Same age doesn't always mean same level.");
  });
});
