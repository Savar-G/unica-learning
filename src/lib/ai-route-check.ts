// The live check of the AI route (D-282): fixed requests with no child data through the real adapter, so an admin can see
// that OpenRouter serves the pinned route for what the features really send, and which provider answered. It is the check
// to run when the model or the route changes. Each request has no retry, so a refusal shows as it came. Admins press it:
// POST /api/admin/ai-route.
//
// The shapes. "small" reaches each model. The other three run on AI_MODEL, because a small request cannot prove them:
// "largest_schema_image" is the largest schema any feature sends (the workbook writer's ITEMS_SCHEMA, and its effort) with
// the image part a work review sends; "maya_proposal" is Maya's schema, effort and token limit as `aiMayaModel` sends them
// (src/lib/maya-model.ts); "image_read" asks what the image shows, so a pass means the model read it. The image is a
// 32 by 32 red square that this file holds. The words are about the sum 80 + 5.
import { AI_DEFAULT_MODEL, AI_SOLVE_DEFAULT_MODEL, type AiJsonRequest } from "@/lib/ai-client";
import { isClaudeModel, openRouterClient, providerWords } from "@/lib/ai-openrouter";
import { PROPOSAL_SCHEMA } from "@/lib/maya/proposal";
import { REVIEW_DEFAULT_MODEL } from "@/lib/maya-talk-review";
import { ITEMS_SCHEMA } from "@/lib/workbook-generator-items";

export type RouteShape = "small" | "largest_schema_image" | "maya_proposal" | "image_read" | "maya_proposal_main_route";

export interface RouteCheck {
  ok: boolean;
  shape: RouteShape;
  /** The model the request named. */
  requested: string;
  /** The size of the JSON schema sent. */
  schemaBytes: number;
  /** OpenRouter's HTTP status; null when no answer came. */
  status: number | null;
  /** The model and the provider OpenRouter says answered. */
  model: string | null;
  provider: string | null;
  error?: string;
  /** What the provider said on a refusal. Shown to admins here because this request holds no child data. */
  providerWords?: string;
}

const RED_SQUARE = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR42mM4ISdHU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULACXLED1gHZEpAAAAAElFTkSuQmCC"), (c) => c.charCodeAt(0));
const ANSWER_SCHEMA = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false };
/** Maya's schema without the keywords strict structured output does not take, as src/lib/maya-model.ts sends it. */
const { $schema: _schema, title: _title, ...MAYA_SCHEMA } = PROPOSAL_SCHEMA as unknown as Record<string, unknown>;
void _schema;
void _title;

const answerOf = (output: unknown) => String((output as { answer?: unknown } | null)?.answer ?? "");

/** Each shape's request, and what its output must hold to count as a pass. */
const MAYA_REQUEST: AiJsonRequest = {
  name: "route_check_proposal",
  system: "This is a test of a request's size. You are a math tutor. Fill every field of the JSON for one turn, with null or an empty list where a field has nothing. Answer with JSON only.",
  content: [{ type: "text", text: "The question is 80 + 5. The answer is 85. The child said: is it 85?" }],
  schema: MAYA_SCHEMA,
  effort: "low",
  maxTokens: 4_000,
};
const isProposal = (output: unknown) => typeof output === "object" && output !== null && "version" in output;

const CHECKS: Record<RouteShape, { request: AiJsonRequest; proves(output: unknown): boolean; mainRoute?: boolean }> = {
  small: {
    request: { name: "route_check", system: "You answer one sum. Answer with JSON only.", content: [{ type: "text", text: "What is 80 + 5?" }], schema: ANSWER_SCHEMA, effort: "low", maxTokens: 2000 },
    proves: (output) => answerOf(output).length > 0,
  },
  largest_schema_image: {
    request: {
      name: "route_check_items",
      system: "This is a test of a request's size. Answer with JSON only.",
      content: [{ type: "text", text: "There are no slots to fill. Answer with an empty items list." }, { type: "image", mediaType: "image/png", data: RED_SQUARE }],
      schema: ITEMS_SCHEMA,
      effort: "medium",
    },
    proves: (output) => Array.isArray((output as { items?: unknown } | null)?.items),
  },
  maya_proposal: { request: MAYA_REQUEST, proves: isProposal },
  // Today's route on main before D-282, for one comparison: no pin and no retention rule. The words are fixed.
  maya_proposal_main_route: { request: MAYA_REQUEST, proves: isProposal, mainRoute: true },
  image_read: {
    request: {
      name: "route_check_image",
      system: "You say what colour an image is. Answer with JSON only.",
      content: [{ type: "text", text: "What colour is this image? Answer with one word." }, { type: "image", mediaType: "image/png", data: RED_SQUARE }],
      schema: ANSWER_SCHEMA,
      effort: "medium",
      maxTokens: 2000,
    },
    proves: (output) => /red/i.test(answerOf(output)),
  },
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

/** The small check on each model, then the real-size checks on the model of the features that send them. */
export function routeChecks(env: Readonly<Record<string, string | undefined>> = process.env): { model: string; shape: RouteShape }[] {
  const models = routeCheckModels(env);
  return [
    ...models.map((model) => ({ model, shape: "small" as const })),
    ...(["largest_schema_image", "maya_proposal", "image_read", "maya_proposal_main_route"] as const).map((shape) => ({ model: models[0], shape })),
  ];
}

export async function checkAiRoute({ apiKey, model, shape = "small", fetch = globalThis.fetch, signal }: {
  apiKey: string;
  model: string;
  shape?: RouteShape;
  /** For tests: the fetch to use. */
  fetch?: typeof globalThis.fetch;
  signal: AbortSignal;
}): Promise<RouteCheck> {
  const { request, proves, mainRoute } = CHECKS[shape];
  const result: RouteCheck = { ok: false, shape, requested: model, schemaBytes: JSON.stringify(request.schema).length, status: null, model: null, provider: null };
  const seen: typeof globalThis.fetch = async (input, init) => {
    const sent = mainRoute ? { ...init, body: JSON.stringify({ ...JSON.parse(String(init?.body)), provider: { require_parameters: true } }) } : init;
    const res = await fetch(input, sent);
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
  let output: unknown;
  try {
    output = await openRouterClient({ apiKey, model, fetch: seen, maxRetries: 0 }).json(request, signal);
  } catch (e) {
    const words = providerWords(e);
    return { ...result, error: e instanceof Error ? e.message : String(e), ...(words ? { providerWords: words } : {}) };
  }
  // OpenRouter's name of the Vertex host is "Google" (its endpoint lists, read 2026-11-05).
  if (!mainRoute && isClaudeModel(model) && !/google/i.test(result.provider ?? "")) {
    return { ...result, error: `A provider off the route answered: ${result.provider ?? "not named"}` };
  }
  if (!proves(output)) return { ...result, error: "The output is not what the request asked for" };
  return { ...result, ok: true };
}
