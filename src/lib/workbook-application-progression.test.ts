import { describe, expect, it } from "vitest";
import { bcStepProgressions } from "./workbook-curriculum";
import { isApplicationPractice, isChallengeOnly } from "./workbook-curriculum/house-templates";
import { U10_APPLICATION_TEMPLATES } from "./workbook-curriculum/u10-application-templates";
import { U19_APPLICATION_TEMPLATES } from "./workbook-curriculum/u19-application-templates";
import { workbookCapacityPlan } from "./workbook-generator";
import { planWorkbook, type PlannedPart } from "./workbook-plan";
import { sampleChild, samplePlanInput } from "./workbook-sample-profiles";
import { buildStepItem, stepRangeProblem, stepTemplateItem } from "./workbook-step-items";

// Application practice (Cedric, 2026-11-16): a later practice page on a step moves the child from the step's ordinary
// drills to authored application tasks. These checks start from the planner's own daily parts, so a planner or filler
// change that lets an application slot fall back to ordinary practice, or lets ordinary practice take application
// tasks, fails here. Retry attempts span the filler's late fallback thresholds (128, 192, 256, 320).

const curriculum = bcStepProgressions();
const ATTEMPTS = [0, 1, 2, 7, 63, 128, 192, 256, 320, 400];
const PLACES = ["on-your-own", "practice-row"] as const;
const key = (step: { skill: string; step: number }) => `${step.skill}#${step.step}`;
// The wording family a child sees: the printed words with every number removed.
const frame = (text: string) => text.replace(/\d[\d,.   ]*/g, "#").replace(/\s+/g, " ").trim().toLowerCase();

function plannedPractice(level: string) {
  const result = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, level)!, "first"));
  if (!result.ok) throw new Error(result.reason);
  const plan = workbookCapacityPlan(curriculum, result.plan);
  const parts: { day: number; part: PlannedPart & { step: NonNullable<PlannedPart["step"]> } }[] = [];
  for (const day of plan.days) for (const page of day.pages) for (const part of page.parts) {
    if (part.kind === "practice" && part.step && part.learningStage) parts.push({ day: day.day, part: part as typeof parts[number]["part"] });
  }
  return parts;
}

const hasApplication = (step: { skill: string; step: number }) =>
  curriculum.skillSteps(step.skill)?.[step.step - 1]?.templates?.some(isApplicationPractice) ?? false;

describe("application practice from the planned daily parts", () => {
  it.each([["U10", U10_APPLICATION_TEMPLATES], ["U19", U19_APPLICATION_TEMPLATES]] as const)(
    "keeps every %s application entry on a step of its own level", (level, entries) => {
      const own = curriculum.level(level)!;
      for (const entry of entries) {
        expect(curriculum.levelOfSkill(entry.skill)?.id, entry.skill).toBe(own.id);
        expect(curriculum.skillSteps(entry.skill)?.[entry.step - 1]?.name).toBe(entry.name);
        expect(entry.templates.length).toBeGreaterThanOrEqual(3);
      }
    });

  it.each(["U10", "U19"])("plans application practice at %s only after the step's independent practice", level => {
    const parts = plannedPractice(level);
    const applications = parts.filter(({ part }) => part.learningStage === "application" && hasApplication(part.step));
    expect(applications.length).toBeGreaterThan(0);
    for (const { day, part } of applications) {
      const earlier = parts.filter(x => key(x.part.step) === key(part.step) && x.part.learningStage !== "application"
        && x.day <= day);
      expect(earlier.length, `${key(part.step)} day ${day}`).toBeGreaterThan(0);
    }
  });

  it.each(["U10", "U19"])("fills %s application slots only with checked application tasks whose wording differs from independent practice", level => {
    const parts = plannedPractice(level);
    const steps = [...new Set(parts.filter(({ part }) => part.learningStage === "application" && hasApplication(part.step))
      .map(({ part }) => key(part.step)))];
    expect(steps.length).toBeGreaterThan(0);
    for (const stepKey of steps) {
      const [skill, n] = stepKey.split("#");
      const step = Number(n);
      const source = curriculum.skillSteps(skill)![step - 1];
      const templates = source.templates!;
      const frames = { application: new Set<string>(), independent: new Set<string>() };
      const indices = { application: new Set<number>(), independent: new Set<number>() };
      for (const { day, part } of parts.filter(({ part }) => key(part.step) === stepKey)) {
        const stage = part.learningStage === "application" ? "application" : part.learningStage === "independent" ? "independent" : null;
        if (!stage) continue;
        for (const place of PLACES) for (const attempt of ATTEMPTS) {
          const filled = stepTemplateItem({ curriculum, skill, step, place, learningStage: stage,
            level: Number(level.slice(1)), day, seed: 977 + day, attempt, ordinal: attempt % 3 });
          // An application slot is never left to a different step or an ordinary drill: it is filled or it is missing.
          expect(filled, `${stepKey} ${stage} ${place} attempt ${attempt}`).not.toBeNull();
          if (!filled) continue;
          expect(filled.ref).toMatchObject({ skill, step });
          const template = templates[filled.ref.index];
          expect(isApplicationPractice(template), `${stepKey} ${stage} attempt ${attempt}: ${filled.text}`).toBe(stage === "application");
          expect(isChallengeOnly(template)).toBe(false);
          expect(filled.ref.difficulty).not.toBe("easy");
          expect(stepRangeProblem(source, filled.text), filled.text).toBeNull();
          const built = buildStepItem(filled.ref, filled.text, { id: `${stage}-${attempt}`, workbookId: "application-progression",
            page: 5, question: 1, level: Number(level.slice(1)), skills: [skill] }, "code");
          expect(built.check.status, filled.text).toBe("checked");
          frames[stage].add(frame(filled.text));
          indices[stage].add(filled.ref.index);
        }
      }
      // Different numbers alone are not progression: no application wording repeats an independent-practice wording.
      expect([...frames.application].filter(f => frames.independent.has(f)), stepKey).toEqual([]);
      expect([...indices.application].filter(i => indices.independent.has(i)), stepKey).toEqual([]);
      // And the application slots vary what the child does.
      expect(indices.application.size, stepKey).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(["U10", "U16", "U19"])("asks each %s application family at most once a day per step, and keeps the rest on the step", level => {
    const result = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, level)!, "first"));
    if (!result.ok) throw new Error(result.reason);
    let capped = 0;
    for (const plan of [result.plan, workbookCapacityPlan(curriculum, result.plan)]) for (const day of plan.days) {
      const asked = new Map<string, number>();
      for (const part of day.pages.flatMap(page => page.parts)) {
        if (part.kind !== "practice" || part.learningStage !== "application" || !part.step) continue;
        const families = curriculum.skillSteps(part.step.skill)![part.step.step - 1].templates!.filter(isApplicationPractice).length;
        if (!families) { expect(part.applicationItems).toBeUndefined(); continue; }
        // Every application part on a step with families states its count, so capacity refills stay independent.
        expect(part.applicationItems).toBeDefined();
        const application = Math.min(part.items, part.applicationItems ?? part.items);
        // (Capacity may later lower a part's items; its slots past applicationItems stay independent either way.)
        if (part.applicationItems !== undefined) { capped++; if (plan === result.plan) expect(part.applicationItems).toBeLessThanOrEqual(part.items); }
        asked.set(key(part.step), (asked.get(key(part.step)) ?? 0) + application);
        expect(asked.get(key(part.step)), `${level} day ${day.day} ${key(part.step)}`).toBeLessThanOrEqual(families);
      }
    }
    if (level === "U10") expect(capped).toBeGreaterThan(0);
  });
});

