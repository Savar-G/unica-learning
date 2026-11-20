import { expect, it } from "vitest";
import { fakeAiClient } from "./ai-client-fake";
import { fakeWorkbookItems } from "./workbook-ai-fake";
import { curriculumFor, type Curriculum } from "./workbook-curriculum";
import { generateWorkbook, type GeneratedPage, type GenerateInput } from "./workbook-generator";
import { planWorkbook } from "./workbook-plan";
import { sampleChild, samplePlanInput } from "./workbook-sample-profiles";
import { keySolver } from "./workbook-solve-check";
import { buildStepItem, type StepTemplateRef } from "./workbook-step-items";
import { templateMethod } from "./workbook-book";
import { workbookQuality } from "./workbook-quality";

const WORKBOOK = "00000000-0000-4000-8000-000000001201";
const ESTIMATE = "3.1-estimate-quantity";

function example(step = 1, kind: StepTemplateRef["kind"] = "box", skill = ESTIMATE) {
  const ref: StepTemplateRef = { skill, step, index: 0, format: "story", difficulty: "medium", kind,
    source: { answer: "g * n", check: null, values: null, derived: [], slots: [
      { name: "g", value: { int: "25" }, domain: { min: 25, max: 25 } },
      { name: "n", value: { int: "4" }, domain: { min: 4, max: 4 } },
    ] }, answer: "100", shown: "101", frame: "groups", drill: false, rank: 1, bounds: null, hardest: false };
  const text = "There are 4 groups of about 25 cards. About how many cards are there?";
  const built = buildStepItem(ref, text, { id: "example", workbookId: WORKBOOK, page: 3, question: 1, level: 10, skills: [skill] }, "code");
  if (!built.package) throw new Error(built.check.status === "failed" ? built.check.reason : "Missing example");
  return { ref, package: built.package, check: built.check };
}

function page(): GeneratedPage {
  const own = example();
  return { number: 3, day: 1, dayLabel: "Day 1", pageOfDay: 1, type: "practice", qrToken: "token-000000000001", attempts: 1,
    fit: { status: "fits" }, questions: [], panelExamples: [own.package],
    expected: [{ slot: "e1", part: "practice", place: "reminder", steps: [`${ESTIMATE}#1`] }],
    content: { kind: "day", id: "teaching-admission", level: 10, day: 1, page: 1, pages: 8,
      title: "Estimate groups", topic: "Estimate groups", subtitle: "Write in boxes.", grownUp: null,
      blocks: [{ slot: "reminder", items: [], lines: [own.package.text, `${templateMethod(own.ref.source, own.package.text, own.ref)} Answer: [100]`] }] } };
}

it("accepts the reserved reminder's checked method on its exact curriculum step", () => {
  const result = workbookQuality([page()]);
  expect(result.issues.filter(i => i.kind === "step" || /method|reserved curriculum/.test(i.reason))).toEqual([]);
});

it("rejects a sound reminder from a different step", () => {
  const p = page();
  p.expected![0].steps = [`${ESTIMATE}#2`];
  expect(workbookQuality([p]).issues).toContainEqual(expect.objectContaining({ kind: "step", reason: expect.stringMatching(/reserved curriculum step/) }));
});

it("rejects an answer-only reminder even with a correct reserved template key", () => {
  const p = page();
  if (p.content?.kind !== "day") throw new Error("Expected day content");
  p.content.blocks[0].lines = [p.panelExamples![0]!.text, "Answer: [100]"];
  expect(workbookQuality([p]).issues).toContainEqual(expect.objectContaining({ kind: "coverage", reason: expect.stringMatching(/answer without a method/) }));
});

it("does not count unrelated prose as the reserved method", () => {
  const p = page();
  if (p.content?.kind !== "day") throw new Error("Expected day content");
  p.content.blocks[0].lines = [p.panelExamples![0]!.text, "Try an easy addition. Then check your answer."];
  expect(workbookQuality([p]).issues).toContainEqual(expect.objectContaining({ kind: "coverage", reason: expect.stringMatching(/no checked method/) }));
});

it.each(["missing", "other-step", "arithmetic"])("rejects %s teaching instead of treating prose as scope evidence", scenario => {
  const p = page();
  if (scenario === "missing") p.panelExamples = [null];
  else if (scenario === "other-step") p.panelExamples = [example(2).package];
  else {
    const own = example(3);
    // The exact same checked scalar expression with an estimation label does not teach sensible estimates.
    p.panelExamples = [{ ...own.package, text: "4 × 25 = ?" }];
    p.expected![0].steps = [`${ESTIMATE}#3`];
  }
  expect(workbookQuality([p]).issues.some(i => /reserved curriculum|no checked method/.test(i.reason))).toBe(true);
});

it.each([ESTIMATE, "3.3-add-within-1000"])("rejects a checked arithmetic error item labeled %s on an estimation step", skill => {
  const base = example(3, "spot", skill);
  const ref: StepTemplateRef = { ...base.ref, source: { answer: "a + b", check: null, values: null, derived: [], slots: [
    { name: "a", value: { int: "13" }, domain: { min: 13, max: 13 } },
    { name: "b", value: { int: "29" }, domain: { min: 29, max: 29 } },
  ] }, answer: "42", shown: "32" };
  const own = buildStepItem(ref, "13 + 29 = ?", { id: "unrelated-addition", workbookId: WORKBOOK, page: 3, question: 1, level: 10, skills: [skill] }, "code");
  expect(own.check.status).toBe("checked");
  if (!own.package) throw new Error("Expected checked arithmetic fixture");
  const p = page();
  p.panelExamples = [];
  p.expected = [{ slot: "1.1", part: "spot-the-error", place: "spot-the-error", steps: [`${ESTIMATE}#3`] }];
  p.questions = [{ number: 1, slot: "1.1", part: "spot-the-error", place: "spot-the-error", package: own.package, check: own.check, attempts: 1 }];
  expect(workbookQuality([p]).issues).toContainEqual(expect.objectContaining({ kind: "step", reason: expect.stringMatching(/Spot the error.*exact curriculum step/) }));
});

it("keeps exhausted approved teaching and error contracts missing instead of asking for generic AI arithmetic", async () => {
  const source = curriculumFor("bc")!;
  const curriculum: Curriculum = { ...source, skillSteps: skill => source.skillSteps(skill)?.map(step => skill === ESTIMATE && step.number === 3 ? { ...step, templates: [] } : step) ?? null };
  const planned = planWorkbook(samplePlanInput(source, sampleChild(source, "U10")!, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  const day = planned.plan.days[0];
  const part = { ...day.pages[0].parts[0], kind: "new-idea" as const, unit: "A" as const,
    step: { unit: "3.1", skill: ESTIMATE, step: 3 }, skills: [ESTIMATE, "3.1-place-value-1000", "3.6-increasing-pattern"], items: 3, hints: true };
  const input: GenerateInput = { workbookId: WORKBOOK, childId: "00000000-0000-4000-8000-000000000001", number: 1,
    profileBuild: null, curriculum, itemPolicy: "approved-v1", book: { child: "Alex" },
    plan: { ...planned.plan, extraPractice: [], days: [{ ...day, pages: [{ ...day.pages[0], number: 1, type: "new-idea",
      parts: [part, { ...part, kind: "spot-the-error", items: 1 }], capacityChecked: true,
      capacity: [{ slot: "worked-example", part: 0, items: 0 }, { slot: "now-you", part: 0, items: 3 }, { slot: "spot-the-error", part: 1, items: 1 }] }] }] } };
  const ai = fakeAiClient({ answer: fakeWorkbookItems });
  let token = 0;
  const result = await generateWorkbook(input, { ai, solver: keySolver(), fit: { fits: async () => ({ ok: true }) },
    qrToken: () => `token-${++token}`, store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null } });
  if (result.status === "stored") {
    const dayPages = result.draft.pages.filter(p => p.day !== null);
    expect(dayPages.flatMap(p => p.panelExamples ?? []).filter(Boolean)).toEqual([]);
    expect(dayPages.flatMap(p => p.questions).filter(q => q.place === "spot-the-error" && q.package && q.check.status === "checked")).toEqual([]);
    expect(result.draft.quality?.ready).toBe(false);
  } else expect(result.status).toBe("refused");
  for (const request of ai.requests) {
    for (const part of request.content) if (part.type === "text") expect(part.text).not.toMatch(/"examples"\s*:/);
  }
});
