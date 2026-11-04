import { describe, expect, it } from "vitest";
import { commaNumbers } from "@/lib/workbook-template";
import { naturalTitle } from "@/lib/workbook-book";

describe("printed numbers and titles (Savar, 2026-11-03/04, D-230)", () => {
  it("prints every number of 1,000 and up with commas, a spaced number as one", () => {
    expect(commaNumbers("Omar has 10000 points and gives 4998 away.")).toBe("Omar has 10,000 points and gives 4,998 away.");
    expect(commaNumbers("The 3 in 83 175 is worth 300. 97 531, 1 000 000 and 999")).toBe("The 3 in 83,175 is worth 300. 97,531, 1,000,000 and 999");
    expect(commaNumbers("$1250.50, 3.1416, 10:30, 12 and 345")).toBe("$1,250.50, 3.1416, 10:30, 12 and 345");
  });
  it("reads a range title naturally, in 4 words at most", () => {
    expect(naturalTitle("Place value to 100 000")).toBe("Place value up to 100 000");
    expect(naturalTitle("Place value to millions")).toBe("Place value up to millions");
    expect(naturalTitle("Count on to 20")).toBe("Count on to 20");
    expect(naturalTitle("Number stories to 20")).toBe("Number stories up to 20");
    expect(naturalTitle("Add and subtract numbers to 20")).toBe("Add and subtract numbers to 20");
    expect(naturalTitle("Place value up to 100 000")).toBe("Place value up to 100 000");
  });
});
