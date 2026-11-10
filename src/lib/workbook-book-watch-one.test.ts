import { expect, it } from "vitest";
import { curriculumFor } from "./workbook-curriculum";
import { dayPageContent, layoutDayPage } from "./workbook-book";
import { buildQuestion } from "./workbook-generator-items";
import { planNextWorkbook } from "./workbook-placement";

// #811 (Kai's U10 book 2, page 61): a Watch one panel printed its example's question, then the worked example's own
// line asking it again in other words: "Is 240 close to 30 or to 300?" over "Is 240 close to 30 or 300?".
it("a Watch one panel asks a relation example's question once", () => {
  const curriculum = curriculumFor("bc")!;
  const placed = planNextWorkbook({ curriculum, grade: 3, profile: null, number: 2, workbooks: [{ number: 1, levels: [10] }] });
  if (!placed.ok) throw new Error(placed.reason);
  const plan = placed.plan;
  const curriculumSteps = (skill: string) => curriculum.skillSteps(skill) ?? [];
  // A Watch one panel on a taught step (one with templates): it prints the example under the step's teaching.
  const found = plan.days.flatMap((d) => d.pages.map((page) => ({ day: d.day, page, layout: layoutDayPage(curriculum, plan, d.day, page) })))
    .flatMap((x) => x.layout.slots.flatMap((s, i) => {
      const step = x.page.parts[s.part]?.step;
      return s.slot === "watch-one" && step && curriculumSteps(step.skill)[step.step - 1]?.templates?.length ? [{ ...x, index: i, skill: step.skill }] : [];
    }))[0];
  expect(found).toBeDefined();
  const built = buildQuestion({
    slot: "e1", skill: found.skill, difficulty: 2, text: "Is 240 close to 30 or to 300?", format: "relation", figure: null, numbers: [{ type: "number", value: 240 }],
    places: null, direction: null, sequence: null, pattern: null, relation: { kind: "closer", to: [30, 300], labels: [] }, figureShows: null, name: null, thing: null,
    operation: null, easier: null, wrongAnswers: [], shownWrong: null,
  }, { id: "e1", workbookId: "00000000-0000-4000-8000-000000000811", page: found.page.number, question: 1, level: plan.level, skills: [found.skill] });
  expect(built.package, JSON.stringify(built.check)).not.toBeNull();
  const content = dayPageContent({ curriculum, plan, day: found.day, page: found.page, layout: found.layout, questions: [], examples: [{ slot: found.index, package: built.package! }], child: "Kai", workbook: 2 });
  if (content.kind !== "day") throw new Error("not a day page");
  const lines = (content.blocks[found.index] as { lines?: string[] }).lines ?? [];
  expect(lines.filter((l) => /close to 30 or (?:to )?300\?/.test(l))).toHaveLength(1);
});
