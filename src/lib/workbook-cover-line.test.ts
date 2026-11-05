import { describe, expect, it } from "vitest";
import { bookPageContent } from "@/lib/workbook-book";
import { coverLineProblem, workbookCoverLine } from "@/lib/workbook-cover-line";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { planNextWorkbook } from "@/lib/workbook-placement";
import { planWorkbook, type WorkbookPlan } from "@/lib/workbook-plan";
import { bookPersona, firstCustomerProfile, sampleChild, samplePlanInput, type BookPersona } from "@/lib/workbook-sample-profiles";

const BC = curriculumFor("bc")!;
function plan(profile = firstCustomerProfile()) {
  const result = planNextWorkbook({ curriculum: BC, grade: 4, profile, workbooks: [], number: 1 });
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
}
const cover = (plan: WorkbookPlan, child = "I.J.", workbook = 1) => bookPageContent({ curriculum: BC, plan, child, workbook, type: "cover", number: 1 });

describe("the personal cover sentence", () => {
  it("keeps the first customer's approved first sentence, changing only its number phrases", () => {
    const draft = "I.J. did very well on every part of the assessment, so this book moves ahead to numbers to a million, multiplying by tens and pattern rules.";
    const expected = draft.replace("numbers to a million", "larger numbers").replace("multiplying by tens", "multiplication");
    expect(workbookCoverLine(plan(), "I.J.", 1)).toBe(expected);
    expect(cover(plan())).toMatchObject({ madeFrom: "assessment", sentence: expected });
    expect(expected).not.toContain("Warm-ups");
  });

  it.each<[BookPersona, string]>([
    ["ahead", "A.B. did very well on every part of the assessment, so this book moves ahead to larger numbers, multiplication and pattern rules."],
    ["catch-up", "This book starts with larger numbers, step by step, then moves on to growing patterns."],
    ["on-level", "This book works on larger numbers and pattern tables, at the level E.F. showed on the assessment."],
    ["rushed", "This book gives G.H. practice with larger numbers and pattern tables, step by step."],
  ])("prints %s's own true sentence", (persona, sentence) => {
    const { profile, initials } = bookPersona(persona);
    expect(cover(plan(profile), initials)).toMatchObject({ sentence });
    expect(coverLineProblem(sentence)).toBeNull();
    expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(30);
    expect(sentence.length).toBeLessThanOrEqual(180);
    expect(sentence).not.toMatch(/\d|\b(?:grade|score|million|tens)\b|%/i);
  });

  it("uses only topics with taught steps, in their teaching order", () => {
    const p = plan();
    p.newSteps = p.newSteps.filter(s => s.unit !== "5.9");
    expect(workbookCoverLine(p, "I.J.", 1)).toBe("I.J. did very well on every part of the assessment, so this book moves ahead to larger numbers and pattern rules.");
    p.newSteps = [...p.newSteps.filter(s => s.unit === "5.10"), ...p.newSteps.filter(s => s.unit !== "5.10")];
    expect(workbookCoverLine(p, "I.J.", 1)).toContain("pattern rules and larger numbers.");
  });

  it("does not praise every area when an area is weak or unmeasured", () => {
    for (const status of ["developing", "needs-attention"] as const) {
      const p = plan();
      p.personal!.strands[0].status = status;
      expect(workbookCoverLine(p, "I.J.", 1)).not.toContain("every part");
    }
    const p = plan();
    p.personal!.strands = [];
    expect(workbookCoverLine(p, "I.J.", 1)).not.toContain("every part");
  });

  it("never claims a trusted working level with rushing, likely help or low confidence", () => {
    for (const change of [
      (p: WorkbookPlan) => { p.personal!.behaviour!.rushRuns = 1; },
      (p: WorkbookPlan) => { p.personal!.behaviour!.helpLikely = true; },
      (p: WorkbookPlan) => { p.personal!.working!.confidence = "low"; },
    ]) {
      const p = plan();
      change(p);
      expect(workbookCoverLine(p, "I.J.", 1)).toBe("This book gives I.J. practice with larger numbers, multiplication and pattern rules, step by step.");
    }
  });

  it("fits long names by shortening topics, and uses plain words if the name breaks copy limits", () => {
    for (const name of ["Alexandria Charlotte", "A".repeat(200), "Seven", "Grade 4", "First. Next", "A.B."]) {
      expect(coverLineProblem(workbookCoverLine(plan(), name, 1)!)).toBeNull();
    }
  });

  it("keeps the complete no-signal cover unchanged at each supported level", () => {
    for (const level of BC.levels) {
      const child = sampleChild(BC, level.id)!;
      const result = planWorkbook(samplePlanInput(BC, child, "first"));
      if (!result.ok) throw new Error(result.reason);
      const before = cover(result.plan, child.name);
      const withoutAssessment = structuredClone(result.plan);
      withoutAssessment.personal = { ...plan().personal!, hasAssessment: false };
      expect(cover(withoutAssessment, child.name)).toEqual(before);
      expect(workbookCoverLine(result.plan, child.name, 1)).toBeNull();
      if (level.number === 4) expect(before).toMatchObject({ sentence: `${child.name} will count, read and write numbers up to 20, and learn how numbers split into smaller parts.` });
    }
  });

  it("keeps later workbook covers unchanged until marking exists", () => {
    const p = plan();
    const plain = structuredClone(p);
    delete plain.personal;
    expect(cover(p, "I.J.", 2)).toEqual(cover(plain, "I.J.", 2));
    expect(workbookCoverLine(p, "I.J.", 2)).toBeNull();
  });

  it.each([
    "", "Read these. Try them.", "Are you ready?", "This book works on grade four maths.",
    "This book starts at Kindergarten.", "Your score was excellent.", "You got 90% right.",
    "Warm-ups add the 3s and 4s times tables.", "This book teaches numbers to a million.",
    "This book teaches multiplying by tens.", `${"word ".repeat(30)}done.`, `${"a".repeat(181)}.`,
  ])("rejects invalid cover copy: %s", line => {
    expect(coverLineProblem(line)).not.toBeNull();
  });
});
