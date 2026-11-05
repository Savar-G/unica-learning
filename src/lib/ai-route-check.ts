// The live check of the AI route (D-282): one fixed request with no child data through the real adapter, so an admin can
// see that OpenRouter serves the pinned route, and which provider answered. It is the check to run when the model or the
// route changes. Its one request has no retry, so a refusal shows as it came. Admins press it: POST /api/admin/ai-route.
import { AI_DEFAULT_MODEL, AI_SOLVE_DEFAULT_MODEL, type AiJsonRequest } from "@/lib/ai-client";
import { isClaudeModel, openRouterClient } from "@/lib/ai-openrouter";
import { REVIEW_DEFAULT_MODEL } from "@/lib/maya-talk-review";

export interface RouteCheck {
  ok: boolean;
  /** The model the request named. */
  requested: string;
  /** OpenRouter's HTTP status; null when no answer came. */
  status: number | null;
  /** The model and the provider OpenRouter says answered. */
  model: string | null;
  provider: string | null;
  error?: string;
}

/** The request: fixed words, a schema like the real features use, thinking on as they have it. */
const REQUEST: AiJsonRequest = {
  name: "route_check",
  system: "You answer one sum. Answer with JSON only.",
  content: [{ type: "text", text: "What is 80 + 5?" }],
  schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false },
  effort: "low",
  maxTokens: 2000,
};

/** Each model this deployment's features name, once. */
export function routeCheckModels(env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  const named = (value: string | undefined, fallback: string) => value?.trim() || fallback;
  return [...new Set([
    named(env.AI_MODEL, AI_DEFAULT_MODEL),
    named(env.AI_SOLVE_MODEL, AI_SOLVE_DEFAULT_MODEL),
    named(env.MAYA_REVIEW_MODEL, REVIEW_DEFAULT_MODEL),
  ])];
}

export async function checkAiRoute({ apiKey, model, fetch = globalThis.fetch, signal }: {
  apiKey: string;
  model: string;
  /** For tests: the fetch to use. */
  fetch?: typeof globalThis.fetch;
  signal: AbortSignal;
}): Promise<RouteCheck> {
  const result: RouteCheck = { ok: false, requested: model, status: null, model: null, provider: null };
  const seen: typeof globalThis.fetch = async (input, init) => {
    const res = await fetch(input, init);
    result.status = res.status;
    try {
      const answer = JSON.parse(await res.clone().text()) as { model?: unknown; provider?: unknown };
      if (typeof answer.model === "string") result.model = answer.model;
      if (typeof answer.provider === "string") result.provider = answer.provider;
    } catch {
      // No JSON answer: the adapter reports it.
    }
    return res;
  };
  try {
    await openRouterClient({ apiKey, model, fetch: seen, maxRetries: 0 }).json(REQUEST, signal);
  } catch (e) {
    return { ...result, error: e instanceof Error ? e.message : String(e) };
  }
  // OpenRouter's name of the Vertex host is "Google" (its endpoint lists, read 2026-11-05).
  if (isClaudeModel(model) && !/google/i.test(result.provider ?? "")) {
    return { ...result, error: `A provider off the route answered: ${result.provider ?? "not named"}` };
  }
  return { ...result, ok: true };
}
