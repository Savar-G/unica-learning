import { describe, expect, it } from "vitest";
import {
  bandFor,
  breakDue,
  createSession,
  difficultyOf,
  everyQuestion,
  finish,
  givenQuestions,
  learnerProfile,
  lockStage1,
  lockStage2,
  nextQuestion,
  reportModel,
  restoreSession,
  stage3Due,
  stage3Level,
  storedTest,
  submitAnswer,
  testLength,
  testStep,
  type Grade,
  type ProfileAnswer,
  type Province,
  type Question,
  type Session,
  type Submission,
} from "@/lib/assessment";
import { beforeThirdStage } from "@/lib/assessment/scripted-child";

// The third stage and the easy-to-hard order (D-282), through the assessment core. A child who goes up and aces stage 2
// goes up another grade; a child who goes down and does not clear stage 2 goes down another grade.
const GRADES: Grade[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const RANK = { easy: 0, medium: 1, hard: 2 } as const;

type Script = (q: Question, stage: 1 | 2 | 3) => boolean;

/** A wrong answer the session takes for the question. */
const wrongTo = (q: Question) => q.wrong[0]?.value ?? (q.answer === "0" ? "1" : "0");

/** Answers as a child does: stage 1, its lock, stage 2, its lock when one is due, and the third stage. */
function walk(grade: Grade, seed: number, script: Script, province: Province = "BC"): Session {
  let session = createSession({ grade, province }, seed);
  for (;;) {
    const q = nextQuestion(session);
    if (q) {
      const stage = session.answers.length < session.stage1.length ? 1 : session.stage3Route === "up" || session.stage3Route === "down" ? 3 : 2;
      session = submitAnswer(session, { questionId: q.id, response: script(q, stage) ? q.answer : wrongTo(q), timeMs: 20_000 });
    } else if (!session.route && session.answers.length === session.stage1.length) {
      session = lockStage1(session);
    } else if (stage3Due(session)) {
      session = lockStage2(session);
    } else {
      return session;
    }
  }
}

const rightUpTo = (level: number): Script => (q) => q.level <= level;

describe("how far a third stage can reach", () => {
  it.each([
    [0, 2, null], [1, 3, null], [2, 4, 0], [3, 5, 1], [4, 6, 2], [5, 7, 3], [6, 8, 4], [7, null, 5], [8, null, 6], [9, null, 7],
  ] as const)("grade %i goes up to %s and down to %s", (grade, up, down) => {
    expect(stage3Level(grade, "up")).toBe(up);
    expect(stage3Level(grade, "down")).toBe(down);
  });
});

describe("the third stage forms", () => {
  it.each(GRADES)("grade %i, BC: a full form at the next grade where the bank has one, with no question its route already asked", (grade) => {
    for (const seed of SEEDS) {
      const session = createSession({ grade, province: "BC" }, seed);
      for (const direction of ["up", "down"] as const) {
        const form = session.stage3![direction];
        const level = stage3Level(grade, direction);
        if (level === null) {
          expect(form).toEqual([]);
          continue;
        }
        expect(form).toHaveLength(bandFor(grade).stage3);
        expect(form.every((q) => q.level === level)).toBe(true);
        const before = new Set([...session.stage1, ...session.stage2[direction]].map((q) => q.templateId));
        expect(form.filter((q) => before.has(q.templateId))).toEqual([]);
        expect(new Set(form.map((q) => q.templateId)).size).toBe(form.length);
        expect(form.map((q) => q.id)).toEqual(form.map((_, i) => `s3${direction}-${i}`));
        // Only the areas the band reports: a Grade 2 child on level 4 gets no fractions question.
        expect(form.every((q) => bandFor(grade).strands.length === 4 || q.strand !== "F")).toBe(true);
      }
    }
  });

  it.each(["AB", "SK", "MB", "ON", "other"] as const)("%s: a test can always start, for every grade", (province) => {
    for (const grade of GRADES) for (const seed of SEEDS) expect(() => createSession({ grade, province }, seed)).not.toThrow();
  });

  it("never asks a Grade 7 or 8 child grade 9 work (D-153 rule 2)", () => {
    for (const grade of [7, 8] as const) {
      for (const seed of SEEDS) expect(everyQuestion(createSession({ grade, province: "BC" }, seed)).every((q) => q.level <= 8)).toBe(true);
    }
  });

  it("keeps every question id in a test different", () => {
    for (const grade of GRADES) {
      const ids = everyQuestion(createSession({ grade, province: "BC" }, 3)).map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("each stage, easy to hard", () => {
  it.each(GRADES)("grade %i: lower levels first, then easy, medium and hard, in every stage and form", (grade) => {
    for (const seed of SEEDS) {
      const s = createSession({ grade, province: "BC" }, seed);
      for (const stage of [s.stage1, s.stage2.up, s.stage2.stay, s.stage2.down, s.stage3!.up, s.stage3!.down]) {
        const keys = stage.map((q) => q.level * 10 + RANK[difficultyOf(q.templateId)]);
        expect(keys).toEqual([...keys].sort((a, b) => a - b));
      }
    }
  });

  it("starts stage 1 with an easy question, and a question keeps its numbers when it moves", () => {
    const s = createSession({ grade: 4, province: "BC" }, 11);
    expect(difficultyOf(s.stage1[0].templateId)).toBe("easy");
    expect(s.stage1.map((q) => q.id)).toEqual(s.stage1.map((_, i) => `s1-${i}`));
    expect(createSession({ grade: 4, province: "BC" }, 11)).toEqual(s);
  });
});

describe("a child who keeps doing well", () => {
  it.each([[3, 5], [4, 6], [5, 7], [6, 8], [1, 3], [0, 2], [2, 4]] as const)("grade %i, all right, reaches and clears grade %i", (grade, top) => {
    const session = walk(grade, 5, () => true);
    expect(session.route).toBe("up");
    expect(session.stage3Route).toBe("up");
    const placement = finish(session);
    expect(placement.workingLevel).toBe(top);
    expect(placement.atCeiling).toBe(true);
    expect(placement.stage3Route).toBe("up");
    expect(placement.levels.at(-1)).toEqual({ level: top, correct: bandFor(grade).stage3, total: bandFor(grade).stage3 });
    expect(testStep(session)).toEqual({ status: "complete", total: session.answers.length });
    expect(session.answers).toHaveLength(givenQuestions(session, session.route, session.stage3Route).length);
  });

  it("who misses the third stage stays at the level below it, and is not at the ceiling", () => {
    const placement = finish(walk(3, 5, rightUpTo(4)));
    expect(placement).toMatchObject({ workingLevel: 4, atCeiling: false, stage3Route: "up" });
  });

  it("ends at the highest level the test may ask at Grades 7, 8 and 9, as before: no third stage", () => {
    for (const grade of [7, 8, 9] as const) {
      const session = walk(grade, 5, () => true);
      expect(session.stage3Route ?? null).toBeNull();
      expect(finish(session).atCeiling).toBe(true);
    }
  });

  it("needs 80% of the higher-grade questions: the school-grade questions of the form do not count", () => {
    // Grade 4, seed 5: the up form has 18 level 5 questions; 14 right is 78%, 15 is 83%.
    const script = (right: number): Script => {
      let n = 0;
      return (q, stage) => stage === 1 || (stage === 2 && (q.level !== 5 || n++ < right));
    };
    expect(walk(4, 5, script(14)).stage3Route).toBe("none");
    expect(walk(4, 5, script(15)).stage3Route).toBe("up");
    // All school-grade questions wrong, every higher-grade question right: still goes up.
    expect(walk(4, 5, (q, stage) => stage === 1 || (stage === 2 && q.level === 5)).stage3Route).toBe("up");
  });
});

describe("a child who struggles again", () => {
  it.each([[3, 1], [4, 2], [5, 3], [6, 4], [9, 7], [2, 0]] as const)("grade %i, who knows only grade %i, goes down twice and clears it", (grade, level) => {
    const session = walk(grade, 5, rightUpTo(level));
    expect(session.route).toBe("down");
    expect(session.stage3Route).toBe("down");
    const placement = finish(session);
    expect(placement.workingLevel).toBe(level);
    expect(placement.confidence).toBe("normal");
    expect(placement.atCeiling).toBe(false);
  });

  it("who clears the down form has no third stage", () => {
    const session = walk(4, 5, rightUpTo(3));
    expect(session).toMatchObject({ route: "down", stage3Route: "none" });
    expect(finish(session)).toMatchObject({ workingLevel: 3, confidence: "normal", stage3Route: "none" });
  });

  it("at Kindergarten and Grade 1 ends at the bottom of the bank: no third stage", () => {
    for (const grade of [0, 1] as const) expect(walk(grade, 5, () => false).stage3Route ?? null).toBeNull();
  });
});

describe("a child who stays on grade", () => {
  it("has the test they had: no lock, no third stage, the same length", () => {
    let n = 0;
    const session = walk(4, 5, () => n++ % 2 === 0);
    expect(session.route).toBe("stay");
    expect(session.stage3Route ?? null).toBeNull();
    expect(stage3Due(session)).toBe(false);
    expect(session.answers).toHaveLength(36);
    expect(finish(session).stage3Route).toBeUndefined();
    expect(testStep(session)).toEqual({ status: "complete", total: 36 });
  });
});

describe("the lock and the steps", () => {
  const upToGrid = () => {
    let session = createSession({ grade: 4, province: "BC" }, 5);
    while (!session.route || nextQuestion(session)) {
      const q = nextQuestion(session);
      session = q ? submitAnswer(session, { questionId: q.id, response: q.answer, timeMs: 20_000 }) : lockStage1(session);
    }
    return session;
  };

  it("waits on the stage 2 grid, with no answer in it, and takes no answer there", () => {
    const session = upToGrid();
    const step = testStep(session);
    expect(step).toMatchObject({ status: "check", section: "stage2", total: 42, breakAfter: 18 });
    if (step.status !== "check") throw new Error("expected the grid");
    expect(step.numbers).toEqual(Array.from({ length: 24 }, (_, i) => 19 + i));
    expect(() => submitAnswer(session, { questionId: session.stage3!.up[0].id, response: "1", timeMs: 1 })).toThrow();
  });

  it("locks once: a lock before the grid and a second lock throw", () => {
    const session = createSession({ grade: 4, province: "BC" }, 5);
    expect(() => lockStage2(session)).toThrow();
    const locked = lockStage2(upToGrid());
    expect(() => lockStage2(locked)).toThrow();
  });

  it("numbers the third stage on from stage 2, says where it starts, and sends no answer", () => {
    const locked = lockStage2(upToGrid());
    const step = testStep(locked);
    expect(step).toMatchObject({ status: "question", number: 43, total: 50, breakAfter: 18, stage3After: 42 });
    expect(breakDue(step)).toBe(false);
    expect(JSON.stringify(step)).not.toMatch(/"answer"|"wrong"|misconception/);
    expect(testLength(storedTest(locked), "up", "up")).toBe(50);
    expect(testLength(storedTest(locked), "up", "none")).toBe(42);
    expect(testLength(storedTest(locked), "up")).toBe(42);
  });

  it("is rebuilt from what the server stores, as JSON", () => {
    const live = walk(3, 9, () => true);
    const stored = JSON.parse(JSON.stringify(storedTest(live)));
    const answers: Submission[] = live.answers.map(({ questionId, response, timeMs }) => ({ questionId, response, timeMs }));
    expect(restoreSession(stored, answers, live.route, live.stage3Route)).toEqual(live);
    // The grid, before the lock: every answer of stage 2 in, no record stored.
    const grid = restoreSession(stored, answers.slice(0, live.stage1.length + live.stage2.up.length), "up");
    expect(testStep(grid)).toMatchObject({ status: "check", section: "stage2" });
  });

  it("leaves a test from before the third stage as it was: it ends after stage 2", () => {
    const old = beforeThirdStage(storedTest(createSession({ grade: 4, province: "BC" }, 5)));
    let session = restoreSession(old, []);
    while (!session.route || nextQuestion(session)) {
      const q = nextQuestion(session);
      session = q ? submitAnswer(session, { questionId: q.id, response: q.answer, timeMs: 20_000 }) : lockStage1(session);
    }
    expect(stage3Due(session)).toBe(false);
    expect(testStep(session)).toEqual({ status: "complete", total: 42 });
    expect(finish(session)).toMatchObject({ workingLevel: 5, atCeiling: true });
  });
});

describe("the report of a child two grades away from their own", () => {
  const profileOf = (session: Session): ProfileAnswer[] => {
    const questions = givenQuestions(session, session.route, session.stage3Route);
    return session.answers.map((a, i) => ({
      question: questions[i], response: a.response, correct: a.correct, misconception: a.misconception, timeMs: a.timeMs,
      work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
    }));
  };

  it.each([[5, () => true], [3, rightUpTo(1)], [2, () => true], [6, rightUpTo(4)]] as [Grade, Script][])("grade %i: the report and the profile build, with every level asked", (grade, script) => {
    const session = walk(grade, 5, script);
    const placement = finish(session, null, "no");
    const model = reportModel(placement, { workReviews: [] });
    expect(model.level.working).toBe(placement.workingLevel);
    expect(Math.abs(placement.workingLevel - grade)).toBe(2);
    const profile = learnerProfile({ placement, answers: profileOf(session), help: "no", learning: null });
    expect(profile).not.toBeNull();
  });
});
