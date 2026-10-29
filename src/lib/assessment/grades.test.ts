import { describe, expect, it } from "vitest";
import {
  BANKS,
  GRADES,
  REPORTED_STRAND,
  bandFor,
  bankFor,
  createFacts,
  createSession,
  downLevel,
  finish,
  gradeLabel,
  gradeName,
  gradeShort,
  isGrade,
  learnerProfile,
  lockStage1,
  readsAloudFirst,
  reportFacts,
  reportModel,
  restoreSession,
  startLevel,
  storedTest,
  submitAnswer,
  testLength,
  testedGrade,
  upLevel,
  type Grade,
  type ProfileAnswer,
  type Province,
  type Question,
  type Route,
  type Session,
  type TaggedProvince,
} from "@/lib/assessment";
import { allRight, allWrong, checked, knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";

// D-156: the assessment takes Kindergarten (stored as 0) to Grade 9. Kindergarten starts at level K. D-158: Grade 9 starts
// at level 9, the top of the bank; a Grade 7 or 8 child is never asked above grade 8 (D-153 rule 2).
const PROVINCES: Province[] = ["BC", "AB", "SK", "MB", "ON", "other"];
const TAGGED: TaggedProvince[] = ["BC", "AB", "SK", "MB", "ON"];
const ROUTES: Route[] = ["up", "stay", "down"];
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 3);
const onRoute = (s: Session, route: Route): Question[] => [...s.stage1, ...s.stage2[route]];
const levels = (qs: readonly Question[]) => [...new Set(qs.map((q) => q.level))].sort((a, b) => a - b);

/** Answers stage 1 with `right` of its questions right, and locks it: the session is routed. */
function routedAfter(grade: Grade, right: (i: number) => boolean, province: Province = "BC"): Session {
  let session = createSession({ grade, province }, 7);
  for (const [i, q] of session.stage1.entries()) session = submitAnswer(session, { questionId: q.id, response: right(i) ? q.answer : "no idea", timeMs: 20_000 });
  return lockStage1(session);
}

describe("the school grades (D-156)", () => {
  it("are Kindergarten (0) to Grade 9, and Kindergarten is never called Grade 0", () => {
    expect(GRADES).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(gradeLabel(0)).toBe("Kindergarten");
    expect(gradeName(0)).toBe("kindergarten");
    expect(gradeShort(0)).toBe("K");
    expect([gradeLabel(4), gradeName(9), gradeShort(8)]).toEqual(["Grade 4", "grade 9", "8"]);
    for (const g of GRADES) expect(gradeLabel(g)).not.toMatch(/grade 0/i);
  });

  it("accept only a whole number from 0 to 9", () => {
    for (const g of GRADES) expect(isGrade(g)).toBe(true);
    for (const bad of [-1, 10, 2.5, NaN, "3", null, undefined]) expect(isGrade(bad), String(bad)).toBe(false);
  });

  it("start at the school grade; only Grade 9 routes reach level 9 (D-158, D-153 rule 2)", () => {
    expect(GRADES.map(startLevel)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(GRADES.map(upLevel)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8, 9]);
    expect(GRADES.map(downLevel)).toEqual([0, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("each have a band and a bank: Kindergarten the grades 1-2 band, Grades 8 and 9 the grades 6-7 band", () => {
    expect(GRADES.map((g) => bandFor(g).id)).toEqual(["1-2", "1-2", "1-2", "3-5", "3-5", "3-5", "6-7", "6-7", "6-7", "6-7"]);
    expect(bankFor(0)).toBe(BANKS["1-2"]);
    expect(bankFor(8)).toBe(BANKS["6-7"]);
    expect(bankFor(9)).toBe(BANKS["6-7"]);
    // Kindergarten draws and does not type, like grades 1-2 (#67).
    expect(bandFor(0)).toMatchObject({ length: 24, stage1: 12, whiteboardRequired: 5, whiteboardTyping: false, strands: ["number", "algebra", "shapes"] });
    expect(bandFor(9)).toMatchObject({ length: 42, stage1: 21, whiteboardRequired: 10, whiteboardTyping: true });
  });

  it("read the questions aloud without a tap for Kindergarten only", () => {
    expect(GRADES.filter(readsAloudFirst)).toEqual([0]);
  });

  it("have template pools at the start levels in every strand of the band, in every province", () => {
    for (const province of TAGGED) {
      for (const [band, level] of [["1-2", 0], ["6-7", 8], ["6-7", 9]] as const) {
        for (const strand of bandFor(band === "1-2" ? 0 : 8).strands) {
          const pool = BANKS[band].filter((t) => t.grades[province] === level && REPORTED_STRAND[t.strand] === strand);
          expect(pool.length, `${province} level ${level} ${strand}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("a Kindergarten test", () => {
  it("starts on level K questions and routes up to level 1; down stays on level K, the floor", () => {
    for (const province of PROVINCES) {
      for (const seed of SEEDS) {
        const s = createSession({ grade: 0, province }, seed);
        const label = `${province} seed ${seed}`;
        expect(s.stage1, label).toHaveLength(12);
        expect(levels(s.stage1), label).toEqual([0]);
        expect(levels(s.stage2.stay), label).toEqual([0]);
        expect(levels(s.stage2.down), label).toEqual([0]);
        // BC (and "another province") adds level K questions to the up form for the strand minimum (D-110).
        expect(levels(s.stage2.up), label).toEqual(province === "BC" || province === "other" ? [0, 1] : [1]);
      }
    }
  });

  it("routes down without an error or a dead end, and scores a child who knows nothing at level K", () => {
    const down = routedAfter(0, () => false);
    expect(down.route).toBe("down");
    const { placement } = takeTest({ grade: 0, province: "BC" }, 7, allWrong);
    expect(placement).toMatchObject({ grade: 0, route: "down", workingLevel: 0, confidence: "low", atCeiling: false });
    expect(placement.levels.map((l) => l.level)).toEqual([0]);
  });

  it("routes up on 80% and reaches level 1; clearing it is the ceiling", () => {
    expect(routedAfter(0, () => true).route).toBe("up");
    const { placement } = takeTest({ grade: 0, province: "BC" }, 7, allRight);
    expect(placement).toMatchObject({ route: "up", workingLevel: 1, atCeiling: true, confidence: "normal" });
    expect(reportModel(placement, { workReviews: [] }).howWeHelp).toBe("ahead");
    const stay = takeTest({ grade: 0, province: "BC" }, 7, knowsUpTo(0)).placement;
    expect(stay).toMatchObject({ workingLevel: 0, atCeiling: false });
    expect(reportModel(stay, { workReviews: [] }).howWeHelp).toBe("on-grade");
  });

  it("has a facts round of adding and taking away within 5", () => {
    for (const seed of SEEDS) {
      for (const f of createFacts({ grade: 0, province: "BC" }, seed).facts) {
        expect(["+", "-"]).toContain(f.op);
        expect(Math.max(f.a, f.b, f.answer), `${f.a} ${f.op} ${f.b}`).toBeLessThanOrEqual(5);
        expect(f.answer).toBeGreaterThan(0);
      }
    }
  });
});

describe("a Grade 8 test", () => {
  it("starts on level 8 questions, routes down to level 7, and never asks above level 8 (D-153 rule 2)", () => {
    for (const province of PROVINCES) {
      for (const seed of SEEDS) {
        const s = createSession({ grade: 8, province }, seed);
        const label = `${province} seed ${seed}`;
        expect(s.stage1, label).toHaveLength(21);
        expect(levels(s.stage1), label).toEqual([8]);
        expect(levels(s.stage2.down), label).toEqual([7]);
        for (const route of ROUTES) expect(Math.max(...onRoute(s, route).map((q) => q.level)), `${label} ${route}`).toBeLessThanOrEqual(8);
      }
    }
  });

  it("never routes a Grade 7 child above level 8 either", () => {
    for (const province of PROVINCES) {
      for (const seed of SEEDS) {
        const s = createSession({ grade: 7, province }, seed);
        for (const route of ROUTES) expect(Math.max(...onRoute(s, route).map((q) => q.level)), `${province} ${seed} ${route}`).toBeLessThanOrEqual(8);
      }
    }
  });

  it("fills a BC level 8 form with level 8 templates only: 42 level 8 places, no template repeats (D-158)", () => {
    for (const seed of SEEDS) {
      const s = createSession({ grade: 8, province: "BC" }, seed);
      for (const route of ["up", "stay"] as const) {
        const label = `seed ${seed} ${route}`;
        expect(s.stage2[route], label).toHaveLength(21);
        expect(levels(s.stage2[route]), label).toEqual([8]);
        expect(new Set(onRoute(s, route).map((q) => q.templateId)).size, label).toBe(42);
      }
    }
  });

  it("routes up on 80% at level 8: clearing level 8 is the ceiling; a child who knows grade 7 is placed there", () => {
    expect(routedAfter(8, () => true).route).toBe("up");
    expect(routedAfter(8, (i) => i % 2 === 0).route).toBe("stay");
    expect(routedAfter(8, () => false).route).toBe("down");
    const top = takeTest({ grade: 8, province: "BC" }, 7, allRight).placement;
    expect(top).toMatchObject({ grade: 8, route: "up", workingLevel: 8, atCeiling: true });
    expect(reportModel(top, { workReviews: [] }).howWeHelp).toBe("on-grade");
    const seven = takeTest({ grade: 8, province: "BC" }, 7, knowsUpTo(7)).placement;
    expect(seven).toMatchObject({ route: "down", workingLevel: 7, atCeiling: false });
    expect(reportModel(seven, { workReviews: [] }).howWeHelp).toBe("behind");
  });
});

describe("a Grade 9 test (D-158)", () => {
  it("starts on level 9 questions, routes down to level 8, and up to a second level 9 form, in every province", () => {
    for (const province of PROVINCES) {
      for (const seed of SEEDS) {
        const s = createSession({ grade: 9, province }, seed);
        const label = `${province} seed ${seed}`;
        expect(s.stage1, label).toHaveLength(21);
        expect(levels(s.stage1), label).toEqual([9]);
        expect(levels(s.stage2.stay), label).toEqual([9]);
        expect(levels(s.stage2.up), label).toEqual([9]);
        expect(levels(s.stage2.down), label).toEqual([8]);
      }
    }
  });

  it("fills both BC level 9 forms with level 9 templates only, and repeats no template", () => {
    for (const seed of SEEDS) {
      const s = createSession({ grade: 9, province: "BC" }, seed);
      for (const route of ROUTES) {
        expect(new Set(onRoute(s, route).map((q) => q.templateId)).size, `seed ${seed} ${route}`).toBe(42);
      }
    }
  });

  it("is compared with grade 9: clearing level 9 is the ceiling; a child who knows grade 8 is one grade behind", () => {
    expect(routedAfter(9, () => true).route).toBe("up");
    expect(routedAfter(9, () => false).route).toBe("down");
    const top = takeTest({ grade: 9, province: "BC" }, 7, allRight).placement;
    expect(top).toMatchObject({ grade: 9, route: "up", workingLevel: 9, atCeiling: true });
    expect(top.strands.map((s) => s.strand)).toEqual(["number", "fractions", "algebra", "shapes"]);
    const model = reportModel(top, { workReviews: [] });
    expect(model.howWeHelp).toBe("on-grade");
    expect(model.level.testedTo).toBe(9);
    const facts = reportFacts(model);
    expect(facts).toMatchObject({ school_grade: "grade 9", working_level: "grade 9", working_level_against_school_grade: "the same" });
    expect(facts).not.toHaveProperty("highest_level_the_test_checks");
    const eight = takeTest({ grade: 9, province: "BC" }, 7, knowsUpTo(8)).placement;
    expect(eight).toMatchObject({ route: "down", workingLevel: 8, atCeiling: false });
    expect(reportFacts(reportModel(eight, { workReviews: [] }))).toMatchObject({ working_level_against_school_grade: "below" });
  });

  it("lists grade 9 standards as the school grade's in the learner profile, with their words", () => {
    const { asked, placement } = takeTest({ grade: 9, province: "BC" }, 7, knowsUpTo(8));
    const answers: ProfileAnswer[] = asked.map((q) => ({
      question: q, response: q.level <= 8 ? q.answer : "no idea", correct: q.level <= 8, misconception: null, timeMs: 20_000,
      work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
    }));
    const profile = learnerProfile({ placement, answers, help: null, learning: null })!;
    expect(profile.test).toMatchObject({ grade: 9, testedTo: 9 });
    const nine = profile.standards.filter((s) => s.code.startsWith("9."));
    expect(nine.length).toBeGreaterThan(0);
    expect(nine.every((s) => s.text.length > 0 && s.grade === 9)).toBe(true);
    expect(profile.unknowns.untested.every((s) => s.code.startsWith("9."))).toBe(true);
  });

  it("keeps a Grade 9 report from before D-158 compared with grade 8, the highest level that test checked", () => {
    // Its questions stopped at level 8, and its stored model has no testedTo.
    expect(testedGrade(9, [{ level: 7 }, { level: 8 }])).toBe(8);
    expect(testedGrade(9, [{ level: 8 }, { level: 9 }])).toBe(9);
    expect(testedGrade(4, [{ level: 4 }, { level: 5 }])).toBe(4);
    const model = reportModel(takeTest({ grade: 9, province: "BC" }, 7, allRight).placement, { workReviews: [] });
    const { testedTo, ...old } = model.level;
    expect(testedTo).toBe(9);
    const facts = reportFacts({ ...model, level: { ...old, working: 8 } });
    expect(facts).toMatchObject({ highest_level_the_test_checks: "grade 8", working_level_against_highest_level_tested: "the same" });
  });

  it("has the grade 7 facts round: multiplication and division to 100", () => {
    expect(createFacts({ grade: 9, province: "BC" }, 3).facts.every((f) => f.family === "mul100" || f.family === "div100")).toBe(true);
    expect(createFacts({ grade: 8, province: "BC" }, 3).facts.every((f) => f.family === "mul100" || f.family === "div100")).toBe(true);
  });
});

describe("tests stored before D-156", () => {
  it("still restore, route and score for grades 1 to 7", () => {
    for (const grade of [1, 2, 3, 4, 5, 6, 7] as Grade[]) {
      const session = createSession({ grade, province: "BC" }, 11);
      const stored = JSON.parse(JSON.stringify(storedTest(session)));
      expect(testLength(stored, null)).toBe(bandFor(grade).length);
      let restored = restoreSession(stored, []);
      for (const q of restored.stage1) restored = checked(submitAnswer(restored, { questionId: q.id, response: q.answer, timeMs: 1000 + q.level }));
      expect(restored.route).toBe("up");
      // Grades 1 to 7 keep their start level and routes: up one grade, down one grade.
      expect(levels(restored.stage1)).toEqual([grade]);
      expect(Math.max(...restored.stage2.up.map((q) => q.level))).toBe(grade + 1);
      expect(Math.min(...restored.stage2.down.map((q) => q.level))).toBe(grade - 1);
      for (let q = restored.stage2.up[0], i = 0; q; q = restored.stage2.up[++i]) restored = submitAnswer(restored, { questionId: q.id, response: q.answer, timeMs: 1000 });
      expect(finish(restored)).toMatchObject({ grade, workingLevel: grade + 1, atCeiling: true });
    }
  });
});
