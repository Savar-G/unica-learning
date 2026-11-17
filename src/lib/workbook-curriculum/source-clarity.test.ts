import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stepItem, stepTemplateItem } from "@/lib/workbook-step-items";
import { BC_CURRICULUM, curriculumFor } from "./index";
import { formatValue } from "./expression";
import { parseStepProgressions } from "./step-source";
import { prepareTemplate, seededRandom } from "./template";
import { verifiedWatchOut, watchOutProblems } from "./watch-out";

const source = parseStepProgressions(JSON.parse(readFileSync("data/curriculum/step-progressions-k9.json", "utf8")));
function step(skill: string, number: number) {
  const found = source.steps.find(s => s.skill === skill && s.number === number);
  if (!found) throw new Error(`Missing source step ${skill}#${number}`);
  return found;
}
function template(skill: string, number: number, index: number) {
  const s = step(skill, number);
  const t = s.templates?.[index - 1];
  if (!t) throw new Error(`Missing source template ${skill}#${number}:${index}`);
  return { s, t };
}

describe("audited source conventions", () => {
  it("retains at least eight daily learning pages after curriculum regeneration at every level", () => {
    expect(BC_CURRICULUM.levels).toHaveLength(30);
    for (const level of BC_CURRICULUM.levels) {
      expect(level.pagesPerDay.min, level.id).toBeGreaterThanOrEqual(8);
      expect(level.pagesPerDay.max, level.id).toBeGreaterThanOrEqual(level.pagesPerDay.min);
    }
  });

  it.each([1, 2])("uses the given group estimate exactly in quantity step %s", number => {
    const { s, t } = template("3.1-estimate-quantity", number, 3);
    for (const g of [25, 100]) for (const flip of [0, 1]) {
      const fixed = { ...s, numbers: { ...s.numbers, group_size: { min: g, max: g }, groups: { min: 2, max: 2 }, template_flip: { min: flip, max: flip } } };
      const filled = prepareTemplate(fixed, t, source.contexts).fill(seededRandom(1));
      expect(filled.text).toContain(`Use ${g} as the estimate for each of 2 groups`);
      expect(filled.text).toContain(`resulting estimate is ${2 * g + flip * (1 + g % 7)}`);
      expect(filled.answer).toBe(flip === 0 ? "true" : "false");
    }
  });

  it("evaluates benchmark multiplication against the declared estimate", () => {
    const { s, t } = template("2.2-benchmarks-25-50-100", 3, 3);
    const fill = prepareTemplate(s, t, source.contexts);
    for (let seed = 0; seed < 40; seed++) {
      const item = fill.fill(seededRandom(seed));
      const n = Number(formatValue(item.values.n));
      const shown = Number(formatValue(item.values.shown));
      expect(item.text).toContain(`Use 25 as the estimate for each of ${n} groups`);
      expect(item.answer).toBe(shown === n * 25 ? "true" : "false");
    }
  });

  it.each([2, 3])("combines separately rounded operands in estimate step %s", number => {
    for (const index of [2, 3, 4]) {
      const { s, t } = template("2.4-estimate-100", number, index);
      const fill = prepareTemplate(s, t, source.contexts);
      for (let seed = 0; seed < 40; seed++) {
        const item = fill.fill(seededRandom(seed));
        const value = (key: string) => Number(formatValue(item.values[key]));
        const expected = Math.round(value("p") / 10) * 10 + (number === 2 ? 1 : -1) * Math.round(value("q") / 10) * 10;
        expect(item.text).toMatch(/nearest ten, then (?:add|subtract)/);
        if (index === 2) expect(Number(item.answer)).toBe(expected);
        if (index === 3) expect(item.answer).toBe(value("shown") === expected ? "true" : "false");
        if (index === 4) expect(item.answer).toBe(value("x") === expected ? "A" : "B");
      }
    }
  });

  it("states a blind marble pick and preserves the red-versus-blue A/B/C comparison", () => {
    const { s, t } = template("2.11-compare-likelihood", 2, 4);
    const fill = prepareTemplate(s, t, source.contexts);
    const seen = new Set<string>();
    for (let seed = 0; seed < 80; seed++) {
      const item = fill.fill(seededRandom(seed));
      const a = Number(formatValue(item.values.a)), b = Number(formatValue(item.values.b));
      expect(item.text).toContain("Pick one marble without looking. Compared with blue, picking red");
      expect(item.answer).toBe(a > b ? "A" : a < b ? "B" : "C");
      seen.add(item.answer);
    }
    expect([...seen].sort()).toEqual(["A", "B", "C"]);
  });

  it("describes the opening independently of side length and bounds every obtuse object angle", () => {
    for (const index of [2, 4]) {
      const { s, t } = template("6.13-classify-angles", 1, index);
      const fill = prepareTemplate(s, t, source.contexts);
      for (let seed = 0; seed < 80; seed++) {
        const item = fill.fill(seededRandom(seed));
        expect(item.text).not.toMatch(/\barms\b|narrow opening/);
        if (index === 2 && item.answer === "obtuse") {
          expect(item.text).toContain("wider than a square corner but less than a straight angle");
        }
      }
    }
    expect(step("6.13-classify-angles", 1).spotTheError.fix).toContain("between 90° and 180°");
  });

  it.each([
    ["5.1-compare-order-million", 1, 16],
    ["5.4-fraction-to-decimal", 2, 19],
    ["5.4-compare-decimals", 1, 19],
    ["5.4-compare-fractions", 1, 19],
    ["5.4-compare-fractions", 2, 19],
  ] satisfies [string, number, number][])("aligns the %s comparison instruction with its existing answer box", (skill, number, level) => {
    const { s, t } = template(skill, number, skill === "5.1-compare-order-million" ? 3 : 1);
    const bc = curriculumFor("bc");
    if (!bc) throw new Error("Missing BC curriculum");
    const curriculum = { ...bc, skillSteps: (id: string) => id === skill ? [{ ...s, templates: [t] }] : bc.skillSteps(id) };
    for (let seed = 1; seed <= 12; seed++) {
      const item = stepTemplateItem({ curriculum, skill, step: number, level, place: "on-your-own", day: 1, ordinal: 0, seed, attempt: 0 });
      expect(item).not.toBeNull();
      if (!item) throw new Error("Missing comparison item");
      expect(item.text).toContain("Write the greater number:");
      expect(item.ref.kind).toBe("box");
      expect(stepItem(item.ref).regions).toMatchObject([{ id: "answer", kind: "box" }]);
    }
  });

  it("keeps changed teaching pairs unapproved while checking the explicit trading arithmetic", () => {
    const s = step("3.1-place-value-1000", 3);
    expect(s.example).toEqual({ problem: "4 hundreds + 13 tens + 2 ones = ?", answer: "532" });
    expect(4 * 100 + 13 * 10 + 2).toBe(5 * 100 + 3 * 10 + 2);
    for (const current of [s, step("6.13-classify-angles", 1)]) for (const mistake of current.mistakes) {
      expect(mistake.watchOut).toBeUndefined();
      expect(verifiedWatchOut(current, mistake)).toBeNull();
    }
    expect(watchOutProblems({ wrong: "Start with 4 hundreds, 13 tens, 2 ones.", fix: "Trade 10 tens for 1 hundred: 4 + 1 = 5 hundreds, 3 tens, 2 ones = 532." })).toEqual([]);
  });
});
