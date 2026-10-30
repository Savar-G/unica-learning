import { describe, expect, it } from "vitest";
import { checkQuestionPackage, stepText, workedSteps, type Operation, type QuestionPackage } from "@/lib/question-package";

// The question package contract (#298): a package is trusted only when its parts are well formed and its answer and
// worked steps are what its operation gives. Each refusal names its reason.

/** 48 + 37 on page 23, question 4 of a workbook, worked by hand. */
const PACKAGE: QuestionPackage = {
  id: "wbq-0423",
  ref: { source: "workbook", workbookId: "wb-1", page: 23, question: 4 },
  templateId: null,
  text: "48 + 37 = ?",
  answer: { value: { type: "number", value: 85 }, accepted: [], unit: null },
  operation: { kind: "add", operands: [48, 37] },
  steps: [
    { id: "ones", kind: "add-column", place: "ones", digits: [8, 7], carryIn: 0, total: 15, write: 5, carryOut: 1 },
    { id: "tens", kind: "add-column", place: "tens", digits: [4, 3], carryIn: 1, total: 8, write: 8, carryOut: 0 },
    { id: "result", kind: "result", value: { type: "number", value: 85 } },
  ],
  skill: { standard: "2.4", skills: ["2.4-add-within-100"] },
  level: 9,
  difficulty: 2,
  wrongAnswers: [{ value: { type: "number", value: 75 }, cause: "O3", description: "Forgets to carry when adding", step: "tens" }],
  easierExample: {
    text: "26 + 7 = ?",
    operation: { kind: "add", operands: [26, 7] },
    answer: { type: "number", value: 33 },
    steps: [
      { id: "ones", kind: "add-column", place: "ones", digits: [6, 7], carryIn: 0, total: 13, write: 3, carryOut: 1 },
      { id: "tens", kind: "add-column", place: "tens", digits: [2], carryIn: 1, total: 3, write: 3, carryOut: 0 },
      { id: "result", kind: "result", value: { type: "number", value: 33 } },
    ],
  },
};

/** The package with one change. */
const changed = (change: (p: QuestionPackage) => void): unknown => {
  const p = structuredClone(PACKAGE);
  change(p);
  return p;
};

describe("checkQuestionPackage", () => {
  it("accepts a sound package", () => {
    expect(checkQuestionPackage(PACKAGE)).toEqual({ ok: true, package: PACKAGE });
  });

  it("accepts other forms of the answer's number and a unit", () => {
    const p = changed((p) => { p.answer = { value: { type: "number", value: 85 }, accepted: [{ type: "fraction", numerator: 170, denominator: 2 }], unit: "cans" }; });
    expect(checkQuestionPackage(p)).toEqual({ ok: true, package: p });
  });

  it("accepts stored steps with their keys in another order, as jsonb gives them back", () => {
    const reorder = (v: unknown): unknown => Array.isArray(v) ? v.map(reorder)
      : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)])) : v;
    const p = reorder(PACKAGE);
    expect(JSON.stringify(p)).not.toBe(JSON.stringify(PACKAGE));
    expect(checkQuestionPackage(p)).toEqual({ ok: true, package: p });
  });

  it("keeps a wrong answer that is close to the answer but not the same number", () => {
    const p = changed((p) => { p.wrongAnswers[0].value = { type: "number", value: 85.0000000001 }; });
    expect(checkQuestionPackage(p).ok).toBe(true);
  });

  it.each([
    ["not a package", "the package is not an object", () => null],
    ["no id", "the package has no id", () => changed((p) => { p.id = ""; })],
    ["a page number of 0", "the workbook reference needs a page number from 1", () => changed((p) => { p.ref = { source: "workbook", workbookId: "wb-1", page: 0, question: 4 }; })],
    ["an unknown source", "the reference's source is not workbook or assessment", () => changed((p) => { (p.ref as { source: string }).source = "scan"; })],
    ["no question text", "the question has no text", () => changed((p) => { p.text = " "; })],
    ["a wrong answer key", "the question's answer is not what its operation gives", () => changed((p) => { p.answer.value = { type: "number", value: 84 }; })],
    ["a wrong step", "the question's worked steps are not the steps of its operation", () => changed((p) => {
      const ones = p.steps[0];
      if (ones.kind === "add-column") ones.write = 4;
    })],
    ["a step left out", "the question's worked steps are not the steps of its operation", () => changed((p) => { p.steps.splice(1, 1); })],
    ["an operation code cannot compute", "the operation's kind is not one code can compute", () => changed((p) => { (p.operation as { kind: string }).kind = "multiply"; })],
    ["a subtraction below zero", "the subtraction goes below zero", () => changed((p) => { p.operation = { kind: "subtract", operands: [37, 48] }; })],
    ["a fraction over 0", "an accepted form is not a fraction with a whole numerator and a denominator from 1", () => changed((p) => { p.answer.accepted = [{ type: "fraction", numerator: 1, denominator: 0 }]; })],
    ["an accepted form of another number", "the accepted form 99 is not the answer's number", () => changed((p) => { p.answer.accepted = [{ type: "number", value: 99 }]; })],
    ["an accepted form code cannot check", "an accepted form is not a number or a fraction, so code cannot check it", () => changed((p) => { p.answer.accepted = [{ type: "text", value: "eighty-five" }]; })],
    ["an accepted form that repeats the answer", "an accepted form repeats the answer", () => changed((p) => { p.answer.accepted = [{ type: "number", value: 85 }]; })],
    ["an unknown standard", "the standard 2.99 is not in the BC skill map", () => changed((p) => { p.skill.standard = "2.99"; })],
    ["a skill of another standard", "the skill 3.1-place-value-thousands is not a skill of standard 2.4", () => changed((p) => { p.skill.skills = ["3.1-place-value-thousands"]; })],
    ["level 31", "the level is not U1 to U30", () => changed((p) => { p.level = 31; })],
    ["level 0", "the level is not U1 to U30", () => changed((p) => { p.level = 0; })],
    ["difficulty 4", "the difficulty is not 1, 2 or 3", () => changed((p) => { (p as { difficulty: number }).difficulty = 4; })],
    ["no wrong answers", "the package has no wrong answers", () => changed((p) => { p.wrongAnswers = []; })],
    ["a wrong answer that is right", "the wrong answer 85 is a right answer", () => changed((p) => { p.wrongAnswers[0].value = { type: "number", value: 85 }; })],
    ["a wrong answer that is an accepted form", "the wrong answer 170/2 is a right answer", () => changed((p) => {
      p.answer.accepted = [{ type: "fraction", numerator: 170, denominator: 2 }];
      p.wrongAnswers[0].value = { type: "fraction", numerator: 170, denominator: 2 };
    })],
    ["a wrong answer that is the answer in another form", "the wrong answer 170/2 is a right answer", () => changed((p) => {
      p.wrongAnswers[0].value = { type: "fraction", numerator: 170, denominator: 2 };
    })],
    ["an accepted form that is only close to the answer", "the accepted form 85.0000000001 is not the answer's number", () => changed((p) => {
      p.answer.accepted = [{ type: "number", value: 85.0000000001 }];
    })],
    ["a wrong answer twice", "the wrong answer 75 is listed twice", () => changed((p) => { p.wrongAnswers.push(structuredClone(p.wrongAnswers[0])); })],
    ["a wrong answer with no cause", "a wrong answer needs a cause and its description", () => changed((p) => { p.wrongAnswers[0].cause = ""; })],
    ["a wrong answer at a step that is not there", "the wrong answer 75 names a step the question does not have", () => changed((p) => { p.wrongAnswers[0].step = "hundreds"; })],
    ["no easier example", "the package has no easier example", () => changed((p) => { delete (p as Partial<QuestionPackage>).easierExample; })],
    ["a wrong easier answer", "the easier example's answer is not what its operation gives", () => changed((p) => { p.easierExample.answer = { type: "number", value: 32 }; })],
    ["a wrong easier step", "the easier example's worked steps are not the steps of its operation", () => changed((p) => { p.easierExample.steps = workedSteps({ kind: "add", operands: [26, 8] }); })],
    ["an easier example of another operation", "the easier example is not the same operation", () => changed((p) => {
      p.easierExample = { text: "26 − 7 = ?", operation: { kind: "subtract", operands: [26, 7] }, answer: { type: "number", value: 19 }, steps: workedSteps({ kind: "subtract", operands: [26, 7] }) };
    })],
    ["an easier example as big as the question", "the easier example is not smaller than the question", () => changed((p) => {
      p.easierExample = { text: "38 + 45 = ?", operation: { kind: "add", operands: [38, 45] }, answer: { type: "number", value: 83 }, steps: workedSteps({ kind: "add", operands: [38, 45] }) };
    })],
  ])("refuses %s", (_name, reason, make) => {
    expect(checkQuestionPackage(make())).toEqual({ ok: false, reason });
  });
});

describe("workedSteps and stepText", () => {
  const words = (operation: Operation) => workedSteps(operation).map((s) => stepText(s, operation));

  it("carries the ones", () => {
    expect(words({ kind: "add", operands: [48, 37] })).toEqual([
      "Add the ones: 8 + 7 = 15. Write 5 and carry 1 ten.",
      "Add the tens: 4 + 3 + 1 = 8. Write 8.",
      "48 + 37 = 85",
    ]);
  });

  it("carries into a new column", () => {
    expect(words({ kind: "add", operands: [58, 67] })).toEqual([
      "Add the ones: 8 + 7 = 15. Write 5 and carry 1 ten.",
      "Add the tens: 5 + 6 + 1 = 12. Write 2 and carry 1 hundred.",
      "Bring down the hundreds: write 1.",
      "58 + 67 = 125",
    ]);
  });

  it("regroups a ten", () => {
    expect(words({ kind: "subtract", operands: [83, 46] })).toEqual([
      "Regroup 1 ten as 10 ones, so 3 ones become 13. Subtract the ones: 13 − 6 = 7. Write 7.",
      "The tens are now 7. Subtract the tens: 7 − 4 = 3. Write 3.",
      "83 − 46 = 37",
    ]);
    expect(words({ kind: "subtract", operands: [21, 9] })).toEqual([
      "Regroup 1 ten as 10 ones, so 1 one becomes 11. Subtract the ones: 11 − 9 = 2. Write 2.",
      "The tens are now 1. Write 1.",
      "21 − 9 = 12",
    ]);
  });

  it("regroups across a zero", () => {
    expect(words({ kind: "subtract", operands: [302, 47] })).toEqual([
      "Regroup 1 ten as 10 ones, so 2 ones become 12. Subtract the ones: 12 − 7 = 5. Write 5.",
      "There were 0 tens, so regroup 1 hundred as 10 tens; after the 1 ten given to the ones, 9 tens are left. Subtract the tens: 9 − 4 = 5. Write 5.",
      "The hundreds are now 2. Write 2.",
      "302 − 47 = 255",
    ]);
  });

  it("writes no leading zeros", () => {
    const operation: Operation = { kind: "subtract", operands: [105, 98] };
    expect(workedSteps(operation).map((s) => s.kind === "subtract-column" && s.write)).toEqual([7, null, null, false]);
    expect(words(operation)).toEqual([
      "Regroup 1 ten as 10 ones, so 5 ones become 15. Subtract the ones: 15 − 8 = 7. Write 7.",
      "There were 0 tens, so regroup 1 hundred as 10 tens; after the 1 ten given to the ones, 9 tens are left. Subtract the tens: 9 − 9 = 0. Write nothing: a number does not start with 0.",
      "The hundreds are now 0. Write nothing: a number does not start with 0.",
      "105 − 98 = 7",
    ]);
  });
});
