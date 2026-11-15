import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUSINESS_NAME, MAILING_ADDRESS, SUPPORT_EMAIL, WEBSITE } from "@/lib/contact";
import { PAUSE_WEEKS_PER_YEAR } from "@/lib/plan-pause";
import { ADDITIONAL_CHILD_PRICE, BRAND, OFFER_ENDS, PLANS, TRIAL_DAYS, cad } from "@/lib/site";
import { planTerms } from "@/lib/subscription-plan";

// docs/facts.md is the list of true claims that agents may use in customer words. These tests bind its numbers and
// contact details to the code, so a price change fails here until the file matches, and they check that every
// claim row names a source and a date.

const ROOT = process.cwd();
const facts = readFileSync(join(ROOT, "docs", "facts.md"), "utf8");
const NEVER_SAY = "## Never say";
const claims = facts.slice(0, facts.indexOf(NEVER_SAY));

/** CAD amounts that may appear in the file: the two plan prices, and the low end of the BC learning centre range (D-114). */
const OTHER_CAD_AMOUNTS = ["170"];

describe("docs/facts.md", () => {
  it("has a claims part and a Never say part that points to the copy rules", () => {
    expect(facts.indexOf(NEVER_SAY)).toBeGreaterThan(0);
    expect(facts.slice(facts.indexOf(NEVER_SAY))).toContain("DESIGN.md");
  });

  it("states the monthly prices from the code", () => {
    expect(facts).toContain(`CAD ${cad(PLANS.one.price)} a month for the first child`);
    expect(facts).toContain(`CAD ${cad(ADDITIONAL_CHILD_PRICE)} a month`);
    expect(planTerms(PLANS.one.price).monthlyCents).toBe(7999);
    expect(planTerms(ADDITIONAL_CHILD_PRICE).monthlyCents).toBe(5999);
  });

  it("names no CAD amount that is not a plan price", () => {
    const allowed = new Set([cad(PLANS.one.price), cad(ADDITIONAL_CHILD_PRICE), ...OTHER_CAD_AMOUNTS]);
    const found = [...facts.matchAll(/CAD (\d+(?:\.\d+)?)/g)].map((m) => m[1]);
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter((amount) => !allowed.has(amount))).toEqual([]);
  });

  it("states the free month from the code", () => {
    expect(planTerms(PLANS.one.price).trialDays).toBe(TRIAL_DAYS);
    expect(facts).toContain(`free for ${TRIAL_DAYS} days`);
    expect(facts).toContain(`On day ${TRIAL_DAYS}`);
    expect(facts).toContain(`ends ${OFFER_ENDS}`);
  });

  it("states the pause limit from the code", () => {
    expect(facts).toContain(`up to ${PAUSE_WEEKS_PER_YEAR} weeks a year`);
  });

  it("states the brand and the contact details from the code", () => {
    expect(facts).toContain(`The brand is ${BRAND}`);
    expect(BUSINESS_NAME).toBe(BRAND);
    expect(facts).toContain(MAILING_ADDRESS);
    expect(facts).toContain(SUPPORT_EMAIL);
    expect(facts).toContain(WEBSITE);
  });

  it("gives every claim row a source and a date", () => {
    const rows = claims
      .split("\n")
      .filter((line) => line.startsWith("|") && !line.startsWith("|---") && !line.startsWith("| Claim you may use"));
    expect(rows.length).toBeGreaterThan(40);
    for (const row of rows) {
      const cells = row.slice(1, -1).split("|").map((cell) => cell.trim());
      expect(cells, row).toHaveLength(3);
      const [claim, source, checked] = cells;
      expect(claim, row).not.toBe("");
      expect(source, row).toMatch(/`[^`]+`|D-\d+|vault note/);
      expect(checked, row).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("cites only file lines that exist", () => {
    const refs = [...facts.matchAll(/`((?:src|docs)\/[^`:]+|DESIGN\.md|AGENTS\.md):(\d+)`/g)];
    expect(refs.length).toBeGreaterThan(20);
    for (const [, path, line] of refs) {
      const file = join(ROOT, path);
      expect(existsSync(file), `${path} exists`).toBe(true);
      expect(readFileSync(file, "utf8").split("\n").length, `${path}:${line}`).toBeGreaterThanOrEqual(Number(line));
    }
  });

  it("holds no em dash and never says the old brand", () => {
    expect(facts).not.toContain("—");
    expect(facts.replace(/Never write "Pagewise"\.[^\n]*/g, "")).not.toMatch(/Pagewise/);
  });
});
