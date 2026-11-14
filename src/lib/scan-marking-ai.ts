// Use the existing AiClient/OpenRouter path. One admission per transport attempt. No subscription queue.
import { costingFetch, openRouterClient, type OpenRouterProvider } from "@/lib/ai-openrouter";
import { recordAiUsage, type AiUsageTag } from "@/lib/ai-usage";
import { MARKING_MODEL, type MarkingClientFactory } from "@/lib/scan-marking";
import models from "../../data/scan-marking-models.json";
import evaluationModels from "../../data/scan-marking-evaluation-models.json";

type MarkingEnv = Readonly<Record<string, string | undefined>>;
/** The pinned model marking would call (the route's, else SCAN_MARKING_MODEL or the default), or null when it is not pinned. */
function pinnedMarkingModel(env: MarkingEnv, route?: { model: string }) {
  const model = route?.model ?? (env.SCAN_MARKING_MODEL?.trim() || MARKING_MODEL);
  return [...models, ...(route ? evaluationModels : [])].find((m) => m.model === model) ?? null;
}

/** Whether marking can call a model at all: a key and a pinned model, the same checks markingAiClient's factory makes (#706). */
export function markingClientReady(env: MarkingEnv = process.env): boolean {
  const pinned = pinnedMarkingModel(env);
  return !!env.SCAN_MARKING_OPENROUTER_API_KEY?.trim() && !!pinned && !!productionRoute(pinned);
}

/**
 * #900 (D-337): production marking sends a child's page photo to Claude only on Anthropic or on Azure's global endpoint,
 * never Google (Google Cloud's terms do not allow its generative AI in a service likely to be used by people under 18).
 * Both list the same price as google-vertex/global, the endpoint the 2026-11-07 price proof was made for (OpenRouter,
 * 2026-11-13); azure/us costs 10% more, so it is not in the list. The evaluation tools keep the pinned endpoint of
 * data/scan-marking-models.json and pass their own route.
 */
export const MARKING_CLAUDE_ENDPOINTS: readonly string[] = ["anthropic", "azure/global"];
const GOOGLE_ENDPOINTS = ["google-vertex", "google-ai-studio"];
/** The production route of a pinned model, or null when it runs only on Google: then marking has no client (fails closed). */
function productionRoute(pinned: { model: string; endpoint: string }): OpenRouterProvider | null {
  if (pinned.model.startsWith("anthropic/")) {
    return { only: [...MARKING_CLAUDE_ENDPOINTS], order: [...MARKING_CLAUDE_ENDPOINTS], allow_fallbacks: false, require_parameters: true, ignore: GOOGLE_ENDPOINTS };
  }
  if (GOOGLE_ENDPOINTS.some((g) => pinned.endpoint === g || pinned.endpoint.startsWith(`${g}/`))) return null;
  return { only: [pinned.endpoint], order: [pinned.endpoint], allow_fallbacks: false, require_parameters: true,
    ignore: [`${pinned.endpoint}/flex`, `${pinned.endpoint}/priority`] };
}

export function markingAiClient(env: Readonly<Record<string, string | undefined>> = process.env, fetch?: typeof globalThis.fetch, route?: { model: string; provider: OpenRouterProvider; maxRetries?: number }, usage?: AiUsageTag): MarkingClientFactory {
  return (beforeAttempt) => {
    const apiKey = env.SCAN_MARKING_OPENROUTER_API_KEY?.trim();
    if (!apiKey) return null;
    const pinned = pinnedMarkingModel(env, route);
    if (!pinned) return null;
    const model = pinned.model;
    const provider = route?.provider ?? productionRoute(pinned);
    if (!provider) return null;
    let cost: number | null = null;
    const client = openRouterClient({
      apiKey, model,
      provider, maxRetries: route?.maxRetries,
      fetch: costingFetch((usd) => { cost = Math.ceil(usd * 1_000_000); }, fetch),
      onRequest: async () => { await beforeAttempt(); cost = null; },
      // The AI usage ledger (D-330) only reads the answer's usage; the admission and the cost above are untouched.
      onUsage: (u) => recordAiUsage(usage ?? { feature: "marking" }, { provider: "openrouter", model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.costUsd, generationId: u.id }),
    });
    return client ? { client, costMicros: () => cost } : null;
  };
}
