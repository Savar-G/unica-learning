// The claim of an other-topic true/false question (Maya coverage, Wave C), for A4's claim session
// (src/lib/maya/claim.ts, which reads A4's own closed forms first): read again from the printed question by
// readTopicQuestion (topic-claims.ts), and only when the package's operation is the one that reading gives. Imports no
// session code, so the session can use it. Pure TypeScript.
// - C3b: scale, minute hand and money, "equal": the computed side against the printed number.
// - C3c: marbles, "less": the other colours added (5 + 5) against red (1), as "red is more likely" holds only when the
//   others together are fewer; area, "greater": one area (5 × 3) against the other (4 × 2 = 8, code's work).
import { operationResult, type Operation, type QuestionPackage } from "@/lib/question-package";
import type { Claim } from "./claim";
import { readTopicQuestion, type TopicReading } from "./topic-claims";

type ClaimReading = Extract<TopicReading, { topic: "scale" | "money" | "minute-hand" | "marbles" | "area" }>;
const CLAIM_TOPICS: readonly string[] = ["scale", "money", "minute-hand", "marbles", "area"];

/** Money's computed side: the bills' dollars plus the quarters' dollars, as one decimal addition ("60 + 0.75"). */
function moneyOperation(reading: ClaimReading): Operation | null {
  if (reading.topic !== "money") return null;
  const m = /^(\d+) × 20 \+ (\d+) × 0\.25$/.exec(reading.work.kind === "evaluate" ? reading.work.operands[0] : "");
  if (!m) return null;
  return { kind: "decimal-add", operands: [Number(m[1]) * 20, (Number(m[2]) * 25) / 100] };
}

/**
 * The operation a claim reading is taught with: the scale's and the minute hand's evaluate, money's decimal addition,
 * the marbles' sum of the other colours, the first area's product.
 */
export function claimOperation(reading: ClaimReading): Operation | null {
  if (reading.topic === "money") return moneyOperation(reading);
  if (reading.topic === "area") return reading.work[0];
  return reading.work;
}

/** A whole-number or decimal result, or null. */
export const resultOf = (op: Operation): number | null => {
  const v = operationResult(op);
  return v.type === "number" ? v.value : null;
};

/** The reading of a claim question, from its printed parts only. */
export function claimReading(pkg: QuestionPackage): ClaimReading | null {
  const reading = readTopicQuestion({ ...pkg, operation: null, answer: null, steps: [], wrongAnswers: [], easierExample: null });
  return reading && CLAIM_TOPICS.includes(reading.topic) ? (reading as ClaimReading) : null;
}

/** The number the computed side is compared with, and the relation the claim states. */
function sideOf(reading: ClaimReading): { shown: number; relation: Claim["relation"] } | null {
  if (reading.topic === "marbles") return { shown: reading.left, relation: "less" };
  if (reading.topic === "area") {
    const other = resultOf(reading.work[1]);
    return other === null ? null : { shown: other, relation: "greater" };
  }
  return { shown: reading.claimed, relation: "equal" };
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
  const side = sideOf(reading);
  if (value === null || !side) return null;
  const holds = side.relation === "equal" ? Math.round(value * 100) === Math.round(side.shown * 100)
    : side.relation === "greater" ? value > side.shown : value < side.shown;
  if ((holds ? "true" : "false") !== reading.answer) return null;
  return { choices: ["true", "false"], relation: side.relation, operation, value, shown: side.shown, holds, word: holds ? "true" : "false", other: holds ? "false" : "true" };
}
