import { expect, it } from "vitest";
import { fakeAiClient } from "./ai-client-fake";
import { fakeWorkbookItems } from "./workbook-ai-fake";
import { curriculumFor } from "./workbook-curriculum";
import { generateWorkbook, prepareWorkbookCapacity, workbookCapacityPlan, type FitCheck, type GenerateInput, type GeneratedPage } from "./workbook-generator";
import { planWorkbook } from "./workbook-plan";
import { sampleChild, samplePlanInput } from "./workbook-sample-profiles";
import { stepAiItem, stepTemplateItem } from "./workbook-step-items";
import { keySolver } from "./workbook-solve-check";
import { pagePlan } from "./workbook-template";
import { renderableDraft } from "./workbook-fit";
import { workbookQuality } from "./workbook-quality";
import { checkQuestionPackage, operationResult } from "./question-package";

it("restores U16 own-step coverage without an incomplete own or review row, and keeps the saved contracts", async () => {
  const curriculum = curriculumFor("bc")!;
  const planned = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, "U16")!, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  const day = workbookCapacityPlan(curriculum, planned.plan).days[2];
  const page = day.pages.find(p => p.type === "practice-2")!;
  expect(page.parts[0].step).toMatchObject({ skill: "5.9-distributive", step: 1 });
  // The strict full-book seed reached this complete but invalid two-own, four-review state.
  // Build each item from its real step, including the two supporting tasks outside the practice count.
  const refs: [string, number, string][] = [
    ["5.9-distributive", 1, "bare"], ["5.9-distributive", 1, "missing"],
    ["4.8-division-facts", 3, "bare"], ["4.8-division-facts", 3, "bare"],
    ["4.8-multiplication-facts", 3, "true-false"], ["4.7-addition-facts-fluency", 3, "true-false"],
    ["4.8-multiplication-facts", 3, "bare"], ["4.8-division-facts", 3, "bare"],
  ];
  const itemContracts = Object.fromEntries(refs.map(([skill, step, format], i) => {
    const slot = i < 6 ? `1.${i + 1}` : `${i - 4}.1`;
    const place = i < 6 ? "practice-row" : i === 6 ? "solve-it-two-ways" : "spot-the-error";
    const fill = Array.from({ length: 128 }, (_, attempt) => stepTemplateItem({ curriculum, skill, step, place, level: 16, day: 3, seed: (i + 1) * 71, attempt, ordinal: i + 1 }))
      .find(f => f?.ref.format === format);
    if (!fill) throw new Error(`No ${skill}#${step} ${format}`);
    return [slot, { type: "template" as const, source: "code" as const, template: fill.ref, numbers: fill.numbers,
      dayRange: { min: 0, max: 99999, pictures: false, help: "none" as const }, item: stepAiItem(slot, fill.ref, fill.text) }];
  }));
  const input: GenerateInput = { workbookId: "17fc5da1-2442-488a-a450-611a471e73e6", childId: "00000000-0000-4000-8000-000000000071", number: 1,
    profileBuild: null, curriculum, itemPolicy: "approved-v1", book: { child: "Ava" },
    plan: { ...planned.plan, days: planned.plan.days.map(d => d.day !== 3 ? d : { ...d, pages: d.pages.map(p => p.type !== "practice-2" ? p : { ...page, itemContracts,
      capacity: [{ slot: "practice-row", part: 0, items: 6 }, { slot: "solve-it-two-ways", part: 1, items: 1 }, { slot: "spot-the-error", part: 2, items: 1 }] }) }) } };
  const fit: FitCheck = { fits: async p => {
    // Model the observed overflow of the intermediate three-own, three-review sections.
    // The real strict sample separately proves the complete four-own, two-review page fits.
    const oddOwn = p.number === 22 && p.questions.filter(q => q.number <= 6 && q.package.templateId?.startsWith("5.9-distributive#1.")).length === 3;
    return !oddOwn && p.questions.length <= (p.number === 22 ? 8 : 10)
      ? { ok: true } : { ok: false, problems: [{ question: null, reason: "test page capacity" }] };
  } };
  const capacity = await prepareWorkbookCapacity(input, fit);
  const contracts = capacity.days[2].pages.find(p => p.type === "practice-2")!.itemContracts!;
  expect(Object.values(contracts).filter(c => c?.item.slot.startsWith("1.") && c.template?.skill === "5.9-distributive" && c.template.step === 1)).toHaveLength(4);
  let token = 0;
  const kept = new Map<number, GeneratedPage>();
  const pages = { load: async () => [...kept.values()], save: async (p: GeneratedPage) => { kept.set(p.number, p); } };
  const generated = await generateWorkbook({ ...input, plan: capacity }, { fit, ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(),
    pages, store: { save: async d => ({ status: "saved", draftId: d.id }), draft: async () => null }, qrToken: () => `token-${String(++token).padStart(12, "0")}` });
  if (generated.status !== "stored") throw new Error(generated.status);
  const printed = generated.draft.pages.find(p => p.number === 22)!;
  expect(printed.questions.filter(q => q.place === "practice-row")).toHaveLength(6);
  expect(printed.expected!.filter(e => e.place === "practice-row").map(e => e.steps![0])).toEqual(Array(6).fill("5.9-distributive#1"));
  expect(pagePlan(renderableDraft(generated.draft).pages.find(p => p.number === printed.number)!)?.incomplete).toEqual([]);
  expect(workbookQuality([printed]).issues.filter(i => ["step", "coverage", "range", "variety", "repeat"].includes(i.kind))).toEqual([]);
  for (const q of printed.questions) {
    expect(q.check.status).toBe("checked");
    expect(q.itemPlan).toEqual(contracts[q.slot]);
    expect(q.stepDeclaration).toEqual(q.itemPlan!.template!.declaration);
    expect(q.itemStep).toEqual(q.stepDeclaration!.reference);
    expect(q.package!.templateId).toContain(`${q.itemStep!.skill}#${q.itemStep!.step}.`);
    expect(checkQuestionPackage(q.package)).toMatchObject({ status: "checked" });
    if (q.package!.answer && q.package!.operation) expect(q.package!.answer.value).toEqual(operationResult(q.package!.operation));
  }
  const resumed = await generateWorkbook({ ...input, plan: capacity }, { fit, pages,
    ai: fakeAiClient({ answer: () => { throw new Error("a saved page asked the writer again"); } }), solver: keySolver(),
    store: { save: async d => ({ status: "saved", draftId: d.id }), draft: async () => null }, qrToken: () => `resume-token-${String(++token).padStart(12, "0")}` });
  if (resumed.status !== "stored") throw new Error(resumed.status);
  expect(resumed.draft.pages.find(p => p.number === 22)).toEqual(printed);
}, 30_000);
