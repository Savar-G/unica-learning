// Use the existing AiClient/OpenRouter path. One admission per transport attempt. No subscription queue.
import { costingFetch, openRouterClient, type OpenRouterProvider } from "@/lib/ai-openrouter";
import { MARKING_MODEL, type MarkingClientFactory } from "@/lib/scan-marking";
import models from "../../data/scan-marking-models.json";

export function markingAiClient(env: Readonly<Record<string, string | undefined>> = process.env, fetch?: typeof globalThis.fetch, route?: { model: string; provider: OpenRouterProvider; maxRetries?: number }): MarkingClientFactory {
  return (beforeAttempt) => {
    const apiKey = env.SCAN_MARKING_OPENROUTER_API_KEY?.trim();
    if (!apiKey) return null;
    const model = route?.model ?? (env.SCAN_MARKING_MODEL?.trim() || MARKING_MODEL);
    const pinned = models.find(m => m.model === model);
    if (!pinned) return null;
    const provider = route?.provider ?? { only: [pinned.endpoint], order: [pinned.endpoint], allow_fallbacks: false as const, require_parameters: true as const,
      ignore: [`${pinned.endpoint}/flex`, `${pinned.endpoint}/priority`],
    };
    let cost: number | null = null;
    const client = openRouterClient({
      apiKey, model,
      provider, maxRetries: route?.maxRetries,
      fetch: costingFetch((usd) => { cost = Math.ceil(usd * 1_000_000); }, fetch),
      onRequest: async () => { await beforeAttempt(); cost = null; },
    });
    return client ? { client, costMicros: () => cost } : null;
  };
}
