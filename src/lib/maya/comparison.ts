// Closed readers for checked two-sided comparisons. The session supplies the common commitment and order checks.
import { sameValue, type AnswerValue, type OperationPackage, type WorkedStep } from "../question-package";
import { comparisonAnswer, comparisonProblem, comparisonSides, comparisonWords, type ComparisonOperation } from "../question-package-comparison";
import { readClaimWord, type WordRead } from "./claim";
import { wholeTurn, wholeValue } from "./numbers";

export function comparisonOf(pkg: Pick<OperationPackage, "operation"> | null): ComparisonOperation | null {
  return pkg?.operation.kind === "comparison" && comparisonProblem(pkg.operation) === null ? pkg.operation : null;
}

/** Preserve a wrong asserted direction. The controller, not this parser, judges its truth. */
export function comparisonRelation(text: string, op: ComparisonOperation, step: Extract<WorkedStep, { kind: "comparison" }>, choseGreater = false): AnswerValue | null {
  const body = wholeTurn(text);
  if (!body) return null;
  const chosen = choseGreater ? wholeValue(body) : null;
  if (chosen === step.left || chosen === step.right) return comparisonAnswer(op, chosen === step.left);
  const m = /^(.+?) is (greater|more|bigger|larger|less|smaller|fewer) than (.+)$/.exec(body) ?? /^(.+?)\s*([<>])\s*(.+)$/.exec(body);
  if (!m) return null;
  const a = wholeValue(m[1]), b = wholeValue(m[3]);
  if (!((a === step.left && b === step.right) || (a === step.right && b === step.left))) return null;
  const greater = [">", "greater", "more", "bigger", "larger"].includes(m[2]);
  return comparisonAnswer(op, a === step.left ? greater : !greater);
}

const COMMIT = /^(?:it is|it's|the answer is|my answer is|i choose|i chose|i pick|i picked|i write|i will write|i'll write) /;
export function comparisonFinal(text: string, op: ComparisonOperation): WordRead {
  const whole = wholeTurn(text);
  if (whole === null) return null;
  const after = /^(.*?)(?:,)?\s+(?:because|since)\s+(.+)$/.exec(whole);
  const before = /^(?:because|since)\s+(.+?),\s*(.+)$/.exec(whole);
  const sentences = /^(.+?)[.!]\s+(.+)$/.exec(whole);
  const parts = after ? [[after[1], after[2]]] : before ? [[before[2], before[1]]] :
    sentences ? [[sentences[1], sentences[2]], [sentences[2], sentences[1]]] : [];
  if (parts.length) {
    const [left, right] = comparisonSides(op), value = comparisonAnswer(op);
    for (const [answer, reason] of parts) {
      const relation = comparisonRelation(reason, op, { id: "compare", kind: "comparison", left, right, value });
      if (!relation || !sameValue(relation, value)) continue;
      const read = comparisonFinal(answer, op);
      // A checked reason makes this a complete asserted choice; an isolated word still uses its original reading.
      if (read) return "word" in read ? { ...read, committed: true } : read;
    }
    return null;
  }
  if (op.context === "same-denominator" || op.context === "equal-pieces") return readClaimWord(whole, ["true", "false"], null);
  const prefix = COMMIT.exec(whole), body = prefix ? whole.slice(prefix[0].length) : whole;
  const choices = comparisonWords(op);
  if (op.context === "rectangle-areas") {
    const pair = /^(.+?) by (.+)$/.exec(body);
    if (!pair) return null;
    const a = wholeValue(pair[1]), b = wholeValue(pair[2]);
    const found = [[op.operands[0], op.operands[1]], [op.operands[2], op.operands[3]]].find(([x, y]) => a === x && b === y);
    return found ? { word: `${found[0]} by ${found[1]}`, committed: prefix !== null } : null;
  }
  const below = /^less than (.+)$/.exec(body);
  const word = below && op.context === "die-events" && wholeValue(below[1]) === op.operands[0] ? choices[1] : body;
  return choices.includes(word) ? { word, committed: prefix !== null } : null;
}

export function comparisonCount(text: string, step: Extract<WorkedStep, { kind: "comparison-count" }>): AnswerValue | null {
  const body = wholeTurn(text);
  if (!body) return null;
  const bare = wholeValue(body);
  if (bare !== null) return { type: "number", value: bare };
  const m = /^(.+?),? so (.+?) outcomes?$/.exec(body);
  if (!m) return null;
  const outcomes = m[1].split(/\s*,\s*|\s+and\s+/).map(wholeValue), count = wholeValue(m[2]);
  if (count === null || outcomes.some(n => n === null) || new Set(outcomes).size !== outcomes.length || count !== outcomes.length || outcomes.length !== step.outcomes.length || !step.outcomes.every(n => outcomes.includes(n))) return null;
  return { type: "number", value: count };
}

export const comparisonSame = (a: AnswerValue | null, b: AnswerValue) => a !== null && sameValue(a, b);
