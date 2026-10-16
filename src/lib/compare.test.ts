import { describe, expect, it } from "vitest";
import { COMPARE_FAQ, COST, ONE_BY_ONE, OPTIONS, ROWS } from "@/lib/compare";
import { BRAND, PLANS } from "@/lib/site";

// The comparison names categories, never a competitor (D-064), and makes no claim about anyone's results.
const allText = () =>
  JSON.stringify([OPTIONS, ROWS, COST, ONE_BY_ONE, COMPARE_FAQ]);

describe("the comparison (home table and /compare)", () => {
  it("names no competitor brand", () => {
    expect(allText()).not.toMatch(/kumon|mathnasium|oxford|sylvan|ixl|prodigy|khan|mathletics|cuemath|thinkster|eye level|spirit of math/i);
  });

  it("makes no performance claim", () => {
    expect(allText()).not.toMatch(/better results|improve[sd]? (grades|scores)|proven|guaranteed results|\d+%/i);
  });

  it("fills every row for every option, with ours last", () => {
    expect(OPTIONS.at(-1)).toEqual({ id: "us", name: BRAND, short: BRAND });
    for (const row of ROWS) for (const o of OPTIONS) expect(row.cells[o.id][1].length).toBeGreaterThan(0);
  });

  it("shows our live plan price", () => {
    expect(COST.us[0]).toBe(`CAD ${PLANS.one.price}`);
  });

  it("has one block per other option", () => {
    expect(ONE_BY_ONE.map((o) => o.id)).toEqual(OPTIONS.filter((o) => o.id !== "us").map((o) => o.id));
  });
});
