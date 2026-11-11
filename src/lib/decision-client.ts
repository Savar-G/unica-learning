// The decision client (spec #850, #851): one interface for closed-question AI calls. A decision model reads text and
// images and answers typed questions (yes/no, choice, score) with probabilities and a confidence, not with text. The live
// adapter is OpenRouter's Decisions API (src/lib/decision-openrouter.ts); tests use the fake (src/lib/decision-client-fake.ts).
// Behind a switch: on only when DECISIONS_OPENROUTER_API_KEY is set. Off, there is no client, so no decision call can
// happen. This module never reads OPENROUTER_API_KEY or SCAN_MARKING_OPENROUTER_API_KEY: decisions have their own key.
// An error, a time-out or a safety block is never a pass. Each caller states what it does instead (spec #850).
// For the server and local scripts only. No "server-only" import so that its tests can run, as src/lib/ai-client.ts.
import { openRouterDecisionClient } from "@/lib/decision-openrouter";

/** The model when DECISION_MODEL is not set, until the comparison (#851) picks one. */
export const DECISION_DEFAULT_MODEL = "typesafe/jev-1.14";

/**
 * The one provider each decision model is pinned to (no fallbacks), by OpenRouter provider slug. Jev reads images only on
 * TypeSafe's own endpoint, and Gemini Decision 1 has only Google AI Studio (OpenRouter endpoints, read 2026-11-11). A
 * model that is not listed has no client.
 */
export const DECISION_PROVIDERS: Readonly<Record<string, string>> = {
  "typesafe/jev-1.14": "typesafe",
  "google/gemini-decision-1": "google-ai-studio",
};

/** One part of what the model reads: text, or an image as bytes (PNG or JPEG). */
export type DecisionPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/png" | "image/jpeg"; data: Uint8Array };

/** One closed question. */
export type DecisionQuestion =
  /** Yes or no. `yes` and `no` say when each answer applies. */
  | { type: "noul"; instructions: string; yes?: string; no?: string }
  /** One of a set of options, by key, each with a description. */
  | { type: "choice"; instructions: string; options: Readonly<Record<string, string>> }
  /** One of a set of ordered levels, lowest first (level 0). */
  | { type: "score"; instructions: string; levels: readonly string[] };

/** One answer, of the same type as its question. Every probability and confidence is from 0 to 1. */
export type DecisionAnswer =
  /** `yes`: the probability of yes. */
  | { type: "noul"; yes: number; confidence: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  /** `score`: the expected level; `probabilities[n]`: the probability of level n. */
  | { type: "score"; score: number; probabilities: number[]; confidence: number };

export interface DecisionRequest {
  input: readonly DecisionPart[];
  /** By key: letters, digits, "_" and "-". */
  questions: Readonly<Record<string, DecisionQuestion>>;
  signal: AbortSignal;
}

export interface DecisionResult {
  /** One answer per question key. */
  answers: Record<string, DecisionAnswer>;
  /**
   * What OpenRouter charged for the request, in US dollars, from the HTTP answers' usage: the sum over every attempt, a
   * charged failed attempt before a retry included; null when no attempt gave a cost.
   */
  usd: number | null;
  /** The provider that answered, and OpenRouter's generation id. */
  provider: string | null;
  id: string | null;
}

/**
 * Why a decision failed. refused: the model declined a question. blocked: a provider safety block. timeout: no answer in
 * time, or the caller's signal stopped it. malformed: an answer that is not the typed answer asked for. unavailable: the
 * model or provider could not take or serve the request (an HTTP error, no connection).
 */
export type DecisionErrorKind = "refused" | "blocked" | "timeout" | "malformed" | "unavailable";

export class DecisionError extends Error {
  readonly kind: DecisionErrorKind;
  /** What OpenRouter charged for the failed request, summed over its attempts, in US dollars; null when none gave a cost. */
  readonly usd: number | null;
  constructor(kind: DecisionErrorKind, message: string, usd: number | null = null) {
    super(message);
    this.name = "DecisionError";
    this.kind = kind;
    this.usd = usd;
  }
}

export interface DecisionClient {
  /** The model id ("fake" for the fake). */
  readonly model: string;
  /** One typed answer per question, or a DecisionError. */
  decide(request: DecisionRequest): Promise<DecisionResult>;
}

/**
 * The client, or null when decisions are off (no DECISIONS_OPENROUTER_API_KEY). The model comes from `model`, else
 * DECISION_MODEL, else the default. A model with no pinned provider throws: it is never sent on an open route.
 */
export function decisionClient(
  env: Readonly<Record<string, string | undefined>> = process.env,
  model?: string,
  hooks?: { fetch?: typeof globalThis.fetch; timeout?: number; maxRetries?: number },
): DecisionClient | null {
  const apiKey = env.DECISIONS_OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;
  const id = model?.trim() || env.DECISION_MODEL?.trim() || DECISION_DEFAULT_MODEL;
  const provider = DECISION_PROVIDERS[id];
  if (!provider) throw new Error(`no pinned provider for the decision model ${id}`);
  return openRouterDecisionClient({ apiKey, model: id, provider, ...hooks });
}
