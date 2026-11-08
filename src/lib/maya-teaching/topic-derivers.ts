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

/** The numbers of an expression, as written. */
const numbersOf = (expr: string) => (expr.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

/**
 * Easier examples of the claim's shape with none of the question's own numbers (lesson 11), smallest first: the scale's
 * "v + m × k" and the minute hand's "k × 5 + x" (5 is the clock's fact, not a printed number). Each must also pass the
 * package check, the session's rule and the giveaway rule (examples.ts `givesAway`); the first that does wins.
 */
function freshExamples(operation: Operation, topic: "scale" | "minute-hand"): Operation[] {
  if (operation.kind !== "evaluate") return [];
  const own = new Set(numbersOf(operation.operands[0]));
  const fresh = (...ns: number[]) => ns.every((n) => !own.has(n));
  const out: string[] = [];
  if (topic === "scale") {
    for (const v of [3, 4, 6, 7, 8, 9]) for (const m of [2, 3, 4]) for (const k of [3, 4, 5]) if (fresh(v, m, k)) out.push(`${v} + ${m} × ${k}`);
  } else {
    for (const k of [1, 2, 3, 6]) for (const x of [1, 2, 3]) if (fresh(k, x)) out.push(`${k} × 5 + ${x}`);
  }
  return out.map((e) => ({ kind: "evaluate", operands: [e] }));
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
  for (const example of reading.topic === "money" ? MONEY_EXAMPLES : freshExamples(operation, reading.topic)) {
    const made = withTeachingOperation(printed, operation, answer, { source: TEACHING_SOURCE, limits: MAYA_TEACHING_LIMITS, examples: [example] });
    if (made?.easierExample && !givesAway(answer, made.easierExample.answer) && heldReason(made) === null) return made;
  }
  return null;
}

/** C3b's derivers, registered in index.ts. */
export const TOPIC_DERIVERS: readonly Deriver[] = [deriveTopicClaim];
