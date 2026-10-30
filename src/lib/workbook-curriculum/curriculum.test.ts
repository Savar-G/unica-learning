import { describe, expect, it } from "vitest";
import { BC_SKILL_MAP } from "../assessment/skill-map";
import { BC_CURRICULUM, curriculumFor, curriculumProblems, type CurriculumData, type CurriculumSkill } from "./index";

const bc = curriculumFor("bc")!;

describe("levels", () => {
  it("has a map for BC only", () => {
    expect(curriculumFor("bc")?.key).toBe("bc");
    expect(curriculumFor("on")).toBeNull();
    expect(curriculumFor("toString")).toBeNull();
  });

  it("lists U1 to U30 in order", () => {
    expect(bc.levels.map((l) => l.id)).toEqual(Array.from({ length: 30 }, (_, i) => `U${i + 1}`));
  });

  it("reads a level by id, with its plan from the skeleton", () => {
    expect(bc.level("U1")).toEqual({
      curriculum: "bc",
      id: "U1",
      number: 1,
      title: "Counting to 10 and first patterns",
      topics: "Counting and writing numbers to 10; repeating patterns; how likely everyday things are",
      band: "early",
      units: ["K1", "K4", "K10"],
      pagesPerDay: { min: 4, max: 6 },
      lead: "parent-led",
      dailyMinutes: { min: 15, max: 20 },
      practicePageMinutes: 2,
      levelTestMinutes: { min: 15, max: 20 },
      reviewShare: 0.1,
      skillPages: 122,
      workbooks: 3,
      schoolGrade: 0,
    });
  });
});

describe("units", () => {
  it("reads a unit (one BC standard) by its code", () => {
    expect(bc.unit("3.3")).toEqual({
      curriculum: "bc",
      code: "3.3",
      text: "addition and subtraction to 1000",
      strand: "O",
      level: "U10",
    });
    expect(bc.unit("3.99")).toBeNull();
  });

  it("lists every unit of a level, each in one level only", () => {
    const codes = bc.levels.flatMap((l) => l.units);
    expect(new Set(codes).size).toBe(codes.length);
    for (const l of bc.levels) for (const code of l.units) expect(bc.unit(code)?.level, code).toBe(l.id);
  });
});

describe("a level's skills", () => {
  it("reads U10's skills in the skeleton's order, units kept together", () => {
    expect(bc.levelSkills("U10")?.map((s) => s.id)).toEqual([
      "3.1-place-value-1000",
      "3.1-compare-order-1000",
      "3.1-count-1000",
      "3.1-estimate-quantity",
      "3.3-add-within-1000",
      "3.3-subtract-within-1000",
      "3.3-word-problems-1000",
      "3.4-recall-addition-20",
      "3.4-subtraction-facts-20",
      "3.6-increasing-pattern",
      "3.6-decreasing-pattern",
      "3.6-growth-amount",
      "3.13-simulated-likelihood",
      "3.13-independent-trials",
    ]);
  });

  it("gives every level U1 to U30 its skills, 541 in all, each once", () => {
    const ids = Array.from({ length: 30 }, (_, i) => bc.levelSkills(`U${i + 1}`) ?? []).flat().map((s) => s.id);
    expect(ids).toHaveLength(541);
    expect(new Set(ids).size).toBe(541);
    for (let n = 1; n <= 30; n++) expect(bc.levelSkills(`U${n}`)?.length).toBeGreaterThan(0);
  });

  it("knows no level outside U1 to U30", () => {
    expect(bc.level("U31")).toBeNull();
    expect(bc.levelSkills("U0")).toBeNull();
  });
});

describe("skills and steps", () => {
  it("reads a skill by its BC skill id", () => {
    expect(bc.skill("3.3-add-within-1000")).toEqual({
      curriculum: "bc",
      id: "3.3-add-within-1000",
      text: "Add within 1000 with regrouping",
      level: "U10",
      unit: "3.3",
      order: 5,
      position: "U10.2.1",
      importance: "core",
      difficulty: 2,
      delivery: "new-step",
      response: "write-number",
      scorable: "yes",
      pages: 25,
      requires: ["3.1-place-value-1000", "2.4-add-within-100"],
    });
    expect(bc.skill("3.3-not-a-skill")).toBeNull();
  });

  it("reads the level of a skill", () => {
    expect(bc.levelOfSkill("3.3-add-within-1000")?.id).toBe("U10");
    expect(bc.levelOfSkill("9.5-distribute")?.id).toBe("U30");
    expect(bc.levelOfSkill("3.3-not-a-skill")).toBeNull();
  });

  it("reads the next level, and none after U30", () => {
    expect(bc.nextLevel("U12")?.id).toBe("U13");
    expect(bc.nextLevel("U30")).toBeNull();
    expect(bc.nextLevel("U31")).toBeNull();
  });

  it("reads a Grade 3 skill's steps in order, with representation, mistakes and spot-the-error item", () => {
    const steps = bc.skillSteps("3.3-add-within-1000")!;
    expect(steps.map((s) => s.name)).toEqual(["Add without regrouping", "Regroup ones", "Regroup ones and tens", "Three numbers"]);
    expect(steps.reduce((sum, s) => sum + s.pages, 0)).toBe(25);
    expect(steps[0]).toEqual({
      curriculum: "bc",
      skill: "3.3-add-within-1000",
      number: 1,
      position: "U10.2.1.1",
      name: "Add without regrouping",
      change: "First step: no carrying",
      rules: "Three-digit + three-digit, sums to 999",
      example: { problem: "324 + 152 = ?", answer: "476" },
      pages: 5,
      representation: "base-ten blocks (hundreds, tens, ones)",
      mistakes: [
        { answer: "17", why: "Adds all six digits instead of adding by place", kind: "conceptual", misconception: null },
        { answer: "466", why: "Writes 6 for 2 + 5 tens", kind: "careless", misconception: null },
      ],
      spotTheError: { wrong: "324 + 152: 2 + 5 = 8 tens, so 486.", fix: "2 + 5 = 7 tens, so the answer is 476." },
      arithmetic: "checked",
    });
  });

  it("keeps a misconception id on an expected mistake", () => {
    expect(bc.skillSteps("3.1-place-value-1000")![1].mistakes[0]).toEqual({
      answer: "30 + 5",
      why: "Leaves out the zero that holds the tens place",
      kind: "conceptual",
      misconception: "zero-placeholder",
    });
  });

  it("has no steps yet outside Grade 3, and none for an unknown skill", () => {
    expect(bc.skillSteps("4.5-multiply-1-digit")).toEqual([]);
    expect(bc.skillSteps("3.3-not-a-skill")).toBeNull();
  });
});

/** Level numbers in groups, from the skeleton's tables: [first, last, value]. */
function byLevel<T>(groups: [number, number, T][]): T[] {
  return groups.flatMap(([from, to, value]) => Array.from({ length: to - from + 1 }, () => value));
}

describe("budgets", () => {
  it("plans pages a day per D-186: 4 to 6 in U1 to U3, 8 in U4 to U18, 6 in U19 to U30", () => {
    expect(bc.levels.map((l) => l.pagesPerDay)).toEqual(
      byLevel([
        [1, 3, { min: 4, max: 6 }],
        [4, 18, { min: 8, max: 8 }],
        [19, 30, { min: 6, max: 6 }],
      ]),
    );
  });

  it("holds the review share by level", () => {
    expect(bc.levels.map((l) => l.reviewShare)).toEqual(
      byLevel([
        [1, 3, 0.1],
        [4, 6, 0.15],
        [7, 9, 0.2],
        [10, 18, 0.25],
        [19, 21, 0.3],
        [22, 30, 0.35],
      ]),
    );
  });

  it("adds skill pages up to each grade's budget, and each level's skills up to the level's pages", () => {
    const pages = new Map<number, number>();
    for (const level of bc.levels) {
      const sum = bc.levelSkills(level.id)!.reduce((total, s) => total + s.pages, 0);
      expect(sum, level.id).toBe(level.skillPages);
      pages.set(level.schoolGrade, (pages.get(level.schoolGrade) ?? 0) + sum);
    }
    expect([...pages.values()]).toEqual([360, 765, 880, 810, 810, 810, 588, 546, 546, 546]);
  });

  it("adds level workbooks up to the grade budgets, 120 in all", () => {
    const workbooks = new Map<number, number>();
    for (const l of bc.levels) workbooks.set(l.schoolGrade, (workbooks.get(l.schoolGrade) ?? 0) + l.workbooks);
    expect([...workbooks.values()]).toEqual([8, 10, 10, 12, 12, 12, 14, 14, 14, 14]);
    expect(bc.levels.reduce((total, l) => total + l.workbooks, 0)).toBe(120);
  });

  it("gives warm-up skills no step pages and activity skills one", () => {
    const all = bc.levels.flatMap((l) => bc.levelSkills(l.id)!);
    expect(new Set(all.filter((s) => s.delivery === "warm-up").map((s) => s.pages))).toEqual(new Set([0]));
    expect(new Set(all.filter((s) => s.delivery === "activity").map((s) => s.pages))).toEqual(new Set([1]));
  });
});

/** The BC data with one skill changed. */
function withSkill(id: string, change: Partial<CurriculumSkill>): CurriculumData {
  return { ...BC_CURRICULUM, skills: BC_CURRICULUM.skills.map((s) => (s.id === id ? { ...s, ...change } : s)) };
}

describe("data checks", () => {
  it("finds no problem in the BC data: every skill once, in the BC skill map, after its prerequisites", () => {
    expect(curriculumProblems(BC_CURRICULUM, BC_SKILL_MAP)).toEqual([]);
  });

  it("lists a skill that is not in the skill map, and a map skill in no level", () => {
    const problems = curriculumProblems(withSkill("3.3-add-within-1000", { id: "3.3-add-to-1000" }), BC_SKILL_MAP);
    expect(problems).toContain("3.3-add-to-1000 is not a skill in the BC skill map");
    expect(problems).toContain("3.3-add-within-1000 is in the skill map but in no level");
  });

  it("lists a skill that appears twice", () => {
    const twice = { ...BC_CURRICULUM, skills: [...BC_CURRICULUM.skills, { ...bc.skill("K1-count-objects")!, level: "U2" as const }] };
    expect(curriculumProblems(twice, BC_SKILL_MAP)).toContain("K1-count-objects appears 2 times");
  });

  it("lists a prerequisite taught in a later level or later in the same level", () => {
    // 3.1-place-value-1000 is U10's first skill, and 3.3-add-within-1000 (U10, 5th) requires it.
    const later = curriculumProblems(withSkill("3.1-place-value-1000", { level: "U11", order: 99 }), BC_SKILL_MAP);
    expect(later).toContain("3.3-add-within-1000 (U10) requires 3.1-place-value-1000, taught later (U11)");
    const sameLevel = curriculumProblems(withSkill("3.1-place-value-1000", { order: 6 }), BC_SKILL_MAP);
    expect(sameLevel).toContain("3.3-add-within-1000 (U10, 5th) requires 3.1-place-value-1000, taught after it (U10, 6th)");
  });

  it("lists a skill whose unit is not one of its level's units", () => {
    expect(curriculumProblems(withSkill("3.3-add-within-1000", { level: "U11", order: 99 }), BC_SKILL_MAP)).toContain(
      "3.3-add-within-1000 is in U11, but its unit 3.3 is in U10",
    );
  });

  it("lists a unit whose text or strand differs from its standard in the skill map", () => {
    const units = BC_CURRICULUM.units.map((u) => (u.code === "3.3" ? { ...u, text: "adding to 1000", strand: "N" as const } : u));
    const problems = curriculumProblems({ ...BC_CURRICULUM, units }, BC_SKILL_MAP);
    expect(problems).toContain('Unit 3.3 text "adding to 1000" differs from the skill map: "addition and subtraction to 1000"');
    expect(problems).toContain("Unit 3.3 strand N differs from the skill map: O");
  });

  it("lists prerequisites that differ from the skill map", () => {
    const problems = curriculumProblems(withSkill("3.3-add-within-1000", { requires: ["3.1-place-value-1000"] }), BC_SKILL_MAP);
    expect(problems).toContain("3.3-add-within-1000 requires 3.1-place-value-1000, but the skill map says 2.4-add-within-100, 3.1-place-value-1000");
  });

  it("lists skill pages or workbooks that do not add up to the budgets", () => {
    const pages = curriculumProblems(withSkill("3.3-add-within-1000", { pages: 26 }), BC_SKILL_MAP);
    expect(pages).toContain("U10 skill pages add up to 254, but the level says 253");
    expect(pages).toContain("Grade 3 skill pages add up to 811, but the budget is 810");
    const levels = BC_CURRICULUM.levels.map((l) => (l.id === "U10" ? { ...l, workbooks: 5 } : l));
    expect(curriculumProblems({ ...BC_CURRICULUM, levels }, BC_SKILL_MAP)).toContain("Grade 3 workbooks add up to 13, but the budget is 12");
  });

  it("lists a grade with levels but no budget", () => {
    const grades = BC_CURRICULUM.grades.filter((g) => g.schoolGrade !== 3);
    expect(curriculumProblems({ ...BC_CURRICULUM, grades }, BC_SKILL_MAP)).toContain("Grade 3 has levels but no budget");
  });

  it("lists step pages that do not add up to their skill's pages", () => {
    const steps = BC_CURRICULUM.steps.map((s) => (s.skill === "3.3-add-within-1000" && s.number === 1 ? { ...s, pages: 6 } : s));
    expect(curriculumProblems({ ...BC_CURRICULUM, steps }, BC_SKILL_MAP)).toContain("3.3-add-within-1000 step pages add up to 26, but the skill has 25");
  });
});
