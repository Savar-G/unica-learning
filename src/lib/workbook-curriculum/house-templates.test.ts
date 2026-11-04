import { describe, expect, it } from "vitest";
import { BC_CURRICULUM, bcStepProgressions } from "@/lib/workbook-curriculum";
import { HOUSE_TEMPLATES, isTwoStep, withHouseTemplates } from "./house-templates";
import { stepFieldProblems } from "./step-source";
import { prepareTemplate, seededRandom } from "./template";
import { stepRangeProblem } from "@/lib/workbook-step-items";
import { takeAwayProblem } from "@/lib/workbook-wording";

describe("Unica Challenge templates", () => {
  const c = bcStepProgressions();
  it("are appended after Cedric's templates of their named steps", () => {
    for (const h of HOUSE_TEMPLATES) {
      const step = c.skillSteps(h.skill)![h.step - 1];
      expect(step.name).toBe(h.name);
      const own = BC_CURRICULUM.steps.find((s) => s.skill === h.skill && s.number === h.step)!.templates ?? [];
      expect(step.templates!.slice(0, own.length)).toEqual(own);
      expect(step.templates!.slice(own.length)).toEqual(h.templates);
    }
  });
  it("refuse a renamed or missing step", () => {
    expect(() => withHouseTemplates(BC_CURRICULUM, [{ ...HOUSE_TEMPLATES[0], name: "Another step" }])).toThrow(/written for/);
    expect(() => withHouseTemplates(BC_CURRICULUM, [{ ...HOUSE_TEMPLATES[0], skill: "no-such-skill" }])).toThrow(/does not have/);
  });
  it("give every U16 day step three hard templates with a number answer, with Cedric's v2 ones, and repeat none of his", () => {
    const numeric = (t: { format: string; answer: string }) => ["bare", "missing", "story"].includes(t.format) && !/['"]/.test(t.answer);
    for (const h of HOUSE_TEMPLATES) {
      const step = c.skillSteps(h.skill)![h.step - 1];
      expect(step.templates!.filter((t) => t.difficulty === "hard" && numeric(t)).length, `${h.skill}#${h.step}`).toBeGreaterThanOrEqual(3);
      const own = BC_CURRICULUM.steps.find((s) => s.skill === h.skill && s.number === h.step)!.templates ?? [];
      for (const t of h.templates) expect(own.some((o) => o.text === t.text || o.answer === t.answer && o.format === t.format && o.difficulty === "hard")).toBe(false);
    }
  });
  it("fill 200 times each: valid fields, a whole-number answer above 0, numbers in the step's range, more than one step", () => {
    for (const h of HOUSE_TEMPLATES) {
      const step = c.skillSteps(h.skill)![h.step - 1];
      // (Cedric's source rule of four to six templates a step is his files' shape; Unica's are added after them.)
      expect(stepFieldProblems(step, c.contexts).filter((p) => !/needs four to six templates/.test(p))).toEqual([]);
      for (const t of h.templates) {
        const prepared = prepareTemplate(step, t, c.contexts);
        let filled = 0;
        for (let seed = 1; seed <= 200; seed++) {
          let item;
          try { item = prepared.fill(seededRandom(seed)); } catch { continue; }
          filled++;
          expect(item.answer, `${h.skill}#${h.step}: ${item.text}`).toMatch(/^[1-9]\d*$/);
          expect(stepRangeProblem(step, item.text), item.text).toBeNull();
          expect(stepRangeProblem(step, item.answer), item.text).toBeNull();
          expect(takeAwayProblem(item.text, Number(item.answer)), item.text).toBeNull();
          // (More than one step: an equation prints two operations; a story, digit or pattern question works two.)
          if (item.text.includes("=") || /^What is \d/.test(item.text)) expect((item.text.match(/[+×-]/g) ?? []).length, item.text).toBeGreaterThanOrEqual(2);
        }
        expect(filled, `${h.skill}#${h.step}: ${t.text}`).toBeGreaterThan(100);
      }
    }
  });
});

describe("code's two-step Challenge cards (U4)", () => {
  const c = bcStepProgressions();
  it("fill from each U4 step's own numbers and keep its range", () => {
    for (const skill of c.levelSkills("U4")!) for (const step of c.skillSteps(skill.id) ?? []) {
      const two = (step.templates ?? []).filter(isTwoStep);
      for (const t of two) {
        const prepared = prepareTemplate(step, t, c.contexts);
        for (let seed = 1; seed <= 60; seed++) {
          let item;
          try { item = prepared.fill(seededRandom(seed)); } catch { continue; }
          expect(stepRangeProblem(step, item.text), item.text).toBeNull();
          if (/^\d+$/.test(item.answer)) expect(stepRangeProblem(step, item.answer), item.text).toBeNull();
          expect(takeAwayProblem(item.text, Number(item.answer)), item.text).toBeNull();
        }
      }
    }
    expect(c.skillSteps("1.1-count-to-20")![0].templates!.filter(isTwoStep)).toHaveLength(5);
    expect(c.skillSteps("1.10-likelihood-words")![0].templates!.filter(isTwoStep)).toHaveLength(3);
    // (No two-step card outside U4.)
    expect(c.skillSteps("5.9-multiply-tens")![0].templates!.some(isTwoStep)).toBe(false);
  });
});

describe("Unica's shorter U4 wording", () => {
  const c = bcStepProgressions();
  it("rewrites only templates whose text is still Cedric's, with their own slots, shorter, and fills them", async () => {
    const { LEVEL_REWRITES, templateAtLevel } = await import("./house-templates");
    const holes = (s: string) => new Set([...s.matchAll(/\{([A-Za-z_0-9]+)\}/g)].map((m) => m[1]));
    for (const r of LEVEL_REWRITES) {
      const step = c.skillSteps(r.skill)![r.step - 1];
      const t = step.templates![r.template - 1];
      expect(t.text, `${r.skill}#${r.step}.${r.template}`).toBe(r.from);
      expect(r.to.length).toBeLessThan(r.from.length);
      for (const h of holes(r.to)) expect(holes(r.from).has(h), `${r.skill}#${r.step}.${r.template} {${h}}`).toBe(true);
      const shown = templateAtLevel(4, step, r.template - 1, t);
      expect(shown.text).toBe(r.to);
      expect(templateAtLevel(1, step, r.template - 1, t).text).toBe(r.from);
      expect({ ...shown, text: t.text }).toEqual(t);
      const prepared = prepareTemplate(step, shown, c.contexts);
      for (let seed = 1; seed <= 40; seed++) {
        let item;
        try { item = prepared.fill(seededRandom(seed)); } catch { continue; }
        expect(item.text).not.toMatch(/\{/);
        expect(takeAwayProblem(item.text, Number(item.answer)), item.text).toBeNull();
      }
    }
  });
});
