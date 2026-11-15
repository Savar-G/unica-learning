import type { markingPageView } from "@/lib/scan-marking";
import { explanationInput, explanationProblem, type ExplanationContext } from "@/lib/parent-problem-explanation";

export function pageExplanationItem(item: ReturnType<typeof markingPageView>["items"][number], context: ExplanationContext | null, complete: boolean, priceReady: boolean) {
  const eligible = complete && item.canChange && item.result === "wrong" && (item.state === "scored" || item.state === "parent-checked");
  const problem = eligible && context ? explanationProblem(context) : null;
  return { explainable: !!(eligible && priceReady && context && explanationInput(context)),
    questionText: problem?.package.text ?? null, correctAnswer: problem?.correctAnswer ?? null };
}
