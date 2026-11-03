import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MISCONCEPTIONS } from "@/lib/assessment/misconceptions";
import { checkQuestionPackage, valueText } from "@/lib/question-package";
import { buildStepItem, hasHardNumberTemplate, printedNumbersOf, stepTemplateItem } from "@/lib/workbook-step-items";
import { aiSolver, sameAnswer, solveCheck } from "@/lib/workbook-solve-check";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { buildQuestion } from "@/lib/workbook-generator-items";
import { storyProblem } from "@/lib/workbook-wording";
import { BC_CURRICULUM, curriculumFor, type NumberRange } from "./index";
import { parseStepProgressions } from "./step-source";
import { prepareTemplate, seededRandom } from "./template";
import { compileExpression, expressionIsTrue, formatValue } from "./expression";

const read = (name: string) => readFileSync(`data/curriculum/${name}`, "utf8");
const raw = parseStepProgressions;
const active = raw(JSON.parse(read("step-progressions-k9.json")));
// The raw v2 deliberately fails admission. Read it only as the known data shape for patch replay.
const original = JSON.parse(read("step-progressions-k9.v2.original.json")) as typeof active;
const originalCounts = new Map(original.steps.map(s => [`${s.skill}#${s.number}`, s.templates!.length]));
const BC = curriculumFor("bc")!;

describe("v2 data and answer contracts", () => {
  it("recovers the real U16 bare Mixed set as the same checked operation in a story", () => {
    const raw = { skill: "4.4-add-within-10000", text: "142 + 1389 = ?", format: "tick-and-number", difficulty: 2, operation: { kind: "add", operands: [142, 1389] }, wrongAnswers: [{ value: { type: "number", value: 1421 }, cause: "no-regroup", description: "Forgot the carry", step: "tens" }], easier: { text: "122 + 1239 = ?", operation: { kind: "add", operands: [122, 1239] } }, figure: null };
    const place = { id: "q", workbookId: "w", page: 9, question: 4, level: 16, skills: [raw.skill], story: true, wording: { name: "Mia", thing: "books", names: ["Mia"], things: ["books"], kinds: ["story" as const], step: false, subtraction: true } };
    const built = buildQuestion(raw, place);
    expect(built.check.status).toBe("checked");
    expect(built.package?.operation).toEqual(raw.operation);
    expect(built.package?.answer?.value).toEqual({ type: "number", value: 1531 });
    expect(built.package?.text).toMatch(/Mia/);
    expect(built.package?.text).toMatch(/books/);
    expect(storyProblem(built.package!.text, { thing: "books" })).toBeNull();
    expect(built.package?.text).not.toMatch(/[+×÷=]/);
    expect(buildQuestion(raw, { ...place, preserveText: true }).check).toEqual({ status: "failed", reason: expect.stringMatching(/a story has a person/) });
    expect(buildQuestion({ ...raw, text: "142 + 1388 = ?" }, place).check.status).toBe("failed");
  });

  it("replays every recorded change and keeps all template positions with easy and hard coverage", () => {
    const patches = JSON.parse(read("author-changes.json")) as { skill: string; step: number; template: number | null; path: string[]; before: unknown; after: unknown; why: string; kind?: "quality-fallback" | "wording-rewrite"; beforeAbsent?: boolean; afterAbsent?: boolean }[];
    for (const patch of patches) {
      const step = original.steps.find(s => s.skill === patch.skill && s.number === patch.step)!;
      const target = (patch.template === null ? step : step.templates![patch.template - 1]) as unknown as Record<string, unknown>;
      expect(patch.path).toHaveLength(1);
      if (patch.kind !== "quality-fallback") expect(patch.path[0]).not.toBe("difficulty");
      if (patch.kind !== "quality-fallback") expect(patch.path[0]).not.toBe("format");
      if (!patch.kind) expect(patch.path[0]).not.toBe("text");
      if (patch.beforeAbsent) expect(Object.hasOwn(target, patch.path[0])).toBe(false);
      else expect(target[patch.path[0]]).toEqual(patch.before);
      if (patch.afterAbsent) delete target[patch.path[0]];
      else target[patch.path[0]] = patch.after;
      expect(patch.why).not.toBe("");
    }
    expect(original).toEqual(active);
    expect(active.steps).toEqual(BC_CURRICULUM.steps);
    expect(active.steps.flatMap(s => s.templates!)).toHaveLength(7999);
    for (const step of active.steps) {
      expect(step.templates!.length).toBe(originalCounts.get(`${step.skill}#${step.number}`));
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

  it("keeps the exact accepted pools after unpacking the fraction domains", () => {
    const author = (JSON.parse(read("step-progressions-k9.v2.original.json")) as typeof active).steps.find(s => s.skill === "7.4-lowest-terms" && s.number === 3)!;
    const step = active.steps.find(s => s.skill === author.skill && s.number === 3)!;
    for (const [domain, index, amin, amax, bmin, gmin] of [["pt", 0, 3, 26, 2, 2], ["pth", 4, 7, 25, 5, 4]] as const) {
      const expected = (author.numbers![domain] as NumberRange).values!;
      const check = compileExpression(step.templates![index].check!);
      const accepted: number[] = [];
      for (let a = amin; a <= amax; a++) for (let b = bmin; b <= 9; b++) for (let g = gmin; g <= 9; g++) {
        if (expressionIsTrue(check.evaluate({ a: BigInt(a), b: BigInt(b), g: BigInt(g) }))) accepted.push(a * 10000 + b * 100 + g);
      }
      expect(accepted.sort((a, b) => a - b)).toEqual([...expected].sort((a, b) => a - b));
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

  it("keeps whole area keys free of an added decimal zero", () => {
    const step = BC.skillSteps("6.12-trapezoid-area")!.find(s => s.number === 3)!;
    const fill = prepareTemplate(step, step.templates![1], BC.contexts!);
    const whole = fill.fill(seededRandom(3));
    expect(whole.answer).toBe("33 m²");
    expect(sameAnswer("33 m²", [whole.answer], false)).toBe(true);
  });

  it("keeps every triangle dimension valid with the original hard walk calculation", () => {
    const step = BC.skillSteps("8.10-model")!.find(s => s.number === 1)!;
    expect(step.templates![3]).toMatchObject({ format: "story", difficulty: "hard", answer: "p + q" });
    for (const template of step.templates!) {
      const fill = prepareTemplate(step, template, BC.contexts!);
      for (let seed = 1; seed <= 40; seed++) {
        const { values } = fill.fill(seededRandom(seed));
        const [p, q, h] = [values.p, values.q, values.h].map(v => Number(formatValue(v)));
        expect(p * p + q * q).toBe(h * h);
        expect(h).toBeLessThanOrEqual(41);
      }
    }
  });

  it("keeps numeric cases of conditional hard stories available to the Challenge", () => {
    expect(hasHardNumberTemplate(BC, "K3-part-part-whole", 3, 4)).toBe(true);
    for (let seed = 1; seed <= 12; seed++) {
      const item = stepTemplateItem({ curriculum: BC, skill: "K3-part-part-whole", step: 3, place: "challenge", level: 4, day: 1, ordinal: 0, seed, attempt: 0 })!;
      expect(item?.ref.difficulty).toBe("hard");
      expect(item?.ref.kind).toBe("story");
      expect(item?.ref.answer).toMatch(/^\d+$/);
    }
    const likelihood = stepTemplateItem({ curriculum: BC, skill: "1.10-likelihood-words", step: 1, place: "challenge", level: 4, day: 9, ordinal: 0, seed: 7, attempt: 0 });
    expect(likelihood?.ref).toMatchObject({ difficulty: "hard", kind: "choice" });
    const maxima = Array.from({ length: 30 }, (_, seed) => {
      const item = stepTemplateItem({ curriculum: BC, skill: "1.1-count-to-20", step: 2, place: "challenge", level: 4, day: 1, ordinal: 0, seed, attempt: 0 })!;
      expect(item.ref.difficulty).toBe("hard");
      return Math.max(...printedNumbersOf(item.ref.answer));
    });
    expect(maxima.filter(n => n >= 18)).toHaveLength(30);
  });

  it("uses purchased goods in a price story while it keeps the arithmetic key", () => {
    const step = BC.skillSteps("4.11-multiply-divide-unknown")!.find(s => s.number === 3)!;
    const curriculum = { ...BC, skillSteps: (id: string) => id === step.skill ? [{ ...step, templates: [step.templates![2]] }] : BC.skillSteps(id) };
    for (let seed = 1; seed <= 20; seed++) {
      const item = stepTemplateItem({ curriculum, skill: step.skill, step: 3, place: "word-problems", level: 16, day: 1, ordinal: 0, seed, attempt: 0 })!;
      expect(item.text).toMatch(/books|notebooks|tickets|toy cars/);
      expect(item.text).not.toMatch(/acorns|leaves|shells/);
      expect(buildStepItem(item.ref, item.text, { id: "q", workbookId: "w", page: 2, question: 1, level: 16, skills: [step.skill] }, "code").check.status).toBe("checked");
    }
  });

  it("prints the hard four-fraction ordering answer on its own Challenge step", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const item = stepTemplateItem({ curriculum: BC, skill: "4.3-same-denominator", step: 3, place: "challenge", level: 14, day: 8, ordinal: 0, seed, attempt: 0 })!;
      expect(item.ref).toMatchObject({ skill: "4.3-same-denominator", step: 3, difficulty: "hard" });
      const fractions = item.ref.answer.split(", ");
      expect(fractions).toHaveLength(4);
      const numerators = fractions.map(f => Number(f.split("/")[0]));
      expect(numerators).toEqual([...numerators].sort((a, b) => b - a));
      expect(buildStepItem(item.ref, item.text, { id: "q", workbookId: "w", page: 2, question: 1, level: 14, skills: [item.ref.skill] }, "code").check.status).toBe("checked");
    }
  });

  it("keeps number construction out of a two-method arithmetic area", () => {
    const author = (JSON.parse(read("step-progressions-k9.v2.original.json")) as typeof active).steps.find(s => s.skill === "5.1-place-value-million" && s.number === 2)!;
    const step = { ...BC.skillSteps(author.skill)!.find(s => s.number === author.number)!, numbers: author.numbers, templates: author.templates };
    const hard = step.templates!.find(t => /every other place/i.test(t.text))!;
    expect(hard).toBeDefined();
    const curriculum = { ...BC, skillSteps: (id: string) => id === step.skill ? [{ ...step, templates: [hard] }] : BC.skillSteps(id) };
    expect(stepTemplateItem({ curriculum, skill: step.skill, step: step.number, place: "solve-it-two-ways", level: 16, day: 1, ordinal: 0, seed: 7, attempt: 0 })).toBeNull();
    expect(stepTemplateItem({ curriculum, skill: step.skill, step: step.number, place: "challenge", level: 16, day: 1, ordinal: 0, seed: 7, attempt: 0 })?.ref.difficulty).toBe("hard");
  });

  it("rejects a reversed-numeral instruction supplied by derived text", () => {
    const step = BC.skillSteps("K1-write-numerals")?.[0];
    expect(step).toBeDefined();
    const template = step!.templates!.find(t => t.derived && Object.values(t.derived).some(v => v.includes("backwards")))!;
    expect(template).toBeDefined();
    const curriculum = { ...BC, skillSteps: (id: string) => id === step!.skill ? [{ ...step!, templates: [template] }] : BC.skillSteps(id) };
    expect(stepTemplateItem({ curriculum, skill: step!.skill, step: step!.number, place: "on-your-own", level: 4, day: 1, ordinal: 0, seed: 7, attempt: 0 })).toBeNull();
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
    const built = buildStepItem(filled.ref, filled.text, { id: "q", workbookId: "w", page: 2, question: 1, level, skills: [skill] }, "ai");
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
