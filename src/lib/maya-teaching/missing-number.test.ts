import { describe, expect, it } from "vitest";
import { createSession, mayaPackageCheck } from "@/lib/maya/session";
import { packageLines } from "@/lib/maya/lines";
import { speechWords } from "@/lib/maya/speech";
import { frameState, saysInverse, type FrameStep } from "@/lib/maya/missing-number";
import { checkQuestionPackage, operationProblem, type OperationPackage, type QuestionPackage, type WorkedStep } from "@/lib/question-package";
import { withWorkbookMayaOperation } from "@/lib/workbook-maya-operation";
import { deriveMissingNumber, givesAway } from "./missing-number";
import { printedMissing } from "./missing-number-fixtures";

const kinds = (steps: WorkedStep[]) => steps.map((s) => s.kind);
const derive = (p: Parameters<typeof printedMissing>[0]) => deriveMissingNumber(printedMissing(p));
const teachable = (pkg: QuestionPackage | null) => (pkg ? createSession({ callId: "t", package: pkg }).package : null);

describe("deriveMissingNumber: a missing factor by division", () => {
  it("frames a × ? = c as c ÷ a, then works the division's own steps", () => {
    const pkg = derive({ known: 24, missing: 7, sign: "×" })!;
    expect(pkg.text).toBe("24 × ? = 168");
    expect(pkg.operation).toEqual({ kind: "divide", operands: [168, 24] });
    expect(pkg.answer).toEqual({ value: { type: "number", value: 7 }, accepted: [], unit: null });
    expect(pkg.steps[0]).toEqual({ id: "frame", kind: "missing-frame", sign: "×", known: 24, unknownFirst: false, total: 168, inverse: "÷", from: 168, by: 24 });
    expect(kinds(pkg.steps).slice(1)).toEqual(["divide-digit", "divide-digit", "divide-digit", "result"]);
    expect(pkg.operationSource).toBe("maya-teaching");
    expect(teachable(pkg)).not.toBeNull();
  });

  it("reads ? × a = c the same way", () => {
    const pkg = derive({ known: 24, missing: 7, sign: "×", unknownFirst: true })!;
    expect(pkg.text).toBe("? × 24 = 168");
    expect(pkg.easierExample?.text).toMatch(/^\? × \d+ = \d+$/);
    expect(teachable(pkg)).not.toBeNull();
  });

  it("drops a factor's zeros from both numbers first: 30 × ? = 1620 is 162 ÷ 3", () => {
    const pkg = derive({ known: 30, missing: 54, sign: "×" })!;
    expect(pkg.operation).toEqual({ kind: "divide", operands: [162, 3] });
    expect(pkg.steps[1]).toEqual({ id: "zeros", kind: "drop-zeros", from: 1620, by: 30, zeros: 1, toFrom: 162, toBy: 3 });
    expect(pkg.easierExample?.steps[1]?.kind).toBe("drop-zeros");
    expect(teachable(pkg)).not.toBeNull();
  });

  it("drops two zeros from a multiple of 100: 600 × ? = 4200 is 42 ÷ 6", () => {
    const pkg = derive({ known: 600, missing: 7, sign: "×" })!;
    expect(pkg.operation).toEqual({ kind: "divide", operands: [42, 6] });
    expect(pkg.steps[1]).toMatchObject({ kind: "drop-zeros", zeros: 2 });
    expect(teachable(pkg)).not.toBeNull();
  });

  it("works a Solve it two ways item, whose only scored region is the answer box", () => {
    expect(teachable(derive({ known: 70, missing: 12, sign: "×", format: "two-ways" }))).not.toBeNull();
  });
});

describe("deriveMissingNumber: a 3-digit factor by trying numbers", () => {
  it("uses one try step, never long division by the 3-digit number", () => {
    const pkg = derive({ known: 236, missing: 6, sign: "×" })!;
    expect(kinds(pkg.steps)).toEqual(["missing-frame", "try-factor", "result"]);
    expect(pkg.steps.some((s) => s.kind === "divide-digit")).toBe(false);
    expect(pkg.steps[1]).toMatchObject({ factor: 236, total: 1416, round: 200, value: 6 });
    expect(kinds(pkg.easierExample!.steps)).toEqual(["missing-frame", "try-factor", "result"]);
    expect(teachable(pkg)).not.toBeNull();
  });

  it("holds a 3-digit factor whose missing factor has two digits (no try path for it)", () => {
    expect(derive({ known: 236, missing: 12, sign: "×" })).toBeNull();
  });

  it("needs Maya's divisor limit: the default check refuses the same operation", () => {
    expect(operationProblem({ kind: "divide", operands: [1416, 236] })).not.toBeNull();
  });
});

describe("deriveMissingNumber: a missing number taken away", () => {
  it("frames a − ? = c as a − c, then the subtraction's own steps", () => {
    const pkg = derive({ known: 9000, missing: 6000, sign: "−" })!;
    expect(pkg.text).toBe("9000 − ? = 3000");
    expect(pkg.operation).toEqual({ kind: "subtract", operands: [9000, 3000] });
    expect(pkg.steps[0]).toMatchObject({ kind: "missing-frame", inverse: "−", from: 9000, by: 3000 });
    expect(pkg.easierExample?.text).toBe("9 − ? = 5");
    expect(teachable(pkg)).not.toBeNull();
  });
});

describe("deriveMissingNumber: three agreements, or held", () => {
  it("holds a text outside the exact forms", () => {
    for (const text of ["24 x ? = 168", "24×?=168", "24 × ? = 168.", "24 × _ = 168", "? − 24 = 168", "024 × ? = 168", "24 × ? = 168 and 1", "2,400 × ? = 16,800"]) {
      expect(derive({ known: 24, missing: 7, sign: "×", text }), text).toBeNull();
    }
  });

  it("holds an answer key that is not the computed missing number", () => {
    expect(derive({ known: 24, missing: 7, sign: "×", key: 8 })).toBeNull();
  });

  it("holds a template whose expression is not the printed relationship", () => {
    expect(derive({ known: 24, missing: 7, sign: "×", relation: "a + b" })).toBeNull();
    expect(derive({ known: 24, missing: 7, sign: "×", relation: "b * b" })).toBeNull();
    expect(derive({ known: 50, missing: 7, sign: "−", relation: "b - a" })).toBeNull();
  });

  it("holds a printed number the template does not give", () => {
    expect(derive({ known: 24, missing: 7, sign: "×", text: "24 × ? = 192" })).toBeNull();
  });

  it("leaves a package that already has an operation alone", () => {
    const pkg = derive({ known: 24, missing: 7, sign: "×" })!;
    expect(deriveMissingNumber(pkg)).toBeNull();
  });
});

describe("the easier example never gives the answer away (lesson 11)", () => {
  const x = (known: number, total: number) => ({ sign: "×" as const, known, unknownFirst: false, total });
  it("refuses an answer times a power of 10, the first digits of the answer, and a printed number", () => {
    expect(givesAway(x(30, 600), 20, x(2, 4), 2)).toBe(true);
    expect(givesAway(x(30, 6000), 200, x(2, 4), 2)).toBe(true);
    expect(givesAway(x(30, 1620), 54, x(2, 10), 5)).toBe(true);
    expect(givesAway(x(30, 16200), 540, x(2, 108), 54)).toBe(true);
    expect(givesAway(x(40, 13200), 330, x(20, 40), 2)).toBe(true);
    expect(givesAway(x(30, 1620), 54, x(20, 40), 2)).toBe(false);
  });

  it("holds for every example the deriver makes, here on a spread of printed questions", () => {
    const cases: Parameters<typeof printedMissing>[0][] = [
      ...[30, 40, 50, 70, 80, 90].flatMap((known) => [12, 54, 140, 330, 540, 700, 810].map((missing) => ({ known, missing, sign: "×" as const }))),
      ...[200, 400, 500, 600, 700, 800].flatMap((known) => [2, 3, 7, 9].map((missing) => ({ known, missing, sign: "×" as const }))),
      ...[104, 173, 236, 302, 548, 977].flatMap((known) => [2, 3, 5, 6, 9].map((missing) => ({ known, missing, sign: "×" as const }))),
      ...[13, 24, 7].flatMap((known) => [4, 8, 20].map((missing) => ({ known, missing, sign: "×" as const }))),
      ...[[9000, 6000], [13000, 10000], [500, 200], [80, 30]].map(([known, missing]) => ({ known, missing, sign: "−" as const })),
    ];
    for (const c of cases) {
      const pkg = derive(c);
      if (!pkg) continue;
      const q = { sign: c.sign, known: c.known, unknownFirst: false, total: c.sign === "×" ? c.known * c.missing : c.known - c.missing };
      const ex = pkg.easierExample!;
      const m = /^(\d+) [×−] \? = (\d+)$/.exec(ex.text)!;
      const e = { sign: c.sign, known: Number(m[1]), unknownFirst: false, total: Number(m[2]) };
      expect(givesAway(q, c.missing, e, (ex.answer as { value: number }).value), `${pkg.text} with ${ex.text}`).toBe(false);
    }
  });
});

describe("Maya's check of a missing-number package", () => {
  const pkg = derive({ known: 30, missing: 54, sign: "×" })!;

  it("is refused by the default check: the framing steps are Maya's only", () => {
    expect(checkQuestionPackage(pkg).ok).toBe(false);
    expect(checkQuestionPackage({ ...pkg, operationSource: undefined }).ok).toBe(false);
    expect(mayaPackageCheck(pkg).ok).toBe(true);
  });

  it("refuses a changed framing step, zeros step, operation or try", () => {
    const changed = (steps: WorkedStep[]) => ({ ...pkg, steps });
    const [frame, zeros, ...rest] = pkg.steps;
    expect(mayaPackageCheck(changed([{ ...frame, total: 1650 } as WorkedStep, zeros, ...rest])).ok).toBe(false);
    expect(mayaPackageCheck(changed([frame, { ...zeros, toFrom: 16 } as WorkedStep, ...rest])).ok).toBe(false);
    expect(mayaPackageCheck(changed([frame, ...rest])).ok).toBe(false);
    expect(mayaPackageCheck({ ...pkg, operation: { kind: "divide", operands: [1620, 30] } }).ok).toBe(false);
    const trial = derive({ known: 236, missing: 6, sign: "×" })!;
    const t = trial.steps[1] as Extract<WorkedStep, { kind: "try-factor" }>;
    expect(mayaPackageCheck({ ...trial, steps: [trial.steps[0], { ...t, tries: t.tries.map((x) => ({ ...x, product: x.product + 1 })) }, trial.steps[2]] }).ok).toBe(false);
  });

  it("refuses a text that is not the framing step's equation, and an example found another way", () => {
    expect(mayaPackageCheck({ ...pkg, text: "30 × ? = 1650" }).ok).toBe(false);
    const other = derive({ known: 24, missing: 7, sign: "×" })!;
    expect(mayaPackageCheck({ ...pkg, easierExample: other.easierExample }).ok).toBe(false);
  });
});

describe("the lines of a missing number", () => {
  it("names the question by its printed equation and says the framing first", () => {
    const pkg = teachable(derive({ known: 30, missing: 54, sign: "×" })) as OperationPackage;
    const l = packageLines(pkg);
    expect(l.question()[0].texts[0]).toContain("30 × ? = 1620");
    expect(l.tryTarget()[0].texts[0]).toBe("Now you try yours: 30 × ? = 1620. To find the missing number, work out 1620 ÷ 30.");
    expect(l.help(l.stepIds[0])[0].texts[0]).toBe("30 times the missing number makes 1620. So the missing number is 1620 ÷ 30. Take 1 zero off both numbers. That gives 162 ÷ 3.");
    expect(l.answerRight()[0].texts[0]).toBe("Yes! 1620 ÷ 30 = 54.");
    expect(l.stepIds).not.toContain("frame");
    expect(l.stepIds).not.toContain("zeros");
  });

  it("puts the framing before the first hint said at any level, only while Maya has not said it", () => {
    const pkg = teachable(derive({ known: 30, missing: 54, sign: "×" })) as OperationPackage;
    const l = packageLines(pkg);
    const first = l.stepIds[0];
    const h1 = (state: "due" | "heard" | "done") => l.help(first, state).find((o) => o.level === 1 && o.line === "step.point")!.texts[0];
    expect(h1("due")).toBe(`The missing number is 1620 ÷ 30. That is 162 ÷ 3. ${h1("done")}`);
    expect(h1("heard")).toBe(`Yes! The missing number is 1620 ÷ 30. That is 162 ÷ 3. ${h1("done")}`);
    expect(l.help(first, "due").filter((o) => (o.level ?? 0) >= 1 && o.line !== "step.why").every((o) => o.texts.every((t) => t.startsWith("The missing number is 1620 ÷ 30.")))).toBe(true);
    expect(l.help(first, "done").filter((o) => o.line !== "step.why").some((o) => o.texts.some((t) => t.includes("1620 ÷ 30")))).toBe(false);
    expect(l.help(first, "done")[0].texts[0]).toBe("Take 1 zero off both numbers. That gives 162 ÷ 3. Let's start with the hundreds.");
    expect(l.help(l.stepIds[1], "due").some((o) => o.texts.some((t) => t.includes("1620 ÷ 30")))).toBe(false);
  });

  it("knows where the framing stands: due, heard from the child (exact forms only), or said by Maya", () => {
    const pkg = teachable(derive({ known: 30, missing: 54, sign: "×" })) as OperationPackage;
    const frame = pkg.steps[0] as FrameStep;
    expect(frameState(pkg.steps, ["What did you try for 30 × ? = 1620?"], [])).toBe("due");
    expect(frameState(pkg.steps, ["Now you try yours: 30 × ? = 1620. To find the missing number, work out 1620 ÷ 30."], [])).toBe("done");
    expect(frameState(pkg.steps, [], ["I do 1620 divided by 30."])).toBe("heard");
    for (const t of ["1620 divided by 30", "I do 1620 ÷ 30.", "We do 1620 divided by 30", "Divide 1620 by 30.", "So I do one thousand six hundred twenty divided by thirty.", "1620 divided by 30 is 54."]) expect(saysInverse(frame, t), t).toBe(true);
    for (const t of ["30 divided by 1620", "I do 1620 divided by 3.", "Do I do 1620 divided by 30?", "My mom does 1620 divided by 30.", "1620 times 30", "I do 1620 divided by 30. Then I add."]) expect(saysInverse(frame, t), t).toBe(false);
    const sub = teachable(derive({ known: 9000, missing: 6000, sign: "−" })) as OperationPackage;
    expect(saysInverse(sub.steps[0] as FrameStep, "I do 9000 minus 3000.")).toBe(true);
    expect(saysInverse(sub.steps[0] as FrameStep, "I do 3000 minus 9000.")).toBe(false);
  });

  it("in a 25-word turn, the first hint while the framing is due is the framing alone; step.why is never led", () => {
    const l = packageLines(teachable(derive({ known: 90, missing: 790, sign: "×" })) as OperationPackage);
    const first = l.stepIds[0];
    const hints = l.help(first, "due", true).filter((o) => (o.level ?? 0) >= 1 && o.line !== "step.why");
    expect(hints.every((o) => o.texts.length === 1 && o.texts[0] === "The missing number is 71100 ÷ 90. That is 7110 ÷ 9.")).toBe(true);
    expect(speechWords(hints[0].texts[0])).toBeLessThanOrEqual(25);
    expect(l.help(first, "due").find((o) => o.line === "step.why")!.texts[0]).toBe("90 times the missing number makes 71100. That is why we work out 71100 ÷ 90.");
    expect(l.help(first, "due")[0].texts.some((t) => speechWords(t) <= 25)).toBe(true);
  });

  it("answers why the first step divides or tries numbers (step.why), from the printed equation", () => {
    const divide = packageLines(teachable(derive({ known: 30, missing: 54, sign: "×" })) as OperationPackage);
    expect(divide.help(divide.stepIds[0], "done").find((o) => o.line === "step.why")!.texts[0]).toBe("30 times the missing number makes 1620. That is why we work out 1620 ÷ 30.");
    const trial = packageLines(teachable(derive({ known: 236, missing: 6, sign: "×" })) as OperationPackage);
    expect(trial.help("try", "done").find((o) => o.line === "step.why")!.texts[0]).toMatch(/^Dividing by 236 in your head is hard\./);
  });

  it("says why first: a subtraction's framing names the missing number taken away", () => {
    const pkg = teachable(derive({ known: 9000, missing: 6000, sign: "−" })) as OperationPackage;
    expect(packageLines(pkg).help("ones", "due")[0].texts[0]).toBe("9000 take away the missing number is 3000. So the missing number is 9000 − 3000. Let's start with the ones. What can you do there?");
  });

  it("multiplies out a wrong try, and shows the try next to the answer at H3, never the answer", () => {
    const pkg = teachable(derive({ known: 236, missing: 6, sign: "×" })) as OperationPackage;
    const l = packageLines(pkg);
    expect(l.stepIds).toEqual(["try"]);
    const help = l.help("try", "done");
    expect(help.map((o) => [o.line, o.level])).toEqual([["step.invite", 0], ["step.point", 1], ["step.operation", 2], ["step.show", 3], ["step.why", 1]]);
    expect(help[3].texts[0]).toBe("236 × 5 = 1180. That is less than 1416.");
    expect(help[3].board).toBeUndefined();
    const seven = l.notYet("result").find((o) => o.slots.heard === "7")!;
    expect(seven.texts[0]).toBe("236 × 7 = 1652. That is more than 1416. Try a smaller number.");
    expect(seven.requires).toEqual({ answer: "wrong", step: "result", heard: "7" });
    expect(l.notYet("result").some((o) => o.slots.heard === "6")).toBe(false);
    expect(l.rightStep("try")[0].texts[0]).toBe("Yes! 236 times your number makes 1416.");
  });
});

describe("the generator's behaviour stays as it was", () => {
  it("today's limits hold by default: no division by 236, no 10000 + 2000, no 13000 − 3000", () => {
    expect(operationProblem({ kind: "divide", operands: [1416, 236] })).not.toBeNull();
    expect(operationProblem({ kind: "add", operands: [10000, 2000] })).not.toBeNull();
    expect(operationProblem({ kind: "subtract", operands: [13000, 3000] })).not.toBeNull();
  });

  it("withWorkbookMayaOperation adds no Maya-only step and keeps today's limits", () => {
    const small = withWorkbookMayaOperation(printedMissing({ known: 30, missing: 54, sign: "×" }));
    expect(small.operation).toEqual({ kind: "divide", operands: [1620, 30] });
    expect(kinds(small.steps)).not.toContain("missing-frame");
    expect(checkQuestionPackage(small).ok).toBe(true);
    const big = printedMissing({ known: 236, missing: 6, sign: "×" });
    expect(withWorkbookMayaOperation(big)).toEqual(big);
    const over = printedMissing({ known: 30, missing: 540, sign: "×" });
    expect(withWorkbookMayaOperation(over)).toEqual(over);
  });
});
