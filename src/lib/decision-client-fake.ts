// A fake decision client (spec #850): no network. Tests give it the answers for each request from a script and read the
// requests it got.
import type { DecisionAnswer, DecisionClient, DecisionRequest, DecisionResult } from "@/lib/decision-client";

export function fakeDecisionClient({
  model = "fake",
  answer,
  usd = 0,
}: {
  model?: string;
  /** The answers for a request, by question key; throw (a DecisionError) to act as a failed request. */
  answer: (request: DecisionRequest) => Record<string, DecisionAnswer> | Promise<Record<string, DecisionAnswer>>;
  /** The cost each answer reports. */
  usd?: number | null;
}): DecisionClient & { requests: DecisionRequest[] } {
  const requests: DecisionRequest[] = [];
  return {
    model,
    requests,
    async decide(request): Promise<DecisionResult> {
      requests.push(request);
      return { answers: await answer(request), usd, provider: "fake", id: null };
    },
  };
}

/** A yes/no answer with probability `yes`. */
export const noul = (yes: number): DecisionAnswer => ({ type: "noul", yes, confidence: Math.max(yes, 1 - yes) });
