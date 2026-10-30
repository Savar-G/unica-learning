import { describe, expect, it } from "vitest";
import {
  checkQuestionPackage,
  operationResult,
  stepText,
  workedSteps,
  type AnswerValue,
  type ClockTime,
  type Duration,
  type Operation,
  type QuestionPackage,
  type Unit,
} from "@/lib/question-package";

// The answer checker for measurement, money and time (#307), through the one package check. Each kind has one problem
// worked by hand (the expected steps are written out here, not computed), then the check is driven with a right
// package, a wrong answer, a wrong step, a unit error and a wrong easier example.

const num = (value: number): AnswerValue => ({ type: "number", value });
const qty = (value: number, unit: Unit) => ({ type: "quantity" as const, value, unit });

/** A package for an operation, with a hand-written answer; the steps come from workedSteps, pinned by hand below. */
function packageOf(operation: Operation, answer: AnswerValue, easier: Operation, easierAnswer: AnswerValue, standard: string): QuestionPackage {
  return {
    id: "wbq-1",
    ref: { source: "workbook", workbookId: "wb-1", page: 4, question: 2 },
    templateId: null,
    text: "Work it out.",
    answer: { value: answer, accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    skill: { standard, skills: [] },
    level: 12,
    difficulty: 2,
    wrongAnswers: [{ value: num(1), cause: "M1", description: "A made-up mistake", step: null }],
    easierExample: { text: "An easier one.", operation: easier, answer: easierAnswer, steps: workedSteps(easier) },
  };
}

const failed = (reason: string) => ({ ok: false, status: "failed", reason });
const unsupported = (reason: string) => ({ ok: false, status: "unsupported", reason });
const words = (operation: Operation) => workedSteps(operation).map((s) => stepText(s, operation));

describe("unit conversion", () => {
  const kmToM: Operation = { kind: "convert", operands: [qty(2.5, "km")], unit: "m" };
  const sound = () => packageOf(kmToM, qty(2500, "m"), { kind: "convert", operands: [qty(3, "km")], unit: "m" }, qty(3000, "m"), "3.9");

  it("has the steps worked by hand", () => {
    expect(workedSteps(kmToM)).toEqual([
      { id: "convert", kind: "convert-unit", from: qty(2.5, "km"), by: "multiply", factor: 1000, to: qty(2500, "m") },
      { id: "result", kind: "result", value: qty(2500, "m") },
    ]);
    expect(workedSteps({ kind: "convert", operands: [qty(250, "cm")], unit: "m" })[0]).toEqual(
      { id: "convert", kind: "convert-unit", from: qty(250, "cm"), by: "divide", factor: 100, to: qty(2.5, "m") },
    );
  });

  it("says each step", () => {
    expect(words(kmToM)).toEqual([
      "1 km = 1000 m, so multiply by 1000: 2.5 × 1000 = 2500. 2.5 km = 2500 m.",
      "2.5 km = 2500 m",
    ]);
    expect(words({ kind: "convert", operands: [qty(90, "min")], unit: "h" })[0]).toBe("60 min = 1 h, so divide by 60: 90 ÷ 60 = 1.5. 90 min = 1.5 h.");
    expect(words({ kind: "convert", operands: [qty(1.5, "$")], unit: "¢" })[0]).toBe("$1.00 = 100¢, so multiply by 100: 1.5 × 100 = 150. $1.50 = 150¢.");
  });

  it("checks a right package", () => {
    const p = sound();
    expect(checkQuestionPackage(p)).toEqual({ ok: true, status: "checked", package: p });
  });

  it("fails a wrong answer", () => {
    const p = sound();
    p.answer.value = qty(250, "m");
    expect(checkQuestionPackage(p)).toEqual(failed("the question's answer is not what its operation gives"));
  });

  it("fails a wrong conversion factor, naming it", () => {
    const p = sound();
    p.steps[0] = { id: "convert", kind: "convert-unit", from: qty(2.5, "km"), by: "multiply", factor: 100, to: qty(250, "m") };
    expect(checkQuestionPackage(p)).toEqual(failed("the question's worked steps use 1 km = 100 m, but 1 km = 1000 m"));
  });

  it("fails an answer with no unit", () => {
    const p = sound();
    p.answer.value = num(2500);
    expect(checkQuestionPackage(p)).toEqual(failed("the question's answer has no unit, but its operation gives a length"));
  });

  it("fails an answer in a unit of another measure", () => {
    const p = sound();
    p.answer.value = qty(2500, "g");
    expect(checkQuestionPackage(p)).toEqual(failed("the question's answer is a mass, but its operation gives a length"));
  });

  it("fails the same length in another unit than the question asks for", () => {
    const p = sound();
    p.answer.value = qty(2.5, "km");
    expect(checkQuestionPackage(p)).toEqual(failed("the question's answer is not in m, the unit the question asks for"));
  });

  it("keeps the same length in another unit as a wrong answer", () => {
    const p = sound();
    p.wrongAnswers[0].value = qty(250000, "cm");
    expect(checkQuestionPackage(p).status).toBe("checked");
    p.wrongAnswers[0].value = qty(2500, "m");
    expect(checkQuestionPackage(p)).toEqual(failed("the wrong answer 2500 m is a right answer"));
  });

  it("fails a wrong easier example", () => {
    const p = sound();
    p.easierExample.answer = qty(300, "m");
    expect(checkQuestionPackage(p)).toEqual(failed("the easier example's answer is not what its operation gives"));
  });

  it.each([
    ["metres to kilograms", { kind: "convert", operands: [qty(2, "m")], unit: "kg" }, "m and kg do not measure the same thing"],
    ["a unit to itself", { kind: "convert", operands: [qty(2, "m")], unit: "m" }, "the amount is already in m"],
    ["minutes that are not a whole or decimal number of hours", { kind: "convert", operands: [qty(100, "min")], unit: "h" }, "100 min is not a whole number or a decimal in h"],
    ["cents that are not whole", { kind: "convert", operands: [qty(2.5, "¢")], unit: "$" }, "an amount in ¢ is a whole number"],
    ["dollars with three decimal places", { kind: "convert", operands: [qty(2.505, "$")], unit: "¢" }, "an amount in $ has at most 2 decimal places"],
    ["a negative length", { kind: "convert", operands: [qty(-2, "m")], unit: "cm" }, "the operation needs an amount from 0 in a unit"],
  ] as const)("fails %s", (_name, operation, reason) => {
    const p = sound() as unknown as { operation: unknown };
    p.operation = operation;
    expect(checkQuestionPackage(p)).toEqual(failed(reason));
  });

  it.each([
    ["a unit code does not know", { kind: "convert", operands: [qty(2, "yd" as Unit)], unit: "m" }, "code cannot check the unit yd"],
    ["an amount with four decimal places", { kind: "convert", operands: [qty(1.2345, "km")], unit: "m" }, "code checks amounts only up to 99999.999, with at most 3 decimal places"],
    ["a result with more than three decimal places", { kind: "convert", operands: [qty(1, "mm")], unit: "km" }, "code checks amounts only up to 99999.999, with at most 3 decimal places"],
  ] as const)("returns unsupported for %s", (_name, operation, reason) => {
    const p = sound() as unknown as { operation: unknown };
    p.operation = operation;
    expect(checkQuestionPackage(p)).toEqual(unsupported(reason));
  });

  it("returns unsupported for an answer in a unit code does not know", () => {
    const p = sound();
    p.wrongAnswers[0].value = qty(2, "yd" as Unit);
    expect(checkQuestionPackage(p)).toEqual(unsupported("code cannot check the unit yd"));
  });

  it("gives the value of money, mass and capacity conversions", () => {
    expect(operationResult({ kind: "convert", operands: [qty(375, "¢")], unit: "$" })).toEqual(qty(3.75, "$"));
    expect(operationResult({ kind: "convert", operands: [qty(1.25, "kg")], unit: "g" })).toEqual(qty(1250, "g"));
    expect(operationResult({ kind: "convert", operands: [qty(750, "mL")], unit: "L" })).toEqual(qty(0.75, "L"));
    expect(operationResult({ kind: "convert", operands: [qty(2, "h")], unit: "s" })).toEqual(qty(7200, "s"));
  });
});

describe("adding, subtracting and multiplying amounts", () => {
  const dollarsAdd: Operation = { kind: "quantity-add", operands: [qty(4.75, "$"), qty(2.5, "$")] };
  const sound = () => packageOf(dollarsAdd, qty(7.25, "$"), { kind: "quantity-add", operands: [qty(1.2, "$"), qty(0.3, "$")] }, qty(1.5, "$"), "4.18");

  it("adds dollars in columns, with every amount written to the cent", () => {
    expect(workedSteps(dollarsAdd)).toEqual([
      { id: "hundredths", kind: "add-column", place: "hundredths", digits: [5, 0], carryIn: 0, total: 5, write: 5, carryOut: 0 },
      { id: "tenths", kind: "add-column", place: "tenths", digits: [7, 5], carryIn: 0, total: 12, write: 2, carryOut: 1 },
      { id: "ones", kind: "add-column", place: "ones", digits: [4, 2], carryIn: 1, total: 7, write: 7, carryOut: 0 },
      { id: "result", kind: "result", value: qty(7.25, "$") },
    ]);
    expect(words(dollarsAdd).at(-1)).toBe("$4.75 + $2.50 = $7.25");
  });

  it("checks a right package, and takes $1.50 written as 1.5 dollars or as 150¢", () => {
    const p = sound();
    expect(checkQuestionPackage(p)).toEqual({ ok: true, status: "checked", package: p });
    expect(words(p.easierExample.operation).at(-1)).toBe("$1.20 + $0.30 = $1.50");
    p.answer.accepted = [qty(725, "¢")];
    expect(checkQuestionPackage(p).status).toBe("checked");
    p.answer.accepted = [qty(7.25, "$")];
    expect(checkQuestionPackage(p)).toEqual(failed("an accepted form repeats the answer"));
    p.answer.accepted = [qty(7.2, "$")];
    expect(checkQuestionPackage(p)).toEqual(failed("the accepted form $7.20 is not the answer's amount"));
  });

  it("fails a wrong answer, a wrong step and a wrong easier example", () => {
    const p = sound();
    p.answer.value = qty(6.25, "$");
    expect(checkQuestionPackage(p)).toEqual(failed("the question's answer is not what its operation gives"));
    const q = sound();
    (q.steps[1] as { carryOut: number }).carryOut = 0;
    expect(checkQuestionPackage(q)).toEqual(failed("the question's worked steps are not the steps of its operation"));
    const r = sound();
    r.easierExample.answer = qty(1.4, "$");
    expect(checkQuestionPackage(r)).toEqual(failed("the easier example's answer is not what its operation gives"));
  });

  it("fails an answer with no unit or in a unit of another measure", () => {
    const p = sound();
    p.answer.value = num(7.25);
    expect(checkQuestionPackage(p)).toEqual(failed("the question's answer has no unit, but its operation gives an amount of money"));
    p.answer.value = qty(7.25, "kg");
    expect(checkQuestionPackage(p)).toEqual(failed("the question's answer is a mass, but its operation gives an amount of money"));
  });

  it("keeps the amount with no unit as a wrong answer", () => {
    const p = sound();
    p.wrongAnswers[0].value = num(7.25);
    expect(checkQuestionPackage(p).status).toBe("checked");
    p.wrongAnswers[0].value = qty(725, "¢");
    expect(checkQuestionPackage(p)).toEqual(failed("the wrong answer 725¢ is a right answer"));
  });

  it("changes a larger unit to the smaller one first", () => {
    const op: Operation = { kind: "quantity-add", operands: [qty(2, "m"), qty(35, "cm")] };
    expect(workedSteps(op)).toEqual([
      { id: "convert-1", kind: "convert-unit", from: qty(2, "m"), by: "multiply", factor: 100, to: qty(200, "cm") },
      { id: "ones", kind: "add-column", place: "ones", digits: [0, 5], carryIn: 0, total: 5, write: 5, carryOut: 0 },
      { id: "tens", kind: "add-column", place: "tens", digits: [0, 3], carryIn: 0, total: 3, write: 3, carryOut: 0 },
      { id: "hundreds", kind: "add-column", place: "hundreds", digits: [2], carryIn: 0, total: 2, write: 2, carryOut: 0 },
      { id: "result", kind: "result", value: qty(235, "cm") },
    ]);
    const p = packageOf(op, qty(2.35, "m"), { kind: "quantity-add", operands: [qty(1, "m"), qty(5, "cm")] }, qty(105, "cm"), "3.9");
    expect(checkQuestionPackage(p).status).toBe("checked");
  });

  it("works the answer in the unit the question asks for, and takes it only in that unit", () => {
    const op: Operation = { kind: "quantity-add", operands: [qty(75, "¢"), qty(50, "¢")], unit: "$" };
    expect(workedSteps(op).slice(-2)).toEqual([
      { id: "convert", kind: "convert-unit", from: qty(125, "¢"), by: "divide", factor: 100, to: qty(1.25, "$") },
      { id: "result", kind: "result", value: qty(1.25, "$") },
    ]);
    const p = packageOf(op, qty(1.25, "$"), { kind: "quantity-add", operands: [qty(5, "¢"), qty(5, "¢")], unit: "$" }, qty(0.1, "$"), "3.14");
    expect(checkQuestionPackage(p).status).toBe("checked");
    p.answer.accepted = [qty(125, "¢")];
    expect(checkQuestionPackage(p)).toEqual(failed("the accepted form 125¢ is not in $, the unit the question asks for"));
    p.answer.accepted = [];
    p.wrongAnswers[0].value = qty(125, "¢");
    expect(checkQuestionPackage(p).status).toBe("checked");
  });

  it("takes 1 h 25 min for 85 min when the question does not ask for a unit", () => {
    const op: Operation = { kind: "quantity-add", operands: [qty(35, "min"), qty(50, "min")] };
    const p = packageOf(op, qty(85, "min"), { kind: "quantity-add", operands: [qty(5, "min"), qty(5, "min")] }, qty(10, "min"), "5.14");
    p.answer.accepted = [{ type: "compound", parts: [{ value: 1, unit: "h" }, { value: 25, unit: "min" }] }];
    expect(checkQuestionPackage(p)).toEqual({ ok: true, status: "checked", package: p });
    p.answer.value = { type: "compound", parts: [{ value: 1, unit: "h" }, { value: 25, unit: "min" }] };
    p.answer.accepted = [qty(85, "min")];
    expect(checkQuestionPackage(p).status).toBe("checked");
    expect(words(op).at(-1)).toBe("35 min + 50 min = 85 min");
  });

  it("refuses a compound amount that is not written in its units", () => {
    const p = packageOf({ kind: "quantity-add", operands: [qty(35, "min"), qty(50, "min")] }, qty(85, "min"), { kind: "quantity-add", operands: [qty(5, "min"), qty(5, "min")] }, qty(10, "min"), "5.14");
    p.wrongAnswers[0].value = { type: "compound", parts: [{ value: 0, unit: "h" }, { value: 85, unit: "min" }] };
    expect(checkQuestionPackage(p).status).toBe("failed");
    p.wrongAnswers[0].value = { type: "compound", parts: [{ value: 1, unit: "min" }, { value: 25, unit: "h" }] };
    expect(checkQuestionPackage(p).status).toBe("failed");
    p.wrongAnswers[0].value = { type: "compound", parts: [{ value: 1, unit: "h" }, { value: 25, unit: "kg" }] };
    expect(checkQuestionPackage(p).status).toBe("failed");
  });

  it("subtracts to make change", () => {
    const op: Operation = { kind: "quantity-subtract", operands: [qty(10, "$"), qty(3.65, "$")] };
    expect(workedSteps(op)).toEqual([
      { id: "hundredths", kind: "subtract-column", place: "hundredths", top: 0, bottom: 5, lent: false, regrouped: true, write: 5 },
      { id: "tenths", kind: "subtract-column", place: "tenths", top: 0, bottom: 6, lent: true, regrouped: true, write: 3 },
      { id: "ones", kind: "subtract-column", place: "ones", top: 0, bottom: 3, lent: true, regrouped: true, write: 6 },
      { id: "tens", kind: "subtract-column", place: "tens", top: 1, bottom: null, lent: true, regrouped: false, write: null },
      { id: "result", kind: "result", value: qty(6.35, "$") },
    ]);
    const p = packageOf(op, qty(6.35, "$"), { kind: "quantity-subtract", operands: [qty(5, "$"), qty(1.25, "$")] }, qty(3.75, "$"), "4.18");
    expect(checkQuestionPackage(p).status).toBe("checked");
  });

  it("says the top amount of a subtraction that writes a 0 in", () => {
    expect(words({ kind: "quantity-subtract", operands: [qty(5.2, "m"), qty(1.75, "m")] })[0]).toBe(
      "Write a 0 in the hundredths of 5.2 m. Regroup 1 tenth as 10 hundredths, so 0 hundredths become 10. Subtract the hundredths: 10 − 5 = 5. Write 5.",
    );
  });

  it("multiplies an amount by a whole number", () => {
    const op: Operation = { kind: "quantity-multiply", operands: [qty(4.25, "$"), 3] };
    expect(workedSteps(op)).toEqual([
      { id: "r1-ones", kind: "multiply-digit", row: "ones", place: "ones", top: 5, multiplier: 3, carryIn: 0, total: 15, write: 5, carryOut: 1 },
      { id: "r1-tens", kind: "multiply-digit", row: "ones", place: "tens", top: 2, multiplier: 3, carryIn: 1, total: 7, write: 7, carryOut: 0 },
      { id: "r1-hundreds", kind: "multiply-digit", row: "ones", place: "hundreds", top: 4, multiplier: 3, carryIn: 0, total: 12, write: 2, carryOut: 1 },
      { id: "r1-thousands", kind: "multiply-digit", row: "ones", place: "thousands", top: null, multiplier: 3, carryIn: 1, total: 1, write: 1, carryOut: 0 },
      { id: "point", kind: "place-point", product: 1275, decimals: 2, value: 12.75 },
      { id: "result", kind: "result", value: qty(12.75, "$") },
    ]);
    expect(words(op).at(-1)).toBe("$4.25 × 3 = $12.75");
    expect(words({ kind: "quantity-multiply", operands: [qty(1.25, "$"), 12] })).toContain("The tens row: 125 × 10 = 1250. It starts with 1 zero because the 1 is in the tens.");
    const p = packageOf(op, qty(12.75, "$"), { kind: "quantity-multiply", operands: [qty(2, "$"), 3] }, qty(6, "$"), "4.18");
    expect(checkQuestionPackage(p).status).toBe("checked");
  });

  it.each([
    ["metres and kilograms", { kind: "quantity-add", operands: [qty(2, "m"), qty(3, "kg")] }, "m and kg do not measure the same thing"],
    ["a subtraction below zero", { kind: "quantity-subtract", operands: [qty(2, "m"), qty(250, "cm")] }, "the subtraction goes below zero"],
    ["a multiplier that is not whole", { kind: "quantity-multiply", operands: [qty(2, "m"), 1.5] }, "the operation needs an amount and a whole number"],
    ["a missing amount", { kind: "quantity-add", operands: [qty(2, "m")] }, "the operation needs two amounts from 0 in units"],
    ["an asked unit of another measure", { kind: "quantity-add", operands: [qty(2, "m"), qty(3, "m")], unit: "kg" }, "m and kg do not measure the same thing"],
  ] as const)("fails %s", (_name, operation, reason) => {
    const p = sound() as unknown as { operation: unknown };
    p.operation = operation;
    expect(checkQuestionPackage(p)).toEqual(failed(reason));
  });

  it("returns unsupported for a multiplication beyond code", () => {
    const p = sound() as unknown as { operation: unknown };
    p.operation = { kind: "quantity-multiply", operands: [qty(123.45, "$"), 3] };
    expect(checkQuestionPackage(p)).toEqual(unsupported("code checks multiplications of amounts only with up to 4 digits in the amount and a whole number up to 999"));
  });
});

describe("rounding cash to the nearest 5 cents", () => {
  const round = (q: ReturnType<typeof qty>): Operation => ({ kind: "money-round", operands: [q] });

  it("rounds 1, 2, 6 and 7 cents down and 3, 4, 8 and 9 cents up, as Canada does since the penny", () => {
    expect([4.91, 4.92, 4.93, 4.94, 4.95, 4.96, 4.97, 4.98, 4.99, 5].map((v) => operationResult(round(qty(v, "$"))))).toEqual(
      [4.9, 4.9, 4.95, 4.95, 4.95, 4.95, 4.95, 5, 5, 5].map((v) => qty(v, "$")),
    );
    expect(operationResult(round(qty(83, "¢")))).toEqual(qty(85, "¢"));
  });

  it("has the step worked by hand, in words", () => {
    expect(workedSteps(round(qty(4.97, "$")))).toEqual([
      { id: "round", kind: "round-cash", from: qty(4.97, "$"), cents: 7, to: qty(4.95, "$") },
      { id: "result", kind: "result", value: qty(4.95, "$") },
    ]);
    expect(words(round(qty(4.97, "$")))).toEqual([
      "$4.97 ends in 7 cents, so in cash it rounds down to the nearest 5 cents: $4.95.",
      "$4.97 rounds to $4.95",
    ]);
    expect(words(round(qty(4.98, "$")))[0]).toBe("$4.98 ends in 8 cents, so in cash it rounds up to the nearest 5 cents: $5.00.");
    expect(words(round(qty(4.95, "$")))[0]).toBe("$4.95 ends in 5 cents, so in cash it stays $4.95.");
  });

  it("checks a right package and fails a wrong one", () => {
    const p = packageOf(round(qty(4.97, "$")), qty(4.95, "$"), round(qty(12, "¢")), qty(10, "¢"), "4.18");
    expect(checkQuestionPackage(p)).toEqual({ ok: true, status: "checked", package: p });
    p.answer.accepted = [qty(495, "¢")];
    expect(checkQuestionPackage(p).status).toBe("checked");
    p.wrongAnswers[0].value = qty(5, "$");
    expect(checkQuestionPackage(p).status).toBe("checked");
    p.answer.value = qty(5, "$");
    expect(checkQuestionPackage(p)).toEqual(failed("the question's answer is not what its operation gives"));
  });

  it("fails an amount that is not money", () => {
    const p = packageOf(round(qty(4.97, "$")), qty(4.95, "$"), round(qty(12, "¢")), qty(10, "¢"), "4.18") as unknown as { operation: unknown };
    p.operation = round(qty(4.97, "m"));
    expect(checkQuestionPackage(p)).toEqual(failed("only an amount of money is rounded to the nearest 5 cents"));
  });
});

describe("clock times and durations", () => {
  const pm = (hours: number, minutes: number): ClockTime => ({ type: "time", hours, minutes, period: "p.m." });
  const am = (hours: number, minutes: number): ClockTime => ({ type: "time", hours, minutes, period: "a.m." });
  const h24 = (hours: number, minutes: number): ClockTime => ({ type: "time", hours, minutes, period: null });
  const hm = (h: number, min: number): Duration => ({ type: "compound", parts: [{ value: h, unit: "h" }, { value: min, unit: "min" }] });
  const elapsed = (from: ClockTime, to: ClockTime, unit?: "min" | "h"): Operation =>
    ({ kind: "elapsed-time", operands: [from, to], ...(unit ? { unit } : {}) });

  it("counts on from one time to another: to the next hour, the whole hours, then the minutes", () => {
    const op = elapsed(pm(2, 15), pm(3, 45));
    expect(workedSteps(op)).toEqual([
      { id: "to-hour", kind: "count-on", from: pm(2, 15), to: pm(3, 0), minutes: 45 },
      { id: "minutes", kind: "count-on", from: pm(3, 0), to: pm(3, 45), minutes: 45 },
      { id: "total", kind: "add-durations", minutes: [45, 45], total: 90 },
      { id: "result", kind: "result", value: hm(1, 30) },
    ]);
    expect(words(op)).toEqual([
      "From 2:15 p.m. to 3:00 p.m. is 45 min.",
      "From 3:00 p.m. to 3:45 p.m. is 45 min.",
      "45 min + 45 min = 1 h 30 min",
      "From 2:15 p.m. to 3:45 p.m. is 1 h 30 min.",
    ]);
  });

  it("counts on across noon and on the 24-hour clock", () => {
    expect(workedSteps(elapsed(am(11, 30), pm(1, 15)))).toEqual([
      { id: "to-hour", kind: "count-on", from: am(11, 30), to: pm(12, 0), minutes: 30 },
      { id: "hours", kind: "count-on", from: pm(12, 0), to: pm(1, 0), minutes: 60 },
      { id: "minutes", kind: "count-on", from: pm(1, 0), to: pm(1, 15), minutes: 15 },
      { id: "total", kind: "add-durations", minutes: [30, 60, 15], total: 105 },
      { id: "result", kind: "result", value: hm(1, 45) },
    ]);
    expect(words(elapsed(h24(9, 50), h24(14, 20)))).toEqual([
      "From 09:50 to 10:00 is 10 min.",
      "From 10:00 to 14:00 is 4 h.",
      "From 14:00 to 14:20 is 20 min.",
      "10 min + 4 h + 20 min = 4 h 30 min",
      "From 09:50 to 14:20 is 4 h 30 min.",
    ]);
    expect(workedSteps(elapsed(pm(2, 15), pm(2, 40)))).toEqual([
      { id: "minutes", kind: "count-on", from: pm(2, 15), to: pm(2, 40), minutes: 25 },
      { id: "result", kind: "result", value: qty(25, "min") },
    ]);
  });

  it("takes 90 min and 1 h 30 min when the question does not ask for a unit, and only minutes when it does", () => {
    const easier = elapsed(pm(2, 0), pm(2, 30));
    const p = packageOf(elapsed(pm(2, 15), pm(3, 45)), hm(1, 30), easier, qty(30, "min"), "5.14");
    p.answer.accepted = [qty(90, "min"), qty(1.5, "h")];
    expect(checkQuestionPackage(p)).toEqual({ ok: true, status: "checked", package: p });

    const q = packageOf(elapsed(pm(2, 15), pm(3, 45), "min"), qty(90, "min"), elapsed(pm(2, 0), pm(2, 30), "min"), qty(30, "min"), "5.14");
    expect(checkQuestionPackage(q).status).toBe("checked");
    expect(words(q.operation).slice(-2)).toEqual(["45 min + 45 min = 90 min", "From 2:15 p.m. to 3:45 p.m. is 90 min."]);
    q.answer.accepted = [hm(1, 30)];
    expect(checkQuestionPackage(q)).toEqual(failed("the accepted form 1 h 30 min is not in min, the unit the question asks for"));
    q.answer.accepted = [];
    q.wrongAnswers[0].value = hm(1, 30);
    expect(checkQuestionPackage(q).status).toBe("checked");
    q.answer.value = hm(1, 30);
    expect(checkQuestionPackage(q)).toEqual(failed("the question's answer is not in min, the unit the question asks for"));
  });

  it("fails a wrong elapsed time, a wrong count and a clock time given as the answer", () => {
    const p = packageOf(elapsed(pm(2, 15), pm(3, 45)), hm(1, 30), elapsed(pm(2, 0), pm(2, 30)), qty(30, "min"), "5.14");
    p.answer.value = hm(1, 70);
    expect(checkQuestionPackage(p).status).toBe("failed");
    p.answer.value = hm(2, 30);
    expect(checkQuestionPackage(p)).toEqual(failed("the question's answer is not what its operation gives"));
    p.answer.value = pm(1, 30);
    expect(checkQuestionPackage(p)).toEqual(failed("the question's answer is a clock time, but its operation gives an amount of time"));
    const q = packageOf(elapsed(pm(2, 15), pm(3, 45)), hm(1, 30), elapsed(pm(2, 0), pm(2, 30)), qty(30, "min"), "5.14");
    (q.steps[0] as { minutes: number }).minutes = 55;
    expect(checkQuestionPackage(q)).toEqual(failed("the question's worked steps are not the steps of its operation"));
  });

  it.each([
    ["an end before the start", elapsed(pm(3, 0), pm(2, 0)), "the end time is before the start time"],
    ["two clocks", elapsed(pm(3, 0), h24(16, 0)), "the two times are not on the same clock"],
    ["13 p.m.", elapsed(pm(13, 0), pm(2, 0)), "the operation needs two clock times"],
    ["minutes that are not a decimal of an hour", elapsed(pm(2, 0), pm(3, 20), "h"), "80 min is not a whole number or a decimal in h"],
    ["a unit that is not of time", { kind: "elapsed-time", operands: [pm(2, 0), pm(3, 0)], unit: "m" } as unknown as Operation, "the time between two clock times is not in m"],
  ])("fails %s", (_name, operation, reason) => {
    const p = packageOf(elapsed(pm(2, 15), pm(3, 45)), hm(1, 30), elapsed(pm(2, 0), pm(2, 30)), qty(30, "min"), "5.14") as unknown as { operation: unknown };
    p.operation = operation;
    expect(checkQuestionPackage(p)).toEqual(failed(reason));
  });

  it("finds a time later, across the hour and midnight", () => {
    const op: Operation = { kind: "time-add", operands: [pm(7, 40), hm(1, 35)] };
    expect(workedSteps(op)).toEqual([
      { id: "hours", kind: "count-on", from: pm(7, 40), to: pm(8, 40), minutes: 60 },
      { id: "to-hour", kind: "count-on", from: pm(8, 40), to: pm(9, 0), minutes: 20 },
      { id: "minutes", kind: "count-on", from: pm(9, 0), to: pm(9, 15), minutes: 15 },
      { id: "result", kind: "result", value: pm(9, 15) },
    ]);
    expect(words(op)).toEqual([
      "1 h after 7:40 p.m. is 8:40 p.m.",
      "20 min after 8:40 p.m. is 9:00 p.m.",
      "15 min after 9:00 p.m. is 9:15 p.m.",
      "1 h 35 min after 7:40 p.m. is 9:15 p.m.",
    ]);
    expect(operationResult({ kind: "time-add", operands: [pm(11, 30), qty(45, "min")] })).toEqual(am(12, 15));
    expect(operationResult({ kind: "time-add", operands: [h24(23, 30), qty(1.5, "h")] })).toEqual(h24(1, 0));
    const p = packageOf(op, pm(9, 15), { kind: "time-add", operands: [pm(7, 0), qty(30, "min")] }, pm(7, 30), "4.12");
    p.answer.accepted = [h24(21, 15)];
    expect(checkQuestionPackage(p)).toEqual({ ok: true, status: "checked", package: p });
    p.answer.value = am(9, 15);
    expect(checkQuestionPackage(p)).toEqual(failed("the question's answer is not what its operation gives"));
  });

  it.each([
    ["seconds that are not whole minutes", qty(90, "s"), "unsupported", "code adds only whole minutes, less than 24 h, to a clock time"],
    ["a day or more", qty(24, "h"), "unsupported", "code adds only whole minutes, less than 24 h, to a clock time"],
    ["a length", qty(2, "m"), "failed", "the operation needs a clock time and an amount of time"],
  ] as const)("refuses to add %s", (_name, duration, status, reason) => {
    const p = packageOf({ kind: "time-add", operands: [pm(7, 40), hm(1, 35)] }, pm(9, 15), { kind: "time-add", operands: [pm(7, 0), qty(30, "min")] }, pm(7, 30), "4.12") as unknown as { operation: unknown };
    p.operation = { kind: "time-add", operands: [pm(7, 40), duration] };
    expect(checkQuestionPackage(p)).toEqual({ ok: false, status, reason });
  });

  it("changes between the 12-hour and the 24-hour clock", () => {
    const say = (t: ClockTime) => words({ kind: "clock-convert", operands: [t] });
    expect(workedSteps({ kind: "clock-convert", operands: [pm(3, 45)] })).toEqual([
      { id: "clock", kind: "clock-change", from: pm(3, 45), to: h24(15, 45) },
      { id: "result", kind: "result", value: h24(15, 45) },
    ]);
    expect(say(pm(3, 45))).toEqual(["3:45 p.m. is after noon, so add 12 to the hours: 3 + 12 = 15. 3:45 p.m. is 15:45.", "3:45 p.m. is 15:45 on the 24-hour clock."]);
    expect(say(am(9, 5))[0]).toBe("9:05 a.m. is before noon, so the hours stay 9: 09:05.");
    expect(say(am(12, 30))[0]).toBe("12:30 a.m. is in the hour after midnight, so the hours are 0: 00:30.");
    expect(say(pm(12, 30))[0]).toBe("12:30 p.m. is in the hour after noon, so the hours stay 12: 12:30.");
    expect(say(h24(15, 45))).toEqual(["15:45 is after noon, so take 12 from the hours: 15 − 12 = 3. 15:45 is 3:45 p.m.", "15:45 is 3:45 p.m. on the 12-hour clock."]);
    expect(say(h24(0, 30))[0]).toBe("00:30 is in the hour after midnight, so the hours are 12: 12:30 a.m.");
    expect(say(h24(12, 30))[0]).toBe("12:30 is in the hour after noon, so the hours stay 12: 12:30 p.m.");
    expect(say(h24(9, 5))[0]).toBe("09:05 is before noon, so the hours stay 9: 9:05 a.m.");
  });

  it("takes a clock change only on the other clock", () => {
    const p = packageOf({ kind: "clock-convert", operands: [pm(3, 45)] }, h24(15, 45), { kind: "clock-convert", operands: [am(9, 5)] }, h24(9, 5), "4.12");
    expect(checkQuestionPackage(p)).toEqual({ ok: true, status: "checked", package: p });
    p.wrongAnswers[0].value = pm(3, 45);
    expect(checkQuestionPackage(p).status).toBe("checked");
    p.answer.accepted = [pm(3, 45)];
    expect(checkQuestionPackage(p)).toEqual(failed("this question takes only its answer, with no other forms"));
    p.answer.accepted = [];
    p.answer.value = pm(3, 45);
    expect(checkQuestionPackage(p)).toEqual(failed("the question's answer is not what its operation gives"));
  });
});
