// The scale, minute-hand and money claims (C3b) in Maya's session: what the model reads, and what code hears for the
// compare step (review of #741, P1a).
import { describe, expect, it, vi } from "vitest";
import { scenarioModel } from "@/lib/maya-gate/gate";
import { modelInput } from "@/lib/maya-model";
import { compareEquationSaid, evaluateSteps } from "@/lib/maya/evaluate";
import { claimView } from "@/lib/maya/claim";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { createTextSession } from "@/lib/maya-text";
import type { OperationPackage, QuestionPackage } from "@/lib/question-package";
import { deriveTopicClaim } from "./topic-derivers";
import { minutePrinted, moneyPrinted, scalePrinted } from "./topic-samples";

vi.mock("server-only", () => ({}));

const session = (pkg: QuestionPackage) => createTextSession({ callId: "claim-steps", package: pkg, grade: 5, model: scenarioModel(), clock: () => 1000 });

describe("the compare step of a scale or minute-hand claim (review of #741, P1a)", () => {
  it.each([
    ["scale, step 10", scalePrinted(10, 60, 2, true)],
    ["scale, step 2", scalePrinted(2, 90, 3, false)],
    ["minute hand", minutePrinted(3, 7, true)],
  ])("%s: the model's steps end with the compare step 'claim'", (_, printed) => {
    const s = session(deriveTopicClaim(printed)!);
    const steps = modelInput(s.session).question!.steps;
    expect(steps.at(-1)!.id).toBe("claim");
    expect(steps.filter((x) => x.id === "claim")).toHaveLength(1);
    expect(steps.map((x) => x.id)).toEqual(evaluateSteps(s.session.package!)!.map((x) => x.id));
  });

  it("money (one decimal addition): the model's steps end with the compare step too", () => {
    const s = session(deriveTopicClaim(moneyPrinted(2, 2, true))!);
    expect(modelInput(s.session).question!.steps.at(-1)!.id).toBe("claim");
  });

  it("hears the equation the compare checks: the last part's own, in its order (either order for + and ×)", () => {
    const pkg = session(deriveTopicClaim(scalePrinted(10, 60, 2, true))!).session.package as OperationPackage;
    expect(compareEquationSaid(pkg, "60 plus 20 is 80", 80)).toBe(true);
    expect(compareEquationSaid(pkg, "20 plus 60 equals 80", 80)).toBe(true);
    expect(compareEquationSaid(pkg, "sixty plus twenty is eighty", 80)).toBe(true);
    // Not the last part, not its result, and not another equation.
    expect(compareEquationSaid(pkg, "2 times 10 is 20", 80)).toBe(false);
    expect(compareEquationSaid(pkg, "60 plus 20 is 90", 80)).toBe(false);
    expect(compareEquationSaid(pkg, "60 plus 2 times 10 is 80", 80)).toBe(false);
    expect(compareEquationSaid(pkg, "60 minus 20 is 80", 80)).toBe(false);
  });

  it("hears a one-step claim's own equation (A4's CLAIM_TF, a multiplication), and never a decimal one", () => {
    const tf = claimView(FIXTURES.CLAIM_TF as OperationPackage);
    expect(tf.operation.kind).toBe("multiply");
    const [a, b] = tf.operation.operands as [number, number];
    expect(compareEquationSaid(tf, `${a} times ${b} is ${a * b}`, a * b)).toBe(true);
    expect(compareEquationSaid(tf, `${b} times ${a} is ${a * b}`, a * b)).toBe(true);
    expect(compareEquationSaid(tf, `${a} times ${b} is ${a * b + 1}`, a * b)).toBe(false);
    // Money's 40 + 0.5: the equation reader takes whole numbers only, so only the total alone is heard.
    const money = session(deriveTopicClaim(moneyPrinted(2, 2, true))!).session.package as OperationPackage;
    expect(compareEquationSaid(money, "40 plus 0.5 is 40.5", 40.5)).toBe(false);
  });
});

describe("a scale claim's easier example (review of #741, P2; lessons 11 and 12)", () => {
  const scales: [2 | 10, number, number][] = [];
  for (const step of [2, 10] as const) for (let v = 20; v <= 100; v += 10) for (let m = 1; m <= 9; m++) scales.push([step, v, m]);

  it.each([
    [10, 90, 3, "9 + 3 × 1"],
    [10, 100, 2, "10 + 2 × 1"],
    [10, 60, 3, "6 + 3 × 1"],
  ] as const)("%s-step scale from %s, %s intervals: not the question's own digits (%s)", (step, v, m, refused) => {
    const made = deriveTopicClaim(scalePrinted(step, v, m, true))!;
    expect(made.easierExample!.operation).not.toEqual({ kind: "evaluate", operands: [refused] });
  });

  it("every scale the template makes gets a checked example of its shape that gives nothing away", () => {
    for (const [step, v, m] of scales) {
      for (const holds of [true, false]) {
        const made = deriveTopicClaim(scalePrinted(step, v, m, holds));
        const id = `${step} ${v} ${m} ${holds}`;
        expect(made, id).not.toBeNull();
        const op = made!.easierExample!.operation;
        const [a, b, c] = /^(\d+) \+ (\d+) × (\d+)$/.exec((op as { operands: string[] }).operands[0])!.slice(1).map(Number);
        const answer = v + m * step;
        const got = a + b * c;
        expect(made!.easierExample!.answer, id).toEqual({ type: "number", value: got });
        for (const x of [a, b, c]) expect([v, m, step, answer, 0, 1], id).not.toContain(x);
        expect([1, 10, 100, 1000].map((p) => got * p), id).not.toContain(answer);
        expect(String(answer).startsWith(String(got)), id).toBe(false);
      }
    }
  });
});
