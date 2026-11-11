// A fake decision client (spec #850): no network. Tests give it the answers for each request from a script and read the
// requests it got. Its model is a model of the pinned table (default Jev), so the cost bound applies to it as to a live client.
import type { DecisionAnswer, DecisionClient, DecisionRequest, DecisionResult } from "@/lib/decision-client";

export function fakeDecisionClient({
  model = "typesafe/jev-1.14",
  answer,
  usd = 0,
}: {
  model?: string;
  /** The answers for a request, by question key; throw (a DecisionError) to act as a failed request. */
  answer: (request: DecisionRequest) => Record<string, DecisionAnswer> | Promise<Record<string, DecisionAnswer>>;
  /** The cost each answer reports; null: an answer with no cost (one unpriced attempt). */
  usd?: number | null;
}): DecisionClient & { requests: DecisionRequest[] } {
  const requests: DecisionRequest[] = [];
  return {
    model,
    maxAttempts: 1,
    requests,
    async decide(request): Promise<DecisionResult> {
      requests.push(request);
      return { answers: await answer(request), usd, unpricedAttempts: usd === null ? 1 : 0, costKnown: usd !== null, provider: "fake", id: null };
    },
  };
}

/** A yes/no answer with probability `yes`. */
export const noul = (yes: number): DecisionAnswer => ({ type: "noul", yes, confidence: Math.max(yes, 1 - yes) });
