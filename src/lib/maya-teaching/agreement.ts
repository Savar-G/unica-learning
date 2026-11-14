// The three agreements a derived operation needs before Maya teaches it (Wave A, D-195):
// 1. the printed text, read by a closed form (the caller's printedOperation; never a slot name in place of printed text);
// 2. the code-computed result, which equals the stored answer key in the item's answer box;
// 3. the template expression, evaluated by code on the stored slot values, which gives the same result.
// For a one-step operation the template expression must also be the same operation on the same numbers ("a * b" with
// a = 373 and b = 6 for 373 × 6). If any agreement fails, the question stays held. Pure TypeScript.
import {
  operationProblem, operationResult, sameValue,
  type AnswerValue, type Operation, type QuestionPackage,
} from "@/lib/question-package";
import { templateAnswer, templateAnswerValue, templateNumbers, type TemplateSource } from "@/lib/question-package-template";
import { hasPrintedOperands } from "@/lib/workbook-maya-operation";
import { MAYA_TEACHING_LIMITS } from "./limits";

/** The item formats a derived operation may teach: one written number, with or without shown work or a ticked sign. */
const FORMATS: readonly string[] = ["show-work", "write-number", "tick-and-number"];

/** The sign a tick-and-number item's ticked operation must be, for each one-step kind. */
const SIGNS: Partial<Record<Operation["kind"], string>> = { add: "+", subtract: "−", multiply: "×", divide: "÷" };

/** The template operators of a one-step expression, for each kind (the template language's own signs). */
const TEMPLATE_SIGNS: Partial<Record<Operation["kind"], string>> = { add: "+", subtract: "-", multiply: "*" };

/** "a * b": one operator between two names, and nothing else. */
const BINARY = /^([A-Za-z][A-Za-z0-9_]*) ([+*-]) ([A-Za-z][A-Za-z0-9_]*)$/;

export interface Agreed {
  /** The answer every source agrees on. */
  answer: AnswerValue;
  /** The template source of the answer box. */
  source: TemplateSource;
}

/**
 * The answer when the printed operation, the answer key and the template agree (see the header), else null. `shape`
 * "one-step": the template expression is the same operation on the same slot values as well.
 */
export function agreedAnswer(pkg: QuestionPackage, operation: Operation, shape: "one-step" | "result"): Agreed | null {
  const item = pkg.item;
  if (!item || !item.scorable || !FORMATS.includes(item.format) || item.error !== null) return null;
  const templates = item.checks.filter(c => c.kind === "template");
  const choices = item.checks.filter(c => c.kind === "template-choice");
  // An allow-list of checks: one template check on the answer box, plus one ticked sign for a tick-and-number item.
  if (templates.length !== 1 || templates[0].kind !== "template") return null;
  if (item.checks.length !== 1 + choices.length || choices.length !== (item.format === "tick-and-number" ? 1 : 0)) return null;
  const check = templates[0];
  const key = templateAnswer(check.source);
  if (!("answer" in key)) return null;
  const answer = templateAnswerValue(key.answer);
  if (answer.type !== "number") return null;
  if (operationProblem(operation, MAYA_TEACHING_LIMITS) || !sameValue(operationResult(operation), answer)) return null;
  const box = item.regions.find(r => r.id === check.region);
  if (box?.kind !== "box" || !box.answer || !sameValue(box.answer, answer)) return null;
  if (!hasPrintedOperands(operation, pkg.text)) return null;
  for (const choice of choices) {
    if (choice.kind !== "template-choice") return null;
    const sign = SIGNS[operation.kind];
    const ticked = templateAnswer(choice.source);
    const region = item.regions.find(r => r.id === choice.region);
    if (!sign || !("answer" in ticked) || ticked.answer !== sign || region?.kind !== "choice" || region.answer !== sign) return null;
  }
  if (shape === "one-step" && !sameOperation(check.source, operation)) return null;
  return { answer, source: check.source };
}

/** The template's expression is this operation on its numbers: "a - b" with a = 10000 and b = 2426 for 10000 − 2426. */
function sameOperation(source: TemplateSource, operation: Operation): boolean {
  const sign = TEMPLATE_SIGNS[operation.kind];
  const match = BINARY.exec(source.answer.trim());
  const values = templateNumbers(source);
  if (!sign || !match || match[2] !== sign || !values || !Object.hasOwn(values, match[1]) || !Object.hasOwn(values, match[3])) return false;
  const [a, b] = operation.operands as [number, number];
  const [x, y] = [values[match[1]], values[match[3]]];
  return (x === a && y === b) || (sign !== "-" && x === b && y === a);
}
