// The teaching package of an "other-topic" workbook question (Maya coverage, Wave C, group "other-topic"): a printed
// question with no stored operation whose math is one operation Maya already teaches, once a code fact names its
// numbers ("half of the numbers 1 to 8 are odd" is 8 ÷ 2; "a square has 4 lines of symmetry"). The topic module reads
// the printed text by a closed form, checks the template and the answer key, and gives the operation and an easier
// example of the same shape (its own printed text, read by the same closed form). This module adds the teaching data
// and checks the package. Nothing here changes the printed question: only the teaching fields are added. The session
// adapter (src/lib/maya-teaching/index.ts, A1) marks the package it returns with its own source. Pure TypeScript.
import {
  checkQuestionPackage, operationProblem, operationResult, sameValue, workedSteps,
  type AnswerValue, type Operation, type QuestionPackage,
} from "@/lib/question-package";
import { templateAnswer, templateAnswerValue, templateNumbers, type TemplateSource } from "@/lib/question-package-template";

/** An easier example of the same shape: its printed text and its operation. */
export interface TopicExample {
  text: string;
  operation: Operation;
}

/**
 * The one template check on the answer box of a printed question, its stored key and its slot values, when the item is
 * a scorable `format` item with exactly that check and the box's answer equals the template's answer; else null.
 */
export function boxTemplate(pkg: QuestionPackage, format: string): { source: TemplateSource; key: AnswerValue; values: Record<string, number> } | null {
  const item = pkg.item;
  if (!item || !item.scorable || item.format !== format || item.error !== null || item.checks.length !== 1) return null;
  const check = item.checks[0];
  if (check.kind !== "template") return null;
  const answer = templateAnswer(check.source);
  if (!("answer" in answer)) return null;
  const key = templateAnswerValue(answer.answer);
  const box = item.regions.find((r) => r.id === check.region);
  if (box?.kind !== "box" || !box.answer || !sameValue(box.answer, key)) return null;
  const values = templateNumbers(check.source);
  return values ? { source: check.source, key, values } : null;
}

/**
 * The printed package with checked teaching data for `operation`: its answer, worked steps, one wrong answer and the
 * easier example. Null when the operation is not valid, does not give `answer`, or the package does not check.
 */
export function withTopicOperation(printed: QuestionPackage, operation: Operation, answer: AnswerValue, example: TopicExample): QuestionPackage | null {
  if (operationProblem(operation) || operationProblem(example.operation)) return null;
  if (!sameValue(operationResult(operation), answer) || answer.type !== "number") return null;
  const candidate: QuestionPackage = {
    ...printed,
    operation,
    answer: { value: answer, accepted: [], unit: null },
    steps: workedSteps(operation),
    wrongAnswers: [{ value: { type: "number", value: answer.value + 1 }, cause: "calculation", description: "Gives a different result.", step: null }],
    easierExample: { text: example.text, operation: example.operation, answer: operationResult(example.operation), steps: workedSteps(example.operation) },
  };
  return checkQuestionPackage(candidate).ok ? candidate : null;
}
