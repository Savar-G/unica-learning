import { describe, expect, it } from "vitest";
import {
  checkQuestionPackage,
  operationResult,
  stepText,
  workedSteps,
  type AnswerValue,
  type Operation,
  type QuestionPackage,
} from "@/lib/question-package";

// The answer checker for expressions and one-variable equations (#307), through the one package check. Each problem is
// worked by hand here (the expected steps are written out, not computed), then the check is driven with a right
// package, a wrong answer, a wrong step and a wrong easier example.

const num = (value: number): AnswerValue => ({ type: "number", value });

function packageOf(operation: Operation, answer: number, easier: Operation, easierAnswer: number, standard: string): QuestionPackage {
  return {
    id: "wbq-1",
    ref: { source: "workbook", workbookId: "wb-1", page: 9, question: 3 },
    templateId: null,
    text: "Work it out.",
    answer: { value: num(answer), accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    skill: { standard, skills: [] },
    level: 20,
    difficulty: 2,
    wrongAnswers: [{ value: num(-999), cause: "A1", description: "A made-up mistake", step: null }],
    easierExample: { text: "An easier one.", operation: easier, answer: num(easierAnswer), steps: workedSteps(easier) },
  };
}

const failed = (reason: string) => ({ ok: false, status: "failed", reason });
const unsupported = (reason: string) => ({ ok: false, status: "unsupported", reason });
const words = (operation: Operation) => workedSteps(operation).map((s) => stepText(s, operation));
const evaluate = (expression: string, values?: Record<string, number>): Operation => ({ kind: "evaluate", operands: [expression], ...(values ? { values } : {}) });

describe("order of operations", () => {
  const op = evaluate("3 + 4 × (2 − 1)");

  it("works the brackets, then multiplication and division, then addition and subtraction", () => {
    expect(workedSteps(op)).toEqual([
      { id: "e1", kind: "operate", rule: "brackets", op: "−", left: 2, right: 1, value: 1, rest: "3 + 4 × 1" },
      { id: "e2", kind: "operate", rule: "multiply-divide", op: "×", left: 4, right: 1, value: 4, rest: "3 + 4" },
      { id: "e3", kind: "operate", rule: "add-subtract", op: "+", left: 3, right: 4, value: 7, rest: "7" },
      { id: "result", kind: "result", value: num(7) },
    ]);
    expect(words(op)).toEqual([
      "Work inside the brackets first: 2 − 1 = 1. Now 3 + 4 × 1.",
      "Multiply and divide from left to right, before you add and subtract: 4 × 1 = 4. Now 3 + 4.",
      "Add and subtract from left to right: 3 + 4 = 7.",
      "3 + 4 × (2 − 1) = 7",
    ]);
  });

  it("works from left to right at one level", () => {
    expect(operationResult(evaluate("12 ÷ 3 × 2"))).toEqual(num(8));
    expect(operationResult(evaluate("10 − 4 + 3"))).toEqual(num(9));
    expect(operationResult(evaluate("2 × (3 + (8 − 2) ÷ 3)"))).toEqual(num(10));
    expect(words(evaluate("2 × (3 + (8 − 2) ÷ 3)")).slice(0, 2)).toEqual([
      "Work inside the brackets first: 8 − 2 = 6. Now 2 × (3 + 6 ÷ 3).",
      "Work inside the brackets first: 6 ÷ 3 = 2. Now 2 × (3 + 2).",
    ]);
  });

  it("works decimals and negative numbers exactly", () => {
    expect(operationResult(evaluate("2.5 × 4 − 1.25"))).toEqual(num(8.75));
    expect(operationResult(evaluate("0.1 + 0.2"))).toEqual(num(0.3));
    expect(operationResult(evaluate("−3 + 5 × (−2)"))).toEqual(num(-13));
    expect(words(evaluate("−3 + 5 × (−2)"))).toEqual([
      "Multiply and divide from left to right, before you add and subtract: 5 × (−2) = −10. Now −3 + (−10).",
      "Add and subtract from left to right: −3 + (−10) = −13.",
      "−3 + 5 × (−2) = −13",
    ]);
  });

  it("checks a right package and fails a wrong one", () => {
    const p = packageOf(evaluate("2 + 3 × 4"), 14, evaluate("2 × 3"), 6, "6.3");
    expect(checkQuestionPackage(p)).toEqual({ ok: true, status: "checked", package: p });
    p.wrongAnswers[0].value = num(20);
    expect(checkQuestionPackage(p).status).toBe("checked");
    p.answer.value = num(20);
    expect(checkQuestionPackage(p)).toEqual(failed("the question's answer is not what its operation gives"));
  });

  it("fails a step worked in the wrong order", () => {
    const p = packageOf(evaluate("2 + 3 × 4"), 14, evaluate("2 × 3"), 6, "6.3");
    p.steps = [
      { id: "e1", kind: "operate", rule: "add-subtract", op: "+", left: 2, right: 3, value: 5, rest: "5 × 4" },
      { id: "e2", kind: "operate", rule: "multiply-divide", op: "×", left: 5, right: 4, value: 20, rest: "20" },
      { id: "result", kind: "result", value: num(14) },
    ];
    expect(checkQuestionPackage(p)).toEqual(failed("the question's worked steps are not the steps of its operation"));
  });

  it("fails a wrong easier example", () => {
    const p = packageOf(evaluate("2 + 3 × 4"), 14, evaluate("2 × 3"), 9, "6.3");
    expect(checkQuestionPackage(p)).toEqual(failed("the easier example's answer is not what its operation gives"));
  });
});

describe("evaluating with given values", () => {
  it("puts the values in, then works the expression", () => {
    const op = evaluate("3n + 2", { n: 4 });
    expect(workedSteps(op)).toEqual([
      { id: "substitute", kind: "substitute", values: [{ name: "n", value: 4 }], expression: "3 × 4 + 2" },
      { id: "e1", kind: "operate", rule: "multiply-divide", op: "×", left: 3, right: 4, value: 12, rest: "12 + 2" },
      { id: "e2", kind: "operate", rule: "add-subtract", op: "+", left: 12, right: 2, value: 14, rest: "14" },
      { id: "result", kind: "result", value: num(14) },
    ]);
    expect(words(op)).toEqual([
      "Put 4 in for n: 3 × 4 + 2.",
      "Multiply and divide from left to right, before you add and subtract: 3 × 4 = 12. Now 12 + 2.",
      "Add and subtract from left to right: 12 + 2 = 14.",
      "3 × 4 + 2 = 14",
    ]);
  });

  it("writes brackets and negative values as they must be read", () => {
    expect(workedSteps(evaluate("2(n + 1)", { n: 4 }))[0]).toEqual({ id: "substitute", kind: "substitute", values: [{ name: "n", value: 4 }], expression: "2 × (4 + 1)" });
    expect(words(evaluate("5 − n", { n: -2 }))).toEqual(["Put −2 in for n: 5 − (−2).", "Add and subtract from left to right: 5 − (−2) = 7.", "5 − (−2) = 7"]);
    expect(words(evaluate("a × b − a", { b: 3, a: 2 }))[0]).toBe("Put 2 in for a and 3 in for b: 2 × 3 − 2.");
  });

  it("checks a right package", () => {
    const p = packageOf(evaluate("3n + 2", { n: 4 }), 14, evaluate("n + 2", { n: 4 }), 6, "8.7");
    p.answer.accepted = [{ type: "fraction", numerator: 28, denominator: 2 }];
    expect(checkQuestionPackage(p)).toEqual({ ok: true, status: "checked", package: p });
  });

  it.each([
    ["an unknown with no value", evaluate("3n + 2"), "the expression has n, but no value for it"],
    ["a value not in the expression", evaluate("3n + 2", { n: 4, m: 1 }), "the value for m is not in the expression"],
    ["a division by zero", evaluate("4 ÷ (2 − 2)"), "the expression divides by zero"],
    ["two operations in a row", evaluate("3 + × 4"), "the expression 3 + × 4 is not written right"],
    ["a bracket not closed", evaluate("2 × (3 + 4"), "the expression 2 × (3 + 4 is not written right"],
    ["two numbers with no operation", evaluate("3 4"), "the expression 3 4 is not written right"],
    ["an empty expression", evaluate(""), "the operation needs an expression"],
    ["a value that is not a number", { kind: "evaluate", operands: ["n + 1"], values: { n: "4" } } as unknown as Operation, "the value for n is not a number"],
  ])("fails %s", (_name, operation, reason) => {
    const p = packageOf(evaluate("2 + 3 × 4"), 14, evaluate("2 × 3"), 6, "6.3") as unknown as { operation: unknown };
    p.operation = operation;
    expect(checkQuestionPackage(p)).toEqual(failed(reason));
  });

  it.each([
    ["a power", evaluate("2^3 + 1"), "code cannot read ^ in an expression"],
    ["a division that does not end", evaluate("7 ÷ 3"), "code checks expressions only where each division gives a whole number or a decimal"],
    ["a minus sign before an unknown", evaluate("−n + 3", { n: 2 }), "code reads a minus sign at the start only before a number"],
    ["a minus sign inside", evaluate("3 + −2"), "code reads a minus sign at the start only before a number"],
    ["a name of two letters", evaluate("ab + 1", { a: 1, b: 2 }), "code reads only one-letter unknowns"],
    ["a division before a product written without ×", evaluate("6 ÷ 2(1 + 2)"), "code does not read a division before a product written without ×"],
    ["too many operations", evaluate("1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1"), "code checks expressions only with up to 8 operations"],
    ["a number too long", evaluate("1.2345 + 1"), "code checks expressions only with numbers up to 99999.999, with at most 3 decimal places"],
  ])("returns unsupported for %s", (_name, operation, reason) => {
    const p = packageOf(evaluate("2 + 3 × 4"), 14, evaluate("2 × 3"), 6, "6.3") as unknown as { operation: unknown };
    p.operation = operation;
    expect(checkQuestionPackage(p)).toEqual(unsupported(reason));
  });
});

describe("one-variable equations", () => {
  const solve = (equation: string): Operation => ({ kind: "solve", operands: [equation] });
  const sound = () => packageOf(solve("3x + 5 = 20"), 5, solve("x + 5 = 20"), 15, "7.6");

  it("undoes each operation on both sides, then checks the solution", () => {
    expect(workedSteps(solve("3x + 5 = 20"))).toEqual([
      { id: "s1", kind: "inverse", op: "subtract", by: 5, from: 20, value: 15, equation: "3x = 15" },
      { id: "s2", kind: "inverse", op: "divide", by: 3, from: 15, value: 5, equation: "x = 5" },
      { id: "check", kind: "check", name: "x", value: 5, expression: "3 × 5 + 5", total: 20 },
      { id: "result", kind: "result", value: num(5) },
    ]);
    expect(words(solve("3x + 5 = 20"))).toEqual([
      "Subtract 5 from both sides: 20 − 5 = 15, so 3x = 15.",
      "Divide both sides by 3: 15 ÷ 3 = 5, so x = 5.",
      "Check: put 5 in for x: 3 × 5 + 5 = 20.",
      "x = 5",
    ]);
  });

  it("undoes brackets, division and an unknown on the right", () => {
    expect(words(solve("2(x + 1) = 10"))).toEqual([
      "Divide both sides by 2: 10 ÷ 2 = 5, so x + 1 = 5.",
      "Subtract 1 from both sides: 5 − 1 = 4, so x = 4.",
      "Check: put 4 in for x: 2 × (4 + 1) = 10.",
      "x = 4",
    ]);
    expect(words(solve("y ÷ 4 − 2 = 3")).slice(0, 2)).toEqual([
      "Add 2 to both sides: 3 + 2 = 5, so y ÷ 4 = 5.",
      "Multiply both sides by 4: 5 × 4 = 20, so y = 20.",
    ]);
    expect(words(solve("20 = 5 + 3n")).slice(0, 2)).toEqual([
      "Subtract 5 from both sides: 20 − 5 = 15, so 15 = 3n.",
      "Divide both sides by 3: 15 ÷ 3 = 5, so 5 = n.",
    ]);
  });

  it("solves to negative numbers and decimals exactly", () => {
    expect(operationResult(solve("x + 7 = 3"))).toEqual(num(-4));
    expect(words(solve("x + 7 = 3"))).toEqual(["Subtract 7 from both sides: 3 − 7 = −4, so x = −4.", "Check: put −4 in for x: −4 + 7 = 3.", "x = −4"]);
    expect(operationResult(solve("4x = 18"))).toEqual(num(4.5));
    expect(operationResult(solve("−2x + 1 = 9"))).toEqual(num(-4));
  });

  it("checks a right package and fails a wrong answer, a wrong step and a wrong easier example", () => {
    const p = sound();
    p.answer.accepted = [{ type: "fraction", numerator: 10, denominator: 2 }];
    expect(checkQuestionPackage(p)).toEqual({ ok: true, status: "checked", package: p });
    const wrong = sound();
    wrong.answer.value = num(8);
    expect(checkQuestionPackage(wrong)).toEqual(failed("the question's answer is not what its operation gives"));
    const step = sound();
    (step.steps[0] as { equation: string }).equation = "3x = 25";
    expect(checkQuestionPackage(step)).toEqual(failed("the question's worked steps are not the steps of its operation"));
    const easier = sound();
    easier.easierExample.answer = num(25);
    expect(checkQuestionPackage(easier)).toEqual(failed("the easier example's answer is not what its operation gives"));
  });

  it.each([
    ["no equals sign", solve("3x + 5"), "the equation has no ="],
    ["two equals signs", solve("x = 5 = 5"), "the equation has more than one ="],
    ["no unknown", solve("3 + 5 = 8"), "the equation has no unknown"],
    ["a solved equation", solve("x = 5"), "the equation is already solved"],
    ["the unknown times 0", solve("0x + 1 = 5"), "the equation multiplies the unknown by 0"],
    ["a side written wrong", solve("3x + = 5"), "the expression 3x + is not written right"],
    ["an empty side", solve("3x + 5 = "), "the equation 3x + 5 =  is not written right"],
  ])("fails %s", (_name, operation, reason) => {
    const p = sound() as unknown as { operation: unknown };
    p.operation = operation;
    expect(checkQuestionPackage(p)).toEqual(failed(reason));
  });

  it.each([
    ["an unknown after a minus sign", solve("12 − x = 5"), "code solves only equations where the unknown is not taken away from or divided into a number"],
    ["an unknown under a division", solve("12 ÷ x = 3"), "code solves only equations where the unknown is not taken away from or divided into a number"],
    ["the unknown twice", solve("2x + 3x = 10"), "code solves only equations with the unknown written once"],
    ["two unknowns", solve("x + y = 5"), "code solves only equations with one unknown"],
    ["no single number on one side", solve("3x + 5 = 2 × 10"), "code solves only equations with one number on one side"],
    ["a product next to the unknown", solve("x + 2 × 3 = 10"), "code solves only equations where each number next to the unknown is one number"],
    ["a solution that does not end", solve("3x = 10"), "code checks expressions only where each division gives a whole number or a decimal"],
  ])("returns unsupported for %s", (_name, operation, reason) => {
    const p = sound() as unknown as { operation: unknown };
    p.operation = operation;
    expect(checkQuestionPackage(p)).toEqual(unsupported(reason));
  });
});

describe("a broken algebra package", () => {
  it("never throws when any field is replaced by junk", () => {
    const junk: unknown[] = [null, undefined, {}, [], "x", "", "(", "x = ", 5, -1, [""], [null], ["3x = "], { type: "fraction" }, { n: "4" }];
    const sounds = [
      packageOf(evaluate("3n + 2", { n: 4 }), 14, evaluate("n + 2", { n: 4 }), 6, "8.7"),
      packageOf({ kind: "solve", operands: ["3x + 5 = 20"] }, 5, { kind: "solve", operands: ["x + 5 = 20"] }, 15, "7.6"),
    ] as unknown as Record<string, Record<string, unknown>>[];
    for (const sound of sounds) {
      const paths: [string, string | null][] = [
        ...Object.keys(sound).map((key): [string, null] => [key, null]),
        ...["operation", "answer", "easierExample"].flatMap((key) => Object.keys(sound[key]).map((sub): [string, string] => [key, sub])),
        ["operation", "values"],
      ];
      for (const [key, sub] of paths) {
        for (const value of junk) {
          const p = structuredClone(sound);
          if (sub === null) p[key] = value as Record<string, unknown>;
          else p[key][sub] = value;
          expect(() => checkQuestionPackage(p), `${key}.${sub} = ${JSON.stringify(value)}`).not.toThrow();
          expect(["failed", "unsupported", "checked"]).toContain(checkQuestionPackage(p).status);
        }
      }
    }
  });
});
