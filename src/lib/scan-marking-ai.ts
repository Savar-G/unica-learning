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
  return !!env.SCAN_MARKING_OPENROUTER_API_KEY?.trim() && !!pinnedMarkingModel(env);
}

export function markingAiClient(env: Readonly<Record<string, string | undefined>> = process.env, fetch?: typeof globalThis.fetch, route?: { model: string; provider: OpenRouterProvider; maxRetries?: number }, usage?: AiUsageTag): MarkingClientFactory {
  return (beforeAttempt) => {
    const apiKey = env.SCAN_MARKING_OPENROUTER_API_KEY?.trim();
    if (!apiKey) return null;
    const pinned = pinnedMarkingModel(env, route);
    if (!pinned) return null;
    const model = pinned.model;
    const provider = route?.provider ?? { only: [pinned.endpoint], order: [pinned.endpoint], allow_fallbacks: false as const, require_parameters: true as const,
      ignore: [`${pinned.endpoint}/flex`, `${pinned.endpoint}/priority`],
    };
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
