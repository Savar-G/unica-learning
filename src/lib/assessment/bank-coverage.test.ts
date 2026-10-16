import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BANKS, fillTemplate } from "@/lib/assessment";

// Structural checks across every band's bank (#187): the BC standards it covers, and how much a template varies.
const SEEDS = Array.from({ length: 50 }, (_, i) => i * 7919 + 3);
const TEMPLATES = [...new Map(Object.values(BANKS).flat().map((t) => [t.id, t])).values()];

/** The 106 BC content standards for grades 1-7, from the research file: "BC-G4-05" is the bank's "4.5". */
const BC_STANDARDS = readFileSync(".design/research/assessment-audit-2026-10-15/bc-math-standards.csv", "utf8")
  .split("\n")
  .flatMap((line) => {
    const code = /^BC-G(\d)-(\d\d),/.exec(line);
    return code ? [`${code[1]}.${Number(code[2])}`] : [];
  });
// Fact fluency: the timed facts section measures these, not the question bank (research README).
const FACTS_SECTION = new Set(["3.4", "4.7", "4.8", "5.8"]);

describe("every bank", () => {
  it("has a question template for every BC standard of grades 1-7, except fact fluency", () => {
    expect(BC_STANDARDS).toHaveLength(106);
    const covered = new Set(TEMPLATES.map((t) => t.standard));
    expect(BC_STANDARDS.filter((s) => !FACTS_SECTION.has(s) && !covered.has(s))).toEqual([]);
  });

  it("has no template that asks the same prompt for every seed", () => {
    // A retake or a sibling should not meet a fixed question: the prompt itself must change, not only the choices.
    const fixed = TEMPLATES.filter((t) => new Set(SEEDS.map((seed) => fillTemplate(t, seed).prompt)).size < 2).map((t) => t.id);
    expect(fixed).toEqual([]);
  });
});
