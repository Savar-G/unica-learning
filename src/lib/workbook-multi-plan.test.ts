import { describe, expect, it } from "vitest";
import { deriveWorkbookProgress } from "./workbook-progress";
import { planWorkbook, type PlanInput, type ProgressPlanInput } from "./workbook-plan";
import { progressFixture } from "./workbook-progress-plan.fixture";

function decision(skill: string, right: number, step = 2): { planning: PlanInput; progress: ProgressPlanInput } {
  const f = progressFixture(right, 100, step, 4, skill);
  const result = deriveWorkbookProgress(f.snapshot, f.curriculum, f.history);
  if (!result.ok) throw Error(result.reason);
  return { planning: f.planning, progress: { version: 1, priorPassedSteps: f.snapshot.priorMastery.passedSteps, decision: result.decision } };
}
function input(a: ReturnType<typeof decision>, b: ReturnType<typeof decision>): PlanInput {
  return { ...a.planning, passed: { ...a.progress.decision.passed, ...b.progress.decision.passed }, previewDecisions: [a.progress, b.progress] };
}
describe("multiple progress decisions", () => {
  it("keeps a dependent locked when its prerequisite is held", () => {
    const a = decision("1.1-count-to-20", 80), b = decision("1.1-read-write-20", 100);
    const result = planWorkbook(input(a, b));
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.plan.newSteps.some(s => s.skill === a.progress.decision.selection.skill)).toBe(true);
    expect(result.plan.newSteps.some(s => s.skill === b.progress.decision.selection.skill)).toBe(false);
    const control = planWorkbook(input(decision("1.1-count-to-20", 100), b));
    expect(control.ok, JSON.stringify(control)).toBe(true);
    if (control.ok) expect(control.plan.newSteps.some(s => s.skill === b.progress.decision.selection.skill)).toBe(true);
  });
  it("does not unlock a descendant through a completed intermediate skill", () => {
    const a = decision("1.1-count-to-20", 80), b = decision("1.1-read-write-20", 100, 3);
    const p = input(a, b);
    p.passed = { ...p.passed, "1.1-count-on-back": 4 };
    const result = planWorkbook(p);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.plan.newSteps.some(s => s.skill === "1.1-number-line-20")).toBe(false);
  });
  it("applies advances to two independent skills in one plan", () => {
    const a = decision("1.1-count-to-20", 100), b = decision("1.1-subitize-to-10", 100);
    const result = planWorkbook(input(a, b));
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.plan.newSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: a.progress.decision.selection.skill, step: 3 }),
      expect.objectContaining({ skill: b.progress.decision.selection.skill, step: 3 }),
    ]));
  });
  it("refuses duplicate and malformed decisions", () => {
    const a = decision("1.1-count-to-20", 80);
    const base = { ...a.planning, passed: a.progress.decision.passed };
    expect(planWorkbook({ ...base, previewDecisions: [a.progress, a.progress] }).ok).toBe(false);
    expect(planWorkbook({ ...base, previewDecisions: [null] as unknown as ProgressPlanInput[] }).ok).toBe(false);
  });
  it("returns the exact single-skill result", () => {
    const a = decision("1.1-count-to-20", 80);
    const base = { ...a.planning, passed: a.progress.decision.passed };
    expect(planWorkbook({ ...base, previewDecisions: [a.progress] })).toEqual(planWorkbook({ ...base, progress: a.progress }));
  });
});

describe("multi-skill preview composition", () => {
  it("preserves the complete single-skill preview", async () => {
    const { previewMultipleWorkbookSkills, previewNextWorkbookPlan } = await import("./workbook-progress-plan");
    const f = progressFixture(80, 100, 2, 4, "1.1-count-to-20");
    expect(previewMultipleWorkbookSkills([f])).toEqual(previewNextWorkbookPlan(f));
  });
  it("refuses skills from different snapshot cutoffs", async () => {
    const { previewMultipleWorkbookSkills } = await import("./workbook-progress-plan");
    const a = progressFixture(80, 100, 2, 4, "1.1-count-to-20");
    const b = progressFixture(100, 100, 2, 4, "1.1-subitize-to-10");
    b.snapshot.cutoff++;
    expect(previewMultipleWorkbookSkills([a, b])).toMatchObject({ ok: false, reason: "invalid-contract" });
  });
  it("validates both skills and plans once without unlocking a held prerequisite", async () => {
    const { previewMultipleWorkbookSkills } = await import("./workbook-progress-plan");
    const a = progressFixture(80, 100, 2, 4, "1.1-count-to-20");
    const b = progressFixture(100, 100, 2, 4, "1.1-read-write-20");
    const passed = { [a.curriculum.skill.id]: 1, [b.curriculum.skill.id]: 1 };
    a.planning.passed = passed; b.planning.passed = passed;
    b.sample.forEach((item, i) => { item.expected.identity.pageId = `other-page-${i}`; item.expected.identity.itemId = `other-item-${i}`; });
    b.originals.forEach((item, i) => { item.first.observation.identity.pageId = `other-page-${i}`; item.first.observation.identity.itemId = `other-item-${i}`; });
    const result = previewMultipleWorkbookSkills([a, b]);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok || result.version !== 2) return;
    expect(result.decisions).toHaveLength(2);
    expect(result.consumedVersions).toHaveLength(200);
    expect(result.plan.newSteps.some(s => s.skill === a.curriculum.skill.id)).toBe(true);
    expect(result.plan.newSteps.some(s => s.skill === b.curriculum.skill.id)).toBe(false);
    expect(planWorkbook(result.planningInput)).toEqual({ ok: true, plan: result.plan });
  });
});
