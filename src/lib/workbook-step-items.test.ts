import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkQuestionPackage, type ItemCheck } from "@/lib/question-package";
import { BC_CURRICULUM, curriculumFor, curriculumFromData } from "@/lib/workbook-curriculum";
import { buildStepItem, choicesFor, handBuiltStep, sequenceOf, stepBounds, stepOf, stepRangeProblem, stepRank, stepTemplateItem, templateProblem } from "@/lib/workbook-step-items";
import { itemNumber, planItem } from "@/lib/workbook-item-plan";
import { buildQuestion, selectedItemStep, type AiItem } from "@/lib/workbook-generator-items";

const BC = curriculumFor("bc")!;
const place = (level: number, skill: string) => ({ id: "q1", workbookId: "00000000-0000-4000-8000-0000000000c1", page: 3, question: 1, level, skills: [skill] });
const item = (skill: string, step: number, slot: Parameters<typeof stepTemplateItem>[0]["place"], seed = 1, attempt = 0, level = 4) =>
  stepTemplateItem({ curriculum: BC, skill, step, place: slot, level, day: 1, seed, attempt, ordinal: 0 });

describe("hand-built tested-step selection (#597)", () => {
  const fact = (skill: string, kind: "add" | "subtract" | "multiply" | "divide", a: number, b: number): AiItem => ({
    ...planItem({ skill: "4.8-multiplication-facts", slot: "1.1", level: 16, day: 1, ordinal: 1, range: { min: 2, max: 100, pictures: false, help: "none" } })!.item,
    skill, operation: { kind, operands: [itemNumber(a), itemNumber(b)], expression: null, unit: null, denominator: null, values: [] },
  });

  it.each([
    ["5.8-extend-facts", "add", 300, 400, 1], ["5.8-extend-facts", "subtract", 9000, 4000, 2],
    ["4.8-multiplication-facts", "multiply", 7, 3, 2], ["4.8-division-facts", "divide", 56, 7, 3],
    ["5.9-recall-facts", "multiply", 6, 4, 1], ["5.9-recall-facts", "divide", 36, 4, 2],
    ["4.7-addition-facts-fluency", "add", 6, 7, 3], ["3.4-subtraction-facts-20", "subtract", 18, 9, 3],
    ["K5-two-more-less", "subtract", 8, 2, 2],
  ] as const)("keeps %s %s %s,%s on its true step %s", (skill, kind, a, b, step) => {
    expect(handBuiltStep(BC, fact(skill, kind, a, b))).toEqual({ unit: BC.skill(skill)!.unit, skill, step });
  });

  it("leaves mislabeled writer tasks and facts with no true step excluded", () => {
    for (const candidate of [fact("5.8-extend-facts", "add", 56, 15), fact("5.8-extend-facts", "add", 60, 70), fact("3.9-area-square-units", "add", 3, 4), fact("5.9-recall-facts", "divide", 35, 4)]) {
      expect(handBuiltStep(BC, candidate)).toBeNull();
    }
  });

  it("selects the place-value step from code's candidate and ignores a writer's reference", () => {
    const candidate = planItem({ skill: "5.1-place-value-million", slot: "1.1", level: 16, day: 1, ordinal: 1, range: { min: 700000, max: 700000, pictures: false, help: "none" } })!.item;
    const selected = handBuiltStep(BC, candidate);
    expect(selected).toEqual({ unit: "5.1", skill: candidate.skill, step: 4 });
    const built = buildQuestion({ ...candidate, itemStep: { unit: "wrong", skill: "wrong", step: 99 } }, place(16, candidate.skill));
    expect(built.check.status).toBe("checked");
    expect(selectedItemStep(built.package, selected)).toEqual(selected);
    expect(selectedItemStep(built.package, null)).toBeNull();
    expect(selectedItemStep(built.package, { unit: "4.8", skill: "4.8-multiplication-facts", step: 1 })).toBeNull();
  });
});

describe("step template items (#489)", () => {
  it("fills a template with numbers from its step's ranges and checks the key from the numbers", () => {
    const step = stepOf(BC, "1.1-count-on-back", 3)!;
    for (let seed = 1; seed <= 40; seed++) {
      const it = item("1.1-count-on-back", 3, "practice-row", seed)!;
      expect(it.ref).toMatchObject({ skill: "1.1-count-on-back", step: 3 });
      expect(stepRangeProblem(step, it.text)).toBeNull();
      for (const s of it.ref.source.slots) {
        const value = Number("int" in s.value ? s.value.int : "dec" in s.value ? s.value.dec : NaN);
        if (!Array.isArray(s.domain) && Number.isFinite(value)) {
          const d = s.domain as { min: number; max: number };
          expect(value).toBeGreaterThanOrEqual(d.min);
          expect(value).toBeLessThanOrEqual(d.max);
        }
      }
      const built = buildStepItem(it.ref, it.text, place(4, it.ref.skill), "code");
      expect(built.check.status, it.text).toBe("checked");
    }
  });

  it("fails a stored item whose key or numbers were changed", () => {
    const it = item("1.1-count-on-back", 3, "practice-row", 5)!;
    const pkg = buildStepItem(it.ref, it.text, place(4, it.ref.skill), "code").package!;
    const region = pkg.item!.regions[0];
    const wrongKey = { ...pkg, item: { ...pkg.item!, regions: [region.kind === "box" ? { ...region, answer: { type: "text" as const, value: "999" } } : region.kind === "choice" ? { ...region, answer: region.choices.find((c) => c !== region.answer)! } : region] } };
    expect(checkQuestionPackage(wrongKey).status).toBe("failed");
    // A number outside its step's range fails, whatever the answer says.
    const check = pkg.item!.checks[0] as Extract<ItemCheck, { kind: "template" | "template-choice" }>;
    const outside = { ...check, source: { ...check.source, slots: check.source.slots.map((s, i) => (i === 0 ? { ...s, value: { int: "999" } } : s)) } };
    expect(checkQuestionPackage({ ...pkg, item: { ...pkg.item!, checks: [outside] } })).toMatchObject({ status: "failed", reason: expect.stringMatching(/outside its step's range/) });
  });

  it("gives each place its format: a story card, Spot the error, two ways, or a circle", () => {
    expect(item("1.1-count-on-back", 3, "word-problems", 2)!.ref.kind).toBe("story");
    const spot = item("1.1-count-on-back", 3, "spot-the-error", 2)!;
    expect(spot.ref.kind).toBe("spot");
    expect(spot.ref.shown).not.toBe(spot.ref.answer);
    expect(buildStepItem(spot.ref, spot.text, place(4, spot.ref.skill), "code").check.status).toBe("checked");
    expect(item("1.1-count-on-back", 3, "solve-it-two-ways", 2)!.ref.kind).toBe("two-ways");
    const likely = [1, 2, 3, 4, 5, 6].map((s) => item("1.10-likelihood-words", 1, "practice-row", s)).filter((x) => x?.ref.kind === "choice");
    expect(likely.length).toBeGreaterThan(0);
    for (const x of likely) expect(buildStepItem(x!.ref, x!.text, place(4, x!.ref.skill), "code").package!.item!.format).toBe("circle");
  });

  it("never prints a picture placeholder or a drawing task from U4", () => {
    for (const l of BC.levels.filter((l) => l.number >= 4)) for (const s of BC.levelSkills(l.id)!) for (const st of BC.skillSteps(s.id)!) {
      const it = stepTemplateItem({ curriculum: BC, skill: s.id, step: st.number, place: "practice-row", level: l.number, day: 1, seed: 3, attempt: 0, ordinal: 0 });
      if (it) expect(it.text, `${s.id}#${st.number}`).not.toMatch(/\(picture:|\bdraw\b|\btrace\b/i);
    }
  });

  it("reads the choices a text offers and ranks steps through the curriculum", () => {
    expect(choicesFor("Is it a cone or a cube?", "cone")).toEqual(["cone", "cube"]);
    expect(choicesFor("True or false: 8 comes after 7.", "True")).toEqual(["True", "false"]);
    // Letters print as capitals (the U4 review: never "A b").
    expect(choicesFor("Which is right? A: 14  B: 15  C: 13", "A")).toEqual(["A", "B", "C"]);
    expect(choicesFor("What is the name of a shape with 5 straight sides?", "pentagon")).toBeNull();
    expect(stepRank(BC, "1.1-count-to-20", 2)!).toBeGreaterThan(stepRank(BC, "1.1-count-to-20", 1)!);
    expect(stepRank(BC, "1.1-read-write-20", 1)!).toBeGreaterThan(stepRank(BC, "1.1-count-to-20", 4)!);
    expect(stepRank(BC, "2.1-count-tens-ones", 1)!).toBeGreaterThan(stepRank(BC, "1.10-likelihood-words", 2)!);
    expect(stepBounds(stepOf(BC, "1.1-count-on-back", 3)!)).toEqual({ min: 0, max: 20 });
  });

  it("reads a template's printed words only: a slot named {shown} names no picture", () => {
    const step = stepOf(BC, "1.1-count-to-20", 1)!;
    const tf = step.templates!.find((t) => t.format === "true-false")!;
    expect(tf.text).toContain("{shown}");
    expect(templateProblem(tf, 4)).toBeNull();
    expect(templateProblem({ ...tf, text: "How many dots are shown?" }, 4)).toMatch(/picture/);
  });

  it("prints a count with blanks as a sequence: its numbers in order, a box in each blank", () => {
    expect(sequenceOf("Count on: 8, ?, ?. What are the next two numbers?", "9, 10")).toEqual({ text: "Count on. What are the next two numbers?", terms: [8, null, null], step: 1 });
    expect(sequenceOf("Count on: 3, ?, ?, ?, ?. Write the next four numbers.", "4, 5, 6, 7")?.text).toBe("Count on. Write the next four numbers.");
    // The answer must fill the blanks by one step.
    expect(sequenceOf("Count on: 8, ?, ?.", "9, 11")).toBeNull();
  });

  it("keeps a step's hardest number templates for its Challenge (#482 review at 3134252)", () => {
    // Count on to 20, step 1: its one hard template ("Write the next four numbers") is the Challenge's.
    const hard = stepOf(BC, "1.1-count-to-20", 1)!.templates!.findIndex((t) => t.difficulty === "hard");
    const challenge = new Set<string>();
    for (let attempt = 0; attempt < 6; attempt++) {
      const c = item("1.1-count-to-20", 1, "challenge", 7, attempt)!;
      // (Cedric's hard template first; later attempts turn to code's two-step cards, all hard.)
      if (attempt === 0) expect(c.ref.index).toBe(hard);
      expect(c.ref.difficulty).toBe("hard");
      // (Cedric's one, then code's five two-step cards for U4, Savar 2026-11-03: house-templates.ts.)
      expect(c.ref.challengeTemplates).toBe(6);
      challenge.add(`${c.text} ${c.ref.answer}`);
    }
    // Later attempts find other tasks, so a page's three Challenge questions differ.
    expect(challenge.size).toBeGreaterThanOrEqual(3);
    for (let seed = 1; seed <= 30; seed++) for (const at of ["now-you", "finish-these", "on-your-own"] as const) expect(item("1.1-count-to-20", 1, at, seed)!.ref.index).not.toBe(hard);
  });

  it("circles the person a story's answer names, and checks it from the numbers", () => {
    const seen = new Set<string>();
    const legacy = curriculumFromData({ ...BC_CURRICULUM, ...JSON.parse(readFileSync("data/curriculum/step-progressions-k9.v1.json", "utf8")) });
    for (let seed = 1; seed <= 60; seed++) {
      const it = stepTemplateItem({ curriculum: legacy, skill: "4.3-same-denominator", step: 1, place: "on-your-own", level: 14, day: 1, seed, attempt: 0, ordinal: 0 });
      if (!it || !/Who eats more/.test(it.text)) continue;
      expect(it.ref.kind).toBe("choice");
      expect(it.ref.choices).toEqual([it.text.split(" ")[0], "the friend"]);
      expect(it.ref.choices).toContain(it.ref.answer);
      const built = buildStepItem(it.ref, it.text, place(14, it.ref.skill), "code");
      expect(built.check.status, it.text).toBe("checked");
      // A label that says the other person fails the check.
      const swapped = { ...it.ref, source: { ...it.ref.source, labels: it.ref.source.labels!.map(([k, w]) => [k === "name" ? "friend" : "name", w] as [string, string]) } };
      expect(buildStepItem(swapped, it.text, place(14, it.ref.skill), "code").check.status).toBe("failed");
      seen.add(it.ref.answer);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
