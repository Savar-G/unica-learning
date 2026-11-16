import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { operationResult, workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";
import { checkTutorSay, tutorStreamContext, tutorTexts } from "./tutor";

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const ADD = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;
const context = (pkg = SUB) => tutorStreamContext(pkg, "Help me please.", "none", new Set());
const column = (operation: Operation, text: string): OperationPackage => ({
  ...SUB, text, operation, answer: { ...SUB.answer, value: operationResult(operation) }, steps: workedSteps(operation),
});

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each([
  [SUB, "We trade 1 ten for 10 ones."],
  [SUB, "Write 4 in the ones place."],
  [SUB, "After the trade, we have 4 tens."],
  [SUB, "After the trade, we have 12 ones."],
  [ADD, "Write 6 in the ones and carry 1 to the tens."],
  [SUB, "We have 4 tens and take away 2 tens."],
  [SUB, "We traded 1 ten away, so 5 tens became 4 tens."],
  [SUB, "We can't take 8 from 2 ones, so we use the 12 ones from the trade."],
] as const)("accepts a complete code-written phrase for its own question: %s", (pkg, sentence) => {
  // Falsifier: a whole phrase computed from this question still needs a math-model request.
  expect(checkTutorSay(sentence, context(pkg))).toMatchObject({ ok: true, math: [] });
});

it.each([
  "After the trade, we had 5 tens.",
  "After the trade, we have 5 tens.",
  "We trade 1 ten for 10 hundreds.",
  "Write 2 in the ones place.",
  "Write 4 in the ones place, with a negative sign.",
  "For the tens, write 4 in the ones place.",
  "So we write 2 in the tens place.",
  "We have 5 tens and take away 2 tens.",
  "We traded 1 ten away, so 5 tens became 3 tens.",
  "We traded 1 hundred away, so 5 tens became 4 tens.",
  "We can't take 8 from 2 ones, so we use the 13 ones from the trade.",
  "We can't take 2 from 8 ones, so we use the 12 ones from the trade.",
])("keeps a false or unlisted sentence for the math review: %s", sentence => {
  const result = checkTutorSay(sentence, context());
  expect(!result.ok || result.math.includes(sentence)).toBe(true);
});

it("keeps generated phrases held when the easier example is active", () => {
  const sentence = "Write 2 in the tens place.";
  const ctx = { ...context(), exact: undefined, ...tutorTexts(SUB, ["For the easier example, what is 42 minus 7?"], true) };
  const result = checkTutorSay(sentence, ctx);
  expect(!result.ok || result.math.includes(sentence)).toBe(true);
});

it("does not throw on the digit sentence from the old reader failure", () => {
  expect(() => checkTutorSay("The ones digit of 2 is 2.", context())).not.toThrow();
});

it("computes a carry into a new place and keeps a false destination under review", () => {
  const ctx = context(column({ kind: "add", operands: [98, 76] }, "98 + 76 = ?"));
  expect(checkTutorSay("Write 7 in the tens and carry 1 to the hundreds.", ctx)).toMatchObject({ ok: true, math: [] });
  const falseLine = "Write 7 in the tens and carry 1 to the thousands.";
  const result = checkTutorSay(falseLine, ctx);
  expect(!result.ok || result.math.includes(falseLine)).toBe(true);
});

it("does not assign an ambiguous after-trade count during a chain through zero", () => {
  const ctx = context(column({ kind: "subtract", operands: [1002, 4] }, "1002 − 4 = ?"));
  for (const line of ["After the trade, we have 10 tens.", "After the trade, we have 9 tens."]) {
    const result = checkTutorSay(line, ctx);
    expect(!result.ok || result.math.includes(line), line).toBe(true);
  }
});

it("recomputes phrase facts instead of trusting stored step values", () => {
  const pkg = { ...SUB, steps: SUB.steps.map(step => step.kind === "subtract-column" ? { ...step, write: 9 } : step) };
  const line = "Write 9 in the ones place.";
  const result = checkTutorSay(line, context(pkg));
  expect(!result.ok || result.math.includes(line)).toBe(true);
});
