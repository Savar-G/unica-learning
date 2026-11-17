import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { storedDomain, templateScalar, type TemplateSource } from "@/lib/question-package-template";
import { templateMethod } from "@/lib/workbook-book";
import { stepTemplateItem } from "@/lib/workbook-step-items";
import { bcStepProgressions } from "./index";
import { formatValue } from "./expression";
import { HOUSE_TEMPLATES, isSpotOnly } from "./house-templates";
import { parseStepProgressions } from "./step-source";
import { prepareTemplate, seededRandom, slotDomain, type FilledTemplate } from "./template";
import type { CurriculumStep, StepTemplate } from "./types";

const source = parseStepProgressions(JSON.parse(readFileSync("data/curriculum/step-progressions-k9.json", "utf8")));
const step = source.steps.find(s => s.skill === "3.1-estimate-quantity" && s.number === 3);
if (!step) throw new Error("Missing real-world estimation step");
const scope = { skill: step.skill, step: step.number };

function sampledSource(s: CurriculumStep, t: StepTemplate, item: FilledTemplate): TemplateSource {
  return { answer: t.answer, check: t.check ?? null, values: null, derived: Object.entries(t.derived ?? {}),
    slots: Object.entries(t.slots).map(([name, reference]) => {
      const value = templateScalar(item.values[name]);
      if (!value) throw new Error(`Invalid sampled slot ${name}`);
      return { name, value, domain: storedDomain(slotDomain(s, reference)) };
    }) };
}

describe("task-specific sensible-estimate guides", () => {
  it("keeps the six original formats and keys while making every task's assumption visible", () => {
    expect(step.templates?.map(t => [t.format, t.answer])).toEqual([
      ["true-false", "'true' if flip == 0 else 'false'"],
      ["choose", "str(b)"],
      ["story", "'yes' if flip == 0 else 'no'"],
      ["choose", "str(b)"],
      ["explain", "'that is far above the stated guide, so it is not a sensible estimate for this task'"],
      ["choose", "str(h100)"],
    ]);
    for (const [index, t] of (step.templates ?? []).entries()) {
      const fill = prepareTemplate(step, t, source.contexts);
      const contexts = new Set<string>();
      for (let seed = 0; seed < 80; seed++) {
        const item = fill.fill(seededRandom(seed));
        const b = formatValue(item.values.b), guide = formatValue(item.values.guide);
        expect(item.text).toContain(`Use about ${b} ${guide} as a guide.`);
        contexts.add(guide);
        const method = templateMethod(sampledSource(step, t, item), item.text, scope);
        if (index < 4) {
          expect(method, item.text).toContain("stated guide");
          expect(method, item.text).toContain(b);
        } else {
          // A printed guide is not an implemented worked method for every response type.
          expect(method).toBeNull();
        }
      }
      expect(contexts.size).toBe(5);
    }
  });

  it("teaches all three Challenge forms from the stated per-group guide", () => {
    const house = HOUSE_TEMPLATES.find(h => h.skill === step.skill && h.step === step.number);
    if (!house) throw new Error("Missing sensible-estimate Challenge forms");
    expect(house.templates).toHaveLength(3);
    for (const [index, t] of house.templates.entries()) {
      const fill = prepareTemplate(step, t, source.contexts);
      for (let seed = 0; seed < 40; seed++) {
        const item = fill.fill(seededRandom(seed));
        const b = Number(formatValue(item.values.b)), count = index + 2;
        expect(Number(item.answer)).toBe(count * b);
        expect(item.text).toMatch(new RegExp(`Use about ${b} .+ as a guide\\.`));
        const method = templateMethod(sampledSource(step, t, item), item.text, scope);
        expect(method, item.text).toContain(`${count} × ${b} = ${count * b}`);
        expect(method).not.toMatch(/cannot hold|could never hold|impossible/);
      }
    }
  });

  it("offers Spot the error its own checked estimate without taking a Challenge contract", () => {
    const curriculum = bcStepProgressions();
    let seen = 0;
    for (let attempt = 0; attempt < 40; attempt++) {
      const made = stepTemplateItem({ curriculum, skill: step.skill, step: step.number,
        place: "spot-the-error", level: 10, day: 8, seed: 121, attempt, ordinal: 0 });
      if (!made) continue;
      const t = curriculum.skillSteps(step.skill)?.find(s => s.number === 3)?.templates?.[made.ref.index];
      expect(t && isSpotOnly(t)).toBe(true);
      expect(made.text).toContain("as a guide.");
      expect(made.ref.source.answer).toBe("str(b)");
      expect(templateMethod(made.ref.source, made.text, made.ref)).toContain("matches that guide");
      seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });
});
