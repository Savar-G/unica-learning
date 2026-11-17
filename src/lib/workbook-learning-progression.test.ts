import { describe, expect, it } from "vitest";
import { bcStepProgressions } from "./workbook-curriculum";
import { isApplicationPractice, isChallengeOnly } from "./workbook-curriculum/house-templates";
import { workbookCapacityPlan } from "./workbook-generator";
import { planWorkbook } from "./workbook-plan";
import { sampleChild, samplePlanInput } from "./workbook-sample-profiles";
import { buildStepItem, stepTemplateItem } from "./workbook-step-items";

const curriculum = bcStepProgressions();

describe("a daily learning sequence", () => {
  it.each(["U1", "U4", "U10", "U16", "U19", "U30"])("keeps eight core pages and a required Challenge at %s", level => {
    const result = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, level)!, "first"));
    if (!result.ok) throw new Error(result.reason);
    for (const day of result.plan.days) {
      expect(day.pages).toHaveLength(8);
      expect(day.pages.every(page => page.parts.some(part => part.items > 0 && !part.extra))).toBe(true);
      const challenges = day.pages.flatMap(page => page.parts).filter(part => part.kind === "challenge");
      expect(challenges.length).toBeGreaterThan(0);
      expect(challenges.every(part => !part.extra)).toBe(true);
    }
  });

  it("fills likelihood review with declared earlier steps rather than more unscorable likelihood questions", () => {
    const result = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, "U4")!, "first"));
    if (!result.ok) throw new Error(result.reason);
    const plan = workbookCapacityPlan(curriculum, result.plan);
    const day = plan.days.find(day => day.pages.some(page => page.type === "new-idea"
      && page.parts.some(part => part.step?.skill === "1.10-likelihood-words")))!;
    const page = day.pages.find(page => page.type === "new-idea")!;
    const reviews = page.parts.filter(part => part.kind === "remember-these");
    expect(reviews.length).toBeGreaterThan(0);
    for (const part of reviews) {
      expect(part.reviewSteps?.length).toBeGreaterThan(0);
      expect(part.skills.every(skill => !skill.includes("likelihood"))).toBe(true);
      expect(part.skills).toEqual([...new Set(part.reviewSteps!.map(step => step.skill))]);
    }
  });

  it("uses application instead of repeating the same faded lesson on a later same-step page", () => {
    const result = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, "U19")!, "first"));
    if (!result.ok) throw new Error(result.reason);
    let applications = 0;
    for (const day of result.plan.days) {
      const seen = new Set<string>();
      for (const part of day.pages.flatMap(page => page.parts).filter(part => part.kind === "practice")) {
        if (!part.step) continue;
        const key = `${part.step.skill}#${part.step.step}`;
        if (seen.has(key)) {
          expect(part.learningStage).toBe("application");
          expect(part.faded).toBeUndefined();
          applications++;
        }
        seen.add(key);
      }
    }
    expect(applications).toBeGreaterThan(0);
  });

  it.each([1, 2])("gives prime step %i distinct application tasks without easy retry fallbacks", step => {
    const templates = curriculum.skillSteps("6.4-prime-composite")![step - 1].templates!;
    const applicationIndices = new Set<number>();
    const ordinaryIndices = new Set<number>();
    for (const learningStage of ["independent", "application"] as const) {
      for (let attempt = 0; attempt < 64; attempt++) {
        const filled = stepTemplateItem({ curriculum, skill: "6.4-prime-composite", step, place: "on-your-own",
          learningStage, level: 19, day: 1, seed: 121, attempt, ordinal: 0 });
        expect(filled).not.toBeNull();
        if (!filled) continue;
        expect(filled.ref.difficulty).not.toBe("easy");
        expect(isChallengeOnly(templates[filled.ref.index])).toBe(false);
        expect(isApplicationPractice(templates[filled.ref.index])).toBe(learningStage === "application");
        (learningStage === "application" ? applicationIndices : ordinaryIndices).add(filled.ref.index);
        const built = buildStepItem(filled.ref, filled.text, { id: `task-${attempt}`, workbookId: "progression",
          page: 5, question: 1, level: 19, skills: ["6.4-prime-composite"] }, "code");
        expect(built.check.status, filled.text).toBe("checked");
      }
    }
    expect(applicationIndices.size).toBeGreaterThanOrEqual(3);
    expect([...applicationIndices].some(index => ordinaryIndices.has(index))).toBe(false);
  });
});
