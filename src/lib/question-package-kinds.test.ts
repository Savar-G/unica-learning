import { describe, expect, it } from "vitest";
import {
  checkQuestionPackage,
  operationResult,
  stepText,
  workedSteps,
  type AnswerValue,
  type Operation,
  type QuestionPackage,
  type WorkedStep,
} from "@/lib/question-package";

// The answer checker (#306): whole-number multiplication and division, decimals and fractions, through the one
// package check. Each kind has one problem worked by hand (the expected steps are written out here, not computed), then
// the check is driven with a right package, a wrong answer, a wrong step and a wrong easier example.

const num = (value: number): AnswerValue => ({ type: "number", value });
const frac = (numerator: number, denominator: number) => ({ type: "fraction" as const, numerator, denominator });
const mixed = (whole: number, numerator: number, denominator: number) => ({ type: "mixed" as const, whole, numerator, denominator });
const parts = (numerator: number, denominator: number) => ({ numerator, denominator });

/** A package for an operation, with a hand-written answer; the steps come from workedSteps, pinned below by hand. */
function packageOf(operation: Operation, answer: AnswerValue, easier: Operation, easierAnswer: AnswerValue, standard: string): QuestionPackage {
  return {
    id: "wbq-1",
    ref: { source: "workbook", workbookId: "wb-1", page: 3, question: 1 },
    templateId: null,
    text: "Work it out.",
    answer: { value: answer, accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    skill: { standard, skills: [] },
    level: 18,
    difficulty: 2,
    wrongAnswers: [{ value: num(1), cause: "O9", description: "A made-up mistake", step: null }],
    easierExample: { text: "An easier one.", operation: easier, answer: easierAnswer, steps: workedSteps(easier) },
  };
}

interface Kind {
  name: string;
  operation: Operation;
  answer: AnswerValue;
  /** The steps, worked by hand, without the result step. */
  steps: WorkedStep[];
  easier: Operation;
  easierAnswer: AnswerValue;
  standard: string;
  /** A wrong answer a child could give. */
  wrong: AnswerValue;
}

const KINDS: Kind[] = [
  {
    name: "whole-number multiplication with a two-digit multiplier",
    operation: { kind: "multiply", operands: [47, 23] },
    answer: num(1081),
    steps: [
      { id: "r1-ones", kind: "multiply-digit", row: "ones", place: "ones", top: 7, multiplier: 3, carryIn: 0, total: 21, write: 1, carryOut: 2 },
      { id: "r1-tens", kind: "multiply-digit", row: "ones", place: "tens", top: 4, multiplier: 3, carryIn: 2, total: 14, write: 4, carryOut: 1 },
      { id: "r1-hundreds", kind: "multiply-digit", row: "ones", place: "hundreds", top: null, multiplier: 3, carryIn: 1, total: 1, write: 1, carryOut: 0 },
      { id: "r1", kind: "partial-product", row: "ones", multiplier: 3, zeros: 0, value: 141 },
      { id: "r2-ones", kind: "multiply-digit", row: "tens", place: "ones", top: 7, multiplier: 2, carryIn: 0, total: 14, write: 4, carryOut: 1 },
      { id: "r2-tens", kind: "multiply-digit", row: "tens", place: "tens", top: 4, multiplier: 2, carryIn: 1, total: 9, write: 9, carryOut: 0 },
      { id: "r2", kind: "partial-product", row: "tens", multiplier: 2, zeros: 1, value: 940 },
      { id: "sum-ones", kind: "add-column", place: "ones", digits: [1, 0], carryIn: 0, total: 1, write: 1, carryOut: 0 },
      { id: "sum-tens", kind: "add-column", place: "tens", digits: [4, 4], carryIn: 0, total: 8, write: 8, carryOut: 0 },
      { id: "sum-hundreds", kind: "add-column", place: "hundreds", digits: [1, 9], carryIn: 0, total: 10, write: 0, carryOut: 1 },
      { id: "sum-thousands", kind: "add-column", place: "thousands", digits: [], carryIn: 1, total: 1, write: 1, carryOut: 0 },
    ],
    easier: { kind: "multiply", operands: [47, 3] },
    easierAnswer: num(141),
    standard: "5.6",
    wrong: num(235),
  },
  {
    name: "whole-number division with a remainder",
    operation: { kind: "divide", operands: [157, 6] },
    answer: { type: "remainder", quotient: 26, remainder: 1 },
    steps: [
      { id: "hundreds", kind: "divide-digit", place: "hundreds", digit: 1, current: 1, quotient: 0, write: null, product: 0, remainder: 1 },
      { id: "tens", kind: "divide-digit", place: "tens", digit: 5, current: 15, quotient: 2, write: 2, product: 12, remainder: 3 },
      { id: "ones", kind: "divide-digit", place: "ones", digit: 7, current: 37, quotient: 6, write: 6, product: 36, remainder: 1 },
    ],
    easier: { kind: "divide", operands: [57, 6] },
    easierAnswer: { type: "remainder", quotient: 9, remainder: 3 },
    standard: "5.6",
    wrong: { type: "remainder", quotient: 25, remainder: 7 },
  },
  {
    name: "decimal addition with different decimal places",
    operation: { kind: "decimal-add", operands: [3.45, 12.7] },
    answer: num(16.15),
    steps: [
      { id: "hundredths", kind: "add-column", place: "hundredths", digits: [5], carryIn: 0, total: 5, write: 5, carryOut: 0 },
      { id: "tenths", kind: "add-column", place: "tenths", digits: [4, 7], carryIn: 0, total: 11, write: 1, carryOut: 1 },
      { id: "ones", kind: "add-column", place: "ones", digits: [3, 2], carryIn: 1, total: 6, write: 6, carryOut: 0 },
      { id: "tens", kind: "add-column", place: "tens", digits: [1], carryIn: 0, total: 1, write: 1, carryOut: 0 },
    ],
    easier: { kind: "decimal-add", operands: [2.5, 1.7] },
    easierAnswer: num(4.2),
    standard: "5.7",
    wrong: num(3.72),
  },
  {
    name: "decimal subtraction that writes a 0 in the top number",
    operation: { kind: "decimal-subtract", operands: [5.2, 1.75] },
    answer: num(3.45),
    steps: [
      { id: "hundredths", kind: "subtract-column", place: "hundredths", top: 0, bottom: 5, lent: false, regrouped: true, write: 5, addedZero: true },
      { id: "tenths", kind: "subtract-column", place: "tenths", top: 2, bottom: 7, lent: true, regrouped: true, write: 4 },
      { id: "ones", kind: "subtract-column", place: "ones", top: 5, bottom: 1, lent: true, regrouped: false, write: 3 },
    ],
    easier: { kind: "decimal-subtract", operands: [5.2, 1.7] },
    easierAnswer: num(3.5),
    standard: "5.7",
    wrong: num(4.55),
  },
  {
    name: "decimal multiplication",
    operation: { kind: "decimal-multiply", operands: [2.5, 1.3] },
    answer: num(3.25),
    steps: [
      { id: "r1-ones", kind: "multiply-digit", row: "ones", place: "ones", top: 5, multiplier: 3, carryIn: 0, total: 15, write: 5, carryOut: 1 },
      { id: "r1-tens", kind: "multiply-digit", row: "ones", place: "tens", top: 2, multiplier: 3, carryIn: 1, total: 7, write: 7, carryOut: 0 },
      { id: "r1", kind: "partial-product", row: "ones", multiplier: 3, zeros: 0, value: 75 },
      { id: "r2-ones", kind: "multiply-digit", row: "tens", place: "ones", top: 5, multiplier: 1, carryIn: 0, total: 5, write: 5, carryOut: 0 },
      { id: "r2-tens", kind: "multiply-digit", row: "tens", place: "tens", top: 2, multiplier: 1, carryIn: 0, total: 2, write: 2, carryOut: 0 },
      { id: "r2", kind: "partial-product", row: "tens", multiplier: 1, zeros: 1, value: 250 },
      { id: "sum-ones", kind: "add-column", place: "ones", digits: [5, 0], carryIn: 0, total: 5, write: 5, carryOut: 0 },
      { id: "sum-tens", kind: "add-column", place: "tens", digits: [7, 5], carryIn: 0, total: 12, write: 2, carryOut: 1 },
      { id: "sum-hundreds", kind: "add-column", place: "hundreds", digits: [2], carryIn: 1, total: 3, write: 3, carryOut: 0 },
      { id: "point", kind: "place-point", product: 325, decimals: 2, value: 3.25 },
    ],
    easier: { kind: "decimal-multiply", operands: [2.5, 3] },
    easierAnswer: num(7.5),
    standard: "6.8",
    wrong: num(32.5),
  },
  {
    name: "fraction addition with unlike denominators",
    operation: { kind: "fraction-add", operands: [frac(2, 3), frac(3, 4)] },
    answer: mixed(1, 5, 12),
    steps: [
      { id: "common", kind: "common-denominator", from: [parts(2, 3), parts(3, 4)], denominator: 12, factors: [4, 3], to: [parts(8, 12), parts(9, 12)] },
      { id: "combine", kind: "combine-numerators", op: "add", numerators: [8, 9], denominator: 12, numerator: 17 },
      { id: "mixed", kind: "to-mixed", from: parts(17, 12), whole: 1, rest: parts(5, 12) },
    ],
    easier: { kind: "fraction-add", operands: [frac(1, 5), frac(2, 5)] },
    easierAnswer: frac(3, 5),
    standard: "6.5",
    wrong: frac(5, 7),
  },
  {
    name: "fraction subtraction from a mixed number",
    operation: { kind: "fraction-subtract", operands: [mixed(1, 1, 2), frac(3, 4)] },
    answer: frac(3, 4),
    steps: [
      { id: "improper", kind: "to-improper", from: [mixed(1, 1, 2), frac(3, 4)], to: [parts(3, 2), parts(3, 4)] },
      { id: "common", kind: "common-denominator", from: [parts(3, 2), parts(3, 4)], denominator: 4, factors: [2, 1], to: [parts(6, 4), parts(3, 4)] },
      { id: "combine", kind: "combine-numerators", op: "subtract", numerators: [6, 3], denominator: 4, numerator: 3 },
    ],
    easier: { kind: "fraction-subtract", operands: [frac(3, 4), frac(1, 4)] },
    easierAnswer: frac(1, 2),
    standard: "6.5",
    wrong: frac(2, 2),
  },
  {
    name: "fraction multiplication",
    operation: { kind: "fraction-multiply", operands: [frac(2, 3), frac(3, 4)] },
    answer: frac(1, 2),
    steps: [
      { id: "multiply", kind: "multiply-fractions", numerators: [2, 3], denominators: [3, 4], numerator: 6, denominator: 12 },
      { id: "simplify", kind: "simplify", from: parts(6, 12), divisor: 6, to: parts(1, 2) },
    ],
    easier: { kind: "fraction-multiply", operands: [frac(1, 2), frac(1, 3)] },
    easierAnswer: frac(1, 6),
    standard: "6.5",
    wrong: frac(5, 7),
  },
  {
    name: "fraction division",
    operation: { kind: "fraction-divide", operands: [frac(3, 4), frac(1, 2)] },
    answer: mixed(1, 1, 2),
    steps: [
      { id: "flip", kind: "flip", from: parts(1, 2), to: parts(2, 1) },
      { id: "multiply", kind: "multiply-fractions", numerators: [3, 2], denominators: [4, 1], numerator: 6, denominator: 4 },
      { id: "simplify", kind: "simplify", from: parts(6, 4), divisor: 2, to: parts(3, 2) },
      { id: "mixed", kind: "to-mixed", from: parts(3, 2), whole: 1, rest: parts(1, 2) },
    ],
    easier: { kind: "fraction-divide", operands: [frac(1, 2), frac(1, 4)] },
    easierAnswer: num(2),
    standard: "6.5",
    wrong: frac(3, 8),
  },
  {
    name: "fraction simplification",
    operation: { kind: "fraction-simplify", operands: [frac(18, 24)] },
    answer: frac(3, 4),
    steps: [{ id: "simplify", kind: "simplify", from: parts(18, 24), divisor: 6, to: parts(3, 4) }],
    easier: { kind: "fraction-simplify", operands: [frac(2, 4)] },
    easierAnswer: frac(1, 2),
    standard: "5.3",
    wrong: frac(9, 12),
  },
  {
    name: "an equivalent fraction with a new denominator",
    operation: { kind: "fraction-equivalent", operands: [frac(3, 4)], denominator: 12 },
    answer: frac(9, 12),
    steps: [{ id: "scale", kind: "scale-fraction", from: parts(3, 4), by: "multiply", factor: 3, to: parts(9, 12) }],
    easier: { kind: "fraction-equivalent", operands: [frac(1, 2)], denominator: 4 },
    easierAnswer: frac(2, 4),
    standard: "5.3",
    wrong: frac(3, 12),
  },
];

const failed = (reason: string) => ({ ok: false, status: "failed", reason });

describe.each(KINDS)("$name", (k) => {
  const sound = () => packageOf(k.operation, k.answer, k.easier, k.easierAnswer, k.standard);

  it("has the steps worked by hand", () => {
    expect(workedSteps(k.operation)).toEqual([...k.steps, { id: "result", kind: "result", value: operationResult(k.operation) }]);
  });

  it("checks a right package", () => {
    const p = sound();
    expect(checkQuestionPackage(p)).toEqual({ ok: true, status: "checked", package: p });
  });

  it("fails a wrong answer", () => {
    const p = sound();
    p.answer.value = k.wrong;
    expect(checkQuestionPackage(p)).toEqual(failed("the question's answer is not what its operation gives"));
  });

  it("fails a wrong step", () => {
    const p = sound();
    const step = p.steps[0] as unknown as Record<string, unknown>;
    const field = Object.keys(step).find((key) => typeof step[key] === "number") ?? "id";
    step[field] = typeof step[field] === "number" ? (step[field] as number) + 1 : "other";
    expect(checkQuestionPackage(p)).toEqual(failed("the question's worked steps are not the steps of its operation"));
  });

  it("fails a wrong easier example", () => {
    const p = sound();
    p.easierExample.answer = k.wrong;
    expect(checkQuestionPackage(p)).toEqual(failed("the easier example's answer is not what its operation gives"));
  });

  it("refuses a right answer listed as a wrong answer", () => {
    const p = sound();
    p.wrongAnswers[0].value = k.answer;
    expect(checkQuestionPackage(p).status).toBe("failed");
  });

  it("gives every step words", () => {
    for (const step of workedSteps(k.operation)) expect(stepText(step, k.operation)).toMatch(/\d/);
  });
});

describe("accepted forms and equivalent fractions", () => {
  const fractionAdd = () => packageOf({ kind: "fraction-add", operands: [frac(1, 2), frac(3, 4)] }, mixed(1, 1, 4), { kind: "fraction-add", operands: [frac(1, 4), frac(1, 4)] }, frac(1, 2), "6.5");

  it("takes the answer in any simplest form", () => {
    const p = fractionAdd();
    p.answer.value = frac(5, 4);
    expect(checkQuestionPackage(p).status).toBe("checked");
  });

  it("fails an answer that is not in simplest form", () => {
    const p = fractionAdd();
    p.answer.value = frac(10, 8);
    expect(checkQuestionPackage(p)).toEqual(failed("the question's answer is not what its operation gives"));
  });

  it("accepts the other forms of the same number", () => {
    const p = fractionAdd();
    p.answer.accepted = [frac(5, 4), frac(10, 8), num(1.25)];
    expect(checkQuestionPackage(p).status).toBe("checked");
  });

  it("refuses an accepted form of another number", () => {
    const p = fractionAdd();
    p.answer.accepted = [frac(5, 3)];
    expect(checkQuestionPackage(p)).toEqual(failed("the accepted form 5/3 is not the answer's number"));
  });

  it("refuses a wrong answer that is the answer in another simplest form", () => {
    const p = fractionAdd();
    p.wrongAnswers[0].value = frac(5, 4);
    expect(checkQuestionPackage(p)).toEqual(failed("the wrong answer 5/4 is a right answer"));
  });

  it("keeps a fraction that is not simplified as a wrong answer, unless it is accepted", () => {
    const p = fractionAdd();
    p.wrongAnswers[0].value = frac(10, 8);
    expect(checkQuestionPackage(p).status).toBe("checked");
    p.answer.accepted = [frac(10, 8)];
    expect(checkQuestionPackage(p)).toEqual(failed("the wrong answer 10/8 is a right answer"));
  });

  it("accepts a remainder answer as a mixed number, a fraction or a decimal", () => {
    const p = packageOf({ kind: "divide", operands: [17, 4] }, { type: "remainder", quotient: 4, remainder: 1 }, { kind: "divide", operands: [9, 4] }, { type: "remainder", quotient: 2, remainder: 1 }, "5.6");
    p.answer.accepted = [mixed(4, 1, 4), frac(17, 4), num(4.25)];
    expect(checkQuestionPackage(p).status).toBe("checked");
    p.answer.accepted = [num(4.1)];
    expect(checkQuestionPackage(p)).toEqual(failed("the accepted form 4.1 is not the answer's number"));
  });

  it("takes a simplification only in simplest form", () => {
    const p = packageOf({ kind: "fraction-simplify", operands: [frac(12, 8)] }, mixed(1, 1, 2), { kind: "fraction-simplify", operands: [frac(2, 4)] }, frac(1, 2), "5.3");
    p.answer.accepted = [frac(3, 2)];
    expect(checkQuestionPackage(p).status).toBe("checked");
    p.answer.accepted = [frac(6, 4)];
    expect(checkQuestionPackage(p)).toEqual(failed("the accepted form 6/4 is not in simplest form"));
  });

  it("takes an equivalent fraction only with its new denominator", () => {
    const p = packageOf({ kind: "fraction-equivalent", operands: [frac(12, 16)], denominator: 4 }, frac(3, 4), { kind: "fraction-equivalent", operands: [frac(2, 4)], denominator: 2 }, frac(1, 2), "5.3");
    expect(workedSteps(p.operation)[0]).toEqual({ id: "scale", kind: "scale-fraction", from: parts(12, 16), by: "divide", factor: 4, to: parts(3, 4) });
    expect(checkQuestionPackage(p).status).toBe("checked");
    p.wrongAnswers[0].value = frac(12, 16);
    expect(checkQuestionPackage(p).status).toBe("checked");
    p.answer.accepted = [num(0.75)];
    expect(checkQuestionPackage(p)).toEqual(failed("this question takes only its answer, with no other forms"));
  });
});

describe("operations code cannot check, or that are wrong", () => {
  const base = () => packageOf({ kind: "multiply", operands: [47, 23] }, num(1081), { kind: "multiply", operands: [47, 3] }, num(141), "5.6");

  it("returns unsupported for an operation kind code cannot compute, never a pass", () => {
    const p = base() as unknown as { operation: { kind: string } };
    p.operation.kind = "percent-of";
    expect(checkQuestionPackage(p)).toEqual({ ok: false, status: "unsupported", reason: "code cannot check the operation percent-of" });
  });

  it("returns unsupported for steps of a version code cannot read", () => {
    const p = { ...base(), stepsVersion: 2 };
    expect(checkQuestionPackage(p)).toEqual({ ok: false, status: "unsupported", reason: "code cannot read worked steps of version 2" });
    expect(checkQuestionPackage({ ...base(), stepsVersion: 1 }).status).toBe("checked");
  });

  it.each([
    ["a division by zero", { kind: "divide", operands: [12, 0] }, "the division needs a whole number from 0 to 9999 divided by a whole number from 1 to 99"],
    ["a multiplier too big", { kind: "multiply", operands: [12, 1000] }, "the multiplication needs a whole number from 0 to 9999 times a whole number from 0 to 999"],
    ["a decimal with four places", { kind: "decimal-add", operands: [1.2345, 1] }, "the operation needs two numbers from 0 to 9999.999 with at most 3 decimal places"],
    ["a decimal subtraction below zero", { kind: "decimal-subtract", operands: [1.5, 1.75] }, "the subtraction goes below zero"],
    ["a decimal product too long", { kind: "decimal-multiply", operands: [123.45, 1.2] }, "the multiplication needs at most 4 digits in the first number and 3 in the second"],
    ["a fraction over 0", { kind: "fraction-add", operands: [frac(1, 0), frac(1, 2)] }, "the operation needs fractions with denominators from 1 to 100, mixed numbers or whole numbers to 99"],
    ["a fraction subtraction below zero", { kind: "fraction-subtract", operands: [frac(1, 4), frac(1, 2)] }, "the subtraction goes below zero"],
    ["a fraction division by zero", { kind: "fraction-divide", operands: [frac(1, 4), frac(0, 2)] }, "the division is by zero"],
    ["a mixed number to simplify", { kind: "fraction-simplify", operands: [mixed(1, 2, 4)] }, "the operation needs one fraction"],
    ["a new denominator that does not fit", { kind: "fraction-equivalent", operands: [frac(2, 4)], denominator: 6 }, "the new denominator must be a multiple or a factor of the denominator, and give a whole numerator"],
  ] as const)("fails %s", (_name, operation, reason) => {
    const p = base() as unknown as { operation: unknown };
    p.operation = operation;
    expect(checkQuestionPackage(p)).toEqual(failed(reason));
  });

  it("fails an easier example that is not easier", () => {
    const p = base();
    p.easierExample = { text: "x", operation: { kind: "multiply", operands: [74, 32] }, answer: num(2368), steps: workedSteps({ kind: "multiply", operands: [74, 32] }) };
    expect(checkQuestionPackage(p)).toEqual(failed("the easier example is not smaller than the question"));
  });

  it("takes an easier example with as many digits but fewer steps", () => {
    const p = packageOf({ kind: "fraction-add", operands: [frac(2, 3), frac(3, 4)] }, mixed(1, 5, 12), { kind: "fraction-add", operands: [frac(1, 5), frac(2, 5)] }, frac(3, 5), "6.5");
    expect(checkQuestionPackage(p).status).toBe("checked");
  });
});

describe("step words", () => {
  const words = (operation: Operation) => workedSteps(operation).map((s) => stepText(s, operation));

  it("say a long multiplication", () => {
    expect(words({ kind: "multiply", operands: [47, 23] })).toEqual([
      "Multiply the ones: 7 × 3 = 21. Write 1 and carry 2.",
      "Multiply the tens: 4 × 3 + 2 = 14. Write 4 and carry 1.",
      "Write the carried 1.",
      "The ones row: 47 × 3 = 141.",
      "Tens row: multiply the ones: 7 × 2 = 14. Write 4 and carry 1.",
      "Tens row: multiply the tens: 4 × 2 + 1 = 9. Write 9.",
      "The tens row: 47 × 20 = 940. It starts with 1 zero because the 2 is in the tens.",
      "Add the ones: 1 + 0 = 1. Write 1.",
      "Add the tens: 4 + 4 = 8. Write 8.",
      "Add the hundreds: 1 + 9 = 10. Write 0 and carry 1 thousand.",
      "Bring down the thousands: write 1.",
      "47 × 23 = 1081",
    ]);
  });

  it("say a long division", () => {
    expect(words({ kind: "divide", operands: [157, 6] })).toEqual([
      "1 ÷ 6 is 0, so write nothing above the hundreds yet. 1 is left.",
      "Bring down 5 to make 15. 15 ÷ 6 = 2, and 2 × 6 = 12. 15 − 12 = 3. Write 2.",
      "Bring down 7 to make 37. 37 ÷ 6 = 6, and 6 × 6 = 36. 37 − 36 = 1. Write 6.",
      "157 ÷ 6 = 26 R 1",
    ]);
  });

  it("say a decimal subtraction and a fraction addition", () => {
    expect(words({ kind: "decimal-subtract", operands: [5.2, 1.75] })[0]).toBe(
      "Write a 0 in the hundredths of 5.2. Regroup 1 tenth as 10 hundredths, so 0 hundredths become 10. Subtract the hundredths: 10 − 5 = 5. Write 5.",
    );
    expect(words({ kind: "fraction-add", operands: [frac(2, 3), frac(3, 4)] })).toEqual([
      "Use 12 as the common denominator: 2/3 = 8/12 and 3/4 = 9/12.",
      "Add the numerators: 8 + 9 = 17, so 17/12.",
      "17/12 is 1 whole and 5/12 more: 1 5/12.",
      "2/3 + 3/4 = 1 5/12",
    ]);
  });
});
