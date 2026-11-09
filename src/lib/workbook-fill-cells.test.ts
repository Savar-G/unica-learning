import { expect, it } from "vitest";
import { Window } from "happy-dom";
import { bcStepProgressions } from "./workbook-curriculum";
import { buildStepItem, stepTemplateItem, stepAiItem } from "./workbook-step-items";
import { fullnessProblem, pagePlan, workbookTemplate } from "./workbook-template";
import { sampleBook } from "./workbook-sample-book";
import { layoutProblems } from "./workbook-layout-check";
import { workbookQuality, pageMinimum } from "./workbook-quality";
import { questionWorkSpace, WORK_INSTRUCTION } from "./workbook-work-space";
import { reviewMasteryStep } from "./workbook-review-level";
import type { DraftPage, MeasuredElement } from "./workbook-render";
import type { GeneratedPage, GeneratedQuestion } from "./workbook-generator";

const curriculum = bcStepProgressions();
const id = "1c45456d-0e60-4581-ba41-accde66de3cf";
const book = sampleBook({ level: "U16", workbookId: id, childId: id, child: "Alex", number: 1 }).draft;

function question(skill: string, step: number, n = 1, format?: string, slot: "remember-these" | "mixed-set" = "remember-these"): GeneratedQuestion {
  const fill = Array.from({ length: 48 }, (_, attempt) => stepTemplateItem({ curriculum, skill, step, place: slot, level: 16, day: 1, seed: n * 71, attempt, ordinal: n })).find(fill => fill && (!format || fill.ref.format === format));
  if (!fill) throw new Error(`No test question for ${skill}#${step}`);
  const built = buildStepItem(fill.ref, fill.text, { id: `q${n}`, workbookId: id, page: 5, question: n, level: 16, skills: [skill] }, "code");
  if (!built.package) throw new Error("Invalid test question");
  return { number: n, slot: `1.${n}`, part: slot, place: slot, attempts: 1, check: built.check, package: built.package,
    itemPlan: { type: "template", source: "code", template: fill.ref, numbers: fill.numbers, dayRange: { min: 0, max: 1_000_000, pictures: false, help: "none" },
      item: stepAiItem(`1.${n}`, fill.ref, fill.text) } };
}

function page(questions: GeneratedQuestion[]): GeneratedPage {
  return { number: 5, type: "practice", day: 1, dayLabel: "Day 1", pageOfDay: 3, qrToken: "token-000000000001", attempts: 0, fit: { status: "fits" }, questions,
    content: { kind: "day", id: "test", level: 16, day: 1, page: 3, pages: 8, topic: "Numbers", title: "Practice", subtitle: `Circle your answers. ${WORK_INSTRUCTION}`, grownUp: null, consistentLayout: true,
      blocks: [{ slot: "on-your-own", items: questions.map(q => q.number) }] } };
}

const draft = (p: GeneratedPage): DraftPage => ({ ...p, questions: p.questions.flatMap(q => q.package ? [{ number: q.number, package: q.package }] : []) });

it("rejects the two empty cells made by three own questions and three review questions", () => {
  const p = page(Array.from({ length: 6 }, (_, n) => question("5.1-place-value-million", 1, n + 1)));
  if (p.content?.kind !== "day") throw new Error("Expected day");
  p.content.blocks[0].reviewFrom = 4;
  expect(pagePlan(draft(p))?.incomplete).toEqual([3, 6]);
  expect(fullnessProblem(draft(p), new Map())).toMatch(/empty cell beside question 3/);
  p.content.blocks[0].reviewFrom = 3;
  expect(pagePlan(draft(p))?.incomplete).toEqual([]);
});

it("keeps Friday 5 at five questions with a full-width last row", () => {
  const p = page(Array.from({ length: 5 }, (_, n) => question("5.1-place-value-million", 1, n + 1)));
  if (p.content?.kind !== "day") throw new Error("Expected day");
  p.content.blocks[0].slot = "friday-5";
  expect(pagePlan(draft(p))?.incomplete).toEqual([]);
  expect(workbookTemplate().page(draft(p), { qr: "", qrUrl: "" }, book)).toMatch(/style="grid-column:1\/-1"[^>]*data-measure="question-5"/);
});

it("rejects a legacy mental-math block on a warm-up", () => {
  const p = page([question("5.8-extend-facts", 1)]);
  p.type = "warm-up";
  p.questions[0].place = "in-your-head";
  if (p.content?.kind !== "day") throw new Error("Expected day");
  p.content.blocks = [{ slot: "warm-up", items: [] }, { slot: "in-your-head", label: "Mental math", items: [1] }];
  expect(workbookQuality([p]).issues.some(i => /redundant mental-math/.test(i.reason))).toBe(true);
});

it.each(["4.16-many-to-one", "4.18-money-notation", "5.8-extend-facts", "4.4-add-within-10000", "4.4-subtract-within-10000"])("rejects review below the mastery step of %s", skill => {
  const floor = reviewMasteryStep(curriculum, 16, skill)!;
  expect(floor).toBeGreaterThan(1);
  const old = question(skill, floor);
  old.itemPlan!.template!.step = 1;
  const p = page([old]);
  expect(workbookQuality([p]).issues.filter(i => /below mastery/.test(i.reason))).toHaveLength(1);
  p.questions = [question(skill, floor)];
  expect(workbookQuality([p]).issues.filter(i => /below mastery/.test(i.reason))).toEqual([]);
  p.questions[0].package!.templateId = p.questions[0].package!.templateId!.replace(/#\d+\./, "#1.");
  expect(workbookQuality([p]).issues.some(i => /below mastery/.test(i.reason))).toBe(true);
});

it("adds white calculation space but gives no work area to a place-value recall", () => {
  const calculation = question("4.4-add-within-10000", 5);
  const recall = question("5.1-place-value-million", 1, 2);
  expect(questionWorkSpace(calculation.package!, calculation.place)).toBeGreaterThanOrEqual(64);
  expect(questionWorkSpace(recall.package!, recall.place)).toBe(0);
  const p = page([calculation, recall]);
  const html = workbookTemplate().page(draft(p), { qr: "", qrUrl: "" }, book)!;
  expect(html).toContain('data-measure="workspace-1"');
  expect(html).not.toContain('data-measure="workspace-2"');
  const missing = layoutProblems(draft(p), new Map(), pagePlan(draft(p)));
  expect(missing.some(i => /needs at least 64 px/.test(i.reason))).toBe(true);
  const space: MeasuredElement = { name: "workspace-1", sheet: 0, x: 64, y: 300, width: 300, height: 64, clientWidth: 300, clientHeight: 64, scrollWidth: 300, scrollHeight: 64, visible: true, textPrinted: false, text: "" };
  expect(layoutProblems(draft(p), new Map([[space.name, space]]), pagePlan(draft(p))).filter(i => /white work space/.test(i.reason))).toEqual([]);
  if (p.content?.kind !== "day") throw new Error("Expected day");
  const quality = workbookQuality([p]);
  p.content.subtitle = "Circle your answers.";
  const template = workbookTemplate();
  expect(template.page(draft(p), { qr: "", qrUrl: "" }, book)).toBe(html);
  expect(html).toContain("Show your work under question 1.");
  expect(workbookQuality([p])).toEqual(quality);
  const root = new Window().document.createElement("div");
  root.innerHTML = html;
  const header = { ...space, name: "slot-subtitle", text: root.querySelector('[data-measure="slot-subtitle"]')!.textContent, textPrinted: true };
  const instructionProblems = (measured: Map<string, MeasuredElement>) => template.fit!(draft(p), measured, book)
    .filter(problem => problem.slot === "subtitle" && /printed instruction does not match/.test(problem.reason));
  expect(instructionProblems(new Map([[header.name, header]]))).toEqual([]);
  expect.soft(instructionProblems(new Map([[header.name, { ...header, text: "Circle your answers." }]]))).toHaveLength(1);
  expect.soft(instructionProblems(new Map())).toHaveLength(1);
  const legacy = { ...p, content: { ...p.content, level: 15 } };
  expect(workbookQuality([legacy]).issues.some(i => /lacks its work/.test(i.reason))).toBe(false);
});

it("makes the final bag step compare an event with the combined alternatives", () => {
  const step = curriculum.skillSteps("4.17-predict-outcome")!.at(-1)!;
  for (const index of [0, 2]) {
    const t = step.templates![index];
    expect(t.slots).toHaveProperty("c", "count");
    expect(t.answer).toContain("a > b + c");
  }
});

it("keeps the recall floor and reserves calculation room where the page needs it", () => {
  expect(pageMinimum("practice", 16, false)).toBe(8);
  expect(pageMinimum("practice", 16, false, true)).toBe(6);
  expect(pageMinimum("practice", 4, false, true)).toBe(8);
  expect(pageMinimum("new-idea", 16, false, true)).toBe(2);
  expect(pageMinimum("practice-2", 16, false, true, 2)).toBe(4);
  expect(pageMinimum("practice-2", 16, false, true, 1)).toBe(6);
  expect(questionWorkSpace(question("5.10-pattern-rule", 1, 1, "missing").package!)).toBe(96);
  expect(questionWorkSpace(question("1.1-count-to-20", 3, 1, "missing").package!)).toBe(0);
  expect(questionWorkSpace(question("5.9-multiply-tens", 2, 1, "bare").package!)).toBe(32);
  expect(questionWorkSpace(question("4.6-add-decimals", 4, 1, "bare").package!)).toBe(64);
});

it("keeps scale inference and inverse money work in the mastery templates", () => {
  const scale = curriculum.skillSteps("4.16-many-to-one")!.at(-1)!.templates![3];
  expect(scale.text).toContain("{lower}, {v}, {upper}");
  expect(scale.derived).toMatchObject({ lower: "v - k", upper: "v + k" });
  const money = question("4.18-money-notation", 3, 1, "missing");
  expect(money.package!.text).toContain("How many $10 bills are there?");
  expect(money.itemPlan!.template!.source.answer).toBe("b10");
  expect(questionWorkSpace(money.package!)).toBe(96);
});

it("completes the row after an exchanged task fails the other page's fit check", async () => {
  const { generateWorkbook } = await import("./workbook-generator");
  const { planWorkbook } = await import("./workbook-plan");
  const { sampleChild, samplePlanInput } = await import("./workbook-sample-profiles");
  const { fakeAiClient } = await import("./ai-client-fake");
  const { fakeWorkbookItems } = await import("./workbook-ai-fake");
  const { keySolver } = await import("./workbook-solve-check");
  const planned = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, "U16")!, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  let complete = false, rejectedDonor = false, repaired = false, token = 0;
  const result = await generateWorkbook({ workbookId: "17fc5da1-2442-488a-a450-611a471e73e6", childId: id, number: 1, profileBuild: null, curriculum, plan: planned.plan, book: { child: "Alex" }, itemPolicy: "approved-v1" }, {
    ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(),
    fit: { fits: async p => {
      if (p.number === 24) {
        if (p.questions.length > 6) return { ok: false, problems: [{ question: null, reason: "Control: only six questions fit here" }] };
        if (!pagePlan(p)?.incomplete?.length) { complete = true; if (rejectedDonor) repaired = true; }
      } else if (complete && !rejectedDonor) {
        rejectedDonor = true;
        return { ok: false, problems: [{ question: null, reason: "Control: the exchanged task does not fit the other page" }] };
      }
      return { ok: true };
    } },
    store: { save: async d => ({ status: "saved", draftId: d.id }), draft: async () => null }, qrToken: () => `token-${String(++token).padStart(12, "0")}`,
  });
  expect(rejectedDonor).toBe(true);
  expect(repaired).toBe(true);
  expect(result.status, result.status === "refused" ? result.reason : "").toBe("stored");
  if (result.status === "stored") expect(pagePlan(draft(result.draft.pages.find(p => p.number === 24)!))?.incomplete).toEqual([]);
}, 90_000);

it("prints operation choices and answer instructions for checked Mixed set templates", () => {
  const p = page([question("4.4-add-within-10000", 5, 1, "story", "mixed-set"), question("4.4-subtract-within-10000", 5, 2, "story", "mixed-set")]);
  if (p.content?.kind !== "day") throw new Error("Expected day");
  p.content.blocks[0].slot = "mixed-set";
  p.content.blocks[0].note = "Tick the operation, then write the answer.";
  const html = workbookTemplate().page(draft(p), { qr: "", qrUrl: "" }, book)!;
  expect(html).toContain("Tick the operation, then write the answer.");
  expect(html.match(/Tick the operation:/g)).toHaveLength(2);
  expect(html.match(/Write the answer:/g)).toHaveLength(2);
  expect(pagePlan(draft(p))?.incomplete).toEqual([]);
  expect(workbookQuality([p]).issues.filter(issue => /Mixed set/.test(issue.reason))).toEqual([]);
});

it("keeps the required practice on the new step when a new-idea page exchanges tasks", () => {
  const p = page([question("5.9-distributive", 1), question("5.9-distributive", 1, 2)]);
  p.type = "new-idea";
  p.questions.forEach(q => { q.place = "now-you"; });
  p.expected = p.questions.map(q => ({ slot: q.slot, part: q.part, place: "now-you", steps: ["5.10-pattern-rule#1"] }));
  expect(workbookQuality([p]).issues.some(i => /practises its own step/.test(i.reason))).toBe(true);
  p.questions = [question("5.10-pattern-rule", 1), question("5.10-pattern-rule", 1, 2)];
  p.questions.forEach(q => { q.place = "now-you"; });
  expect(workbookQuality([p]).issues.filter(i => /practises its own step/.test(i.reason))).toEqual([]);
});
