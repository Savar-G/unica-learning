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

// D-156: the assessment takes Kindergarten (stored as 0) to Grade 9. Kindergarten starts at level K; Grades 8 and 9
// start at level 8, the top of the bank, and nothing above grade 8 is ever asked (D-153).
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

  it("start at the school grade, and Grade 9 at level 8; routes stay on the K-8 scale", () => {
    expect(GRADES.map(startLevel)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 8]);
    expect(GRADES.map(upLevel)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8, 8]);
    expect(GRADES.map(downLevel)).toEqual([0, 0, 1, 2, 3, 4, 5, 6, 7, 7]);
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
      for (const [band, level] of [["1-2", 0], ["6-7", 8]] as const) {
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
  it("starts on level 8 questions, routes down to level 7, and never asks above level 8", () => {
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

  it("fills a BC level 8 form with level 7 questions where the level 8 templates run out, and repeats no template", () => {
    for (const seed of SEEDS) {
      const s = createSession({ grade: 8, province: "BC" }, seed);
      for (const route of ["up", "stay"] as const) {
        const form = s.stage2[route];
        const label = `seed ${seed} ${route}`;
        expect(form, label).toHaveLength(21);
        expect(levels(form), label).toEqual([7, 8]);
        // Level 8 questions first in each strand's turns: a level 7 one only once its strand has no unused level 8 template.
        for (const q of form.filter((q) => q.level === 7)) {
          const strand = REPORTED_STRAND[q.strand];
          const usedHere = new Set(onRoute(s, route).map((x) => x.templateId));
          const unused8 = BANKS["6-7"].filter((t) => t.grades.BC === 8 && REPORTED_STRAND[t.strand] === strand && !usedHere.has(t.id));
          expect(unused8, `${label} ${strand}`).toEqual([]);
        }
        const questions = onRoute(s, route);
        expect(new Set(questions.map((q) => q.templateId)).size, label).toBe(42);
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

describe("a Grade 9 test", () => {
  it("is the Grade 8 test: the same questions from the same seed, up to level 8 only (D-153)", () => {
    for (const province of PROVINCES) {
      for (const seed of SEEDS.slice(0, 10)) {
        const [eight, nine] = [createSession({ grade: 8, province }, seed), createSession({ grade: 9, province }, seed)];
        expect(storedTest(nine).stage1, `${province} ${seed}`).toEqual(storedTest(eight).stage1);
        expect(nine.stage2, `${province} ${seed}`).toEqual(eight.stage2);
        expect(levels(nine.stage1)).toEqual([8]);
        expect(levels(nine.stage2.down)).toEqual([7]);
      }
    }
  });

  it("is compared with grade 8, never called behind grade 9 for clearing all it can test", () => {
    const top = takeTest({ grade: 9, province: "BC" }, 7, allRight).placement;
    expect(top).toMatchObject({ grade: 9, route: "up", workingLevel: 8, atCeiling: true });
    // Every question is at or below the school grade, so every area has a status.
    expect(top.strands.map((s) => s.strand)).toEqual(["number", "fractions", "algebra", "shapes"]);
    const model = reportModel(top, { workReviews: [] });
    expect(model.howWeHelp).toBe("on-grade");
    const facts = reportFacts(model);
    expect(facts).toMatchObject({ school_grade: "grade 9", working_level: "grade 8", highest_level_the_test_checks: "grade 8", working_level_against_highest_level_tested: "the same" });
    expect(facts).not.toHaveProperty("working_level_against_school_grade");
    const seven = reportModel(takeTest({ grade: 9, province: "BC" }, 7, knowsUpTo(7)).placement, { workReviews: [] });
    expect(seven.howWeHelp).toBe("behind");
    expect(reportFacts(seven)).toMatchObject({ working_level_against_highest_level_tested: "below" });
  });

  it("lists grade 8 standards as the school grade's in the learner profile, never grade 9", () => {
    const { asked, placement } = takeTest({ grade: 9, province: "BC" }, 7, knowsUpTo(7));
    const answers: ProfileAnswer[] = asked.map((q) => ({
      question: q, response: q.level <= 7 ? q.answer : "no idea", correct: q.level <= 7, misconception: null, timeMs: 20_000,
      work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
    }));
    const profile = learnerProfile({ placement, answers, help: null, learning: null })!;
    expect(profile.test.grade).toBe(9);
    expect(profile.unknowns.untested.length).toBeGreaterThan(0);
    expect(profile.unknowns.untested.every((s) => s.code.startsWith("8."))).toBe(true);
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
