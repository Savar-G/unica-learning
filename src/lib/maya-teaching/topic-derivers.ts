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
import { withShapedExample } from "./examples";
import { MAYA_TEACHING_LIMITS, TEACHING_SOURCE } from "./limits";
import { readTopicQuestion } from "./topic-claims";
import { claimOperation, resultOf } from "./topic-claim";
import type { Deriver } from "./index";

/**
 * Money's easier examples, best first: one $20 bill and some quarters, then smaller dollar amounts. The first the
 * package check finds smaller than the question (and the session can teach) wins.
 */
const MONEY_EXAMPLES: Operation[] = [[20, 0.5], [20, 0.25], [20, 0.75], [10, 0.5], [2, 0.5], [2, 0.25], [1, 0.5]]
  .map(([d, q]) => ({ kind: "decimal-add", operands: [d, q] }));

/**
 * The minute hand's easier examples, of its shape ("4 × 5 + 4": a number on the clock times 5, plus the marks): one
 * number less, then one mark less, then the hand 2 marks past the 1. Its numbers are single digits, so the adapter's
 * one-place-smaller examples (examples.ts) have none.
 */
function minuteExamples(operation: Operation): Operation[] {
  const m = /^(\d+) × 5 \+ (\d+)$/.exec(operation.kind === "evaluate" ? operation.operands[0] : "");
  if (!m) return [];
  const [k, x] = [Number(m[1]), Number(m[2])];
  return [[k - 1, x], [k, x - 1], [1, 2]].filter(([a, b]) => a >= 1 && b >= 1 && (a !== k || b !== x))
    .map(([a, b]) => ({ kind: "evaluate", operands: [`${a} × 5 + ${b}`] }) as Operation);
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
  if (reading.topic === "scale") return withShapedExample(printed, operation, answer, MAYA_TEACHING_LIMITS);
  for (const example of reading.topic === "money" ? MONEY_EXAMPLES : minuteExamples(operation)) {
    const made = withTeachingOperation(printed, operation, answer, { source: TEACHING_SOURCE, limits: MAYA_TEACHING_LIMITS, examples: [example] });
    if (made && heldReason(made) === null) return made;
  }
  return null;
}

/** C3b's derivers, registered in index.ts. */
export const TOPIC_DERIVERS: readonly Deriver[] = [deriveTopicClaim];
