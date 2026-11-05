import { describe, expect, it, vi } from "vitest";
import { childProfileFacts, type ChildProfileInput } from "@/lib/child-profile";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { planNextWorkbook } from "@/lib/workbook-placement";
import { bookPersona, firstCustomerProfile } from "@/lib/workbook-sample-profiles";
import { previewWorkbook, workbookWhy } from "@/lib/workbook-why";

const curriculum = curriculumFor("bc")!;
const facts = (): ChildProfileInput => ({ grade: 4, learning: null, assessment: firstCustomerProfile().assessment, events: [] });
function preview(input = facts(), books: { number: number; levels: number[] }[] = []) {
  const result = previewWorkbook({ curriculum, grade: input.grade, facts: input, workbooks: books }, planNextWorkbook);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe("Why this book and read-only preview", () => {
  it("previews the first customer at U16 with all inputs, start reason, page rows and warnings", () => {
    const { plan, why } = preview();
    expect(plan.level).toBe(16);
    expect(plan.personal?.start.rules).toEqual(expect.arrayContaining(["P5", "P5a", "P5b", "P7", "P8"]));
    expect(plan.personal?.why).toEqual(why);
    expect(why.inputs).toHaveLength(22);
    expect(why.start).toContain("Start at U16");
    expect(why.start).toContain("Grade 5");
    expect(why.start).toContain("No topic at or below school grade is weak");
    expect(why.pages).toHaveLength(1 + plan.days.reduce((n, d) => n + d.pages.length, 0));
    expect(why.inputs.find(i => i.label === "Number facts")?.value).toContain("2s, 5s and 10s");
    expect(why.inputs.find(i => i.label === "Parent's answers")).toMatchObject({ status: "Missing", reason: expect.stringContaining("Learning card not answered") });
    expect(why.warnings).toContain("AI suggestion 5.13 not used: above school grade, so it is not a weakness.");
  });

  it("stores the explanation with the plan and preserves it through JSON storage", () => {
    const { plan, why } = preview();
    const saved = JSON.parse(JSON.stringify(plan));
    const profile = firstCustomerProfile();
    profile.parent.goal = "catch_up";
    profile.assessment!.profile.level.working = 2;
    expect(workbookWhy(saved)).toEqual(why);
    expect(saved.personal.why).toEqual(why);
  });

  it("builds profile facts in memory and calls the planner once without changing its input", () => {
    const input = facts();
    const before = JSON.stringify(input);
    const planner = vi.fn(planNextWorkbook);
    const result = previewWorkbook({ curriculum, grade: 4, facts: input, workbooks: [] }, planner);
    expect(result.ok).toBe(true);
    expect(planner).toHaveBeenCalledOnce();
    expect(planner.mock.calls[0][0].profile).toEqual(childProfileFacts(input));
    expect(JSON.stringify(input)).toBe(before);
  });

  it("keeps the latest workbook level and computes the next book number", () => {
    const input = facts();
    const planner = vi.fn(planNextWorkbook);
    const result = previewWorkbook({ curriculum, grade: 4, facts: input, workbooks: [{ number: 3, levels: [14] }, { number: 1, levels: [13] }] }, planner);
    expect(result.ok).toBe(true);
    expect(planner.mock.calls[0][0].number).toBe(4);
    if (result.ok) expect(result.why.start).toContain("Start at U14. Continue");
  });

  it("shows missing inputs with no test and keeps the legacy planner path", () => {
    const { plan, why } = preview({ grade: 4, learning: null, assessment: null, events: [] });
    expect(plan.personal).toBeUndefined();
    expect(plan.level).toBe(13);
    expect(why.inputs.find(i => i.label === "Working level")?.status).toBe("Missing");
    expect(why.pages.some(p => p.choices.includes("Same as a standard book"))).toBe(true);
  });

  it("fails closed on a test profile it cannot read, without calling the planner", () => {
    const planner = vi.fn(planNextWorkbook);
    const result = previewWorkbook({ curriculum, grade: 4, facts: { ...facts(), assessment: { assessmentId: "", completedAt: null, buildId: null, profile: { schemaVersion: 999 } } }, workbooks: [] }, planner);
    expect(result.ok).toBe(false);
    expect(planner).not.toHaveBeenCalled();
  });

  it("does not retain private answers, names, AI prose, model names or parent notes", () => {
    const input = facts();
    input.assessment!.profile = { ...input.assessment!.profile as object, privateNote: "PRIVATE_SENTINEL", childName: "PRIVATE_SENTINEL" };
    const { plan, why } = preview(input);
    expect(JSON.stringify(plan.personal)).not.toContain("PRIVATE_SENTINEL");
    expect(JSON.stringify(why)).not.toMatch(/\bS\d+\b|\bP\d+\b|mul2510|catch_up|under_1h|howWeHelp|early-sign|needs-attention/);
  });

  it("shows the actual catch-up plan, Extra blocks and required time shortfalls", () => {
    const profile = bookPersona("catch-up").profile;
    const result = planNextWorkbook({ curriculum, grade: 4, profile, workbooks: [], number: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const why = workbookWhy(result.plan)!;
    expect(why.start).toContain("lowest clearly weak topic");
    expect(why.inputs.find(i => i.label === "Parent's answers")?.value).toContain("Catch up");
    expect(why.pages.some(p => p.choices.some(c => c.includes("Extra")))).toBe(true);
    result.plan.personal!.timeShortfalls = [{ day: 1, target: 20, required: 22, shortfall: 2 }];
    expect(workbookWhy(result.plan)!.warnings).toContain("Day 1: 22 required minutes exceed the 20-minute target by 2 minutes.");
  });

  it("shows a report mismatch without changing placement", () => {
    const result = planNextWorkbook({ curriculum, grade: 4, profile: firstCustomerProfile(), workbooks: [], number: 1, report: { howWeHelp: "behind", minutes: 55 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.level).toBe(16);
    expect(result.plan.personal!.why!.warnings.some(w => w.includes("do not agree"))).toBe(true);
    expect(result.plan.personal!.why!.inputs.find(i => i.label === "Report recommendation")?.value).toBe("Catch up");
  });

  it("returns no invented history for an old plan without personal data", () => {
    const { plan } = preview();
    delete plan.personal;
    expect(workbookWhy(plan)).toBeNull();
  });

  it("uses existing AI notes only with the same rebuilt facts and explains excluded older notes", () => {
    const input = facts();
    const previous = childProfileFacts(input)!;
    previous.ai = { model: "private-model", findings: [{ standard: "4.4", hypothesis: "PRIVATE_HYPOTHESIS", events: [] }] };
    const current = previewWorkbook({ curriculum, grade: 4, facts: input, workbooks: [], previous }, planNextWorkbook);
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    expect(current.why.inputs.find(i => i.label === "AI notes from later learning")?.status).toBe("Not used");
    expect(JSON.stringify(current.why)).not.toMatch(/PRIVATE_HYPOTHESIS|private-model/);
    previous.parent.goal = "catch_up";
    const stale = previewWorkbook({ curriculum, grade: 4, facts: input, workbooks: [], previous }, planNextWorkbook);
    expect(stale.ok).toBe(true);
    if (stale.ok) expect(stale.why.warnings).toContain("Stored AI notes were excluded because the profile facts changed. A real run may write new notes.");
  });
});
