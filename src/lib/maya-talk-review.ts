// The review seam of Maya's free talk (D-197): a separate small AI call that judges one free-talk line against what Maya
// must never say to a child (NEVER_SAY in src/lib/maya/talk-review.ts). The text adapter (src/lib/maya-text.ts) asks
// it for every free-talk line that passed the code guards, before the line is said, with a time limit; a line is said
// only when the review passes. A failed call, a time-out or an answer outside the schema counts as a fail.
//
// The live reviewer goes through the AI client (OpenRouter on the site, MAYA_REVIEW_MODEL, default Claude Haiku 5.5:
// small and fast, and another model than Maya's). Tests use the fake below.
import { withTimeLimit, type AiClient } from "@/lib/ai-client";
import { CONVERSATION_REVIEW_SYSTEM, hideName, readTalkReview, TALK_REVIEW_PROMPT_VERSION, TALK_REVIEW_SCHEMA, TALK_REVIEW_SYSTEM, type Session, type TalkReviewInput, type TalkReviewResult } from "@/lib/maya";
import { classifyError } from "@/lib/maya-trace";

/** The review model when MAYA_REVIEW_MODEL is not set: an OpenRouter model id with structured output. */
export const REVIEW_DEFAULT_MODEL = "anthropic/claude-haiku-5.5";
/** The adapter's time limit for one review; a review that takes longer counts as a fail. */
export const REVIEW_TIME_LIMIT_MS = 8_000;
/** D-341, round 3: the review of a conversational reply as a whole must answer within this, or it counts as a fail. */
export const CONVERSATION_REVIEW_TIME_LIMIT_MS = 4_000;
/**
 * D-341, round 3: the conversational review thinks as little as Haiku allows. Measured on the 88 OK_TALK, NOT_OK_TALK and
 * NEVER_SAY lines (2026-11-12): minimal with 400 tokens gave the same verdicts as low with 2,000 (86 of 88, the same two
 * cautious fails), p50 0.85 s against 0.97 s; 200 tokens cut off four answers, which then counted as errors. The real
 * runs of round 4 cut off some at 400 too, so the limit is 1,000 (a short answer stops well before it).
 */
export const CONVERSATION_REVIEW_REQUEST = { effort: "minimal" as const, maxTokens: 1_000 };
/** The turns of the call the review reads, besides the line. */
const REVIEW_TURNS = 6;

export interface TalkReviewer {
  /** The model id, for the trace ("fake-review" for the fake). */
  readonly id: string;
  readonly promptVersion: string;
  /** The review of one line. May throw: the adapter counts a throw, and a time-out, as an error (a fail). */
  review(input: TalkReviewInput, signal: AbortSignal): Promise<TalkReviewResult>;
}

/** What the review reads for one line now: the line, the child's words Maya answers, and the last turns. */
export function reviewInput(session: Session, line: string, verdict: "wrong" | "right" | "none" = "none"): TalkReviewInput {
  // Round 4, P2-6: the child's name never reaches the review model either.
  const hide = (text: string) => hideName(text, session.variety.name);
  return {
    ...(session.conversational ? { conversation: true as const } : {}),
    ...(session.conversational && verdict === "wrong" ? { verdict } : {}),
    promptVersion: TALK_REVIEW_PROMPT_VERSION,
    line: hide(line),
    childTurn: session.turn ? hide(session.turn.text) : null,
    transcript: session.turns.slice(-REVIEW_TURNS).map((t) => ({ speaker: t.speaker, text: hide(t.text) })),
  };
}

/** The review through the AI client: one structured-output request per line. */
export function aiTalkReviewer(client: AiClient, options: { effort?: "minimal" | "low" | "medium" | "high"; conversation?: { effort: "minimal" | "low"; maxTokens: number } } = {}): TalkReviewer {
  const conversation = options.conversation ?? CONVERSATION_REVIEW_REQUEST;
  return {
    id: client.model,
    promptVersion: TALK_REVIEW_PROMPT_VERSION,
    review: async (input, signal) =>
      readTalkReview(await client.json(
        { name: "maya_talk_review", system: input.conversation ? CONVERSATION_REVIEW_SYSTEM : TALK_REVIEW_SYSTEM, content: [{ type: "text", text: JSON.stringify(input) }], schema: TALK_REVIEW_SCHEMA as unknown as Record<string, unknown>,
          ...(input.conversation ? { effort: conversation.effort, maxTokens: conversation.maxTokens } : { effort: options.effort ?? "low", maxTokens: 2_000 }) },
        signal,
      )),
  };
}

/**
 * Runs one review with the time limit, and never throws: a throw is an error, a time-out an error (both fail the
 * line). The error's own text is never kept (a provider's message can hold a key): only fixed wording, with the
 * trace's fixed error code for a failed call (`classifyError`: "the review call failed (http_429)", #604).
 */
export async function runReview(reviewer: TalkReviewer, input: TalkReviewInput, ms: number = REVIEW_TIME_LIMIT_MS, onError?: (e: unknown) => void): Promise<TalkReviewResult> {
  try {
    // A review that stops on the time limit's signal is a time-out too, whatever it throws.
    return await withTimeLimit(ms, (signal) => reviewer.review(input, signal).catch((e: unknown) => {
      throw signal.aborted ? new Error("time is up") : e;
    }));
  } catch (e) {
    onError?.(e);
    const text = e instanceof Error ? e.message : "";
    return { verdict: "error", reason: text === "time is up" ? "the review did not answer in time" : `the review call failed (${classifyError(e, "model").code})` };
  }
}

/**
 * A fake reviewer for tests and the scripted gate: `answer` gives the result for each line (`call` counts from 0);
 * "throw" fails the call, "hang" never answers (the time limit ends it). It records every request.
 */
export function fakeTalkReviewer(answer: (input: TalkReviewInput, call: number) => TalkReviewResult | "throw" | "hang" = () => ({ verdict: "pass" }), id = "fake-review"): TalkReviewer & { requests: TalkReviewInput[] } {
  const requests: TalkReviewInput[] = [];
  return {
    id,
    promptVersion: TALK_REVIEW_PROMPT_VERSION,
    requests,
    review: (input, signal) => {
      requests.push(structuredClone(input));
      const a = answer(input, requests.length - 1);
      if (a === "throw") return Promise.reject(new Error("the fake review failed"));
      if (a === "hang") return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
      return Promise.resolve(a);
    },
  };
}
