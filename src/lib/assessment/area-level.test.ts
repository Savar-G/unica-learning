import { describe, expect, it } from "vitest";
import {
  REPORTED_STRAND,
  areaLevels,
  createSession,
  finish,
  nextQuestion,
  submitAnswer,
  testAreaAnswers,
  testStep,
  type AreaAnswer,
  type Grade,
  type Level,
  type ReportedStrand,
  type Session,
} from "@/lib/assessment";
import { checked } from "@/lib/assessment/scripted-child";

// `right` of `total` answers in one area at one grade.
const at = (area: ReportedStrand, level: Level, right: number, total: number): AreaAnswer[] =>
  Array.from({ length: total }, (_, i) => ({ area, level, correct: i < right }));

const bar = (answers: AreaAnswer[], schoolGrade: Grade, workingLevel: Level, area: ReportedStrand = "number") =>
  areaLevels({ answers, schoolGrade, workingLevel }).find((b) => b.area === area);

describe("the 70% edge", () => {
  it("a grade with exactly 70% right counts", () => {
    expect(bar(at("number", 3, 7, 10), 3, 3)).toMatchObject({ level: 3, basis: "area" });
  });

  it("a grade just under 70% does not count, also when it would round up", () => {
    // 2 of 3 is 66.7%, and 69 of 100 is 69%: both stay under the bar.
    expect(bar(at("number", 3, 69, 100), 3, 3)?.basis).toBe("estimate");
    expect(bar(at("number", 3, 4, 6), 3, 3)?.basis).toBe("estimate");
  });

  it("the bar ends at the highest grade that clears, with no requirement on lower grades", () => {
    const answers = [...at("number", 2, 1, 5), ...at("number", 3, 4, 5), ...at("number", 4, 1, 5)];
    expect(bar(answers, 3, 3)).toMatchObject({ level: 3, label: "at-grade", basis: "area" });
    const hole = [...at("number", 3, 0, 5), ...at("number", 4, 5, 5)];
    expect(bar(hole, 3, 3)).toMatchObject({ level: 4, label: "ahead", basis: "area" });
  });
});

describe("the 4-answer minimum", () => {
  it("3 of 3 right at a grade is not enough; 4 of 4 is", () => {
    expect(bar(at("number", 4, 3, 3), 3, 2)).toMatchObject({ level: 2, basis: "overall" });
    expect(bar(at("number", 4, 4, 4), 3, 2)).toMatchObject({ level: 4, basis: "area" });
  });

  it("answers at different grades do not add up to the minimum", () => {
    const answers = [...at("number", 2, 2, 2), ...at("number", 3, 3, 3)];
    expect(bar(answers, 3, 4)).toMatchObject({ level: 4, basis: "overall" });
  });

  it("a thin grade above does not lift the bar over a grade with enough answers", () => {
    const answers = [...at("number", 3, 4, 4), ...at("number", 4, 3, 3)];
    expect(bar(answers, 3, 3)).toMatchObject({ level: 3, basis: "area" });
  });
});

describe("the fallback to the overall level", () => {
  it("shows the overall working level, labelled Early sign", () => {
    expect(bar(at("number", 3, 1, 3), 3, 2)).toEqual({ area: "number", level: 2, label: "building-up", certainty: "early-sign", basis: "overall" });
    expect(bar(at("number", 3, 3, 3), 3, 4)).toEqual({ area: "number", level: 4, label: "ahead", certainty: "early-sign", basis: "overall" });
  });
});

describe("enough answers and no grade at 70%", () => {
  it("is an estimate one grade under the lowest grade with enough answers, like the working level", () => {
    const answers = [...at("number", 2, 2, 3), ...at("number", 3, 1, 5)];
    expect(bar(answers, 3, 3)).toEqual({ area: "number", level: 2, label: "building-up", certainty: "early-sign", basis: "estimate" });
  });

  it("never goes under Kindergarten", () => {
    expect(bar(at("number", 0, 1, 4), 0, 0)).toMatchObject({ level: 0, label: "at-grade", certainty: "early-sign" });
  });
});

describe("the areas", () => {
  it.each([0, 1, 2] as Grade[])("Grade %i reports number, algebra and shapes, with no fractions", (grade) => {
    const answers = [...at("number", grade as Level, 4, 4), ...at("fractions", grade as Level, 4, 4), ...at("algebra", grade as Level, 4, 4), ...at("shapes", grade as Level, 4, 4)];
    expect(areaLevels({ answers, schoolGrade: grade, workingLevel: grade as Level }).map((b) => b.area)).toEqual(["number", "algebra", "shapes"]);
  });

  it("Grade 3 and up report the four areas, in the report's order", () => {
    const answers = [...at("shapes", 3, 4, 4), ...at("algebra", 3, 4, 4), ...at("fractions", 3, 4, 4), ...at("number", 3, 4, 4)];
    expect(areaLevels({ answers, schoolGrade: 3, workingLevel: 3 }).map((b) => b.area)).toEqual(["number", "fractions", "algebra", "shapes"]);
  });

  it("an area with no answers has no bar", () => {
    expect(areaLevels({ answers: at("number", 3, 4, 4), schoolGrade: 3, workingLevel: 3 }).map((b) => b.area)).toEqual(["number"]);
    expect(areaLevels({ answers: [], schoolGrade: 3, workingLevel: 3 })).toEqual([]);
  });
});

describe("the labels", () => {
  it("compare whole grades with the school grade", () => {
    expect(bar(at("number", 4, 4, 4), 3, 3)?.label).toBe("ahead");
    expect(bar(at("number", 3, 4, 4), 3, 3)?.label).toBe("at-grade");
    expect(bar(at("number", 2, 4, 4), 3, 3)?.label).toBe("building-up");
  });

  it("wrong answers above the school grade never make a weakness (D-108)", () => {
    // Routed up: every answer above the school grade wrong, and too few at the school grade to clear.
    const answers = [...at("number", 3, 3, 3), ...at("number", 4, 0, 6)];
    expect(bar(answers, 3, 3)?.label).toBe("at-grade");
    // The same with nothing at the school grade.
    expect(bar(at("number", 4, 0, 6), 3, 3)?.label).toBe("at-grade");
  });
});

describe("the certainty", () => {
  it("is Clear when one more answer, right or wrong, leaves the bar as it is", () => {
    expect(bar(at("number", 3, 5, 5), 3, 3)?.certainty).toBe("clear");
    expect(bar(at("number", 3, 4, 4), 3, 3)?.certainty).toBe("clear");
  });

  it("is an Early sign when one more wrong answer takes the grade under 70%", () => {
    expect(bar(at("number", 3, 7, 10), 3, 3)?.certainty).toBe("early-sign");
    expect(bar(at("number", 3, 3, 4), 3, 3)?.certainty).toBe("early-sign");
  });

  it("is an Early sign when one more right answer lifts the bar", () => {
    // 3 of 3 above: one more right makes 4 of 4, so the bar would move up a grade.
    expect(bar([...at("number", 3, 5, 5), ...at("number", 4, 3, 3)], 3, 3)?.certainty).toBe("early-sign");
    // 2 of 3 above: one more right is 3 of 4, 75%, so it moves up too.
    expect(bar([...at("number", 3, 5, 5), ...at("number", 4, 2, 3)], 3, 3)?.certainty).toBe("early-sign");
    // 1 of 3 above: one more right is 2 of 4, 50%, so the bar stays.
    expect(bar([...at("number", 3, 5, 5), ...at("number", 4, 1, 3)], 3, 3)?.certainty).toBe("clear");
  });

  it("an estimate or a fallback is never Clear", () => {
    expect(bar(at("number", 3, 0, 10), 3, 3)?.certainty).toBe("early-sign");
    expect(bar(at("number", 3, 0, 1), 3, 3)?.certainty).toBe("early-sign");
  });
});

describe("a finished test's answers", () => {
  const take = (grade: Grade, seed: number, rightEvery: number, timeMs = 9_000): Session => {
    let session = createSession({ grade, province: "BC" }, seed);
    let n = 0;
    for (let step = testStep(session); step.status === "question"; step = testStep(session)) {
      const q = nextQuestion(session)!;
      session = checked(submitAnswer(session, { questionId: step.question.id, response: n++ % rightEvery === 0 ? q.answer : "0", timeMs }));
    }
    return session;
  };
  const tallyBy = <K>(answers: AreaAnswer[], key: (a: AreaAnswer) => K) => {
    const out = new Map<K, { correct: number; total: number }>();
    for (const a of answers) {
      const t = out.get(key(a)) ?? { correct: 0, total: 0 };
      out.set(key(a), { correct: t.correct + (a.correct ? 1 : 0), total: t.total + 1 });
    }
    return out;
  };

  it.each([[0, 3, 1], [2, 5, 2], [4, 11, 1], [4, 12, 2], [5, 7, 3], [8, 9, 1], [9, 4, 2]] as [Grade, number, number][])(
    "add up to the placement's levels and areas (grade %i, seed %i)",
    (grade, seed, rightEvery) => {
      const session = take(grade, seed, rightEvery);
      const placement = finish(session);
      const answers = testAreaAnswers(session);
      const levels = tallyBy(answers, (a) => a.level);
      for (const l of placement.levels) expect(levels.get(l.level)).toEqual({ correct: l.correct, total: l.total });
      const areas = tallyBy(answers.filter((a) => a.level <= grade), (a) => a.area);
      for (const s of placement.strands) expect(areas.get(s.strand)).toEqual({ correct: s.correct, total: s.total });
    },
  );

  it("leave out what the score leaves out: a very fast wrong answer in a run", () => {
    const session = take(4, 11, 2, 1_000);
    const placement = finish(session);
    expect(placement.pace?.leftOut.length).toBeGreaterThan(0);
    expect(testAreaAnswers(session).length).toBe(session.answers.length - placement.pace!.leftOut.length);
  });

  it("carry each question's reported area", () => {
    const session = take(5, 7, 1);
    const areas = new Set(session.stage1.map((q) => REPORTED_STRAND[q.strand]));
    expect(new Set(testAreaAnswers(session).map((a) => a.area))).toEqual(areas);
  });

  it("refuse a test that is not complete", () => {
    expect(() => testAreaAnswers(createSession({ grade: 4, province: "BC" }, 1))).toThrow(/not complete/);
  });

  it("give a full-marks child no bar below the school grade", () => {
    const session = take(4, 11, 1);
    const placement = finish(session);
    const bars = areaLevels({ answers: testAreaAnswers(session), schoolGrade: 4, workingLevel: placement.workingLevel });
    expect(bars.map((b) => b.area)).toEqual(["number", "fractions", "algebra", "shapes"]);
    expect(bars.filter((b) => b.label === "building-up")).toEqual([]);
  });
});
