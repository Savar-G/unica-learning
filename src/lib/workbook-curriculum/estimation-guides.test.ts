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
  // The guide is for one group and the task asks about several, so the guide is never the answer (the live U10 Book 1,
  // 2026-11-17: "Use about 21 grapes per small bunch as a guide ... about how many grapes in a bunch?"). These replace
  // the earlier tests that kept the guide as the key.
  it("asks about several groups in all six forms, so the sensible estimate is never the printed guide", () => {
    expect(step.templates?.map(t => [t.format, t.answer])).toEqual([
      ["true-false", "'true' if flip == 0 else 'false'"],
      ["choose", "str(ans)"],
      ["story", "'yes' if flip == 0 else 'no'"],
      ["choose", "str(ans)"],
      ["explain", "str(n) + ' groups of about ' + str(b) + ' make about ' + str(ans) + ', and ' + str(bad) + ' is 10 times that'"],
      ["choose", "str(t10)"],
    ]);
    for (const [index, t] of (step.templates ?? []).entries()) {
      const fill = prepareTemplate(step, t, source.contexts);
      const contexts = new Set<string>();
      for (let seed = 0; seed < 80; seed++) {
        const item = fill.fill(seededRandom(seed));
        const b = Number(formatValue(item.values.b)), n = Number(formatValue(item.values.n)), guide = formatValue(item.values.guide);
        expect(item.text).toContain(`Use about ${b} ${guide} as a guide.`);
        expect(item.text).toMatch(new RegExp(`\\b${n} (?:pencil cases|picture books|small bunches|classroom shelves|classes)\\b`));
        expect(n).toBeGreaterThanOrEqual(2);
        expect(Number(formatValue(item.values.ans))).toBe(n * b);
        // The key is never the guide.
        expect(item.answer).not.toBe(String(b));
        contexts.add(guide);
        const method = templateMethod(sampledSource(step, t, item), item.text, scope);
        if (index < 4) expect(method, item.text).toContain(`${n} × ${b} = ${n * b}`);
        else expect(method).toBeNull();
      }
      expect(contexts.size).toBe(5);
    }
  });

  it("gives six Challenge forms that judge a guess or choices 10 times apart, then scale the guide", () => {
    const house = HOUSE_TEMPLATES.find(h => h.skill === step.skill && h.step === step.number);
    if (!house) throw new Error("Missing sensible-estimate Challenge forms");
    expect(house.templates).toHaveLength(6);
    for (const t of house.templates) {
      const count = Number(/^([234]) \* b$/.exec(t.answer)?.[1]);
      const fill = prepareTemplate(step, t, source.contexts);
      for (let seed = 0; seed < 40; seed++) {
        const item = fill.fill(seededRandom(seed));
        const b = Number(formatValue(item.values.b));
        expect(Number(item.answer)).toBe(count * b);
        expect(item.answer).not.toBe(String(b));
        expect(item.text).toMatch(new RegExp(`Use about ${b} .+ as a guide\\.`));
        expect(item.text).not.toMatch(/\bone (?:class|classroom shelf|short storybook|small bunch|pencil case)\b/);
        const method = templateMethod(sampledSource(step, t, item), item.text, scope);
        expect(method, item.text).toContain(`${count} × ${b} = ${count * b}`);
        expect(method).not.toMatch(/cannot hold|could never hold|impossible/);
      }
    }
    // Four contexts and three structures (a guess to correct, choices to judge, the closest of three).
    expect(new Set(house.templates.map(t => t.text.split(" as a guide.")[0])).size).toBeGreaterThanOrEqual(4);
    expect(new Set(house.templates.map(t => t.text.split(" as a guide.")[1].split(" ").slice(1, 3).join(" "))).size).toBeGreaterThanOrEqual(3);
  });

  it("keeps the counted things when a wrong guess runs to thousands", () => {
    const curriculum = bcStepProgressions();
    for (let seed = 0; seed < 300; seed++) {
      const made = stepTemplateItem({ curriculum, skill: step.skill, step: step.number, place: "on-your-own", level: 10, day: 8, seed, attempt: 0, ordinal: seed % 3 });
      if (!made) continue;
      expect(made.text, made.text).not.toMatch(/\b(?:points|tickets) per\b/);
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
      expect(made.ref.source.answer).toBe("str(ans)");
      expect(templateMethod(made.ref.source, made.text, made.ref)).toMatch(/× .* (?:Choose|Write)/);
      seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });
});
