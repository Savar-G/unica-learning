import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import { dayHeader, dayPageContent, layoutDayPage, planRow } from "./workbook-book";
import { curriculumFor } from "./workbook-curriculum";
import { planWorkbook, type PlannedPage } from "./workbook-plan";
import { sampleChild, samplePlanInput } from "./workbook-sample-profiles";
import { sampleBook } from "./workbook-sample-book";
import { workbookTemplate } from "./workbook-template";
import { regionNames, type DraftPage } from "./workbook-render";
import type { QuestionPackage } from "./question-package";

const curriculum = curriculumFor("bc")!;
const samplePlan = (level: string) => {
  const planned = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, level)!, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  return planned.plan;
};

function lesson(skill: string, step: number, level = 19) {
  const plan = samplePlan(`U${level}`);
  const source = plan.days[0].pages.find(p => p.parts.some(part => part.kind === "new-idea"));
  if (!source) throw new Error("Missing lesson page");
  const original = source.parts.find(part => part.kind === "new-idea");
  if (!original) throw new Error("Missing lesson part");
  const unit = curriculum.skill(skill)?.unit;
  if (!unit) throw new Error("Missing curriculum unit");
  const page: PlannedPage = { ...source, parts: [{ ...original, skills: [skill], step: { skill, step, unit } }] };
  const layout = layoutDayPage(curriculum, plan, 1, page);
  const content = dayPageContent({ curriculum, plan, day: 1, page, layout, questions: [], child: "Alex", workbook: 1 });
  if (content.kind !== "day") throw new Error("Expected lesson content");
  return { plan, page, layout, content };
}

describe("explain the idea before asking", () => {
  it.each([
    ["6.4-prime-composite", 1, "exactly two factors", "more than two"],
    ["6.4-divisibility", 1, "no remainder", "last digit"],
    ["6.4-divisibility", 2, "add the digits", "divisible by 3"],
    ["6.4-divisibility", 3, "last two digits", "both 2 and 3"],
    ["6.4-lcm", 1, "smallest positive multiple", "share"],
    ["6.13-classify-angles", 1, "not their length", "straight angle"],
    ["6.13-classify-angles", 2, "less than a full turn", "Longer sides"],
    ["3.1-place-value-1000", 1, "Ten ones", "one hundred"],
    ["3.1-place-value-1000", 2, "empty place", "no tens"],
    ["3.1-place-value-1000", 3, "not its total", "left over"],
    ["3.1-estimate-quantity", 1, "10 or 25", "groups"],
    ["3.1-estimate-quantity", 2, "100", "groups"],
    ["3.1-estimate-quantity", 3, "guide stated in the question", "each group"],
    ["3.6-increasing-pattern", 1, "goes up", "before any jumps"],
    ["3.6-decreasing-pattern", 1, "goes down", "before any jumps"],
  ] as const)("defines %s step %i for the lesson's own idea", (skill, step, first, second) => {
    const { content } = lesson(skill, step, skill.startsWith("3.") ? 10 : 19);
    const introduction = content.blocks.find(block => block.slot === "worked-example")?.introduction;
    expect(introduction).toContain(first);
    expect(introduction).toContain(second);
    // A concept paragraph cannot replace the separately reserved, checked method.
    expect(content.blocks.find(block => block.slot === "worked-example")?.methods).toEqual([]);
  });

  it("prints the concept and worked example before the first numbered task without changing stored identities", () => {
    const book = sampleBook({ level: "U19", workbookId: "55555555-5555-4555-8555-000000000019",
      childId: "22222222-2222-4222-8222-222222222222", child: "Alex", number: 1 }).draft;
    const source = book.pages.find(page => page.content?.kind === "day" && page.questions.length);
    if (!source || source.content?.kind !== "day") throw new Error("Missing day page");
    const question = { ...source.questions[0], number: 1 };
    const { content } = lesson("6.4-prime-composite", 1);
    const introduction = content.blocks.find(block => block.slot === "worked-example")?.introduction;
    const page: DraftPage = { ...source, questions: [question], content: { ...source.content, consistentLayout: true,
      blocks: [{ slot: "try-first", items: [1] }, { slot: "worked-example", items: [], introduction,
        methods: [{ label: "How it works", lines: ["Is 16 prime or composite?", "16 = 2 × 8. It has more than two factors, so it is composite."] }] }] } };
    const before = structuredClone(page);
    const root = new Window().document.createElement("div");
    root.innerHTML = workbookTemplate().page(page, { qr: "", qrUrl: "" }, book)!;
    const sections = [...root.querySelectorAll("main>section")].map(section => section.getAttribute("data-slot"));
    expect(sections).toEqual(["worked-example", "try-first"]);
    expect(root.textContent?.indexOf("exactly two factors")).toBeLessThan(root.textContent?.indexOf("Is 16 prime or composite?") ?? -1);
    expect(root.querySelector('[data-measure="block-1"] [data-measure="introduction-1"]')).toBeTruthy();
    expect(root.querySelector('[data-measure="block-0"] [data-measure="question-1"]')).toBeTruthy();
    for (const { name } of regionNames(question)) expect(root.querySelector(`[data-measure="${name}"]`)).toBeTruthy();
    expect(root.textContent).toContain("Try one");
    expect(root.textContent).not.toContain("Try this first");
    expect(page).toEqual(before);
  });

  it("keeps the printed sequence before its method even without a template identifier", () => {
    const { plan, page, layout } = lesson("3.1-place-value-1000", 1, 10);
    const scope = { skill: "1.1-count-to-20", step: 1, unit: "1.1" };
    const scoped: PlannedPage = { ...page, parts: page.parts.map(part => ({ ...part, skills: [scope.skill], step: scope })) };
    const slot = layout.slots.findIndex(s => s.slot === "worked-example");
    const example: QuestionPackage = { id: "sequence", ref: { source: "workbook", workbookId: "sequence", page: 3, question: 1 },
      text: "Count back. What are the next two numbers? 7, 6, __, __", skill: { standard: "1.1", skills: [scope.skill] },
      level: 4, difficulty: 1, templateId: null, operation: null, answer: null, steps: [], wrongAnswers: [], easierExample: null,
      item: { format: "write-number", scorable: true, parentChecked: false, error: null,
        regions: [{ id: "first", kind: "box", label: null, answer: { type: "number", value: 5 } },
          { id: "second", kind: "box", label: null, answer: { type: "number", value: 4 } }],
        checks: [{ kind: "sequence", terms: [{ type: "number", value: 7 }, { type: "number", value: 6 }, { region: "first" }, { region: "second" }],
          step: { type: "number", value: -1 } }] } };
    const content = dayPageContent({ curriculum, plan, day: 1, page: scoped, layout, questions: [],
      examples: [{ slot, package: example }], child: "Alex", workbook: 1 });
    if (content.kind !== "day") throw new Error("Expected day content");
    expect(content.blocks[slot].methods?.[0].lines).toEqual([example.text, "Take away 1 each time.", "7, 6, [5], [4]"]);
  });

  it("uses the same teaching-first instruction at upper and lower levels", () => {
    for (const level of [10, 19]) {
      const { page } = lesson(level === 19 ? "6.4-prime-composite" : "3.1-place-value-1000", 1, level);
      expect(dayHeader(curriculum, page, level).subtitle).toBe("Read how it works, then try it.");
    }
  });
});

describe("the plan describes what the day does", () => {
  it.each(["U10", "U19"])("distinguishes learning, checking and final consolidation in %s", level => {
    const plan = samplePlan(level);
    const first = planRow(curriculum, plan, 1), friday = planRow(curriculum, plan, 5), final = planRow(curriculum, plan, 10);
    // (Each row says what its day does: no fixed "Learn, practise, then apply" line on every teaching day.)
    expect(first.second).toMatch(/^Learn it/);
    expect(friday.second).toBe("Practise, then check five skills");
    expect(final).toEqual({ topic: "Put your learning together", second: "Apply the skills from this book" });
    expect(final.topic).not.toBe(planRow(curriculum, plan, 9).topic);
    for (const day of plan.days) {
      const row = planRow(curriculum, plan, day.day);
      expect(row.second).not.toMatch(/^Review$|Friday 5/);
    }
    const seconds = plan.days.map(day => planRow(curriculum, plan, day.day).second);
    expect(new Set(seconds).size, seconds.join(" | ")).toBe(seconds.length);
  });
});
