import { describe, expect, it } from "vitest";
import { createSession, heldReason, mayaPackageCheck } from "@/lib/maya";
import { checkQuestionPackage, operationProblem, workedSteps, type QuestionPackage } from "@/lib/question-package";
import { printedWorkbookQuestion } from "@/lib/workbook-maya-operation";
import { teachingPackage } from "./index";
import { MAYA_TEACHING_LIMITS } from "./limits";
import { multiStepOperation } from "./multi-step";
import { addsThousandChain, boxesThenSells, eachHasStory, putsInEachStory, subtractFromTenThousand, thousandsSum } from "./samples";

const teach = (stored: QuestionPackage) => teachingPackage(stored) as QuestionPackage;
const held = (pkg: unknown) => createSession({ callId: "adapter", package: pkg }).contentProblem;

describe("the session adapter: one-step questions", () => {
  it.each([
    ["a 5-digit subtraction story", subtractFromTenThousand("Leo", "stickers", [3, 6, 1, 4]), { kind: "subtract", operands: [10000, 3615] }],
    ["a tick-and-number subtraction story", subtractFromTenThousand("Ivy", "points", [0, 4, 0, 8], "tick-and-number"), { kind: "subtract", operands: [10000, 409] }],
    ["a 3-digit × 1-digit 'Each … has' story", eachHasStory("crate", 284, "apples", "Nora", 7), { kind: "multiply", operands: [284, 7] }],
    ["a 'puts N in each' tick-and-number story", putsInEachStory("Theo", 4, "shells", "box", "boxes", 6), { kind: "multiply", operands: [4, 6] }],
    ["a bare sum of thousands", thousandsSum(16200, 3900), { kind: "add", operands: [16000, 3000] }],
    ["a sum-of-thousands story", thousandsSum(14700, 5100, { name: "Rui", things: "stamps" }), { kind: "add", operands: [14000, 5000] }],
  ])("teaches %s from the stored package, which stays as it is", (_, stored, operation) => {
    const before = structuredClone(stored);
    const made = teach(stored);
    expect(made.operation).toEqual(operation);
    expect(made.operationSource).toBe("maya-teaching");
    expect(made.steps).toEqual(workedSteps(made.operation!));
    expect(held(made)).toBeNull();
    expect(heldReason(made)).toBeNull();
    // The stored package is not changed, and the made one prints exactly as it.
    expect(stored).toEqual(before);
    expect(printedWorkbookQuestion(made)).toEqual(stored);
    expect(held(stored)).toBe("Maya cannot teach items with no operation yet");
  });

  it("gives the same package each time, and makes again (never trusts) a package marked as made here", () => {
    const stored = subtractFromTenThousand("Leo", "stickers", [3, 6, 1, 4]);
    expect(teach(teach(stored))).toEqual(teach(stored));
    // A forged mark with an operation the printed text does not hold is dropped: back to the printed question.
    const forged = { ...stored, operationSource: "maya-teaching", operation: { kind: "add", operands: [90000, 1] } } as unknown as QuestionPackage;
    expect(teach(forged)).toEqual(teach(stored));
    const unmatched = { ...forged, text: "Leo has a big pile of stickers." };
    expect(teach(unmatched).operation).toBeNull();
    expect(held(teach(unmatched))).not.toBeNull();
  });

  it("leaves alone a package with an operation, one from an assessment, and one that fails its check", () => {
    const stored = eachHasStory("crate", 284, "apples", "Nora", 7);
    const withOperation = teach(stored);
    const builder = { ...withOperation, operationSource: undefined };
    expect(teachingPackage(builder)).toBe(builder);
    const assessment = { ...stored, ref: { source: "assessment", assessmentId: "a", questionId: "q" } } as unknown as QuestionPackage;
    expect(teachingPackage(assessment)).toBe(assessment);
    const broken = { ...stored, text: "" };
    expect(teachingPackage(broken)).toBe(broken);
    expect(teachingPackage(null)).toBeNull();
  });

  describe("holds the question when one of the three agreements fails", () => {
    const stored = subtractFromTenThousand("Leo", "stickers", [3, 6, 1, 4]);
    const answerBox = (p: QuestionPackage, value: number) => ({ ...p, item: { ...p.item!, regions: p.item!.regions.map(r => r.kind === "box" ? { ...r, answer: { type: "number" as const, value } } : r) } });
    const source = (p: QuestionPackage, change: Record<string, unknown>) => ({ ...p, item: { ...p.item!, checks: p.item!.checks.map(c => c.kind === "template" ? { ...c, source: { ...c.source, ...change } } : c) } });
    it.each([
      ["printed wording outside the closed forms", { ...stored, text: "Leo has 10000 stickers and gives 3615 to Sam. How many stickers are left?" }],
      ["printed numbers that are not the template's", { ...stored, text: "Leo has 10000 stickers and gives 3614 away. How many stickers are left?" }],
      ["a different template expression (same key)", source(stored, { answer: "d" })],
      ["a template that is another operation", source(stored, { answer: "a + b - 2 * b" })],
      ["a template that does not give the key", source(stored, { answer: "a - b - 1" })],
      ["a key that is not the printed operation's result", answerBox(source(stored, { answer: "a - b + 1" }), 6386)],
    ])("%s", (_, pkg) => {
      const made = teach(pkg as QuestionPackage);
      expect(made.operation).toBeNull();
      expect(held(made)).not.toBeNull();
    });

    it("a ticked sign that is not the operation's", () => {
      const tick = subtractFromTenThousand("Ivy", "points", [0, 4, 0, 8], "tick-and-number");
      const wrongSign = { ...tick, item: { ...tick.item!,
        regions: tick.item!.regions.map(r => r.kind === "choice" ? { ...r, answer: "+" } : r),
        checks: tick.item!.checks.map(c => c.kind === "template-choice" ? { ...c, source: { ...c.source, answer: "'+'" } } : c) } };
      expect(checkQuestionPackage(wrongSign).ok).toBe(true);
      expect(teach(wrongSign).operation).toBeNull();
    });
  });
});

describe("the session adapter: multi-step stories", () => {
  it("derives the story's operations in printed order as an evaluate, which Maya teaches part by part (A2)", () => {
    const stored = boxesThenSells("Mo", 4, 236, "beads");
    expect(stored.text).toBe("Mo's shop has 4 boxes with 230 beads in each. It sells 460 beads. How many beads are left?");
    expect(multiStepOperation(stored)).toEqual({ kind: "evaluate", operands: ["4 × 230 − 460"] });
    const made = teach(stored);
    expect(made.operation).toEqual({ kind: "evaluate", operands: ["4 × 230 − 460"] });
    expect(mayaPackageCheck(made).ok).toBe(true);
    expect(held(made)).toBeNull();
    expect(printedWorkbookQuestion(made)).toEqual(stored);
  });

  it("reads a printed chain as written, not as the template's one-step expression", () => {
    const made = teach(addsThousandChain(73562));
    expect(made.operation).toEqual({ kind: "evaluate", operands: ["73562 + 1000 + 100"] });
    expect(held(made)).toBeNull();
  });
});

describe("Maya's wider limits hold only for packages the adapter made", () => {
  const big = { kind: "add", operands: [10000, 2000] } as const;
  it("leaves every default check as it was", () => {
    expect(operationProblem(big)).toBe("code checks additions only of whole numbers up to 9999");
    expect(operationProblem(big, MAYA_TEACHING_LIMITS)).toBeNull();
    // Only "beyond code" widens; a wrong operation stays wrong, and the kinds' other rules hold.
    expect(operationProblem({ kind: "subtract", operands: [10000, 20000] }, MAYA_TEACHING_LIMITS)).not.toBeNull();
    expect(operationProblem({ kind: "add", operands: [999_999, 1] }, MAYA_TEACHING_LIMITS)).not.toBeNull();
    expect(operationProblem({ kind: "multiply", operands: [999_999, 2] }, MAYA_TEACHING_LIMITS)).not.toBeNull();
    expect(operationProblem({ kind: "multiply", operands: [1000, 1000] }, MAYA_TEACHING_LIMITS)).not.toBeNull();
    expect(operationProblem({ kind: "divide", operands: [999_999, 0] }, MAYA_TEACHING_LIMITS)).not.toBeNull();
    expect(operationProblem({ kind: "divide", operands: [999_999, 99] }, MAYA_TEACHING_LIMITS)).toBeNull();
    expect(operationProblem({ kind: "add", operands: [1.5, 2] }, MAYA_TEACHING_LIMITS)).not.toBeNull();
  });

  it("refuses an adapter-made package under the default check and without its mark", () => {
    const made = teach(subtractFromTenThousand("Leo", "stickers", [3, 6, 1, 4]));
    expect(mayaPackageCheck(made).ok).toBe(true);
    expect(checkQuestionPackage(made).ok).toBe(false);
    const unmarked = { ...made, operationSource: "maya" as const };
    expect(mayaPackageCheck(unmarked).ok).toBe(false);
    expect(held(unmarked)).toMatch(/up to 9999/);
  });

  it("checks a 6-digit result and dividend, and nothing past 999,999", () => {
    expect(operationProblem({ kind: "add", operands: [976746, 11000] }, MAYA_TEACHING_LIMITS)).toBeNull();
    expect(operationProblem({ kind: "subtract", operands: [999_999, 1] }, MAYA_TEACHING_LIMITS)).toBeNull();
    expect(operationProblem({ kind: "multiply", operands: [142858, 7] }, MAYA_TEACHING_LIMITS)).not.toBeNull();
    expect(operationProblem({ kind: "multiply", operands: [142857, 7] }, MAYA_TEACHING_LIMITS)).toBeNull();
  });
});
