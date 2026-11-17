import { describe, expect, it } from "vitest";
import { BC_CURRICULUM, curriculumFromData } from "./index";
import { prepareTemplate, seededRandom, type FilledTemplate } from "./template";
import { stepFieldProblems } from "./step-source";
import { U19_APPLICATION_TEMPLATES } from "./u19-application-templates";
import { buildStepItem, choicesFor, stepRangeProblem, stepTemplateItem } from "../workbook-step-items";

const contexts = BC_CURRICULUM.contexts;
if (!contexts) throw new Error("BC application templates require their declared contexts");

function commonMultiple(a: number, b: number): number {
  let candidate = Math.max(a, b);
  while (candidate % a !== 0 || candidate % b !== 0) candidate++;
  return candidate;
}

function expectedAnswer(skill: string, step: number, index: number, filled: FilledTemplate): string {
  const number = (key: string) => Number(filled.values[key]);
  const word = (key: string) => String(filled.values[key]);
  const truth = (value: boolean) => value ? "true" : "false";
  const yes = (value: boolean) => value ? "yes" : "no";
  if (skill === "6.4-lcm") {
    const a = number("a"), b = number("b");
    return index === 1 ? truth(number("c") % a === 0 && number("c") % b === 0) : String(commonMultiple(a, b));
  }
  if (skill === "6.4-divisibility" && step === 1) {
    if (index === 0) {
      const sizes = [2, 5].filter(size => number("n") % size === 0);
      expect(sizes).toHaveLength(1);
      return String(sizes[0]);
    }
    if (index === 1) {
      const digits = Array.from({ length: 10 }, (_, digit) => digit).filter(digit => (10 * number("prefix") + digit) % 10 === 0);
      expect(digits).toHaveLength(1);
      return String(digits[0]);
    }
    if (index === 2) return truth((number("n") - 1) % 2 === 0);
    return String([number("a"), number("b"), number("c")].filter(n => n % 2 === 0).length);
  }
  if (skill === "6.4-divisibility" && step === 2) {
    if (index === 0) {
      const digits = Array.from({ length: 9 }, (_, digit) => digit).filter(digit => (10 * number("prefix") + digit) % 9 === 0);
      expect(digits).toHaveLength(1);
      return String(digits[0]);
    }
    if (index === 1) return truth((number("n") + number("added")) % 3 === 0);
    if (index === 2) return yes((number("n") - 1) % 3 === 0);
    const accepted = [number("a"), number("b"), number("c")].filter(n => n % 9 === 0);
    expect(accepted).toHaveLength(1);
    return String(accepted[0]);
  }
  if (skill === "6.4-divisibility" && step === 3) {
    if (index === 0) return yes((number("n") - 1) % 8 === 0);
    if (index === 1) return truth((number("n") + number("added")) % 6 === 0);
    if (index === 2) return String([number("a"), number("b"), number("c")].filter(n => n % 4 === 0).length);
    const counterexamples = [number("a"), number("b")].filter(n => n % 2 === 0 && n % 6 !== 0);
    expect(counterexamples).toHaveLength(1);
    return String(counterexamples[0]);
  }
  if (skill === "6.13-classify-angles" && step === 1) {
    if (index === 0) return word("opening").startsWith("less") ? "acute" : "obtuse";
    if (index === 1) return word("a").startsWith("wider") ? "A" : "B";
    if (index === 2) return truth(word("opening").startsWith("less"));
    return String(number("a") + number("b"));
  }
  if (skill === "6.13-classify-angles" && step === 2) {
    if (index === 0) return word("turn").startsWith("exactly") ? "straight" : "reflex";
    if (index === 1) return word("a").startsWith("turn more than half") ? "A" : "B";
    if (index === 2) return truth(word("turn").startsWith("more than half"));
    return String(number("a") + number("b"));
  }
  throw new Error(`No independent answer check for ${skill}#${step}.${index}`);
}

describe("U19 application practice", () => {
  it("covers the seven non-prime application steps without changing their names or number domains", () => {
    expect(U19_APPLICATION_TEMPLATES.map(entry => `${entry.skill}#${entry.step}`)).toEqual([
      "6.4-divisibility#1", "6.4-divisibility#2", "6.4-divisibility#3", "6.4-lcm#1", "6.4-lcm#2",
      "6.13-classify-angles#1", "6.13-classify-angles#2",
    ]);
    for (const entry of U19_APPLICATION_TEMPLATES) {
      const source = BC_CURRICULUM.steps.find(s => s.skill === entry.skill && s.number === entry.step)!;
      expect(source.name).toBe(entry.name);
      expect(entry.templates.length).toBeGreaterThanOrEqual(3);
      expect(new Set(entry.templates.map(t => t.format)).size).toBeGreaterThanOrEqual(3);
      expect(entry.templates.every(t => t.difficulty === "medium")).toBe(true);
      expect(entry.templates.some(t => source.templates?.some(old => old.text === t.text))).toBe(false);
      const step = { ...source, templates: entry.templates };
      expect(stepFieldProblems(step, contexts).filter(p => !/needs four to six templates/.test(p))).toEqual([]);
    }
  });

  it.each(U19_APPLICATION_TEMPLATES)("fills and independently checks $skill step $step across 200 seeds", entry => {
    const step = BC_CURRICULUM.steps.find(s => s.skill === entry.skill && s.number === entry.step)!;
    for (const [index, template] of entry.templates.entries()) {
      const prepared = prepareTemplate(step, template, contexts);
      const answers = new Set<string>();
      for (let seed = 1; seed <= 200; seed++) {
        const filled = prepared.fill(seededRandom(seed));
        expect(filled.answer, filled.text).toBe(expectedAnswer(entry.skill, entry.step, index, filled));
        expect(stepRangeProblem(step, filled.text), filled.text).toBeNull();
        expect(stepRangeProblem(step, filled.answer), filled.text).toBeNull();
        if (!/^\d+$/.test(filled.answer)) expect(choicesFor(filled.text, filled.answer), filled.text).toContain(filled.answer);
        answers.add(filled.answer);
      }
      // Claims are not all true or all false; the child must check the given situation.
      if (template.format === "true-false") expect(answers).toEqual(new Set(["true", "false"]));
    }
  });

  it.each(U19_APPLICATION_TEMPLATES)("builds checked printable contracts for every $skill step $step form", entry => {
    for (const template of entry.templates) {
      // Exercise the public template and package builders with one real authored form.
      // Worked-example selection avoids depending on the parent's application-pool wiring.
      const curriculum = curriculumFromData({ ...BC_CURRICULUM, steps: BC_CURRICULUM.steps.map(step =>
        step.skill === entry.skill && step.number === entry.step ? { ...step, templates: [template] } : step) });
      for (let seed = 1; seed <= 24; seed++) {
        const filled = stepTemplateItem({ curriculum, skill: entry.skill, step: entry.step, place: "worked-example",
          level: 19, day: 1, seed, attempt: 0, ordinal: 0 });
        expect(filled, template.text).not.toBeNull();
        if (!filled) continue;
        const result = buildStepItem(filled.ref, filled.text, { id: `application-${seed}`, workbookId: "application-proof",
          page: 5, question: 1, level: 19, skills: [entry.skill] }, "code");
        expect(result.check.status, filled.text).toBe("checked");
        expect(result.itemStep).toMatchObject({ skill: entry.skill, step: entry.step });
      }
    }
  });
});
