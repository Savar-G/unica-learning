// The teaching packages of the "other-topic" questions that C3b teaches (Maya coverage, Wave C, after #731): each is
// read first by `readTopicQuestion` (topic-claims.ts: the printed text, code's work and the stored template agree), then
// given an operation Maya teaches and a checked easier example. Pure TypeScript.
//
// - Scale, minute-hand and money claims ("True or false: 2 intervals above 90 is 94."): the claim's computed side is
//   the operation (an `evaluate` for the scale and the minute hand, taught by A2; a decimal addition of the bills and
//   the quarters for money), and A4's claim session teaches the compare and the circled word (topic-claim.ts gives that
//   session the claim).
import { heldReason } from "@/lib/maya";
import { operationResult, sameValue, type Operation, type QuestionPackage } from "@/lib/question-package";
import { withTeachingOperation } from "@/lib/workbook-maya-operation";
import { givesAway } from "./examples";
import { MAYA_TEACHING_LIMITS, TEACHING_SOURCE } from "./limits";
import { readTopicQuestion } from "./topic-claims";
import { claimOperation, resultOf } from "./topic-claim";
import type { Deriver } from "./index";

/** Every number printed in the question's text ("$40.50" is 40.5), for the examples' refusals (lessons 11 and 12). */
function printedNumbers(text: string): number[] {
  return [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

/**
 * True when an example would give the question away (lessons 11 and 12): one of its numbers, its step value or its
 * result is a number the question prints or works out (`own`), or its result is the answer times a power of 10 or
 * begins with the answer's digits (givesAway). 0 is never an example's number.
 */
function examplesGiveAway(numbers: number[], got: number, own: number[], answer: number): boolean {
  const same = (x: number, y: number) => Math.abs(x - y) < 1e-9;
  const tenfold = [1, 10, 100, 1000, 10000].some((p) => same(got * p, answer) || same(got, answer * p));
  return [...numbers, got].some((x) => x <= 0 || own.some((y) => same(x, y))) || tenfold ||
    givesAway({ type: "number", value: answer }, { type: "number", value: got });
}

/**
 * Money's easier examples, of its shape (some dollars plus some quarters, as a decimal addition), best first, made by
 * code and refused when they reuse a number of the question (review of #741, P2-1): the bill and quarter counts, the
 * $20, the shown amount, the bills' and the quarters' sums, or the answer (examplesGiveAway). The package check then
 * takes the first that is smaller than the question.
 */
export function moneyExamples(operation: Operation, printed: number[]): Operation[] {
  if (operation.kind !== "decimal-add") return [];
  const [d, q] = operation.operands as number[];
  const answer = d + q;
  const own = [...printed, d, q, answer];
  const out: Operation[] = [];
  // Fewer digits first (every amount is written to the cent, so $5.75 is easier than $40.50 and $10.75 is not).
  for (const dollars of [5, 4, 3, 2, 1, 10, 30, 50]) for (const quarters of [0.5, 0.75, 0.25]) {
    const got = Math.round((dollars + quarters) * 100) / 100;
    if (examplesGiveAway([dollars, quarters], got, own, answer)) continue;
    out.push({ kind: "decimal-add", operands: [dollars, quarters] });
  }
  return out;
}

/**
 * The minute hand's easier examples, of its shape ("4 × 5 + 3": a number on the clock times 5, plus the marks past it),
 * best first: a smaller number on the clock, then a larger one, each with 1 to 4 marks. Refused when the example reuses
 * a number of the question (review of #741, P2-1): the marks, the number, the shown minutes, the number times 5 or the
 * answer, as its own numbers, its step value (times 5) or its result (examplesGiveAway). Its single digits leave the
 * adapter's one-place-smaller examples (examples.ts) none.
 */
export function minuteExamples(operation: Operation, printed: number[]): Operation[] {
  const m = /^(\d+) × 5 \+ (\d+)$/.exec(operation.kind === "evaluate" ? operation.operands[0] : "");
  if (!m) return [];
  const [k, x] = [Number(m[1]), Number(m[2])];
  const answer = k * 5 + x;
  const own = [...printed, k, x, k * 5, answer];
  const numbers = [...Array.from({ length: k - 1 }, (_, i) => k - 1 - i), ...Array.from({ length: Math.max(0, 11 - k) }, (_, i) => k + 1 + i)];
  const out: Operation[] = [];
  for (const a of numbers) for (const b of [1, 2, 3, 4]) {
    if (examplesGiveAway([a, b, a * 5], a * 5 + b, own, answer)) continue;
    out.push({ kind: "evaluate", operands: [`${a} × 5 + ${b}`] });
  }
  return out;
}

/**
 * A scale's easier examples, of its shape ("20 + 3 × 5": the mark the count starts at, plus the intervals times the
 * step), best first, made by code and not from the question's own digits (review of #741, P2: "9 + 3 × 1" for
 * "90 + 3 × 10" gave 12 for 120). Each is refused when it uses any number of the question (its start, count or step),
 * the question's answer, a 0 or a 1; when its answer is the question's, or that times a power of 10; and when its
 * answer's digits begin the question's answer (givesAway; lessons 11 and 12). Its start is a round mark where it can be,
 * and its step a scale's step (5, 2 or 10) before 3, so it reads as a scale. The package check then takes the first
 * that is smaller than the question.
 */
export function scaleExamples(operation: Operation): Operation[] {
  const m = /^(\d+) \+ (\d+) × (\d+)$/.exec(operation.kind === "evaluate" ? operation.operands[0] : "");
  if (!m) return [];
  const own = [Number(m[1]), Number(m[2]), Number(m[3])];
  const answer = own[0] + own[1] * own[2];
  const tenfold = (x: number) => [10, 100, 1000, 10000].some((p) => x * p === answer);
  const out: Operation[] = [];
  // A round start first; a 1-digit start after, for a question with few digits (an example must have fewer, as the
  // package check counts them: "90 + 3 × 2" has 4).
  for (const start of [10, 20, 30, 40, 4, 6, 8]) for (const step of [5, 2, 10, 3]) for (const count of [2, 3, 4]) {
    const got = start + count * step;
    const numbers = [start, count, step];
    if (numbers.some((x) => x <= 1 || own.includes(x) || x === answer) || got === answer || tenfold(got)) continue;
    if (givesAway({ type: "number", value: answer }, { type: "number", value: got })) continue;
    out.push({ kind: "evaluate", operands: [`${start} + ${count} × ${step}`] });
  }
  return out;
}

/** The teaching package of a scale, minute-hand or money claim, or null. */
export function deriveTopicClaim(printed: QuestionPackage): QuestionPackage | null {
  const reading = readTopicQuestion(printed);
  if (!reading || (reading.topic !== "scale" && reading.topic !== "money" && reading.topic !== "minute-hand")) return null;
  const operation = claimOperation(reading);
  const value = operation && resultOf(operation);
  if (!operation || value === null) return null;
  // The money operation must give what code's evaluate of the bills and quarters gives.
  if (reading.topic === "money" && !sameValue(operationResult(reading.work), { type: "number", value })) return null;
  const answer = { type: "number" as const, value };
  const printedNow = printedNumbers(printed.text);
  const examples = reading.topic === "money" ? moneyExamples(operation, printedNow) : reading.topic === "scale" ? scaleExamples(operation) : minuteExamples(operation, printedNow);
  for (const example of examples) {
    const made = withTeachingOperation(printed, operation, answer, { source: TEACHING_SOURCE, limits: MAYA_TEACHING_LIMITS, examples: [example] });
    if (made && heldReason(made) === null) return made;
  }
  return null;
}

/** C3b's derivers, registered in index.ts. */
export const TOPIC_DERIVERS: readonly Deriver[] = [deriveTopicClaim];
