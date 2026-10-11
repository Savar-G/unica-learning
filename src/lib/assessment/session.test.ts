import { describe, expect, it } from "vitest";
import { REPORTED_STRAND, SAMPLE_BANK, createSession, finish, nextQuestion, submitAnswer, type Session, type Template } from "@/lib/assessment";
import { allRight, allWrong, firstRight, knowsUpTo, takeTest, type Script } from "./scripted-child";

const prompts = (s: Session) => [...s.stage1, ...s.stage2.up, ...s.stage2.stay, ...s.stage2.down].map((q) => q.prompt);

describe("scripted children, grades 3-5", () => {
  it("all correct: 36 questions, routed up, working one level above school grade", () => {
    const { asked, placement } = takeTest({ grade: 4, province: "BC" }, 1, allRight);
    expect(asked).toHaveLength(36);
    expect(placement.route).toBe("up");
    expect(placement.workingLevel).toBe(5);
    expect(placement.atCeiling).toBe(true);
    expect(placement.strands.map((s) => s.status)).toEqual(["secure", "secure", "secure", "secure"]);
  });

  it("all wrong: routed down, low confidence, every strand needs attention", () => {
    const { asked, placement } = takeTest({ grade: 4, province: "BC" }, 1, allWrong);
    expect(asked).toHaveLength(36);
    expect(placement.route).toBe("down");
    expect(placement.workingLevel).toBe(2);
    expect(placement.confidence).toBe("low");
    expect(placement.strands.every((s) => s.status === "needs-attention" && s.correct === 0)).toBe(true);
  });

  it("a grade 4 child working at grade 2 level is placed at 2", () => {
    const { placement } = takeTest({ grade: 4, province: "BC" }, 7, knowsUpTo(2));
    expect(placement.route).toBe("down");
    expect(placement.workingLevel).toBe(2);
    expect(placement.confidence).toBe("low");
  });

  it("a grade 3 child working at grade 5 level is placed above grade, at the highest level the test reaches", () => {
    const { asked, placement } = takeTest({ grade: 3, province: "BC" }, 7, knowsUpTo(5));
    expect(placement.route).toBe("up");
    expect(Math.max(...asked.map((q) => q.level))).toBe(4);
    expect(placement.workingLevel).toBe(4);
    expect(placement.atCeiling).toBe(true);
  });

  it("a child who stays on grade is never at the ceiling, even with stage 2 all right", () => {
    const { placement } = takeTest({ grade: 4, province: "BC" }, 9, (_, i) => i < 10 || i >= 18);
    expect(placement.route).toBe("stay");
    expect(placement.workingLevel).toBe(4);
    expect(placement.atCeiling).toBe(false);
  });

  it("stage 1 has 18 questions at the school grade", () => {
    const session = createSession({ grade: 5, province: "BC" }, 3);
    expect(session.stage1).toHaveLength(18);
    expect(session.stage1.every((q) => q.level === 5)).toBe(true);
  });

  it("each strand reports its correct count and question count, at or below the school grade", () => {
    const { asked, placement } = takeTest({ grade: 4, province: "BC" }, 2, allRight);
    const total = placement.strands.reduce((sum, s) => sum + s.total, 0);
    expect(total).toBe(asked.filter((q) => q.level <= 4).length);
    expect(placement.strands.map((s) => s.strand)).toEqual(["number", "fractions", "algebra", "shapes"]);
    expect(placement.strands.every((s) => s.correct === s.total && s.total >= 4)).toBe(true);
  });
});

// Decision 2026-10-11 (orchestrator, Q1 of #65; D-084 "never invent a weakness"): an area's status counts only the
// questions at or below the school grade. Questions above it still count toward the working level.
describe("area status: only questions at or below the school grade", () => {
  it("an on-grade child who got every grade 5 question right is Secure in every area, though some grade 6 ones were wrong", () => {
    const { asked, placement } = takeTest({ grade: 5, province: "BC" }, 4, (q, i) => q.level <= 5 || i % 2 === 0);
    expect(placement.route).toBe("up");
    expect(placement.workingLevel).toBe(5);
    expect(asked.some((q) => q.level === 6)).toBe(true);
    expect(placement.strands.map((s) => s.status)).toEqual(["secure", "secure", "secure", "secure"]);
    expect(placement.strands.every((s) => s.correct === s.total)).toBe(true);
    expect(placement.strands.reduce((sum, s) => sum + s.total, 0)).toBe(18);
  });

  it("a child working below grade keeps the areas that really need attention", () => {
    // Grade 4, knows grade 3 except fractions: stage 1 all wrong routes down, stage 2 at grade 3 has fractions wrong.
    const { placement } = takeTest({ grade: 4, province: "BC" }, 1, (q) => q.level <= 3 && q.strand !== "F");
    expect(placement.workingLevel).toBe(3);
    expect(placement.strands.find((s) => s.strand === "fractions")).toEqual({ strand: "fractions", status: "needs-attention", correct: 0, total: 10 });
  });

  it("an area with no question at or below the school grade gets no status and no count, not Needs attention", () => {
    // A bank whose shapes questions all sit above grade 4: the child meets shapes only in stage 2, routed up.
    const bank = SAMPLE_BANK.filter((t) => !(REPORTED_STRAND[t.strand] === "shapes" && t.grades.BC <= 4));
    const { asked, placement } = takeTest({ grade: 4, province: "BC" }, 1, (q) => q.level <= 4, bank);
    expect(asked.some((q) => REPORTED_STRAND[q.strand] === "shapes")).toBe(true);
    expect(placement.strands.map((s) => s.strand)).toEqual(["number", "fractions", "algebra"]);
    expect(placement.strands.every((s) => s.status === "secure")).toBe(true);
  });
});

describe("strand status at its exact boundaries", () => {
  // Grade 4, only number questions can be right, so stage 1 routes down: all 10 number questions are at or below
  // the school grade, and 80% and 50% are whole counts.
  const numberStrand = (right: number) => {
    let seen = 0;
    const { placement } = takeTest({ grade: 4, province: "BC" }, 2, (q) => ["N", "O"].includes(q.strand) && seen++ < right);
    return placement.strands.find((s) => s.strand === "number")!;
  };

  it("8 of 10 (80%) is secure", () => {
    expect(numberStrand(8)).toEqual({ strand: "number", status: "secure", correct: 8, total: 10 });
  });
  it("7 of 10 (70%) is developing", () => {
    expect(numberStrand(7).status).toBe("developing");
  });
  it("5 of 10 (50%) is developing", () => {
    expect(numberStrand(5).status).toBe("developing");
  });
  it("4 of 10 (40%) needs attention", () => {
    expect(numberStrand(4).status).toBe("needs-attention");
  });
});

describe("routing after stage 1 (18 questions, so 80% and 40% fall between whole counts)", () => {
  const route = (right: number) => takeTest({ grade: 4, province: "BC" }, 5, firstRight(right)).placement;

  it("15 of 18 (83%) is the first count at or over 80% and routes up", () => {
    expect(route(15).route).toBe("up");
    expect(route(15).stage1).toEqual({ correct: 15, total: 18 });
  });

  it("14 of 18 (78%) stays on grade", () => {
    expect(route(14).route).toBe("stay");
  });

  it("8 of 18 (44%) is the lowest count at or over 40% and stays on grade", () => {
    expect(route(8).route).toBe("stay");
  });

  it("7 of 18 (39%) routes down", () => {
    expect(route(7).route).toBe("down");
  });
});

describe("working level: the highest level with 70% or more correct", () => {
  // Stage 1 all right routes up; stage 2 has 18 level-5 questions, and the child gets the first k of them.
  const withStage2Right = (k: number) => takeTest({ grade: 4, province: "BC" }, 9, firstRight(18 + k)).placement;

  it("13 of 18 (72%) at level 5 clears it", () => {
    const placement = withStage2Right(13);
    expect(placement.levels).toEqual([
      { level: 4, correct: 18, total: 18 },
      { level: 5, correct: 13, total: 18 },
    ]);
    expect(placement.workingLevel).toBe(5);
  });

  it("12 of 18 (67%) at level 5 does not, so the level stays at 4", () => {
    expect(withStage2Right(12).workingLevel).toBe(4);
  });

  it("on the stay route, 25 of 36 (69%) at level 4 does not clear it and 26 of 36 (72%) does", () => {
    // 10 of 18 in stage 1 stays on grade; then 15 of the 18 stage 2 questions gives 25 of 36.
    const below = takeTest({ grade: 4, province: "BC" }, 9, (_, i) => i < 10 || (i >= 18 && i < 33)).placement;
    expect(below.levels).toEqual([{ level: 4, correct: 25, total: 36 }]);
    expect(below.workingLevel).toBe(3);
    const above = takeTest({ grade: 4, province: "BC" }, 9, (_, i) => i < 10 || (i >= 18 && i < 34)).placement;
    expect(above.workingLevel).toBe(4);
  });
});

describe("seeds", () => {
  it("the same seed gives the same test", () => {
    const a = createSession({ grade: 4, province: "BC" }, 42);
    const b = createSession({ grade: 4, province: "BC" }, 42);
    expect(b).toEqual(a);
  });

  it("sibling seeds give different questions", () => {
    const a = prompts(createSession({ grade: 4, province: "BC" }, 42));
    const b = prompts(createSession({ grade: 4, province: "BC" }, 43));
    const shared = a.filter((p) => b.includes(p)).length;
    expect(shared).toBeLessThan(a.length / 4);
  });

  it("no question repeats within one test", () => {
    for (let seed = 0; seed < 30; seed++) {
      const { asked } = takeTest({ grade: 3, province: "BC" }, seed, firstRight(10));
      expect(new Set(asked.map((q) => `${q.prompt} ${[...(q.choices ?? [])].sort()} ${JSON.stringify(q.figure ?? null)}`)).size).toBe(asked.length);
    }
  });
});

describe("marking", () => {
  it("a coded wrong answer is marked wrong and records its misconception", () => {
    let session = createSession({ grade: 4, province: "BC" }, 11);
    const q = nextQuestion(session)!;
    session = submitAnswer(session, { questionId: q.id, response: q.wrong[0].value, timeMs: 9000 });
    expect(session.answers[0]).toMatchObject({ correct: false, misconception: q.wrong[0].misconception, timeMs: 9000 });
  });

  it("a typed number is marked by value, so 1,200 and 1200 are the same answer", () => {
    const session = createSession({ grade: 5, province: "BC" }, 4, { bank: SAMPLE_BANK });
    const q = session.stage1.find((x) => x.format === "number" && Number(x.answer) >= 1000)!;
    const before = { ...session, stage1: [q, ...session.stage1.filter((x) => x !== q)] };
    const after = submitAnswer(before, { questionId: q.id, response: Number(q.answer).toLocaleString("en-CA"), timeMs: 1 });
    expect(after.answers[0].correct).toBe(true);
  });

  it("commas count only as thousands separators", () => {
    const session = createSession({ grade: 5, province: "BC" }, 4, { bank: SAMPLE_BANK });
    const q = session.stage1.find((x) => x.format === "number" && Number(x.answer) >= 1000)!;
    const first = { ...session, stage1: [q, ...session.stage1.filter((x) => x !== q)] };
    const scattered = q.answer.split("").join(",");
    expect(submitAnswer(first, { questionId: q.id, response: scattered, timeMs: 1 }).answers[0].correct).toBe(false);
  });

  it("refuses an answer to a question that is not the current one", () => {
    const session = createSession({ grade: 4, province: "BC" }, 11);
    expect(() => submitAnswer(session, { questionId: session.stage1[1].id, response: "1", timeMs: 1 })).toThrow();
  });

  it("refuses to score a test that is not complete", () => {
    expect(() => finish(createSession({ grade: 4, province: "BC" }, 11))).toThrow(/not complete/);
  });
});

describe("province", () => {
  it('"another province" is scored against BC: same test, same placement', () => {
    const bc = takeTest({ grade: 4, province: "BC" }, 21, firstRight(20));
    const other = takeTest({ grade: 4, province: "other" }, 21, firstRight(20));
    expect(other.asked).toEqual(bc.asked);
    expect(other.placement).toEqual({ ...bc.placement, province: "other" });
    expect(other.placement.scoredAgainst).toBe("BC");
  });

  it("uses each fixture template's province grade tag", () => {
    const earlier = new Set(["read-clock", "missing-factor"]); // Fixture tags: ON grade 3, BC grade 4.
    const stage1 = (province: "BC" | "ON") =>
      Array.from({ length: 40 }, (_, seed) => createSession({ grade: 3, province }, seed, { bank: SAMPLE_BANK }).stage1).flat();
    const on = stage1("ON").filter((q) => earlier.has(q.templateId));
    expect(on.length).toBeGreaterThan(0);
    expect(on.every((q) => q.level === 3)).toBe(true);
    expect(stage1("BC").some((q) => earlier.has(q.templateId))).toBe(false);
  });

  it("the same miss counts at each province's grade tag", () => {
    // The child misses only fixture topics tagged BC grade 4 and Ontario grade 3.
    const early = ["read-clock", "missing-factor"];
    const missesEarlyTopics: Script = (q) => !early.includes(q.templateId);
    const levelsOfMisses = (province: "BC" | "ON", seed: number) =>
      takeTest({ grade: 3, province }, seed, missesEarlyTopics, SAMPLE_BANK).asked.filter((q) => early.includes(q.templateId)).map((q) => q.level);
    const seed = Array.from({ length: 50 }, (_, i) => i).find((i) => levelsOfMisses("BC", i).length > 0 && levelsOfMisses("ON", i).length > 0);
    expect(seed).toBeDefined();
    expect(new Set(levelsOfMisses("BC", seed!))).toEqual(new Set([4]));
    expect(new Set(levelsOfMisses("ON", seed!))).toEqual(new Set([3]));
  });
});

describe("grade bands", () => {
  // Level 1 fixtures stand in for the grade 1-2 bank (#74), so a grade 2 test can be built.
  const level1: Template[] = (["N", "A", "MG"] as const).map((strand) => ({
    id: `fixture-${strand}`,
    strand,
    grades: { BC: 1 },
    format: "number",
    whiteboard: false,
    standard: "1.3",
    fill: (rng) => {
      const a = rng.int(1, 9), b = rng.int(1, 9);
      return { values: { a, b }, prompt: `${strand}: ${a} + ${b} = ?`, readAloud: `${a} plus ${b}`, answer: String(a + b), wrong: [{ value: String(a + b + 1), misconception: "O3" }] };
    },
  }));

  it("grades 1-2: 24 questions, 12 in stage 1, and fractions are not tested or reported", () => {
    const { asked, placement } = takeTest({ grade: 2, province: "BC" }, 1, allRight, [...SAMPLE_BANK, ...level1]);
    expect(asked).toHaveLength(24);
    expect(placement.stage1.total).toBe(12);
    expect(asked.some((q) => q.strand === "F")).toBe(false);
    expect(placement.strands.map((s) => s.strand)).toEqual(["number", "algebra", "shapes"]);
  });

  it("grade 3 reports fractions", () => {
    const { placement } = takeTest({ grade: 3, province: "BC" }, 1, allRight);
    expect(placement.strands.map((s) => s.strand)).toContain("fractions");
  });

  it("a grade the bank cannot cover yet fails at once with a clear message", () => {
    // An incomplete caller-supplied bank must fail clearly, even when the default bank covers this grade.
    expect(() => createSession({ grade: 7, province: "BC" }, 1, { bank: SAMPLE_BANK })).toThrow(/no level 7 questions/);
  });
});
