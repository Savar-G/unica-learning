import { aiClient, type AiClient } from "@/lib/ai-client";
import type { OpenRouterProvider } from "@/lib/ai-openrouter";
import { featureProduct } from "@/lib/ai-product-keys";
import { isLivekitModel, livekitCredentials, livekitInferenceFetch } from "@/lib/ai-livekit-inference";

// Maya's OpenRouter route (D-337). Every request that carries a child's words for Maya (her model and its safety read, the
// free-talk review and the call note) goes only to Anthropic and Azure, never to Google: Google Cloud's Service Specific Terms (section 20(d),
// read 2026-11-12) do not allow its generative AI services in an online service directed to or likely to be used by people
// under 18. `require_parameters` keeps the parameters sent (a strict JSON schema, when the schema allows one).
// Other AI features that read child data use the client's default route, which leaves out Google's endpoints too
// (NO_GOOGLE_PROVIDER in src/lib/ai-client.ts, #900). A zero-data-retention route on Amazon Bedrock is the next step, after
// its test with Maya's real schema.

export const MAYA_PROVIDER: OpenRouterProvider = {
  // Only the companies the privacy page names (D-337): a request without `response_format` (a schema too large for
  // Claude's strict output, src/lib/ai-openrouter-schema.ts) no longer limits the route by itself, and could otherwise
  // go to "Claude Platform on AWS" or Amazon Bedrock. No Google endpoint is in this list.
  only: ["anthropic", "azure"],
  // Azure first, Anthropic as the fallback. Measured once, 2026-11-13, on the conversational build (strict schema,
  // effort low, streamed, about 34 calls each): Azure had no schema refusal, no repair and no fallback; first sentence
  // p50 1.20 s against 1.24 s, full reply p95 2.62 s against 3.31 s.
  order: ["azure", "anthropic"],
  require_parameters: true,
};

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Maya's turn model when MAYA_MODEL is not set (D-349, 2026-11-20): OpenAI's GPT-5.4 mini on LiveKit Inference, paid
 * from the LiveKit Cloud credits. MAYA_MODEL=anthropic/claude-sonnet-5.5 goes back to Sonnet through OpenRouter.
 */
export const MAYA_DEFAULT_MODEL = "livekit/openai/gpt-5.4-mini";

let warnedNoLivekitKey = false;

/**
 * Maya's own turn model (D-349): MAYA_MODEL (an OpenRouter id, or a `livekit/` id for LiveKit Inference), else
 * MAYA_DEFAULT_MODEL. A `livekit/` model with no LiveKit key in this process gives AI_MODEL through OpenRouter instead,
 * so Maya never falls back to the rule player because one key is missing. Only the turn model (and its safety read)
 * reads MAYA_MODEL: the reviews, the call note and every other feature keep their own models.
 */
export function mayaTurnModel(env: Env = process.env): string | undefined {
  const chosen = env.MAYA_MODEL?.trim() || MAYA_DEFAULT_MODEL;
  if (isLivekitModel(chosen) && !livekitCredentials(env)) {
    if (!warnedNoLivekitKey) console.error(`[maya] ${chosen} needs LIVEKIT_API_KEY and LIVEKIT_API_SECRET; using AI_MODEL through OpenRouter`);
    warnedNoLivekitKey = true;
    return undefined;
  }
  return chosen;
}

/**
 * The network fetch of a Maya request for `model` (or AI_MODEL): LiveKit Inference for a `livekit/` model, else `base`.
 * The spending ledger's fetch wraps it, so each attempt is reserved before and settled with the cost it reads after.
 */
export function mayaTransport(env: Env, model: string | undefined, base: typeof globalThis.fetch = globalThis.fetch): typeof globalThis.fetch {
  const chosen = model?.trim() || env.AI_MODEL?.trim() || "";
  const credentials = isLivekitModel(chosen) ? livekitCredentials(env) : null;
  return credentials ? livekitInferenceFetch(credentials, base) : base;
}

/**
 * The AI client for a Maya request, on her route; null when the AI is off. Same arguments as `aiClient`. A `livekit/`
 * model goes to LiveKit Inference (D-349): with `hooks.fetch` (the spending ledger's), that fetch must already end in
 * `mayaTransport`; without it, the client sends through `mayaTransport` itself. No LiveKit key: no client.
 */
export function mayaAiClient(env: Env = process.env, model?: string, hooks?: Omit<NonNullable<Parameters<typeof aiClient>[2]>, "provider" | "usageProvider">): AiClient | null {
  const usage = hooks?.usage ?? { feature: "maya" as const };
  if (featureProduct(usage.feature) !== "maya") return null;
  const chosen = model?.trim() || env.AI_MODEL?.trim() || "";
  if (isLivekitModel(chosen)) {
    if (!livekitCredentials(env)) return null;
    return aiClient(env, chosen, { ...hooks, usage, provider: MAYA_PROVIDER, usageProvider: "livekit", fetch: hooks?.fetch ?? mayaTransport(env, chosen) });
  }
  return aiClient(env, model, { ...hooks, usage, provider: MAYA_PROVIDER });
}
