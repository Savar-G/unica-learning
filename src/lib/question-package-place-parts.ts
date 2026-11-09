// Place value, B1b (design: .design/research/maya-place-value-design.md, sections 1, 2 and 4): the asks that put two
// parts of a number together, beside B1a's digit and value (question-package-place-value.ts):
// - compare: "In 16466, the digit in the thousands place is bigger than the digit in the hundreds place." true or false;
// - sum: "In 99467, what is the value of the thousands digit plus the value of the tens digit?" 9000 + 60 = 9060;
// - build: "6 wholes and 4 tenths is ? as a decimal." 6.4.
// Only Maya's session adapter (src/lib/maya-teaching) makes these operations, from a stored workbook question with no
// operation; they share the "place-value" kind, so every rule that keeps that kind out of the default package check holds
// for them too. Code computes every digit, value and word from the number's own digits. Pure TypeScript.
import type { AnswerValue, Place, WorkedStep } from "@/lib/question-package";
import type { KindRules, Of } from "@/lib/question-package-math";
import { fail, type Fields, type OperationProblem } from "@/lib/question-package-columns";
import { digitAt, MAX_PLACE_NUMBER, placeIndex, withCommas } from "@/lib/question-package-place-value";

type PlaceValue = Of<"place-value">;
export type PartsOperation = Extract<PlaceValue, { ask: "compare" | "sum" | "build" }>;
export type TwoPlaces = Extract<PlaceValue, { ask: "compare" | "sum" }>;
export type BuildOperation = Extract<PlaceValue, { ask: "build" }>;

/** The asks of this file. */
export const PARTS_ASKS: readonly string[] = ["compare", "sum", "build"];
export const isPartsOperation = (op: { ask?: unknown }): op is PartsOperation => PARTS_ASKS.includes(op.ask as string);

/** The two digits of a compare or a sum, in the printed order, with their places' worth. */
export function partsOf(op: TwoPlaces) {
  const n = op.operands[0];
  const ka = placeIndex(op.place);
  const kb = placeIndex(op.second);
  const a = digitAt(n, ka);
  const b = digitAt(n, kb);
  return { n, ka, kb, a, b, worthA: 10 ** ka, worthB: 10 ** kb, valueA: a * 10 ** ka, valueB: b * 10 ** kb };
}

/** The decimal a build makes, exactly: 6 wholes and 4 tenths is 64 tenths, 6.4. */
export const buildValue = (op: BuildOperation): number => (op.operands[0] * 10 + op.operands[1]) / 10;

function problemOf(op: Fields): OperationProblem | null {
  const operands = op.operands;
  if (op.ask === "build") {
    if (!Array.isArray(operands) || operands.length !== 2 || !operands.every((v) => Number.isSafeInteger(v))) return fail("a build has a whole number of wholes and of tenths");
    const [w, t] = operands as number[];
    if (w < 1 || w > 9 || t < 1 || t > 9) return fail("a build has 1 to 9 wholes and 1 to 9 tenths");
    if (op.place !== "tenths") return fail("a build makes tenths");
    return null;
  }
  if (!Array.isArray(operands) || operands.length !== 1 || !Number.isSafeInteger(operands[0]) || (operands[0] as number) < 1 || (operands[0] as number) > MAX_PLACE_NUMBER) {
    return fail(`a place-value question has one whole number from 1 to ${MAX_PLACE_NUMBER}`);
  }
  const n = operands[0] as number;
  const ka = placeIndex(op.place);
  const kb = placeIndex(op.second);
  const length = String(n).length;
  if (ka < 0 || kb < 0 || ka >= length || kb >= length) return fail("the places are not places of the number");
  if (ka <= kb) return fail("the first place is higher than the second");
  // A sum of a 0 digit's value is one value: the question has no second part to teach (held, never taught).
  if (op.ask === "sum" && (digitAt(n, ka) === 0 || digitAt(n, kb) === 0)) return fail("a sum adds the values of two digits that are not 0");
  return null;
}

const choice = (value: string): AnswerValue => ({ type: "choice", value });
const number = (value: number): AnswerValue => ({ type: "number", value });

function resultOf(op: PartsOperation): AnswerValue {
  if (op.ask === "build") return number(buildValue(op));
  const p = partsOf(op);
  return op.ask === "compare" ? choice(p.a > p.b ? "true" : "false") : number(p.valueA + p.valueB);
}

/** The steps before the result: each digit's place for a compare (and which digit is bigger), each value for a sum. */
function stepsOf(op: PartsOperation): WorkedStep[] {
  if (op.ask === "build") return [];
  const p = partsOf(op);
  if (op.ask === "compare") {
    return [
      { id: "digit-1", kind: "read-digit", place: op.place, digit: p.a, worth: p.worthA },
      { id: "digit-2", kind: "read-digit", place: op.second, digit: p.b, worth: p.worthB },
      ...(p.a !== p.b ? [{ id: "bigger" as const, kind: "bigger" as const, a: p.a, b: p.b, bigger: Math.max(p.a, p.b) }] : []),
    ];
  }
  return [
    { id: "worth-1", kind: "place-worth", place: op.place, digit: p.a, worth: p.worthA, value: p.valueA },
    { id: "worth-2", kind: "place-worth", place: op.second, digit: p.b, worth: p.worthB, value: p.valueB },
  ];
}

/** What is asked, as Maya names it: "the thousands and hundreds digits of 16,466", "6 wholes and 4 tenths as a decimal". */
export function partsText(op: PartsOperation): string {
  if (op.ask === "build") return `${buildParts(op)} as a decimal`;
  // Short: "the two digits of 38,472". Maya's opening question about it has its own words (assess.parts), with no number.
  const n = withCommas(op.operands[0]);
  return op.ask === "compare" ? `the two digits of ${n}` : `the two values of ${n}`;
}

/** What is asked, without the number, for Maya's fixed opening (a grade 3 turn). */
export function partsOpeningText(op: PartsOperation): string {
  if (op.ask === "build") return `${buildParts(op)} as a decimal`;
  return op.ask === "compare" ? `the ${op.place} and ${op.second} digits` : `the ${op.place} value plus the ${op.second} value`;
}

/** "6 wholes and 4 tenths", "6 wholes and 1 tenth". */
export const buildParts = (op: BuildOperation): string => {
  const [w, t] = op.operands;
  return `${w} ${w === 1 ? "whole" : "wholes"} and ${t} ${t === 1 ? "tenth" : "tenths"}`;
};

function sayOf(op: PartsOperation, value: AnswerValue): string {
  if (op.ask === "build") return `${buildParts(op)} is ${value.type === "number" ? value.value : ""}.`;
  const p = partsOf(op);
  if (op.ask === "compare") {
    const how = p.a > p.b ? "bigger than" : p.a < p.b ? "smaller than" : "the same as";
    return `${p.a} is ${how} ${p.b}, so the statement is ${value.type === "choice" ? value.value : ""}.`;
  }
  return `${withCommas(p.valueA)} + ${withCommas(p.valueB)} = ${value.type === "number" ? withCommas(value.value) : ""}.`;
}

/** The rules of B1b's asks; `withPlaceParts` lays them over B1a's rules for the one "place-value" kind. */
const PARTS_RULES: KindRules<PartsOperation> = {
  answer: "result",
  accepted: "same-number",
  sameNumberWrong: "never",
  problem: problemOf,
  text: partsText,
  steps: stepsOf,
  result: resultOf,
  say: sayOf,
};

/** B1a's place-value rules with B1b's asks dispatched first. Every other ask goes to B1a's rules unchanged. */
export function withPlaceParts(base: KindRules<PlaceValue>): KindRules<PlaceValue> {
  const parts = PARTS_RULES as unknown as KindRules<PlaceValue>;
  const pick = (op: { ask?: unknown }) => (isPartsOperation(op) ? parts : base);
  return {
    ...base,
    problem: (op) => pick(op).problem(op),
    text: (op) => pick(op).text(op),
    steps: (op) => pick(op).steps(op),
    result: (op) => pick(op).result(op),
    say: (op, value) => (pick(op).say ?? base.say)!(op, value),
  };
}

/** A worked B1b step in words, for H3 and the easier example. */
export function partsStepText(step: WorkedStep): string | null {
  if (step.kind === "bigger") return `${step.bigger} is bigger than ${step.bigger === step.a ? step.b : step.a}.`;
  if (step.kind === "place-worth") return `The ${step.digit} in the ${step.place} place is worth ${withCommas(step.value)}.`;
  return null;
}

/**
 * The math a B1b question's own work holds, for Maya's scope check (scope.ts): a sum's digit times its place for each
 * part and the two values added; a build's wholes and tenths. A child who says one of these works on this question.
 */
export function partsRelations(op: PartsOperation): { op: "add" | "multiply"; operands: [number, number] }[] {
  if (op.ask !== "sum") return [];
  const p = partsOf(op);
  return [
    { op: "multiply", operands: [p.a, p.worthA] }, { op: "multiply", operands: [p.b, p.worthB] },
    { op: "add", operands: [p.valueA, p.valueB] },
  ];
}

/** The places of a B1b question, for the chart: the two compared or added places. */
export const placesOf = (op: TwoPlaces): [Place, Place] => [op.place, op.second];
