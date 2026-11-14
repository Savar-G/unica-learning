// Closed, Maya-only comparisons. Code computes both sides and the answer from the operands.
import type { AnswerValue, WorkedStep } from "./question-package";
import type { KindRules } from "./question-package-math";
import { fail } from "./question-package-columns";

export type ComparisonOperation =
  | { kind: "comparison"; context: "same-denominator"; operands: [number, number]; denominator: number }
  | { kind: "comparison"; context: "rectangle-areas"; operands: [number, number, number, number] }
  | { kind: "comparison"; context: "die-events"; operands: [2 | 3 | 5 | 6] }
  | { kind: "comparison"; context: "equal-pieces" | "counter-counts"; operands: [number, number] };
export type ComparisonStep =
  | { id: "compare"; kind: "comparison"; left: number; right: number; value: AnswerValue }
  | { id: string; kind: "comparison-count"; side: "left" | "right"; outcomes: number[]; value: number };

const whole = (v: unknown, min = 1, max = 9): v is number => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every(n => whole(n));

/** Exact keys prevent labels, counts or results supplied by a caller from becoming trusted facts. */
export function comparisonProblem(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "the comparison is missing";
  const op = raw as Record<string, unknown>;
  const keys = op.context === "same-denominator" ? ["kind", "context", "operands", "denominator"] : ["kind", "context", "operands"];
  if (op.kind !== "comparison" || Object.keys(op).length !== keys.length || keys.some(k => !Object.hasOwn(op, k))) return "the comparison has unsupported fields";
  if (op.context === "same-denominator") {
    if (!whole(op.denominator, 2, 100) || !Array.isArray(op.operands) || op.operands.length !== 2 || !op.operands.every(n => whole(n, 1, Number(op.denominator) - 1))) return "the comparison needs two positive proper fractions with the same denominator";
  } else if (op.context === "rectangle-areas") {
    if (!Array.isArray(op.operands) || op.operands.length !== 4 || !op.operands.every(n => whole(n))) return "the comparison needs two rectangles with one-digit sides";
  } else if (op.context === "die-events") {
    return Array.isArray(op.operands) && op.operands.length === 1 && [2, 3, 5, 6].includes(op.operands[0]) ? null : "the die event is unsupported";
  } else if (op.context === "equal-pieces" || op.context === "counter-counts") {
    if (!pair(op.operands)) return "the comparison needs two one-digit counts";
  } else return "the comparison context is unsupported";
  const [left, right] = comparisonSides(op as ComparisonOperation);
  return left === right ? "the supported comparisons have unequal sides" : null;
}

export const comparisonOutcomes = (op: Extract<ComparisonOperation, { context: "die-events" }>): [number[], number[]] => [
  [2, 4, 6], [1, 2, 3, 4, 5, 6].filter(n => n < op.operands[0]),
];

export function comparisonSides(op: ComparisonOperation): [number, number] {
  if (op.context === "rectangle-areas") return [op.operands[0] * op.operands[1], op.operands[2] * op.operands[3]];
  if (op.context === "die-events") return comparisonOutcomes(op).map(s => s.length) as [number, number];
  return [...op.operands];
}

/** The final labels are closed data. They never come from the model. */
export function comparisonWords(op: ComparisonOperation): [string, string] {
  if (op.context === "same-denominator" || op.context === "equal-pieces") return ["true", "false"];
  if (op.context === "rectangle-areas") return [`${op.operands[0]} by ${op.operands[1]}`, `${op.operands[2]} by ${op.operands[3]}`];
  return op.context === "counter-counts" ? ["red", "blue"] : ["even", `less than ${op.operands[0]}`];
}

export function comparisonAnswer(op: ComparisonOperation, leftGreater = comparisonSides(op)[0] > comparisonSides(op)[1]): Extract<AnswerValue, { type: "choice" | "text" }> {
  return { type: op.context === "same-denominator" || op.context === "equal-pieces" ? "choice" : "text", value: comparisonWords(op)[leftGreater ? 0 : 1] };
}

export function comparisonText(op: ComparisonOperation): string {
  if (op.context === "same-denominator") return `${op.operands[0]}/${op.denominator} > ${op.operands[1]}/${op.denominator}`;
  if (op.context === "equal-pieces") return `All pieces have the same size. True or false: ${op.operands[0]} ${op.operands[0] === 1 ? "piece" : "pieces"} > ${op.operands[1]} ${op.operands[1] === 1 ? "piece" : "pieces"}.`;
  if (op.context === "rectangle-areas") return `Which is bigger: ${comparisonWords(op).join(" or ")}?`;
  if (op.context === "counter-counts") return `A bag has ${op.operands[0]} red counters and ${op.operands[1]} blue counters. Which colour is more likely on one random draw?`;
  return `Which is more likely on a die numbered 1 to 6: even or less than ${op.operands[0]}?`;
}

export function comparisonSteps(op: ComparisonOperation): WorkedStep[] {
  const [left, right] = comparisonSides(op);
  const steps: WorkedStep[] = [];
  if (op.context === "rectangle-areas") for (const [i, [a, b]] of [[op.operands[0], op.operands[1]], [op.operands[2], op.operands[3]]].entries()) steps.push({
    id: i === 0 ? "left-area" : "right-area", kind: "operate", rule: "multiply-divide", op: "×", left: a, right: b, value: a * b, rest: String(a * b),
  });
  if (op.context === "die-events") for (const [i, outcomes] of comparisonOutcomes(op).entries()) steps.push({
    id: i === 0 ? "left-count" : "right-count", kind: "comparison-count", side: i === 0 ? "left" : "right", outcomes, value: outcomes.length,
  });
  steps.push({ id: "compare", kind: "comparison", left, right, value: comparisonAnswer(op) });
  return steps;
}

export const COMPARISON_RULES: KindRules<ComparisonOperation> = {
  problem: op => { const p = comparisonProblem(op); return p ? fail(p) : null; },
  text: comparisonText, steps: comparisonSteps, result: comparisonAnswer,
  answer: "result", accepted: "none", sameNumberWrong: "never",
};
