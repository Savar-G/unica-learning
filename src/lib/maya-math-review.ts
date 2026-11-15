// The seam of the tutor core's math-truth review (two-layer true math, the Chief of Staff's design of 2026-11-15): one
// small AI call that judges one sentence of Maya's against code's facts of the question (MATH_REVIEW_SYSTEM in
// src/lib/maya/math-review.ts). The text adapter (src/lib/maya-text.ts) asks it for each tutor sentence that code's claim
// reader did not read whole (tutor.ts unreadMath), beside the safety review, before the sentence is said, with the
// review's time limit. Only "true" lets the sentence be said. A failed call, a time-out or an answer outside the schema
// counts as "unsure". An "unsure" answer of the first review is asked once of the retry model (version 3, 2026-11-15),
// inside the same time limit: only the retry's "true" passes; its "false", "unsure", an error or a time-out is final.
//
// The live reviewer goes through the AI client (OpenRouter, MAYA_MATH_REVIEW_MODEL, default Claude Haiku 5.5, with the
// same key as Maya); the retry is MAYA_MATH_REVIEW_RETRY_MODEL (default Claude Sonnet 5.5). Both count their attempts in
// Maya's spend as review attempts (docs/maya-spend.md). Tests use the fake.
import { hedged, withTimeLimit, type AiClient } from "@/lib/ai-client";
import { hedgeDelay } from "@/lib/maya-talk-review";
import { MATH_REVIEW_PROMPT_VERSION, MATH_REVIEW_SCHEMA, MATH_REVIEW_SYSTEM, readMathReview, type MathReviewInput, type MathReviewResult } from "@/lib/maya/math-review";
import { classifyError } from "@/lib/maya-trace";

/** The review model when MAYA_MATH_REVIEW_MODEL is not set: an OpenRouter model id with structured output. */
export const MATH_REVIEW_DEFAULT_MODEL = "anthropic/claude-haiku-5.5";
/** The retry model when MAYA_MATH_REVIEW_RETRY_MODEL is not set (version 3): it reads a sentence the first review was unsure of. */
export const MATH_REVIEW_RETRY_DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";
/**
 * The request: some thinking, a short answer (a held sentence waits for it). Version 3: "medium" (measured 2026-11-15
 * on #1056's 124 false sentences: "low" judged 1 or 2 true in 3 of 5 runs, "medium" none in 2; median 1.3 s, not 0.8 s).
 */
export const MATH_REVIEW_REQUEST = { effort: "medium" as const, maxTokens: 1_500 };
/**
 * 2026-11-15 (fallback rate): a math review with no answer after this many ms is sent once more (`hedged`), the first
 * answer counting. Its latency comes mostly from the sentence (the same slow sentences were slow on every route), so a
 * hedge at 2.5 s fired on 40% of math reviews in 10 desk-chat sessions and won once: this delay is about the p90 (3.4 s),
 * for a stalled request only. On a 4 s voice limit no copy is sent (HEDGE_MIN_LEFT_MS).
 */
export const MATH_REVIEW_HEDGE_MS = 3_500;
/** The retry's request: it must answer inside what is left of the same time limit. */
export const MATH_REVIEW_RETRY_REQUEST = { effort: "low" as const, maxTokens: 1_500 };

export interface MathReviewer {
  /** The model id, for the trace ("fake-math-review" for the fake). */
  readonly id: string;
  readonly promptVersion: string;
  /** The review of one sentence. May throw: the adapter counts a throw, and a time-out, as "unsure". */
  review(input: MathReviewInput, signal: AbortSignal): Promise<MathReviewResult>;
  /** The reviewer asked once when this one answers "unsure" (version 3), or none. */
  readonly retry?: MathReviewer;
}

type ReviewRequest = { effort: "minimal" | "low" | "medium"; maxTokens: number };

/**
 * The review through the AI client: one structured-output request per sentence. `retry`: the client (and request) of
 * the model asked once when this review answers "unsure".
 */
export function aiMathReviewer(client: AiClient, request: ReviewRequest = MATH_REVIEW_REQUEST, retry?: { client: AiClient; request?: ReviewRequest }): MathReviewer {
  return {
    id: client.model,
    promptVersion: MATH_REVIEW_PROMPT_VERSION,
    ...(retry ? { retry: aiMathReviewer(retry.client, retry.request ?? MATH_REVIEW_RETRY_REQUEST) } : {}),
    review: async (input, signal) =>
      readMathReview(await client.json(
        { name: "maya_math_review", system: MATH_REVIEW_SYSTEM, content: [{ type: "text", text: JSON.stringify(input) }], schema: MATH_REVIEW_SCHEMA as unknown as Record<string, unknown>, effort: request.effort, maxTokens: request.maxTokens },
        signal,
      )),
  };
}

/**
 * Runs one review with the time limit, and never throws: a throw or a time-out is "unsure". Final check 8 (2026-11-15): a
 * malformed answer (not JSON, outside the schema, an unknown verdict) is a FINAL "unsure" for that sentence: no second
 * call of any kind, to the same model or to the retry, and the text adapter does not review that sentence again in the
 * same child turn, not even in the repair. A time-out and every other error are final too (final check 9: the text
 * adapter keeps every terminal result that is not "true" for its sentence for the rest of the child turn). Only a
 * well-formed "unsure" answer of the first review goes once
 * to `reviewer.retry`, inside the same time limit; the retry's answer is final and marked `retried` (its error or
 * time-out is "unsure"). The error's own text is never kept (a provider's message can hold a key): only fixed wording,
 * with the trace's fixed error code for a failed call.
 */
/** Final check 8: the results that came from a malformed review answer (the caller never reviews that sentence again). */
const malformedResults = new WeakSet<MathReviewResult>();
/** Final check 8 (2026-11-15): whether a result came from a malformed answer (not JSON, outside the schema, no verdict). */
export const fromMalformedAnswer = (r: MathReviewResult): boolean => malformedResults.has(r);
const MALFORMED_CODES = new Set(["bad_json", "schema_invalid"]);

export async function runMathReview(reviewer: MathReviewer, input: MathReviewInput, ms: number, onError?: (e: unknown) => void, hedgeMs: number = MATH_REVIEW_HEDGE_MS): Promise<MathReviewResult> {
  const once = (r: MathReviewer, signal: AbortSignal) => r.review(input, signal).catch((e: unknown) => {
    throw signal.aborted ? new Error("time is up") : e;
  });
  // 2026-11-15 (fallback rate): the first review with no answer after `hedgeMs` is sent once more, the same request beside
  // it (MATH_REVIEW_HEDGE_MS); the first answer counts. A malformed answer of either copy is an answer (final check 8: it is
  // final); a copy that fails with no answer waits for the other. The retry model is not hedged.
  const hedgedOnce = (r: MathReviewer, signal: AbortSignal) => hedged(hedgeDelay(hedgeMs, ms), signal, (copy) => r.review(input, copy), (e) => MALFORMED_CODES.has(classifyError(e, "model").code)).catch((e: unknown) => {
    throw signal.aborted ? new Error("time is up") : e;
  });
  let retrying = false;
  const failed = (e: unknown): MathReviewResult => {
    const text = e instanceof Error ? e.message : "";
    const what = retrying ? "the second math review" : "the math review";
    const code = classifyError(e, "model").code;
    const result: MathReviewResult = { verdict: "unsure", reason: text === "time is up" ? `${what} did not answer in time` : `${what} call failed (${code})`, ...(retrying ? { retried: true as const } : {}) };
    if (text !== "time is up" && MALFORMED_CODES.has(code)) malformedResults.add(result);
    return result;
  };
  try {
    return await withTimeLimit(ms, async (signal) => {
      const first = await hedgedOnce(reviewer, signal);
      // Final check 5: only a well-formed "unsure" goes to the retry; an answer outside the schema is final "unsure".
      if (first.verdict !== "unsure" || first.malformed || !reviewer.retry || signal.aborted) {
        const result: MathReviewResult = { verdict: first.verdict, reason: first.reason, ...(first.retried ? { retried: true as const } : {}) };
        if (first.malformed) malformedResults.add(result);
        return result;
      }
      retrying = true;
      try {
        const second = await once(reviewer.retry, signal);
        // Only the retry's own answer counts; a "retried" mark it carries is its own.
        const result: MathReviewResult = { verdict: second.verdict, reason: second.reason, retried: true as const };
        if (second.malformed) malformedResults.add(result);
        return result;
      } catch (e) {
        if (signal.aborted) throw new Error("time is up");
        onError?.(e);
        return failed(e);
      }
    });
  } catch (e) {
    onError?.(e);
    return failed(e);
  }
}

/**
 * A fake reviewer for tests: `answer` gives the result for each sentence (`call` counts from 0); "throw" fails the call,
 * "bad_json" fails it as an answer that is not JSON, "hang" never answers (the time limit ends it). It records every
 * request. By default every sentence is true.
 */
export function fakeMathReviewer(answer: (input: MathReviewInput, call: number) => MathReviewResult | "throw" | "bad_json" | "hang" = () => ({ verdict: "true", reason: "all true" }), id = "fake-math-review"): MathReviewer & { requests: MathReviewInput[] } {
  const requests: MathReviewInput[] = [];
  return {
    id,
    promptVersion: MATH_REVIEW_PROMPT_VERSION,
    requests,
    review: (input, signal) => {
      requests.push(structuredClone(input));
      const a = answer(input, requests.length - 1);
      if (a === "throw") return Promise.reject(new Error("the fake math review failed"));
      if (a === "bad_json") return Promise.reject(new Error("The model's answer was not valid JSON."));
      if (a === "hang") return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
      return Promise.resolve(a);
    },
  };
}
