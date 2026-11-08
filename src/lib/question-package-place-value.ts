// Place value in the question package (design: .design/research/maya-place-value-design.md, B1a): the digit in one place
// of a whole number ("In 53172, which digit is in the thousands place?" is 3), or that digit's value ("What is the value
// of the digit in the ten thousands place of 53172?" is 50000). Only Maya's session adapter (src/lib/maya-teaching) makes
// this operation, from a stored workbook question with no operation: no stored package and no generator output holds
// it. Code computes every digit and value from the number's own digits. Pure TypeScript: no Next.js, React, network,
// database or clock.
import type { AnswerValue, Place, WorkedStep } from "@/lib/question-package";
import type { KindRules, Of } from "@/lib/question-package-math";
import { fail, isOne, type Fields, type OperationProblem } from "@/lib/question-package-columns";

/** The whole-number places, lowest first: index k is worth 10 ** k. */
export const WHOLE_PLACES: readonly Place[] = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands", "millions"];
/** The largest number a place-value question holds: 7 digits, the millions. */
export const MAX_PLACE_NUMBER = 9_999_999;

/** The power of ten of a whole place ("thousands" is 3), or -1 for a place that is not a whole place. */
export const placeIndex = (place: unknown): number => WHOLE_PLACES.indexOf(place as Place);
/** The digit of a whole number in a place (index k). */
export const digitAt = (n: number, k: number): number => Math.floor(n / 10 ** k) % 10;
/** A whole number written with commas, as Maya says and the chart writes it: 53,172. */
export const withCommas = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

type PlaceValue = Of<"place-value">;

function placeValueProblem(op: Fields): OperationProblem | null {
  const operands = op.operands;
  if (!isOne(operands) || !Number.isSafeInteger(operands[0]) || (operands[0] as number) < 1 || (operands[0] as number) > MAX_PLACE_NUMBER) {
    return fail(`a place-value question has one whole number from 1 to ${MAX_PLACE_NUMBER}`);
  }
  if (op.ask !== "digit" && op.ask !== "value") return fail("a place-value question asks for a digit or a value");
  const k = placeIndex(op.place);
  const n = operands[0] as number;
  if (k < 0 || k >= String(n).length) return fail("the place is not a place of the number");
  // A ones digit's value is the digit itself: the question has no second step to teach.
  if (op.ask === "value" && k === 0) return fail("a value question asks about a place from the tens up");
  return null;
}

const digitOf = (op: PlaceValue) => digitAt(op.operands[0], placeIndex(op.place));
const worthOf = (op: PlaceValue) => 10 ** placeIndex(op.place);

/** The place-value kind's rules, for KINDS in question-package-math.ts. */
export const PLACE_VALUE_RULES: KindRules<PlaceValue> = {
  answer: "result",
  accepted: "same-number",
  sameNumberWrong: "never",
  problem: placeValueProblem,
  // What is asked, as Maya names it: "the thousands digit of 53,172", "the value of the ten thousands digit of 53,172".
  text: (op) => `${op.ask === "value" ? "the value of " : ""}the ${op.place} digit of ${withCommas(op.operands[0])}`,
  // The value ask has one work step: the digit in the place. The digit ask's only step is its answer.
  steps: (op): WorkedStep[] => (op.ask === "value"
    ? [{ id: "digit", kind: "read-digit", place: op.place, digit: digitOf(op), worth: worthOf(op) }]
    : []),
  result: (op): AnswerValue => ({ type: "number", value: op.ask === "value" ? digitOf(op) * worthOf(op) : digitOf(op) }),
  say: (op, value) => (op.ask === "value"
    ? `The value of the ${digitOf(op)} in the ${op.place} place of ${withCommas(op.operands[0])} is ${placeValueText(value)}.`
    : `The digit in the ${op.place} place of ${withCommas(op.operands[0])} is ${placeValueText(value)}.`),
};

const placeValueText = (v: AnswerValue) => (v.type === "number" ? withCommas(v.value) : "");

/** A read-digit step in words, for H3 and the easier example: "The digit in the ten thousands place is 5." */
export const readDigitText = (step: Extract<WorkedStep, { kind: "read-digit" }>): string => `The digit in the ${step.place} place is ${step.digit}.`;

/**
 * The multiplications a place-value question's own work holds, for Maya's scope check (scope.ts): the digit times its
 * place ("8 times 10,000"), and code's wrong-answer work: one place too large or too small, and a neighbour's digit
 * times the place. A child who says one of these is working on this question, never on another problem.
 */
export function placeRelations(op: Of<"place-value">): [number, number][] {
  const n = op.operands[0];
  const k = placeIndex(op.place);
  const digit = digitAt(n, k);
  const out: [number, number][] = [[digit, 10 ** k]];
  if (k + 1 < 7) out.push([digit, 10 ** (k + 1)]);
  if (k >= 1) out.push([digit, 10 ** (k - 1)]);
  for (const j of [k + 1, k - 1]) if (j >= 0 && j < String(n).length) out.push([digitAt(n, j), 10 ** k]);
  return out;
}

/** What is asked, without the number, for Maya's fixed opening (it fits a grade 3 turn): "the value of the tens digit". */
export const placeOpeningText = (op: Of<"place-value">): string => `${op.ask === "value" ? "the value of " : ""}the ${op.place} digit`;
