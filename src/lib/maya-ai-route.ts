import { aiClient, type AiClient } from "@/lib/ai-client";
import type { OpenRouterProvider } from "@/lib/ai-openrouter";

// Maya's OpenRouter route (D-337). Every request that carries a child's words for Maya (her model and its safety read, the
// free-talk review and the call note) goes only to endpoints that OpenRouter lists as zero data retention. `zdr: true`
// holds for the fallbacks too, so a fallback is still ZDR. `require_parameters` keeps the strict JSON schema: an endpoint
// that cannot give structured output is not used. The order is the fastest ZDR endpoints for Claude Sonnet 5.5 and Haiku 5.5
// on 2026-11-12 (OpenRouter's ZDR list and its latency data). Other AI features keep the default route.

export const MAYA_PROVIDER: OpenRouterProvider = {
  zdr: true,
  require_parameters: true,
  order: ["google-vertex/us", "google-vertex/global", "amazon-bedrock/us-east-1"],
  allow_fallbacks: true,
};

/** The AI client for a Maya request, on her ZDR route; null when the AI is off. Same arguments as `aiClient`. */
export function mayaAiClient(env: Readonly<Record<string, string | undefined>> = process.env, model?: string, hooks?: Omit<NonNullable<Parameters<typeof aiClient>[2]>, "provider">): AiClient | null {
  return aiClient(env, model, { ...hooks, provider: MAYA_PROVIDER });
}
