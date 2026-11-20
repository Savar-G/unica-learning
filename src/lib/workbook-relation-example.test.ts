import { expect, it } from "vitest";
import { dayPageContent, layoutDayPage, templateMethod } from "./workbook-book";
import { curriculumFor } from "./workbook-curriculum";
import { planWorkbook } from "./workbook-plan";
import { sampleChild, samplePlanInput } from "./workbook-sample-profiles";
import { buildStepItem, stepTemplateItem } from "./workbook-step-items";
import type { QuestionPackage } from "./question-package";

it.each([
  { kind: "more", numbers: [300, 30], answer: "bookcase" },
  { kind: "fewer", numbers: [300, 30], answer: "shelf" },
  { kind: "equal", numbers: [30, 30], answer: "equal" },
  { kind: "equal", numbers: [300, 30], answer: "not equal" },
] as const)("rejects a $kind comparison as teaching for sensible real-world estimation", ({ kind, numbers, answer }) => {
  const curriculum = curriculumFor("bc")!;
  const planned = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, "U10")!, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  const page = planned.plan.days[7].pages.find(p => p.type === "new-idea")!;
  const layout = layoutDayPage(curriculum, planned.plan, 8, page);
  const slot = layout.slots.findIndex(s => s.slot === "worked-example");
  expect(slot).toBeGreaterThanOrEqual(0);
  const pkg: QuestionPackage = {
    id: "example", ref: { source: "workbook", workbookId: "example-book", page: 60, question: 1 },
    level: 10, skill: { standard: "3.1", skills: ["3.1-estimate-quantity"] }, difficulty: 1,
    text: "A bookcase holds 300 books and a shelf holds 30 books. Compare the amounts.",
    operation: null, answer: null, steps: [], wrongAnswers: [], easierExample: null, templateId: null,
    item: { format: "tick-one", scorable: true, parentChecked: false, error: null,
      regions: [{ id: "answer", kind: "choice", mark: "tick", label: null,
        choices: kind === "equal" ? ["equal", "not equal"] : ["bookcase", "shelf"], answer }],
      checks: [{ kind: "relation", relation: kind, region: "answer", numbers: [...numbers], to: [], labels: ["bookcase", "shelf"] }] },
  };
  const content = dayPageContent({ curriculum, plan: planned.plan, day: 8, page, layout,
    questions: [], examples: [{ slot, package: pkg }], child: "Alex", workbook: 1 });
  if (content.kind !== "day") throw new Error("not a day page");
  const lines = content.blocks.find(b => b.slot === "worked-example")?.methods?.flatMap(m => m.lines) ?? [];
  expect(lines).toEqual([]);
});

it("does not replace an unsupported reserved example with a fixed answer-only source example", () => {
  const curriculum = curriculumFor("bc")!;
  const planned = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, "U10")!, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  const page = planned.plan.days[7].pages.find(p => p.type === "new-idea")!;
  const layout = layoutDayPage(curriculum, planned.plan, 8, page);
  const content = dayPageContent({ curriculum, plan: planned.plan, day: 8, page, layout,
    questions: [], examples: [], child: "Alex", workbook: 1 });
  if (content.kind !== "day") throw new Error("not a day page");
  expect(content.blocks.find(b => b.slot === "worked-example")?.methods ?? []).toEqual([]);
  expect(content.blocks.find(b => b.slot === "worked-example")?.explain).not.toMatch(/3000|fits|far too many/);
});

it.each(["worked-example", "watch-one", "reminder"] as const)("keeps the reserved question and method in a %s, and rejects step drift", kind => {
  const curriculum = curriculumFor("bc")!;
  const planned = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, "U10")!, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  const page = planned.plan.days[0].pages.find(p => p.type === "new-idea")!;
  const layout = layoutDayPage(curriculum, planned.plan, 1, page);
  const slot = layout.slots.findIndex(s => s.slot === "worked-example");
  expect(slot).toBeGreaterThanOrEqual(0);
  const step = page.parts[layout.slots[slot].part].step;
  if (!step) throw new Error("missing teaching step");
  let example: QuestionPackage | null = null;
  for (let attempt = 0; attempt < 80 && !example; attempt++) {
    const filled = stepTemplateItem({ curriculum, skill: step.skill, step: step.step, place: "worked-example",
      level: 10, day: 1, seed: 121, attempt, ordinal: 0 });
    if (!filled || !templateMethod(filled.ref.source, filled.text, filled.ref)) continue;
    example = buildStepItem(filled.ref, filled.text, { id: "reserved", workbookId: "reserved-book", page: 3,
      question: 1, level: 10, skills: [step.skill] }, "code").package;
  }
  if (!example) throw new Error("no supported approved teaching example");
  const target: typeof layout = { ...layout, slots: layout.slots.map((s, i) => i === slot ? { ...s, slot: kind } : s) };
  const render = (pkg: QuestionPackage) => {
    const content = dayPageContent({ curriculum, plan: planned.plan, day: 1, page, layout: target,
      questions: [], examples: [{ slot, package: pkg }], child: "Alex", workbook: 1 });
    if (content.kind !== "day") throw new Error("not a day page");
    const block = content.blocks[slot];
    return [...(block.lines ?? []), ...(block.methods ?? []).flatMap(m => m.lines)];
  };
  const lines = render(example);
  expect(lines).toContain(example.text);
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.join(" ")).toMatch(/hundreds|tens|ones/);
  expect(render({ ...example, templateId: `${step.skill}#${step.step + 1}.1:bare` })).toEqual([]);
});
