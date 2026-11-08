import { equivalent, operationText, type AnswerValue, type Operation } from "@/lib/question-package";
import { valuesIn } from "./numbers";

/** Whether the expression in close.together contains the target answer. */
export function closeExpressionContainsAnswer(operation: Operation, answer: AnswerValue): boolean {
  return valuesIn(operationText(operation), { fractions: true }).some((value) => equivalent(value, answer));
}
