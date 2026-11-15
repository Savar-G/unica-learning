// The seam of the tutor core's math-truth review (two-layer true math, the Chief of Staff's design of 2026-11-15): one
// small AI call that judges one sentence of Maya's against code's facts of the question (MATH_REVIEW_SYSTEM in
// src/lib/maya/math-review.ts). The text adapter (src/lib/maya-text.ts) asks it for each tutor sentence that code's claim
// reader did not read whole (tutor.ts unreadMath), beside the safety review, before the sentence is said, with the
// review's time limit. Only "true" lets the sentence be said. A failed call, a time-out or an answer outside the schema
// counts as "unsure".
//
// The live reviewer goes through the AI client (OpenRouter, MAYA_MATH_REVIEW_MODEL, default Claude Haiku 5.5, with the
// same key as Maya). Its attempts are counted in Maya's spend as review attempts (docs/maya-spend.md). Tests use the fake.
import { withTimeLimit, type AiClient } from "@/lib/ai-client";
import { MATH_REVIEW_PROMPT_VERSION, MATH_REVIEW_SCHEMA, MATH_REVIEW_SYSTEM, readMathReview, type MathReviewInput, type MathReviewResult } from "@/lib/maya/math-review";
import { classifyError } from "@/lib/maya-trace";

/** The review model when MAYA_MATH_REVIEW_MODEL is not set: an OpenRouter model id with structured output. */
export const MATH_REVIEW_DEFAULT_MODEL = "anthropic/claude-haiku-5.5";
/** The request: little thinking, a short answer (a held sentence waits for it). */
export const MATH_REVIEW_REQUEST = { effort: "low" as const, maxTokens: 1_500 };

export interface MathReviewer {
  /** The model id, for the trace ("fake-math-review" for the fake). */
  readonly id: string;
  readonly promptVersion: string;
  /** The review of one sentence. May throw: the adapter counts a throw, and a time-out, as "unsure". */
  review(input: MathReviewInput, signal: AbortSignal): Promise<MathReviewResult>;
}

/** The review through the AI client: one structured-output request per sentence. */
export function aiMathReviewer(client: AiClient, request: { effort: "minimal" | "low" | "medium"; maxTokens: number } = MATH_REVIEW_REQUEST): MathReviewer {
  return {
    id: client.model,
    promptVersion: MATH_REVIEW_PROMPT_VERSION,
    review: async (input, signal) =>
      readMathReview(await client.json(
        { name: "maya_math_review", system: MATH_REVIEW_SYSTEM, content: [{ type: "text", text: JSON.stringify(input) }], schema: MATH_REVIEW_SCHEMA as unknown as Record<string, unknown>, effort: request.effort, maxTokens: request.maxTokens },
        signal,
      )),
  };
}

/**
 * Runs one review with the time limit, and never throws: a throw or a time-out is "unsure". An answer that is not JSON
 * (bad_json) is asked again once, at once, inside the same time limit: only a second failure is "unsure". A time-out is
 * never asked again (it used the time), and no other error is either. The error's own text is never kept (a provider's
 * message can hold a key): only fixed wording, with the trace's fixed error code for a failed call.
 */
export async function runMathReview(reviewer: MathReviewer, input: MathReviewInput, ms: number, onError?: (e: unknown) => void): Promise<MathReviewResult> {
  const once = (signal: AbortSignal) => reviewer.review(input, signal).catch((e: unknown) => {
    throw signal.aborted ? new Error("time is up") : e;
  });
  try {
    return await withTimeLimit(ms, async (signal) => {
      try {
        return await once(signal);
      } catch (e) {
        if (signal.aborted || classifyError(e, "model").code !== "bad_json") throw e;
        onError?.(e);
        return await once(signal);
      }
    });
  } catch (e) {
    onError?.(e);
    const text = e instanceof Error ? e.message : "";
    return { verdict: "unsure", reason: text === "time is up" ? "the math review did not answer in time" : `the math review call failed (${classifyError(e, "model").code})` };
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
