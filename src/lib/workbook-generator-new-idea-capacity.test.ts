import { expect, it } from "vitest";
import { curriculumFor } from "./workbook-curriculum";
import { prepareWorkbookCapacity, workbookCapacityPlan, type FitCheck, type GenerateInput } from "./workbook-generator";
import { planWorkbook } from "./workbook-plan";
import { sampleChild, samplePlanInput } from "./workbook-sample-profiles";

// #759 page 52: the minimum two-question pattern lesson is stretched to fill its page.
// Spare physical space must get another pair before the existing rows grow into it.
function patternLesson(): GenerateInput {
  const curriculum = curriculumFor("bc")!;
  const planned = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, "U16")!, "first"));
  if (!planned.ok) throw Error(planned.reason);
  const full = workbookCapacityPlan(curriculum, planned.plan);
  const day = full.days.find(d => d.day === 7)!;
  const lesson = day.pages.find(p => p.type === "new-idea")!;
  expect(lesson.parts.find(p => p.kind === "new-idea")?.step).toMatchObject({ skill: "5.10-pattern-rule", step: 1 });
  const capacity = lesson.capacity!.map(s => s.slot === "now-you" ? { ...s, items: 2 } : s);
  return { workbookId: "17fc5da1-2442-488a-a450-611a471e73e6",
    childId: "00000000-0000-4000-8000-000000000759", number: 1, profileBuild: null,
    curriculum, itemPolicy: "approved-v1", book: { child: "Alex" },
    plan: { ...full, days: [{ ...day, pages: [{ ...lesson, capacity }] }] } };
}

it("fills a U16 pattern lesson beyond its measured two-question minimum when four questions fit", async () => {
  const result = await prepareWorkbookCapacity(patternLesson(), { fits: async page => {
    if (page.content?.kind !== "day") throw Error("not a day page");
    const count = page.content.blocks.find(b => b.slot === "now-you")?.items.length ?? 0;
    if (count > 4) return { ok: false, problems: [{ question: null, reason: "The questions exceed the content area." }] };
    // The outlined work area looks full even at two questions; four questions physically fit.
    return { ok: true };
  } });
  const page = result.days[0].pages[0];
  expect(page.capacity?.find(s => s.slot === "now-you")?.items).toBe(4);
  expect(page.capacityChecked).toBe(true);
  const questions = Object.values(page.itemContracts ?? {}).filter(c => c?.item.slot.startsWith("1."));
  expect(questions.map(c => [c?.template?.skill, c?.template?.step])).toEqual(Array(4).fill(["5.10-pattern-rule", 1]));
}, 60_000);

it("keeps the two-question lesson when another pair would overflow", async () => {
  const fit: FitCheck = { fits: async page => {
    if (page.content?.kind !== "day") throw Error("not a day page");
    const count = page.content.blocks.find(b => b.slot === "now-you")?.items.length ?? 0;
    if (count > 2) return { ok: false, problems: [{ question: null, reason: "The questions exceed the content area." }] };
    return page.content.atMaximum ? { ok: true } : { ok: false, problems: [
      { question: null, kind: "fullness", reason: "The page has room below its questions." },
    ] };
  } };
  const result = await prepareWorkbookCapacity(patternLesson(), fit);
  expect(result.days[0].pages[0].capacity?.find(s => s.slot === "now-you")?.items).toBe(2);
  expect(result.days[0].pages[0].capacityChecked).toBe(true);
}, 60_000);

it("keeps three lesson questions in complete rows when a fourth cannot fit", async () => {
  const result = await prepareWorkbookCapacity(patternLesson(), { fits: async page => {
    if (page.content?.kind !== "day") throw Error("not a day page");
    const count = page.content.blocks.find(b => b.slot === "now-you")?.items.length ?? 0;
    return count <= 3 ? { ok: true } : { ok: false, problems: [{ question: null, reason: "The questions exceed the content area." }] };
  } });
  expect(result.days[0].pages[0].capacity?.find(s => s.slot === "now-you")?.items).toBe(3);
}, 60_000);

it("keeps the lesson's error question on its own step instead of borrowing a shorter review to fit four", async () => {
  const result = await prepareWorkbookCapacity(patternLesson(), { fits: async page => {
    if (page.content?.kind !== "day") throw Error("not a day page");
    const questions = page.content.blocks.find(b => b.slot === "now-you")?.items ?? [];
    const errorNumber = page.content.blocks.find(b => b.slot === "spot-the-error")?.items[0];
    const error = page.questions.find(q => q.number === errorNumber);
    const ownError = error?.package.templateId?.startsWith("5.10-pattern-rule#1.");
    return questions.length < 4 || !ownError ? { ok: true } : { ok: false, problems: [
      { question: errorNumber ?? null, reason: "The lesson's error question runs past the content area." },
    ] };
  } });
  const page = result.days[0].pages[0];
  expect(page.capacity?.find(s => s.slot === "now-you")?.items).toBe(3);
  const questions = Object.values(page.itemContracts ?? {});
  expect(questions.map(c => [c?.template?.skill, c?.template?.step])).toEqual(Array(4).fill(["5.10-pattern-rule", 1]));
}, 60_000);
