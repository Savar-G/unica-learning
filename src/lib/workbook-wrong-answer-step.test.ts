import { expect, it } from "vitest";
import { buildQuestion } from "./workbook-generator-items";

const number = (value: number) => ({ type: "number", value });
const multiply = (a: number, b: number) => ({ kind: "multiply", operands: [number(a), number(b)] });
function question(step: string | null, multiplier = 4) {
  return buildQuestion({
    slot: "1.1", skill: "6.2-fact-strategies", difficulty: 1, text: `22 × ${multiplier} = ?`, format: "write-number",
    operation: multiply(22, multiplier),
    wrongAnswers: [{ value: number(80), cause: "place-value", description: "Multiplied only the tens and forgot the ones.", step }],
    easier: { text: "12 × 4 = ?", operation: multiply(12, 4) }, shownWrong: null,
  }, { id: "q", workbookId: "book", page: 9, question: 2, level: 19, skills: ["6.2-fact-strategies"] });
}

it("resolves the writer's unique column place to the computed multiplication step", () => {
  const built = question("ones");
  expect(built.check).toEqual({ status: "checked" });
  expect(built.package?.wrongAnswers[0].step).toBe("r1-ones");
  expect(built.package?.answer?.value).toEqual(number(88));
});

it("preserves an exact step id and a mistake that names no one step", () => {
  for (const step of ["r1-ones", null]) {
    const built = question(step);
    expect(built.check).toEqual({ status: "checked" });
    expect(built.package?.wrongAnswers[0].step).toBe(step);
  }
});

it("rejects nonexistent or ambiguous column places", () => {
  for (const [step, multiplier] of [["hundreds", 4], ["ones", 14]] as const) {
    expect(question(step, multiplier).check).toMatchObject({ status: "failed", reason: expect.stringContaining("names a step the question does not have") });
  }
});

it("does not infer an unscaled decimal column from a whole-number place alias", () => {
  const operation = (a: number) => ({ kind: "decimal-multiply", operands: [number(a), number(4)] });
  const built = buildQuestion({
    slot: "1.1", skill: "6.2-fact-strategies", difficulty: 1, text: "2.2 × 4 = ?", format: "write-number",
    operation: operation(2.2), easier: { text: "0.2 × 4 = ?", operation: operation(0.2) },
    wrongAnswers: [{ value: number(8), cause: "place-value", description: "Lost the decimal part.", step: "ones" }], shownWrong: null,
  }, { id: "q", workbookId: "book", page: 9, question: 2, level: 19, skills: ["6.2-fact-strategies"] });
  expect(built.check).toMatchObject({ status: "failed", reason: expect.stringContaining("names a step the question does not have") });
});
