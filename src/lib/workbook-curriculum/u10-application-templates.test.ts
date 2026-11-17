import { describe, expect, it } from "vitest";
import { BC_CURRICULUM } from "./bc";
import { U10_APPLICATION_TEMPLATES, type U10ApplicationEntry } from "./u10-application-templates";
import { prepareTemplate, seededRandom, type FilledTemplate } from "./template";
import { stepFieldProblems } from "./step-source";
import { choicesFor, stepRangeProblem, templateProblem } from "../workbook-step-items";

/** Work from the printed quantities rather than evaluating the authored answer expression. */
function independentAnswer(entry: U10ApplicationEntry, index: number, filled: FilledTemplate): string {
  const number = (name: string) => Number(filled.values[name]);
  if (entry.skill === "3.1-place-value-1000") {
    const h = number("h");
    if (entry.step === 1) {
      if (index === 0) return String((number("n") - 100 * h - number("o")) / 10);
      if (index === 1) {
        const digits = String(number("wrong"));
        return digits[0] + digits[2] + digits[1];
      }
      const a = 100 * h + 10 * number("t") + number("o");
      const b = 100 * h + 10 * number("u") + number("o");
      return a > b ? "A" : "B";
    }
    if (entry.step === 2) {
      if (index === 0) return String(100 * h + 10 * number("t"));
      if (index === 1) {
        const digits = String(number("n"));
        return digits[0] + digits[2] + digits[1];
      }
      const meaning = number("n") % 10 === 0 ? "no ones" : "no tens";
      return filled.values.oa === meaning ? "A" : "B";
    }
    if (index === 0) return String(number("t") - 10);
    if (index === 1) return String((100 * h + 10 * number("t") - 10 * number("left")) / 100);
    return number("oa") === number("o") - 10 ? "A" : "B";
  }
  if (entry.skill === "3.1-estimate-quantity") {
    if (entry.step < 3) {
      const total = Array.from({ length: number("n") }, () => number("g")).reduce((sum, group) => sum + group, 0);
      if (index === 0) return String(total);
      if (index === 1) return total <= number("capacity") ? "true" : "false";
      const expression = String(filled.values.oa);
      const [a, b] = expression.split(/[×+]/).map(Number);
      const candidate = expression.includes("×") ? a * b : a + b;
      return candidate === total ? "A" : "B";
    }
    if (index === 0) return String(number("b") + number("b"));
    if (index === 1) return String(number("bad") / 10);
    return Math.abs(number("oa") - number("b")) < Math.abs(number("ob") - number("b")) ? "A" : "B";
  }
  const direction = entry.skill === "3.6-decreasing-pattern" ? -1 : 1;
  if (index === 0) return number("a") + direction * number("d") >= number("target") ? "yes" : "no";
  if (index === 1) return String(number("b") + (number("b") - number("a")));
  return number("a") + direction * number("d") > number("a") + direction * number("e") ? "A" : "B";
}

describe("U10 application tasks", () => {
  it("covers the nine first-book steps with three distinct response families each", () => {
    expect(U10_APPLICATION_TEMPLATES.map(e => `${e.skill}#${e.step}`).sort()).toEqual([
      "3.1-estimate-quantity#1", "3.1-estimate-quantity#2", "3.1-estimate-quantity#3",
      "3.1-place-value-1000#1", "3.1-place-value-1000#2", "3.1-place-value-1000#3",
      "3.6-decreasing-pattern#1", "3.6-increasing-pattern#1", "3.6-increasing-pattern#2",
    ]);
    for (const entry of U10_APPLICATION_TEMPLATES) {
      const source = BC_CURRICULUM.steps.find(s => s.skill === entry.skill && s.number === entry.step)!;
      expect(source.name).toBe(entry.name);
      expect(entry.templates).toHaveLength(3);
      expect(new Set(entry.templates.map(t => t.format)).size).toBe(3);
      expect(new Set(entry.templates.map(t => t.text)).size).toBe(3);
      expect(entry.templates.every(t => t.difficulty === "medium")).toBe(true);
      expect(entry.templates.some(t => source.templates?.some(ordinary => ordinary.text === t.text))).toBe(false);
      const errors = stepFieldProblems({ ...source, templates: [...(source.templates ?? []), ...entry.templates] }, BC_CURRICULUM.contexts);
      expect(errors.filter(error => !/needs four to six templates/.test(error))).toEqual([]);
    }
  });

  it.each(U10_APPLICATION_TEMPLATES)("checks $skill step $step answers, assumptions and ranges across 100 seeds", entry => {
    const source = BC_CURRICULUM.steps.find(s => s.skill === entry.skill && s.number === entry.step)!;
    for (const [index, template] of entry.templates.entries()) {
      expect(templateProblem(template, 10)).toBeNull();
      const prepared = prepareTemplate(source, template, BC_CURRICULUM.contexts!);
      const answers = new Set<string>();
      for (let seed = 1; seed <= 100; seed++) {
        const filled = prepared.fill(seededRandom(seed));
        expect(filled.answer, filled.text).toBe(independentAnswer(entry, index, filled));
        expect(stepRangeProblem(source, filled.text), filled.text).toBeNull();
        expect(stepRangeProblem(source, filled.answer), filled.text).toBeNull();
        expect(filled.text).not.toMatch(/\{[^}]+\}/);
        expect(filled.text.split(/\s+/).length, filled.text).toBeLessThanOrEqual(40);
        if (!/^\d+$/.test(filled.answer)) expect(choicesFor(filled.text, filled.answer), filled.text).toContain(filled.answer);
        answers.add(filled.answer);
        if (entry.skill === "3.1-estimate-quantity") {
          expect(filled.text).toMatch(/about \d+.*(?:per|guide)/);
          if (entry.step < 3 && index === 0) {
            expect(Number(filled.values.n) + Number(filled.values.g)).not.toBe(Number(filled.answer));
          }
          if (entry.step === 3 && index === 2) {
            const a = Number(filled.values.oa), b = Number(filled.values.ob);
            expect(Math.max(a, b) / Math.min(a, b)).toBe(10);
            expect([a, b]).not.toContain(Number(filled.values.b));
          }
        }
        if (entry.skill.includes("pattern") && index === 1) {
          expect(Number(filled.values.wrong)).not.toBe(Number(filled.answer));
          expect(Math.abs(Number(filled.values.b) - Number(filled.values.a))).toBe(Number(filled.values.d));
        }
      }
      // Choices must require reading each task, rather than always circling the same answer.
      if (template.format === "choose" || template.format === "true-false" || entry.skill.includes("pattern") && index === 0) {
        expect(answers.size).toBe(2);
      }
    }
  });
});
