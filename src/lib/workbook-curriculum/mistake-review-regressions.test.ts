import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseStepProgressions } from "./step-source";
import { verifiedWatchOut } from "./watch-out";

const data = parseStepProgressions(JSON.parse(readFileSync("data/curriculum/step-progressions-k9.json", "utf8")));
const report = JSON.parse(readFileSync("data/curriculum/mistake-verification.json", "utf8")) as {
  records: { id: string; attempts: { verified: boolean; reason: string }[] }[];
};

// These are independent expected methods for the review's concrete counterexamples.
// A source inconsistency may instead have three recorded rejections and no printable pair.
const cases: [string, string, number, string, RegExp][] = [
  ["F01 rectangle side", "5.12-missing-side", 1, "inverse-operation", /divid|÷/i],
  ["F02 larger places", "5.1-compare-order-million", 1, "digit-compare", /left|greatest|hundred|thousand/i],
  ["F03 count by fives", "1.1-skip-count-2-5", 2, "skip-by-one", /5|five/i],
  ["F04 cube root of 27", "8.2-cube-root", 1, "root-half", /three|3|cube|³/i],
  ["F04 cube root of 125", "8.2-cube-root", 2, "root-half", /three|3|cube|³/i],
  ["F05 factors of 72", "6.4-factors", 2, "factor-multiple", /pair|divis|factor|72.*36.*24/i],
  ["F06 fraction product", "8.5-multiply-fractions", 2, "fraction-add-across", /multipl|×|times|product/i],
  ["F07 split division", "6.2-fact-strategies", 3, "distribute-one", /divid|÷|quotient/i],
  ["F08 correct benchmarks", "1.2-benchmarks-10-20", 2, "benchmark-far", /10.*20|20.*10/i],
  ["F09a multiplication", "5.9-recall-facts", 1, "operation", /multipl|×|times|product/i],
  ["F09a division", "5.9-recall-facts", 2, "operation", /divid|÷|group|share/i],
  ["F09b decimal carry", "7.3-add-subtract-decimals", 1, "O3", /hundredth|tenth|0\.1|carry/i],
  ["F09c actual units", "6.14-capacity-units", 1, "unit-convert", /1,000|2,500|thousand/i],
  ["F09d subtract a negative", "8.12-range", 2, "sign-rule", /13|8.*5/i],
  ["F09e add hundreds", "5.8-extend-facts", 1, "fact-scale-zeros", /hundred|1,500|15.*100/i],
  ["F09e subtract thousands", "5.8-extend-facts", 2, "fact-scale-zeros", /thousand|8,000|8.*1,000/i],
  ["F09f read a scaled value", "8.6-scale-axes", 2, "scale-tick-one", /20|4.*5/i],
  ["F09f read below zero", "8.6-read-graph", 3, "scale-tick-one", /[-−]20|below|negative/i],
  ["F09g similar triangles", "9.6-similar-shapes", 1, "one-attribute", /angle|50|60|70/i],
  ["F09h spaces on a ruler", "2.8-ruler-from-zero", 1, "N4", /gap|space|interval/i],
];

describe("review F01 to F09", () => {
  it.each(cases)("%s uses its own method or has a recorded removal", (finding, skill, number, misconception, method) => {
    const step = data.steps.find(s => s.skill === skill && s.number === number)!;
    expect(step, finding).toBeDefined();
    const index = step.mistakes.findIndex(m => m.misconception === misconception);
    expect(index, finding).toBeGreaterThanOrEqual(0);
    const mistake = step.mistakes[index];
    const record = report.records.find(r => r.id === `${skill}#${number}:${index}`)!;
    expect(record, finding).toBeDefined();
    if (mistake.watchOut) {
      expect(verifiedWatchOut(step, mistake), finding).not.toBeNull();
      expect(mistake.watchOut.fix, finding).toMatch(method);
      if (finding.startsWith("F09h")) expect(mistake.watchOut.wrong, finding).toMatch(/mark|zero|0|13/i);
      expect(record.attempts.some(a => a.verified), finding).toBe(true);
    } else {
      expect(record.attempts, finding).toHaveLength(3);
      expect(record.attempts.every(a => a.verified === false && a.reason.trim().length > 0), finding).toBe(true);
    }
  });
});
