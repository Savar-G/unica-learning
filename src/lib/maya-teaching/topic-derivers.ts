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
  const examples = reading.topic === "money" ? MONEY_EXAMPLES : reading.topic === "scale" ? scaleExamples(operation) : minuteExamples(operation);
  for (const example of examples) {
    const made = withTeachingOperation(printed, operation, answer, { source: TEACHING_SOURCE, limits: MAYA_TEACHING_LIMITS, examples: [example] });
    if (made && heldReason(made) === null) return made;
  }
  return null;
}

/** C3b's derivers, registered in index.ts. */
export const TOPIC_DERIVERS: readonly Deriver[] = [deriveTopicClaim];
