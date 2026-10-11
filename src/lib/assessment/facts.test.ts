import { describe, expect, it } from "vitest";
import {
  FACTS_SECONDS,
  createFacts,
  createSession,
  factsStep,
  finish,
  nextQuestion,
  reportModel,
  restoreFacts,
  storedFacts,
  submitAnswer,
  submitFact,
  type ChildProfile,
  type Fact,
  type FactsSession,
  type Grade,
} from "@/lib/assessment";
import { knowsUpTo, type Script } from "./scripted-child";

const GRADES: Grade[] = [1, 2, 3, 4, 5, 6, 7];
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 3);
const drawn = (grade: Grade) => SEEDS.flatMap((seed) => createFacts({ grade, province: "BC" }, seed).facts);

// The BC expectation for each grade, written out from the curriculum map (bc-math-curriculum-map.md, section 1 and
// the "Multiplication facts come late" note): add and subtract to 10 in grade 1, facts to 20 from grade 2,
// no multiplication facts before grade 4, then 2s, 5s and 10s (grade 4), 2s, 3s, 4s, 5s and 10s (grade 5),
// and multiplication and division facts to 100 in grades 6 and 7. Never 12 x 12.
function withinBc(grade: Grade, f: Fact): boolean {
  const small = (n: number) => Number.isInteger(n) && n >= 0;
  if (![f.a, f.b, f.answer].every(small)) return false;
  switch (f.op) {
    case "+":
      return f.a + f.b === f.answer && f.answer <= (grade === 1 ? 10 : 20);
    case "-":
      return f.a - f.b === f.answer && f.a <= (grade === 1 ? 10 : 20);
    case "×": {
      if (f.a * f.b !== f.answer || f.a > 10 || f.b > 10) return false;
      if (grade <= 3) return false;
      const recall = grade === 4 ? [2, 5, 10] : grade === 5 ? [2, 3, 4, 5, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      return recall.includes(f.a) || recall.includes(f.b);
    }
    case "÷":
      return grade >= 6 && f.b > 0 && f.b <= 10 && f.answer <= 10 && f.answer * f.b === f.a;
  }
}

describe("facts section: only facts BC expects at the child's grade", () => {
  it.each(GRADES)("grade %i: every drawn fact, over many seeds, is within BC's expectation", (grade) => {
    const facts = drawn(grade);
    expect(facts.length).toBeGreaterThan(0);
    const above = facts.filter((f) => !withinBc(grade, f)).map((f) => `${f.a} ${f.op} ${f.b} = ${f.answer}`);
    expect(above).toEqual([]);
  });
});

const SECOND = 1000;
const grade3 = () => createFacts({ grade: 3, province: "BC" }, 11);
/** Answers the next `n` facts, one every `everyMs`, right or with "999". */
function answer(session: FactsSession, n: number, everyMs: number, right = true): FactsSession {
  let s = session;
  for (let i = 0; i < n; i++) {
    const fact = s.facts[s.answers.length];
    const last = s.answers.at(-1)?.atMs ?? 0;
    s = submitFact(s, { factId: fact.id, response: right ? String(fact.answer) : "999", atMs: last + everyMs });
  }
  return s;
}

describe("facts section: timed by the server", () => {
  it("lasts 60 seconds, inside the spec's 60-90", () => {
    expect(FACTS_SECONDS).toBeGreaterThanOrEqual(60);
    expect(FACTS_SECONDS).toBeLessThanOrEqual(90);
  });

  it("shows the next facts and the time left, then is done when the time is up", () => {
    const s = answer(grade3(), 3, 2 * SECOND);
    const step = factsStep(s, 6 * SECOND);
    expect(step).toMatchObject({ status: "running", answered: 3, remainingMs: FACTS_SECONDS * SECOND - 6 * SECOND });
    if (step.status !== "running") throw new Error("not running");
    expect(step.facts[0]).toEqual({ id: s.facts[3].id, a: s.facts[3].a, op: s.facts[3].op, b: s.facts[3].b });
    expect(step.facts[0]).not.toHaveProperty("answer");
    expect(factsStep(s, FACTS_SECONDS * SECOND)).toEqual({ status: "done", answered: 3 });
  });

  it("refuses an answer that reaches the server after the time is up, and an answer to the wrong fact", () => {
    const s = grade3();
    expect(() => submitFact(s, { factId: s.facts[0].id, response: "1", atMs: FACTS_SECONDS * SECOND + 10 * SECOND })).toThrow(/time is up/i);
    expect(() => submitFact(s, { factId: s.facts[1].id, response: "1", atMs: SECOND })).toThrow();
  });

  it("an empty answer skips the fact: it is not counted as answered", () => {
    const s = grade3();
    const skipped = submitFact(s, { factId: s.facts[0].id, response: "", atMs: SECOND });
    expect(factsStep(skipped, 2 * SECOND)).toMatchObject({ status: "running", answered: 0 });
  });

  it("restores the same section from the stored facts and the answers", () => {
    const s = answer(grade3(), 5, 3 * SECOND);
    const again = restoreFacts(storedFacts(s), s.answers.map(({ factId, response, atMs }) => ({ factId, response, atMs })));
    expect(again).toEqual(s);
  });
});

// A whole test through the public session API, then the placement with the facts section given.
function placementWith(profile: ChildProfile, isRight: Script, facts: FactsSession | null) {
  let session = createSession(profile, 5);
  for (let q = nextQuestion(session), i = 0; q; q = nextQuestion(session), i++) {
    session = submitAnswer(session, { questionId: q.id, response: isRight(q, i) ? q.answer : "no idea", timeMs: 20_000 });
  }
  return finish(session, facts);
}
const onGrade4 = { grade: 4, province: "BC" } as const;
const factsFor4 = () => createFacts(onGrade4, 5);
const report = (facts: FactsSession | null) =>
  reportModel(placementWith(onGrade4, knowsUpTo(4), facts), { completedTestsInGrade: 0, workReviews: [] });

describe("facts section: speed beside accuracy in the placement and the report", () => {
  it("quick and right: accuracy secure, speed quick, with the counts", () => {
    const facts = report(answer(factsFor4(), 25, 2 * SECOND)).facts;
    expect(facts).toMatchObject({ answered: 25, correct: 25, seconds: FACTS_SECONDS, secondsPerFact: 2, accuracy: "secure", speed: "quick" });
    expect(facts?.scope).toMatch(/addition and subtraction facts to 20/i);
    expect(facts?.scope).toMatch(/multiplication facts for 2, 5 and 10/i);
  });

  it("slow but correct: speed needs practice, accuracy secure, and nothing says behind", () => {
    const model = report(answer(factsFor4(), 7, 8 * SECOND));
    expect(model.facts).toMatchObject({ answered: 7, correct: 7, secondsPerFact: 8, accuracy: "secure", speed: "needs-practice" });
    expect(model.howWeHelp).toBe("on-grade");
    expect(JSON.stringify(model.facts)).not.toMatch(/behind/i);
  });

  it("quick but wrong: accuracy needs practice", () => {
    expect(report(answer(factsFor4(), 20, 2 * SECOND, false)).facts).toMatchObject({ answered: 20, correct: 0, accuracy: "needs-practice" });
  });

  it("skipped facts are not answered, and the time of a skip is not counted as speed", () => {
    let s = factsFor4();
    s = submitFact(s, { factId: s.facts[0].id, response: "", atMs: 20 * SECOND });
    s = answer(s, 4, 2 * SECOND);
    expect(report(s).facts).toMatchObject({ answered: 4, correct: 4, secondsPerFact: 2, speed: "quick" });
  });

  it("nothing answered: counts only, no speed or accuracy status", () => {
    expect(report(factsFor4()).facts).toMatchObject({ answered: 0, correct: 0, secondsPerFact: null, accuracy: null, speed: null });
  });

  it("no facts section: the placement and the report have no facts", () => {
    expect(placementWith(onGrade4, knowsUpTo(4), null).facts).toBeNull();
    expect(report(null).facts).toBeNull();
  });

  // Spec #54: "The working level is the highest level with 70% or more correct", from the test questions only.
  // The spec gives the facts section no part in the working level, so the facts never move it.
  it.each([
    ["a grade 4 child working at grade 2", knowsUpTo(2)],
    ["a grade 4 child on grade", knowsUpTo(4)],
    ["a grade 4 child working above grade", knowsUpTo(8)],
  ] as const)("%s: the facts section does not change the working level, the strands or the verdict", (_, isRight) => {
    const without = placementWith(onGrade4, isRight, null);
    for (const facts of [answer(factsFor4(), 30, SECOND), answer(factsFor4(), 4, 14 * SECOND, false), factsFor4()]) {
      const withFacts = placementWith(onGrade4, isRight, facts);
      expect({ ...withFacts, facts: null }).toEqual(without);
      const ctx = { completedTestsInGrade: 0, workReviews: [] };
      expect(reportModel(withFacts, ctx).howWeHelp).toBe(reportModel(without, ctx).howWeHelp);
    }
  });
});
