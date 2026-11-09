import { aiClient } from "@/lib/ai-client";
import { EXPLANATION_MAX_BYTES, EXPLANATION_MAX_TOKENS, EXPLANATION_MODEL, type ExplanationClientFactory } from "@/lib/parent-problem-explanation";

/** Only transport usage is charge evidence. A missing or incompatible response retains the full reservation. */
export function explanationAiClient(env: Readonly<Record<string, string | undefined>> = process.env,
  base: typeof globalThis.fetch = globalThis.fetch): ExplanationClientFactory {
  return beforeAttempt => {
    let cost: number | null = null;
    const fetch: typeof globalThis.fetch = async (url, init) => {
      if (typeof init?.body !== "string") throw new Error("explanation_body");
      const body = JSON.parse(init.body);
      if (body.model !== EXPLANATION_MODEL || body.max_tokens !== EXPLANATION_MAX_TOKENS || body.stream !== false
        || body.reasoning?.effort !== "low" || body.provider?.require_parameters !== true) throw new Error("explanation_bounds");
      // The feature's verified bound uses USD per million tokens and no per-request charge.
      // Pin one provider so internal routing cannot add unreserved attempts. Shared-client retries still reserve separately.
      const text = JSON.stringify({ ...body, provider: { ...body.provider, only: ["anthropic"], allow_fallbacks: false,
        max_price: { prompt: 1, completion: 3, request: 0 } }, usage: { include: true } });
      if (Buffer.byteLength(text, "utf8") > EXPLANATION_MAX_BYTES) throw new Error("explanation_input_limit");
      const response = await base(url, { ...init, body: text });
      try {
        const data = JSON.parse(await response.clone().text());
        const usage = data.usage;
        // The configured model and verified per-request bound also cover provider-internal retries.
        if (data.model === EXPLANATION_MODEL && usage && typeof usage.cost === "number" && Number.isFinite(usage.cost)
          && usage.cost >= 0 && Number.isSafeInteger(usage.prompt_tokens) && usage.prompt_tokens >= 0
          && Number.isSafeInteger(usage.completion_tokens) && usage.completion_tokens >= 0) {
          const micros = Math.ceil(usage.cost * 1_000_000);
          if (Number.isSafeInteger(micros)) cost = micros;
        }
      } catch { /* Unknown usage keeps the full hold. Never infer zero from HTTP status. */ }
      return response;
    };
    // This feature uses only its dedicated key and model. Global or other feature credentials cannot enable it.
    const client = aiClient({ OPENROUTER_API_KEY: env.PARENT_EXPLANATION_API_KEY }, EXPLANATION_MODEL, { fetch, onRequest: async () => { try { await beforeAttempt(); } finally { cost = null; } } });
    return client ? { client, costMicros: () => cost } : null;
  };
}

/**
 * Whether "Explain this problem" can give an explanation at all: the feature's own client exists. explainParentProblem answers
 * `retry` for an uncached explanation when it does not. Builds the client only; makes no request. Other checks (the plan, marking,
 * the price row) are per request.
 */
export function explanationAvailable(env: Readonly<Record<string, string | undefined>> = process.env, base: typeof globalThis.fetch = globalThis.fetch): boolean {
  return explanationAiClient(env, base)(async () => {}) !== null;
}
