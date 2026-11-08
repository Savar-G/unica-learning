// The claim of a scale, minute-hand or money question (Maya coverage, Wave C, C3b), for A4's claim session
// (src/lib/maya/claim.ts, which reads A4's own closed forms first): read again from the printed question by
// readTopicQuestion (topic-claims.ts), and only when the package's operation is the one that reading gives. Imports no
// session code, so the session can use it. Pure TypeScript.
import { operationResult, type Operation, type QuestionPackage } from "@/lib/question-package";
import type { Claim } from "./claim";
import { readTopicQuestion, type TopicReading } from "./topic-claims";

type ClaimReading = Extract<TopicReading, { topic: "scale" | "money" | "minute-hand" }>;

/** Money's computed side: the bills' dollars plus the quarters' dollars, as one decimal addition ("60 + 0.75"). */
function moneyOperation(reading: ClaimReading): Operation | null {
  const m = /^(\d+) × 20 \+ (\d+) × 0\.25$/.exec(reading.work.kind === "evaluate" ? reading.work.operands[0] : "");
  if (!m) return null;
  return { kind: "decimal-add", operands: [Number(m[1]) * 20, (Number(m[2]) * 25) / 100] };
}

/** The operation a claim reading is taught with: the scale's and the minute hand's evaluate, money's decimal addition. */
export function claimOperation(reading: ClaimReading): Operation | null {
  return reading.topic === "money" ? moneyOperation(reading) : reading.work;
}

/** A whole-number or decimal result, or null. */
export const resultOf = (op: Operation): number | null => {
  const v = operationResult(op);
  return v.type === "number" ? v.value : null;
};

/** The reading of a claim question, from its printed parts only. */
export function claimReading(pkg: QuestionPackage): ClaimReading | null {
  const reading = readTopicQuestion({ ...pkg, operation: null, answer: null, steps: [], wrongAnswers: [], easierExample: null });
  return reading && (reading.topic === "scale" || reading.topic === "money" || reading.topic === "minute-hand") ? reading : null;
}

/**
 * The claim a session package states, for A4's claim session (src/lib/maya/claim.ts): read again from the printed
 * question, and only when the package's operation is the one the reading gives. Null for any other package.
 */
export function topicClaim(pkg: QuestionPackage): Claim | null {
  const reading = claimReading(pkg);
  if (!reading) return null;
  const operation = claimOperation(reading);
  if (!operation || !pkg.operation || JSON.stringify(operation) !== JSON.stringify(pkg.operation)) return null;
  const value = resultOf(operation);
  if (value === null) return null;
  const holds = Math.round(value * 100) === Math.round(reading.claimed * 100);
  if ((holds ? "true" : "false") !== reading.answer) return null;
  return { choices: ["true", "false"], relation: "equal", operation, value, shown: reading.claimed, holds, word: holds ? "true" : "false", other: holds ? "false" : "true" };
}

