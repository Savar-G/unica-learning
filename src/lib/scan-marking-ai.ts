// Use the existing AiClient/OpenRouter path. One admission per transport attempt. No subscription queue.
import { aiClient } from "@/lib/ai-client";
import { costingFetch } from "@/lib/ai-openrouter";
import { MARKING_MODEL, type MarkingClientFactory } from "@/lib/scan-marking";

export function markingAiClient(env: Readonly<Record<string, string | undefined>> = process.env, fetch?: typeof globalThis.fetch): MarkingClientFactory {
  return (beforeAttempt) => {
    let cost: number | null = null;
    const client = aiClient(env, MARKING_MODEL, {
      fetch: costingFetch((usd) => { cost = Math.ceil(usd * 1_000_000); }, fetch),
      onRequest: async () => { await beforeAttempt(); cost = null; },
    });
    return client ? { client, costMicros: () => cost } : null;
  };
}
