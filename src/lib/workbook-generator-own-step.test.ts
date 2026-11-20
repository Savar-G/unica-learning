import { expect, it } from "vitest";
import { fakeAiClient } from "./ai-client-fake";
import { fakeWorkbookItems } from "./workbook-ai-fake";
import { curriculumFor } from "./workbook-curriculum";
import { generateWorkbook, prepareWorkbookCapacity, workbookCapacityPlan, type FitCheck, type GenerateInput, type GeneratedPage } from "./workbook-generator";
import { planWorkbook } from "./workbook-plan";
import { firstCustomerProfile, sampleChild, samplePlanInput } from "./workbook-sample-profiles";
import { planNextWorkbook } from "./workbook-placement";
import { stepAiItem, stepTemplateItem } from "./workbook-step-items";
import { keySolver } from "./workbook-solve-check";
import { pagePlan } from "./workbook-template";
import { renderableDraft } from "./workbook-fit";
import { workbookQuality } from "./workbook-quality";
import { checkQuestionPackage, operationResult } from "./question-package";

it("reserves the new-idea page's own-step minimum when review contracts displaced it", async () => {
  const curriculum = curriculumFor("bc")!;
  const placed = planNextWorkbook({ curriculum, grade: 8, profile: firstCustomerProfile(), number: 1, workbooks: [],
    instructions: { version: 1, startLevel: "U19", teachMore: ["6.4", "6.13"], teachLess: [], addReview: ["5.2", "5.7", "5.15"], difficulty: null } });
  if (!placed.ok) throw new Error(placed.reason);
  const plan = workbookCapacityPlan(curriculum, placed.plan), day = plan.days.find(d => d.day === 8)!;
  const page = day.pages.find(p => p.type === "new-idea")!, part = page.parts[0];
  expect(part.step).toMatchObject({ skill: "6.13-classify-angles", step: 2 });
  const refs: [string, number, string][] = [
    ["6.4-lcm", 1, "missing"], ["6.4-lcm", 2, "bare"], ["6.4-lcm", 1, "bare"],
    ["6.4-lcm", 1, "choose"], ["6.4-lcm", 1, "missing"], ["6.13-classify-angles", 2, "true-false"],
  ];
  const itemContracts = Object.fromEntries(refs.map(([skill, step, format], i) => {
    const slot = `1.${i + 1}`, place = i === 0 ? "try-first" : i === 1 ? "spot-the-error" : "now-you";
    const fill = Array.from({ length: 128 }, (_, attempt) => stepTemplateItem({ curriculum, skill, step,
      place, level: 19, day: 8, seed: (i + 1) * 71, attempt, ordinal: i + 1 })).find(f => f?.ref.format === format);
    if (!fill) throw new Error(`Missing ${skill}#${step} ${format}`);
    return [slot, { type: "template" as const, source: "code" as const, template: fill.ref, numbers: fill.numbers,
      dayRange: { min: 0, max: 1000000, pictures: false, help: "none" as const }, item: stepAiItem(slot, fill.ref, fill.text) }];
  }));
  const input: GenerateInput = { workbookId: "00000000-0000-4000-8000-000000000746", childId: "00000000-0000-4000-8000-000000000071", number: 1,
    profileBuild: null, curriculum, itemPolicy: "approved-v1", book: { child: "Alex" },
    plan: { ...plan, days: [{ ...day, pages: [{ ...page, capacityChecked: true, parts: [{ ...part, items: 6 }], itemContracts,
      capacity: [{ slot: "try-first", part: 0, items: 1 }, { slot: "spot-the-error", part: 0, items: 1 }, { slot: "now-you", part: 0, items: 4 }] }] }] } };
  const fit: FitCheck = { fits: async () => ({ ok: true }) };
  const capacity = await prepareWorkbookCapacity(input, fit);
  expect(Object.values(capacity.days[0].pages[0].itemContracts ?? {}).filter(c => c?.template?.skill === "6.13-classify-angles" && c.template.step === 2).length).toBeGreaterThanOrEqual(2);
  let token = 0;
  const result = await generateWorkbook({ ...input, plan: capacity }, { fit, ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(),
    qrToken: () => `token-${String(++token).padStart(12, "0")}`, store: { save: async d => ({ status: "saved", draftId: d.id }), draft: async () => null } });
  if (result.status !== "stored") throw new Error(result.status);
  const printed = result.draft.pages.find(p => p.type === "new-idea")!;
  expect(printed.questions.filter(q => q.place !== "spot-the-error" && q.itemPlan?.template?.skill === "6.13-classify-angles" && q.itemPlan.template.step === 2).length).toBeGreaterThanOrEqual(2);
  expect(workbookQuality([printed]).issues.filter(i => i.kind === "step")).toEqual([]);
});

it("restores U19 LCM practice when complete review rows displaced its own-step minimum", async () => {
  const curriculum = curriculumFor("bc")!;
  const placed = planNextWorkbook({ curriculum, grade: 8, profile: firstCustomerProfile(), number: 1, workbooks: [],
    instructions: { version: 1, startLevel: "U19", teachMore: ["6.4", "6.13"], teachLess: [], addReview: ["5.2", "5.7", "5.15"], difficulty: null } });
  if (!placed.ok) throw new Error(placed.reason);
  const full = workbookCapacityPlan(curriculum, placed.plan);
  const day = full.days.find(d => d.day === 7)!;
  const page = day.pages.find(p => p.type === "practice")!;
  const part = page.parts[0];
  expect(part.step).toMatchObject({ skill: "6.4-lcm", step: 2 });
  const refs: [string, number, string][] = [
    ["6.4-lcm", 2, "choose"], ["6.4-lcm", 2, "bare"],
    ["6.4-prime-composite", 2, "missing"], ["6.4-prime-composite", 2, "missing"],
    ["5.4-compare-decimals", 2, "compare"], ["5.4-compare-decimals", 2, "compare"],
  ];
  const itemContracts = Object.fromEntries(refs.map(([skill, step, format], i) => {
    const slot = `1.${i + 1}`, place = i < 2 ? "finish-these" : "on-your-own";
    const fill = Array.from({ length: 128 }, (_, attempt) => stepTemplateItem({ curriculum, skill, step, place, level: 19, day: 7, seed: (i + 1) * 71, attempt, ordinal: i + 1 })).find(f => f?.ref.format === format);
    if (!fill) throw new Error(`No ${skill}#${step} ${format}`);
    return [slot, { type: "template" as const, source: "code" as const, template: fill.ref, numbers: fill.numbers,
      dayRange: { min: 0, max: 1000000, pictures: false, help: "none" as const }, item: stepAiItem(slot, fill.ref, fill.text) }];
  }));
  const input: GenerateInput = { workbookId: "00000000-0000-4000-8000-000000000719", childId: "00000000-0000-4000-8000-000000000071", number: 1,
    profileBuild: null, curriculum, itemPolicy: "approved-v1", book: { child: "Alex" },
    plan: { ...full, days: [{ ...day, pages: [{ ...page, parts: [{ ...part, items: 7 }], itemContracts,
      capacity: [{ slot: "watch-one", part: 0, items: 0 }, { slot: "finish-these", part: 0, items: 2 }, { slot: "on-your-own", part: 0, items: 4 }] }] }] } };
  const measured: number[] = [];
  const fit: FitCheck = { fits: async p => {
    const own = p.questions.filter(q => q.package.templateId?.startsWith("6.4-lcm#2.")).length;
    measured.push(own);
    // A single replacement leaves two odd sections. The repair must replace the review pair together.
    return own !== 3 && p.questions.length <= 8 ? { ok: true } : { ok: false, problems: [{ question: null, reason: "test page capacity" }] };
  } };
  const capacity = await prepareWorkbookCapacity(input, fit);
  expect(measured.some(own => own >= 4)).toBe(true);
  let token = 0;
  const result = await generateWorkbook({ ...input, plan: capacity }, { fit, ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(),
    qrToken: () => `token-${String(++token).padStart(12, "0")}`, store: { save: async d => ({ status: "saved", draftId: d.id }), draft: async () => null } });
  if (result.status !== "stored") throw new Error(result.status);
  const printed = result.draft.pages.find(p => p.day === 7 && p.type === "practice")!;
  expect(workbookQuality([printed]).issues.filter(i => i.kind === "step")).toEqual([]);
  expect(pagePlan(renderableDraft(result.draft).pages.find(p => p.number === printed.number)!)?.incomplete).toEqual([]);
}, 30_000);

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
