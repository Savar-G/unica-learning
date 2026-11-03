import { describe, expect, it } from "vitest";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { planWorkbook, type PlanInput, type WorkbookPlan } from "@/lib/workbook-plan";
import { sampleChild, samplePlanInput } from "@/lib/workbook-sample-profiles";

const BC = curriculumFor("bc")!;
const plan = (i: PlanInput): WorkbookPlan => {
  const r = planWorkbook(i);
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
};
const first = (level: string) => plan(samplePlanInput(BC, sampleChild(BC, level)!, "first"));

describe("the step progression (#489)", () => {
  it("starts the next step on every teaching day, spread over a window of the level's skills, with no second unit", () => {
    for (const level of ["U4", "U10", "U14", "U26"]) {
      const p = first(level);
      expect(p.units.B, level).toBeNull();
      expect(p.newSteps.map((s) => s.day), level).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      // The first skill in skeleton order starts the book; each skill's steps come in their own order.
      const own = BC.levelSkills(level)!;
      expect(p.newSteps[0].skill, level).toBe(own.find((s) => s.delivery !== "warm-up" && s.requires.every((r) => !own.some((o) => o.id === r)))!.id);
      for (const skill of new Set(p.newSteps.map((s) => s.skill))) {
        const mine = p.newSteps.filter((s) => s.skill === skill).map((s) => s.step);
        expect(mine, `${level} ${skill}`).toEqual([...mine].sort((a, b) => a - b));
      }
      // A skill starts only when its prerequisites in the level are all taught on earlier days.
      for (const s of p.newSteps) for (const r of BC.skill(s.skill)!.requires.filter((r) => own.some((o) => o.id === r))) {
        const steps = BC.skillSteps(r)!.length;
        expect(p.newSteps.filter((x) => x.skill === r && x.day < s.day).length, `${level} ${s.skill} needs ${r}`).toBe(steps);
      }
      // Several of the level's skills, not one for most of the book (the U4 review, item 13).
      expect(new Set(p.newSteps.map((s) => s.skill)).size, level).toBeGreaterThanOrEqual(3);
      expect(p.days.flatMap((d) => d.pages).some((pg) => pg.type === "unit-b"), level).toBe(false);
    }
  });

  it("aims every teaching part at the day's step, the Challenge too", () => {
    const p = first("U4");
    for (const d of p.days.filter((d) => d.day <= 9)) {
      const today = p.newSteps.find((s) => s.day === d.day)!;
      for (const part of d.pages.flatMap((pg) => pg.parts).filter((x) => x.step)) expect(part.step, `day ${d.day} ${part.kind}`).toEqual({ unit: today.unit, skill: today.skill, step: today.step });
      expect(d.pages.flatMap((pg) => pg.parts).some((x) => x.kind === "challenge" && x.step?.skill === today.skill && x.step.step === today.step)).toBe(true);
    }
  });

  it("reviews only steps already done before the day: this book's earlier days, passed steps or earlier levels", () => {
    for (const level of ["U4", "U14"]) {
      const p = first(level);
      const own = new Set(BC.levelSkills(level)!.map((s) => s.id));
      for (const d of p.days) for (const part of d.pages.flatMap((pg) => pg.parts)) {
        for (const r of part.reviewSteps ?? []) {
          if (["unit-check", "already-know-it", "level-test"].includes(part.kind)) continue;
          if (own.has(r.skill)) expect(p.newSteps.some((s) => s.skill === r.skill && s.step === r.step && s.day < d.day) || part.kind === "show-what-you-know", `${level} day ${d.day} ${part.kind} ${r.skill}#${r.step}`).toBe(true);
          else expect(BC.levelOfSkill(r.skill)!.number, `${level} ${r.skill}`).toBeLessThan(BC.level(level)!.number);
        }
      }
    }
  });

  it("keeps the unit A and B schedule on request, for plans made before #489", () => {
    const i = samplePlanInput(BC, sampleChild(BC, "U10")!, "first");
    expect(plan({ ...i, progression: "units" }).units.B).not.toBeNull();
  });
});
