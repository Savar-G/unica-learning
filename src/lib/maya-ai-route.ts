import { aiClient, type AiClient } from "@/lib/ai-client";
import type { OpenRouterProvider } from "@/lib/ai-openrouter";

// Maya's OpenRouter route (D-337). Every request that carries a child's words for Maya (her model and its safety read, the
// free-talk review and the call note) leaves out Google's endpoints: Google Cloud's Service Specific Terms (section 20(d),
// read 2026-11-12) do not allow its generative AI services in an online service directed to or likely to be used by people
// under 18. `require_parameters` keeps the strict JSON schema: an endpoint that cannot give structured output is not used.
// Other AI features keep the default route (#900). A zero-data-retention route on Amazon Bedrock is the next step, after
// its test with Maya's real schema.

export const MAYA_PROVIDER: OpenRouterProvider = {
  ignore: ["google-vertex", "google-ai-studio"],
  require_parameters: true,
};

/** The AI client for a Maya request, on her route; null when the AI is off. Same arguments as `aiClient`. */
export function mayaAiClient(env: Readonly<Record<string, string | undefined>> = process.env, model?: string, hooks?: Omit<NonNullable<Parameters<typeof aiClient>[2]>, "provider">): AiClient | null {
  return aiClient(env, model, { ...hooks, provider: MAYA_PROVIDER });
}
