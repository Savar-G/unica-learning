// The decision client (spec #850, #851): one interface for closed-question AI calls. A decision model reads text and
// images and answers typed questions (yes/no, choice, score) with probabilities and a confidence, not with text. The live
// adapter is OpenRouter's Decisions API (src/lib/decision-openrouter.ts); tests use the fake (src/lib/decision-client-fake.ts).
// Behind a switch: on only when DECISIONS_OPENROUTER_API_KEY is set. Off, there is no client, so no decision call can
// happen. This module never reads OPENROUTER_API_KEY or SCAN_MARKING_OPENROUTER_API_KEY: decisions have their own key.
// An error, a time-out or a safety block is never a pass. Each caller states what it does instead (spec #850).
// For the server and local scripts only. No "server-only" import so that its tests can run, as src/lib/ai-client.ts.
import { openRouterDecisionClient } from "@/lib/decision-openrouter";
import { livePriceGuard, withPriceGuard, type PriceGuard } from "@/lib/decision-price";
import { recordAiUsage, type AiUsageTag } from "@/lib/ai-usage";

/** The model when DECISION_MODEL is not set, until the comparison (#851) picks one. */
export const DECISION_DEFAULT_MODEL = "typesafe/jev-1.14";

/** One decision model's pinned route, prices and limits. Prices are US dollars per million tokens. */
export interface DecisionModelTerms {
  /** The one OpenRouter provider slug the model is pinned to (no fallbacks). */
  provider: string;
  promptUsdPerM: number;
  completionUsdPerM: number;
  /** The most input tokens one request can hold. */
  contextTokens: number;
  /** The most output tokens one request can bill. */
  maxOutputTokens: number;
  /** When these terms were read from OpenRouter. */
  read: string;
}

/**
 * The decision models this code may call. Each is pinned to one provider: Jev reads images only on TypeSafe's own
 * endpoint, and Gemini Decision 1 has only Google AI Studio. Prices and limits are from OpenRouter's model and endpoint
 * API (/api/v1/models/<id>/endpoints), read 2026-11-11. A model that is not in this table has no client. Change a row only
 * after reading the endpoint again: the cost bound below depends on it. Gemini Decision 1 also lists a web search price
 * (USD 0.014 a search); no request here asks for web search, so the bound leaves it out.
 */
export const DECISION_MODELS: Readonly<Record<string, DecisionModelTerms>> = {
  "typesafe/jev-1.14": { provider: "typesafe", promptUsdPerM: 0.042, completionUsdPerM: 0, contextTokens: 262_144, maxOutputTokens: 235_929, read: "2026-11-11" },
  "google/gemini-decision-1": { provider: "google-ai-studio", promptUsdPerM: 0.1, completionUsdPerM: 0, contextTokens: 262_144, maxOutputTokens: 235_929, read: "2026-11-11" },
};

/** The terms of a model in DECISION_MODELS; throws for any other model. */
export function decisionModelTerms(model: string): DecisionModelTerms {
  const terms = Object.hasOwn(DECISION_MODELS, model) ? DECISION_MODELS[model] : undefined;
  if (!terms) throw new Error(`the decision model ${model} is not in the pinned model table`);
  return terms;
}

/**
 * The most one attempt of a request to `model` can cost, in US dollars: its whole context at the prompt price, plus its
 * most output tokens at the completion price when that price is above 0. A decision request bills input tokens only today.
 */
export function attemptCostBound(model: string): number {
  const t = decisionModelTerms(model);
  return (t.contextTokens * t.promptUsdPerM) / 1e6 + (t.completionUsdPerM > 0 ? (t.maxOutputTokens * t.completionUsdPerM) / 1e6 : 0);
}

/** The most one request can cost: the attempt bound times the client's most attempts. */
export function requestCostBound(client: Pick<DecisionClient, "model" | "maxAttempts">): number {
  return attemptCostBound(client.model) * client.maxAttempts;
}

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
  /**
   * Optional: the caller's last check. The client runs it after every wait that comes before a send (the live price
   * check included) and immediately before each attempt sends the input. False, or a throw, sends nothing: the request
   * fails with kind "cancelled".
   */
  beforeSend?: () => Promise<boolean>;
}

export interface DecisionResult {
  /** One answer per question key. */
  answers: Record<string, DecisionAnswer>;
  /**
   * The known part of what OpenRouter charged for the request, in US dollars, from the HTTP answers' usage: the sum over
   * every attempt that gave a cost, a charged failed attempt before a retry included; null when no attempt gave a cost.
   */
  usd: number | null;
  /** Attempts sent with no cost in their answer (a lost connection, a time-out, an answer without usage.cost). */
  unpricedAttempts: number;
  /** True only when every attempt gave its cost, so `usd` is the whole charge. */
  costKnown: boolean;
  /** The provider that answered, and OpenRouter's generation id. */
  provider: string | null;
  id: string | null;
}

/**
 * Why a decision failed. refused: the model declined a question. blocked: a provider safety block. timeout: no answer in
 * time, or the caller's signal stopped it. malformed: an answer that is not the typed answer asked for. unavailable: the
 * model or provider could not take or serve the request (an HTTP error, no connection). price: the live price of the
 * model was not shown to be at or below its pinned price (src/lib/decision-price.ts), so nothing was sent. cancelled: the
 * caller's `beforeSend` said no (or failed), so that attempt sent nothing.
 */
export type DecisionErrorKind = "refused" | "blocked" | "timeout" | "malformed" | "unavailable" | "price" | "cancelled";

export class DecisionError extends Error {
  readonly kind: DecisionErrorKind;
  /** The known part of what OpenRouter charged for the failed request, summed over its attempts; null when none gave a cost. */
  readonly usd: number | null;
  /** Attempts sent with no cost in their answer. */
  readonly unpricedAttempts: number;
  constructor(kind: DecisionErrorKind, message: string, usd: number | null = null, unpricedAttempts = 0) {
    super(message);
    this.name = "DecisionError";
    this.kind = kind;
    this.usd = usd;
    this.unpricedAttempts = unpricedAttempts;
  }
  /** True only when every attempt sent gave its cost. */
  get costKnown(): boolean {
    return this.unpricedAttempts === 0;
  }
}

export interface DecisionClient {
  /** The model id: a model in DECISION_MODELS. */
  readonly model: string;
  /** The most HTTP attempts one request can make (the first try and its retries). */
  readonly maxAttempts: number;
  /** One typed answer per question, or a DecisionError. */
  decide(request: DecisionRequest): Promise<DecisionResult>;
  /**
   * Optional: runs the checks that come before a request (the live price check) without sending one, so a caller can do
   * its own last check between them and `decide`. Throws the DecisionError that `decide` would throw for them.
   */
  ready?(signal: AbortSignal): Promise<void>;
}

/**
 * The client, or null when decisions are off (no DECISIONS_OPENROUTER_API_KEY). The model comes from `model`, else
 * DECISION_MODEL, else the default. A model that is not in DECISION_MODELS throws: it is never sent on an open route
 * or without a cost bound. Each request first passes the live price check (src/lib/decision-price.ts): once per process
 * and model, and again once a day. `priceGuard` replaces that check (tests).
 */
export function decisionClient(
  env: Readonly<Record<string, string | undefined>> = process.env,
  model?: string,
  hooks?: { fetch?: typeof globalThis.fetch; timeout?: number; maxRetries?: number; priceGuard?: PriceGuard; usage?: AiUsageTag },
): DecisionClient | null {
  const apiKey = env.DECISIONS_OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;
  const id = model?.trim() || env.DECISION_MODEL?.trim() || DECISION_DEFAULT_MODEL;
  const { provider } = decisionModelTerms(id);
  const { priceGuard, usage, ...rest } = hooks ?? {};
  const inner = withPriceGuard(openRouterDecisionClient({ apiKey, model: id, provider, ...rest }), priceGuard ?? livePriceGuard);
  // The usd each request already computes also goes to the AI usage ledger (D-330), a failed one that was charged included.
  // One reading for a request: `calls` is not known here, so it counts one.
  return {
    ...inner,
    async decide(request) {
      try {
        const result = await inner.decide(request);
        recordAiUsage(usage ?? { feature: "other" }, { provider: "openrouter", model: id, costUsd: result.usd, generationId: result.id });
        return result;
      } catch (e) {
        if (e instanceof DecisionError && e.usd !== null) recordAiUsage(usage ?? { feature: "other" }, { provider: "openrouter", model: id, costUsd: e.usd });
        throw e;
      }
    },
  };
}
