import { aiClient, type AiClient } from "@/lib/ai-client";
import type { OpenRouterProvider } from "@/lib/ai-openrouter";

// Maya's OpenRouter route (D-337). Every request that carries a child's words for Maya (her model and its safety read, the
// free-talk review and the call note) goes only to Anthropic and Azure, never to Google: Google Cloud's Service Specific Terms (section 20(d),
// read 2026-11-12) do not allow its generative AI services in an online service directed to or likely to be used by people
// under 18. `require_parameters` keeps the parameters sent (a strict JSON schema, when the schema allows one).
// Other AI features keep the default route (#900). A zero-data-retention route on Amazon Bedrock is the next step, after
// its test with Maya's real schema.

export const MAYA_PROVIDER: OpenRouterProvider = {
  // Only the companies the privacy page names (D-337): a request without `response_format` (a schema too large for
  // Claude's strict output, src/lib/ai-openrouter-schema.ts) no longer limits the route by itself, and could otherwise
  // go to "Claude Platform on AWS" or Amazon Bedrock. No Google endpoint is in this list.
  only: ["anthropic", "azure"],
  require_parameters: true,
};

/** The AI client for a Maya request, on her route; null when the AI is off. Same arguments as `aiClient`. */
export function mayaAiClient(env: Readonly<Record<string, string | undefined>> = process.env, model?: string, hooks?: Omit<NonNullable<Parameters<typeof aiClient>[2]>, "provider">): AiClient | null {
  return aiClient(env, model, { ...hooks, provider: MAYA_PROVIDER });
}
