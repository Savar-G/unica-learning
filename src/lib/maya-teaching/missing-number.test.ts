import { describe, expect, it } from "vitest";
import { createSession, mayaPackageCheck } from "@/lib/maya/session";
import { packageLines } from "@/lib/maya/lines";
import { checkQuestionPackage, operationProblem, type OperationPackage, type QuestionPackage, type WorkedStep } from "@/lib/question-package";
import { withWorkbookMayaOperation } from "@/lib/workbook-maya-operation";
import { deriveMissingNumber } from "./missing-number";
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
    expect(l.help(l.stepIds[0])[0].texts[0]).toBe("To find the missing number, work out 1620 ÷ 30. Take 1 zero off both numbers. That gives 162 ÷ 3. Let's start with the hundreds.");
    expect(l.answerRight()[0].texts[0]).toBe("Yes! 1620 ÷ 30 = 54.");
    expect(l.stepIds).not.toContain("frame");
    expect(l.stepIds).not.toContain("zeros");
  });

  it("multiplies out a wrong try, and shows the tries on each side at H3 without the answer", () => {
    const pkg = teachable(derive({ known: 236, missing: 6, sign: "×" })) as OperationPackage;
    const l = packageLines(pkg);
    expect(l.stepIds).toEqual(["try"]);
    const help = l.help("try");
    expect(help.map((o) => o.level)).toEqual([0, 1, 2, 3]);
    expect(help[3].texts[0]).toBe("236 × 5 = 1180. That is less than 1416. 236 × 7 = 1652. That is more than 1416.");
    expect(help[3].board).toBeUndefined();
    const seven = l.notYet("result").find((o) => o.slots.heard === "7")!;
    expect(seven.texts[0]).toBe("236 × 7 = 1652. That is more than 1416. Try a smaller number.");
    expect(seven.requires).toEqual({ answer: "wrong", step: "result", heard: "7" });
    expect(l.notYet("result").some((o) => o.slots.heard === "6")).toBe(false);
    expect(l.rightStep("try")[0].texts[0]).toBe("Yes! 236 × 6 = 1416.");
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
