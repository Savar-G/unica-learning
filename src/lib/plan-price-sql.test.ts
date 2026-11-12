import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADDITIONAL_CHILD_PRICE, PLANS } from "@/lib/site";

// The plan prices live twice: in src/lib/site.ts (dollars) and as cents literals in the family plan SQL functions, which
// cap a charge at the price. A price change in TypeScript alone would be capped by the database with no error.
// IF THIS TEST FAILS: change the price in BOTH places. Write a new additive migration that replaces the family plan
// functions with the new cents, and update FILES to the migrations that now hold the live definitions.
const FILES = [
  "20261109032547_family_plan_pricing.sql",
  "20261109041204_family_plan_history_admission.sql",
  "20261109042134_family_plan_legacy_window.sql",
  "20261109054614_family_plan_legacy_settlement.sql",
  "20261109055004_family_plan_offer.sql",
];
const cents = (dollars: number) => Math.round(dollars * 100);
const literals = (file: string) => [...readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8").matchAll(/\b(?:then|else)\s+(\d{4,5})\b/g)].map((m) => Number(m[1]));

describe("plan prices in SQL match src/lib/site.ts", () => {
  const first = cents(PLANS.one.price), sibling = cents(ADDITIONAL_CHILD_PRICE);
  it("holds the cents of the first child and of each later child", () => {
    expect([first, sibling]).toEqual([7999, 5999]);
  });
  for (const file of FILES) {
    it(`${file} has only those cents literals, both of them`, () => {
      const found = literals(file);
      expect(found.length).toBeGreaterThan(0);
      expect(new Set(found)).toEqual(new Set([first, sibling]));
    });
  }
});
