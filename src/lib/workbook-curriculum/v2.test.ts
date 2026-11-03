import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MISCONCEPTIONS } from "@/lib/assessment/misconceptions";
import { checkQuestionPackage, valueText } from "@/lib/question-package";
import { buildStepItem, stepTemplateItem } from "@/lib/workbook-step-items";
import { aiSolver, sameAnswer, solveCheck } from "@/lib/workbook-solve-check";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { BC_CURRICULUM, curriculumFor } from "./index";
import { parseStepProgressions } from "./step-source";
import { prepareTemplate, seededRandom } from "./template";
import { formatValue } from "./expression";

const read = (name: string) => readFileSync(`data/curriculum/${name}`, "utf8");
const raw = parseStepProgressions;
const active = raw(JSON.parse(read("step-progressions-k9.json")));
// The raw v2 deliberately fails admission. Read it only as the known data shape for patch replay.
const original = JSON.parse(read("step-progressions-k9.v2.original.json")) as typeof active;
const BC = curriculumFor("bc")!;

describe("v2 data and answer contracts", () => {
  it("replays every recorded field change and keeps every source template's intent and difficulty", () => {
    const patches = JSON.parse(read("author-changes.json")) as { skill: string; step: number; template: number | null; path: string[]; before: unknown; after: unknown; why: string }[];
    for (const patch of patches) {
      const step = original.steps.find(s => s.skill === patch.skill && s.number === patch.step)!;
      const target = (patch.template === null ? step : step.templates![patch.template - 1]) as unknown as Record<string, unknown>;
      expect(patch.path).toHaveLength(1);
      expect(target[patch.path[0]]).toEqual(patch.before);
      target[patch.path[0]] = patch.after;
      expect(patch.why).not.toBe("");
    }
    expect(original).toEqual(active);
    expect(active.steps).toEqual(BC_CURRICULUM.steps);
    expect(active.steps.flatMap(s => s.templates!)).toHaveLength(7999);
    for (const step of active.steps) {
      expect(step.templates!.some(t => t.difficulty === "easy"), `${step.skill}#${step.number}`).toBe(true);
      expect(step.templates!.some(t => t.difficulty === "hard"), `${step.skill}#${step.number}`).toBe(true);
    }
    expect(createHash("sha256").update(read("step-progressions-k9.v2.original.json")).digest("hex"))
      .toBe("8a67431f88f3c44db703b7f8468f81e2163d94c8bcd74282c3066f5892540da5");
    for (const id of ["operation-swap", "less-than-order", "prediction-exact"] as const) expect(MISCONCEPTIONS[id]).toBeDefined();
  });

  it("keeps expanded fractions equivalent and in lowest terms after separating the packed domain", () => {
    const step = active.steps.find(s => s.skill === "7.4-lowest-terms" && s.number === 3)!;
    for (const template of step.templates!.filter(t => t.format === "bare")) {
      const fill = prepareTemplate(step, template, active.contexts);
      for (let seed = 0; seed < 40; seed++) {
        const item = fill.fill(seededRandom(seed));
        const [n, d] = (item.text.match(/\d+\/\d+/)![0]).split("/").map(Number);
        const [a, b] = item.answer.split("/").map(Number);
        expect(n * b).toBe(d * a);
        const gcd = (x: number, y: number): number => y ? gcd(y, x % y) : x;
        expect(gcd(a, b)).toBe(1);
        expect(Math.max(n, d)).toBeLessThanOrEqual(100);
      }
    }
  });

  it("sorts mixed forms by value and keeps each original notation", () => {
    const step = active.steps.find(s => s.skill === "7.4-compare-forms" && s.number === 3)!;
    const fill = prepareTemplate(step, step.templates![0], active.contexts);
    const value = (s: string) => s.endsWith("%") ? Number(s.slice(0, -1)) / 100 : s.includes("/") ? s.split("/").map(Number).reduce((a, b) => a / b) : Number(s);
    for (let seed = 0; seed < 40; seed++) {
      const item = fill.fill(seededRandom(seed));
      const expected = [formatValue(item.values.sa), `${formatValue(item.values.n)}/${formatValue(item.values.d)}`, `${formatValue(item.values.p)}%`, formatValue(item.values.sb)].sort((a, b) => value(a) - value(b));
      expect(item.answer).toBe(expected.join(", "));
    }
  });

  it.each([
    ["9.8-bank-record", 2, 0, 30, /^\$\d+\.\d{2}$/],
    ["5.12-area-rectangle", 2, 1, 16, /^\d+ m²$/],
  ] as const)("preserves %s money and units in the number check, solve check and key display", async (skill, stepNumber, index, level, answerPattern) => {
    const step = BC.skillSteps(skill)!.find(s => s.number === stepNumber)!;
    const curriculum = { ...BC, skillSteps: (id: string) => id === skill ? [{ ...step, templates: [step.templates![index]] }] : BC.skillSteps(id) };
    const filled = stepTemplateItem({ curriculum, skill, step: stepNumber, place: "on-your-own", level, day: 1, ordinal: 0, seed: 7, attempt: 0 })!;
    expect(filled).not.toBeNull();
    expect(filled.ref.answer).toMatch(answerPattern);
    const built = buildStepItem(filled.ref, filled.text, { id: "q", workbookId: "w", page: 2, question: 1, level, skills: [skill] }, "story");
    expect(built.check.status).toBe("checked");
    const pkg = built.package!;
    expect(checkQuestionPackage(pkg).status).toBe("checked");
    const region = pkg.item!.regions.find(r => r.kind === "box" && r.answer)!;
    if (region.kind !== "box" || !region.answer) throw new Error("missing answer box");
    expect(valueText(region.answer)).toBe(filled.ref.answer);
    expect(sameAnswer(filled.ref.answer.replace(/[$]| m²/g, ""), [filled.ref.answer], false)).toBe(false);
    const solver = aiSolver(fakeAiClient({ answer: () => ({ answers: [{ question: "question", box: region.id, answer: filled.ref.answer }], problem: null }) }));
    expect((await solveCheck(solver, pkg, 1000))?.verdict).toEqual({ status: "agreed" });
  });
});
