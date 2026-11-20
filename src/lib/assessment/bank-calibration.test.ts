import { describe, expect, it } from "vitest";
import {
  createAdaptiveSession, fillTemplate, lockAdaptiveBlock, nextQuestion, REPORTED_STRAND, restoreSession,
  storedTest, submitAnswer, templateSkills, toPublicQuestion,
  type Question, type Session,
} from "@/lib/assessment";
import { adaptiveBank, ALL_TEMPLATES } from "./bank";

const bc = adaptiveBank("BC");
const byId = new Map(bc.map((t) => [t.id, t]));
const originalById = new Map(ALL_TEMPLATES.map((t) => [t.id, t]));
const seeds = Array.from({ length: 50 }, (_, i) => i * 7919);

function drawn(id: string, seed = 1) {
  const template = byId.get(id);
  if (!template) throw new Error(`Missing test template ${id}`);
  return fillTemplate(template, seed);
}

function mark(question: Question, response: string) {
  const session: Session = {
    profile: { province: "BC", grade: 8 }, seed: 1, stage1: [question], stage2: { up: [], stay: [], down: [] },
    route: null, answers: [],
  };
  return restoreSession(storedTest(session), [{ questionId: question.id, response, timeMs: 15000 }]).answers[0];
}

function finishPart(session: Session, right = 4) {
  const questions = session.adaptive!.blocks.at(-1)!.questions;
  for (const [i, q] of questions.entries()) session = submitAnswer(session, {
    questionId: q.id, response: i < right ? q.answer : "I don't know yet", timeMs: 15000,
  });
  return session;
}

describe("new adaptive question pool", () => {
  it("keeps historic IDs while dropping verified duplicate tasks from the BC pool", () => {
    const pairs = [
      ["1-order-three", "1-tallest-child"],
      ["1-order-three", "1-heaviest-box"],
      ["k-pattern-core", "2-pattern-core"],
      ["2-graph-fewer", "1-graph-how-many-more"],
      ["2-certain-possible", "1-never-sometimes-always"],
      ["g35-5-rectangle-area", "g67-5-rectangle-area"],
      ["g67-6-mixed-to-improper", "g35-6-mixed-to-improper"],
      ["g67-8-cylinder-volume-revised", "g67-7-cylinder-volume"],
    ];
    for (const [kept, retired] of pairs) {
      expect(byId.has(kept), kept).toBe(true);
      expect(byId.has(retired), retired).toBe(false);
      expect(originalById.has(retired), retired).toBe(true);
    }
    expect(byId.has("k-coin-picture")).toBe(false);
    expect(byId.has("k-make-balance")).toBe(false);
    expect(byId.has("k-where-is-revised")).toBe(true);
    // Ontario's Grade 7 cylinder filing continues to get a rounded variant.
    expect(adaptiveBank("ON").some((t) => t.id === "g67-7-cylinder-volume-revised" && t.grades.ON === 7)).toBe(true);
  });

  it("moves the verified integer equations and two-operation rule to their mapped BC standards", () => {
    for (const operation of ["add", "subtract"]) {
      const old = `g67-7-integer-${operation}-equation`;
      const id = `${old}-revised`;
      expect(byId.has(old)).toBe(false);
      expect(originalById.get(old)?.grades.BC).toBe(7);
      expect(byId.get(id)).toMatchObject({ grades: { BC: 8 }, standard: "8.8" });
      expect(templateSkills(id).map((s) => s.id)).toEqual(["8.8-one-step-integers"]);
    }
    expect(byId.get("g67-5-table-rule-revised")).toMatchObject({ grades: { BC: 6 }, standard: "6.9" });
    // These tasks have explicit grade-appropriate skills in the BC map.
    expect(byId.get("g35-5-divide-two-digit")?.grades.BC).toBe(5);
    expect(byId.get("1-unit-size")?.grades.BC).toBe(1);
    expect(byId.get("g35-6-like-terms-equation")?.grades.BC).toBe(6);
  });

  it.each(seeds)("draws the plain cases and revised content in range at seed %i", (seed) => {
    const sum = drawn("1-add-within-10", seed);
    expect(Number(sum.answer)).toBe(sum.values.a + sum.values.b);
    expect(Number(sum.answer)).toBeLessThanOrEqual(10);

    const noRegroup = drawn("2-add-no-regroup", seed);
    expect(Number(noRegroup.answer)).toBe(noRegroup.values.a + noRegroup.values.b);
    expect(noRegroup.values.a % 10 + noRegroup.values.b % 10).toBeLessThan(10);
    const three = drawn("2-three-addends-revised", seed);
    expect(Object.values(three.values).every((n) => n < 10)).toBe(true);
    expect(Number(three.answer)).toBe(Object.values(three.values).reduce((a, b) => a + b));

    const fraction = drawn("g35-3-fraction-of-amount-revised", seed);
    expect(fraction.values.d * Number(fraction.answer)).toBeLessThanOrEqual(12);
    expect(drawn("3-coin-streak-revised", seed).prompt).toMatch(/^Toss a fair /);
    const decimals = drawn("4-compare-equal-place-decimals", seed);
    expect(decimals.choices?.every((choice) => /^\d\.\d{2}$/.test(choice))).toBe(true);
    const extreme = decimals.prompt.includes("greatest") ? Math.max : Math.min;
    expect(Number(decimals.answer)).toBe(extreme(...decimals.choices!.map(Number)));

    const figure = drawn("g35-4-figure-pattern-revised", seed);
    expect(figure.prompt).toContain("How many tiles does Figure 4 use?");
    expect(Number(figure.answer)).toBe(figure.values.first + 3 * figure.values.step);
    const expression = drawn("g35-5-evaluate-multiply-revised", seed);
    expect(expression.prompt).toContain(" × n");
    expect(Number(expression.answer)).toBe(expression.values.a * expression.values.b);
    const likeDenominators = drawn("8-like-denominator-subtract", seed);
    const { a, b, d } = likeDenominators.values;
    expect(likeDenominators.answer).toBe(`${a - b}/${d}`);
    const fractions = likeDenominators.choices?.map((text) => {
      const [numerator, denominator] = text.split("/").map(Number);
      return numerator / denominator;
    });
    expect(new Set(fractions).size).toBe(3);
  });

  it("balances a full block and reproduces the next block after JSON storage and restore", () => {
    const test = () => createAdaptiveSession({ grade: 8, province: "BC" }, 137);
    const initial = test();
    expect(storedTest(initial)).toEqual(storedTest(test()));
    const answered = finishPart(initial);
    const restored = restoreSession(JSON.parse(JSON.stringify(storedTest(initial))), answered.answers);
    const locked = lockAdaptiveBlock(restored);
    expect(locked).toEqual(lockAdaptiveBlock(answered));
    expect(locked.adaptive?.blocks[1].questions).toHaveLength(6);

    const questions = initial.adaptive!.blocks[0].questions;
    const count = (difficulty: Question["difficulty"]) => questions.filter((q) => q.difficulty === difficulty).length;
    expect([1, 2]).toContain(count("easy"));
    expect([2, 3]).toContain(count("medium"));
    expect(count("hard")).toBeLessThanOrEqual(2);
    expect(new Set(questions.map((q) => REPORTED_STRAND[q.strand])).size).toBe(4);
    expect(toPublicQuestion(questions[0])).not.toHaveProperty("difficulty");
  });

  it("continues a legacy adaptive test with its saved IDs and original block selection", () => {
    const generated = createAdaptiveSession({ grade: 4, province: "BC" }, 137, ALL_TEMPLATES);
    const pool = generated.adaptive!.pool.map((question) => {
      const saved = { ...question };
      delete saved.difficulty;
      delete saved.numberGrading;
      return saved;
    });
    // The first and second block IDs were drawn by the previous selector at the same seed.
    const start = ["bq-69", "bq-103", "bq-28", "bq-46", "bq-32", "bq-104"];
    const questions = start.map((id) => pool.find((q) => q.id === id)!);
    const adaptive = {
      ...generated.adaptive!, pool, blocks: [{ level: 4, purpose: "search", questions }],
    } satisfies NonNullable<Session["adaptive"]>;
    delete adaptive.bankCalibration;
    const initial = restoreSession({ ...storedTest(generated), adaptive }, []);
    expect(initial.adaptive?.blocks[0].questions.map((q) => q.id)).toEqual(start);
    expect(lockAdaptiveBlock(finishPart(initial)).adaptive?.blocks[1].questions.map((q) => q.id))
      .toEqual(["bq-53", "bq-45", "bq-145", "bq-133", "bq-178", "bq-72"]);
  });

  it("keeps the strand rotation and fills the block when the difficulty target is impossible", () => {
    const ids = new Set([
      "g67-8-hypotenuse", "g67-8-cylinder-volume-revised", "g67-8-root-between",
      "g67-8-add-fractions", "g67-8-negative-coefficient", "g67-8-small-percent",
    ]);
    const hardBank = bc.filter((t) => ids.has(t.id));
    const session = createAdaptiveSession({ grade: 8, province: "BC" }, 137, hardBank);
    const questions = session.adaptive!.blocks[0].questions;
    expect(questions).toHaveLength(6);
    expect(questions.every((q) => q.difficulty === "hard")).toBe(true);
    expect(new Set(questions.map((q) => q.id)).size).toBe(6);
    expect(questions.map((q) => q.strand).sort()).toEqual(hardBank.map((t) => t.strand).sort());
  });
});

describe("stored number grading policy", () => {
  it("accepts an unambiguous trailing decimal point only under the new policy", () => {
    const before = drawn("1-add-within-10");
    const after = { ...before, numberGrading: {} };
    expect(mark(after, `${before.answer}.`).correct).toBe(true);
    expect(mark(before, `${before.answer}.`).correct).toBe(false);
    expect(mark(before, `${before.answer}.0`).correct).toBe(true);
    for (const malformed of [".", `${before.answer}..`, `${before.answer}.0.`, `${before.answer},0.`, `${before.answer}e0.`]) {
      expect(mark(after, malformed).correct, malformed).toBe(false);
    }
    expect(toPublicQuestion(after)).not.toHaveProperty("numberGrading");
  });

  it("accepts the whole-number half-up boundary for the actual circle area, and rejects close wrong answers", () => {
    const circle = seeds.map((seed) => drawn("g67-7-circle-area-revised", seed)).find((q) => q.values.r === 5);
    expect(circle).toBeDefined();
    expect(circle!.answer).toBe("78.5");
    expect(circle!.numberGrading?.rounded).toEqual(["78.5", "79"]);
    for (const response of ["78.50", "79", "79."]) expect(mark(circle!, response).correct).toBe(true);
    for (const response of ["78", "78.49", "78.51", "79.1"]) expect(mark(circle!, response).correct).toBe(false);
    const legacy = fillTemplate(originalById.get("g67-7-circle-area")!, 1);
    expect(mark({ ...legacy, answer: "78.5" }, "79").correct).toBe(false);
  });

  it.each(["g67-7-circumference-revised", "g67-8-cylinder-volume-revised", "g67-8-mean-revised"])(
    "accepts the stated rounding for %s using the saved alternatives", (id) => {
      const q = seeds.map((seed) => drawn(id, seed)).find((q) => q.answer.includes("."));
      expect(q).toBeDefined();
      expect(q!.prompt).toContain("round to the nearest tenth or whole number");
      for (const response of q!.numberGrading!.rounded!) expect(mark(q!, response).correct).toBe(true);
      expect(mark(q!, String(Number(q!.answer) + 0.013)).correct).toBe(false);
    },
  );

  it("regrades the saved block with the policy attached at creation", () => {
    const initial = createAdaptiveSession({ grade: 1, province: "BC" }, 137);
    let session = initial;
    for (const question of initial.adaptive!.blocks[0].questions) {
      expect(nextQuestion(session)?.id).toBe(question.id);
      session = submitAnswer(session, {
        questionId: question.id, response: question.format === "number" ? `${question.answer}.` : question.answer, timeMs: 15000,
      });
    }
    expect(session.answers.some((q) => q.response.endsWith("."))).toBe(true);
    expect(session.answers.every((answer) => answer.correct)).toBe(true);
    expect(restoreSession(storedTest(initial), session.answers).answers).toEqual(session.answers);
  });
});
