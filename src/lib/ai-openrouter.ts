// The OpenRouter adapter of the AI client (#183): the chat completions API with structured output (a strict JSON
// schema) and image input. Server only, and only with an OpenRouter API key. No SDK: one fetch per try, so tests fake
// fetch. API: https://openrouter.ai/docs/api/reference/overview (read 2026-10-16).
// provider.require_parameters: only providers that support every parameter sent (the JSON schema above all) get the
// request.
//
// The route (D-282). Children's work and words go through this client, so every request carries its data policy, not
// only the account settings (#182): `zdr: true` (zero data retention endpoints only) and `data_collection: "deny"` (no
// provider that may train on inputs). A request for a Claude model (`anthropic/...` on OpenRouter) is pinned to Google
// Vertex (`only` and `order`, with `allow_fallbacks: false`), so it never goes to another host of the same model. Vertex,
// not Anthropic's own endpoint: OpenRouter's list of zero data retention endpoints (`/api/v1/endpoints/zdr`, read
// 2026-11-05) has no endpoint hosted by Anthropic, so that pin would refuse every request; of the hosts it lists for
// Claude Sonnet 5.5 and Haiku 5.5, Vertex alone supports `structured_outputs`, at the same price. When no allowed
// endpoint can serve a request, OpenRouter answers 404 and the request fails with a plain message; nothing widens the
// route. Whether Safety Retention endpoints may serve a ZDR request is an account setting on OpenRouter, not a request
// field: it stays off (docs, AGENTS.md). Fields from https://openrouter.ai/docs/guides/routing/provider-selection and
// https://openrouter.ai/docs/guides/features/zdr (read 2026-11-05). Live check: POST /api/admin/ai-route.
//
// Constrained decoding (D-282). Claude's constrained output refuses a schema with more than 16 union-type fields; Maya's
// proposal has 33 and the workbook writer's items have 73 (the provider's words, 2026-11-05). Such a schema goes in the
// instructions, on the same route, decided from the schema before the first request, so it never costs a refused call.
// If the provider still says a schema is too complex, that request goes once more in the instructions and that request
// name stays there. Nothing then holds the model to the schema: the callers' own checks judge the output, as they always
// do, and output that is not JSON is the same failure as before.
import type { AiClient, AiJsonRequest, AiPart } from "@/lib/ai-client";
import { firstObject, overConstrainedLimit, schemaInText } from "@/lib/ai-schema-text";

/** OpenRouter's slug of the host of every Claude model here (D-282). */
export const CLAUDE_PROVIDER = "google-vertex";

/** A Claude model: pinned to `CLAUDE_PROVIDER`. */
export const isClaudeModel = (model: string) => model.startsWith("anthropic/");

/** The route in words, for an error message. */
const routeWords = (model: string) => isClaudeModel(model) ? "Google Vertex only, zero data retention, no training" : "zero data retention, no training";

/** The provider routing of every request for `model` (D-282). */
export function providerRoute(model: string) {
  const policy = { require_parameters: true, zdr: true, data_collection: "deny" as const };
  if (!isClaudeModel(model)) return policy;
  return { order: [CLAUDE_PROVIDER], only: [CLAUDE_PROVIDER], allow_fallbacks: false, ...policy };
}

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/** One request stops after this long. A time-out, a lost connection, a 408, a 429 or a 5xx gets one more try. */
export const AI_REQUEST_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 16_000;

function part(p: AiPart) {
  if (p.type === "text") return { type: "text", text: p.text };
  return { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${Buffer.from(p.data).toString("base64")}` } };
}

function body(model: string, request: AiJsonRequest, constrained: boolean) {
  return {
    model,
    stream: false,
    max_tokens: request.maxTokens ?? MAX_TOKENS,
    messages: [
      { role: "system", content: constrained ? request.system : schemaInText(request.system, request.schema) },
      // OpenRouter parses the text first, then the images (its image guide).
      { role: "user", content: request.content.map(part) },
    ],
    ...(constrained ? { response_format: { type: "json_schema", json_schema: { name: request.name, strict: true, schema: request.schema } } } : {}),
    provider: providerRoute(model),
    ...(request.effort ? { reasoning: { effort: request.effort, exclude: true } } : {}),
  };
}

/** An error worth one more try: a time-out, a lost connection, a 408, a 429 or a 5xx. */
class Retryable extends Error {}

/**
 * What the provider said on a failed request (OpenRouter's `error.metadata`). It can repeat request text, which can be a
 * child's words, so it is never in an error's message and never on the error object: a log line that prints the error
 * cannot print it. Only code that names `providerWords` reads it.
 */
const WORDS_LIMIT = 2_000;
const wordsOf = new WeakMap<Error, string>();
export const providerWords = (e: unknown): string | null => (e instanceof Error ? wordsOf.get(e) ?? null : null);

function withWords<E extends Error>(error: E, metadata: ErrorBody["metadata"]): E {
  if (metadata?.raw === undefined || metadata.raw === null) return error;
  const raw = typeof metadata.raw === "string" ? metadata.raw : JSON.stringify(metadata.raw);
  wordsOf.set(error, `${metadata.provider_name ? `${metadata.provider_name}: ` : ""}${raw}`.slice(0, WORDS_LIMIT));
  return error;
}

interface ErrorBody {
  code?: number | string;
  message?: string;
  metadata?: { raw?: unknown; provider_name?: string };
}
interface Completion {
  error?: ErrorBody;
  choices?: {
    finish_reason?: string | null;
    native_finish_reason?: string | null;
    error?: ErrorBody;
    message?: { content?: unknown; refusal?: string | null };
  }[];
}

const short = (s: unknown) => String(s ?? "").slice(0, 160);
const retryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

/** One try: the parsed JSON output, or an error. Error messages hold codes and OpenRouter's words, never the output. */
async function once(fetch: typeof globalThis.fetch, init: RequestInit, signal: AbortSignal, timeout: number, route: string, constrained: boolean, onDispatch?: () => void): Promise<unknown> {
  let res: Response;
  try {
    const options = { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]) };
    onDispatch?.();
    res = await fetch(OPENROUTER_URL, options);
  } catch (e) {
    if (signal.aborted) throw new Error("time is up");
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new Retryable(timedOut ? `OpenRouter did not answer in time (${timeout} ms)` : `OpenRouter could not be reached: ${short(e instanceof Error ? e.message : e)}`);
  }
  const text = await res.text().catch(() => "");
  let data: Completion | null = null;
  try {
    data = JSON.parse(text) as Completion;
  } catch {
    data = null;
  }
  if (res.status === 404) {
    // No endpoint meets the route (D-282). Never retried, never sent another way.
    throw withWords(new Error(`OpenRouter has no endpoint for this request on the allowed route (${route}): 404 ${short(data?.error?.message ?? text)}`), data?.error?.metadata);
  }
  if (!res.ok) {
    const error = `OpenRouter answered ${res.status}: ${short(data?.error?.message ?? text)}`;
    throw withWords(retryableStatus(res.status) ? new Retryable(error) : new Error(error), data?.error?.metadata);
  }
  if (!data) throw new Error("OpenRouter answered 200 with a body that is not JSON");
  // After the provider accepts the request, OpenRouter reports a failure inside a 200 answer.
  if (data.error) throw withWords(new Error(`OpenRouter error ${short(data.error.code)}: ${short(data.error.message)}`), data.error.metadata);
  const choice = data.choices?.[0];
  if (!choice) throw new Error("OpenRouter answered with no choices");
  if (choice.error) throw new Error(`OpenRouter error ${short(choice.error.code)}: ${short(choice.error.message)}`);
  if (choice.message?.refusal) throw new Error("the model refused");
  if (choice.native_finish_reason === "refusal") throw new Error("the model refused");
  if (choice.finish_reason !== "stop") throw new Error(`the model stopped: ${short(choice.finish_reason)} (${short(choice.native_finish_reason)})`);
  const content = choice.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("no output");
  // With no constrained decoding the model can put words or a code fence around the object.
  const json = constrained ? content : firstObject(content);
  try {
    if (json === null) throw new Error("no object");
    return JSON.parse(json);
  } catch {
    throw new Error("the output is not valid JSON");
  }
}

/** The provider refused the schema itself, not the request (its words: too many union-type or optional fields). */
const schemaRefused = (e: unknown) => /union types|optional parameters|schema is too complex|compilation/i.test(providerWords(e) ?? "");

export function openRouterClient({
  apiKey,
  model,
  fetch = globalThis.fetch,
  maxRetries = 1,
  timeout = AI_REQUEST_TIMEOUT_MS,
  onRequest,
  onDispatch,
}: {
  apiKey: string;
  model: string;
  /** For tests: the fetch to use. */
  fetch?: typeof globalThis.fetch;
  maxRetries?: number;
  timeout?: number;
  onRequest?: () => Promise<void>;
  /** Synchronous observation immediately before fetch, after the durable permission and abort check. */
  onDispatch?: () => void;
}): AiClient {
  /** Request names whose schema the provider refused: they go with the schema in the instructions. */
  const inText = new Set<string>();
  return {
    model,
    async json(request, signal) {
      let constrained = !inText.has(request.name) && !(isClaudeModel(model) && overConstrainedLimit(request.schema));
      const init = (): RequestInit => ({
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-openrouter-title": "Unica Learning" },
        body: JSON.stringify(body(model, request, constrained)),
      });
      for (let attempt = 0; ; attempt++) {
        if (signal.aborted) throw new Error("time is up");
        await onRequest?.();
        if (signal.aborted) throw new Error("time is up");
        try {
          return await once(fetch, init(), signal, timeout, routeWords(model), constrained, onDispatch);
        } catch (e) {
          if (constrained && !signal.aborted && schemaRefused(e)) {
            inText.add(request.name);
            constrained = false;
            attempt--;
            continue;
          }
          if (!(e instanceof Retryable) || attempt >= maxRetries || signal.aborted) {
            if (!(e instanceof Retryable)) throw e;
            const plain = new Error(e.message);
            const words = wordsOf.get(e);
            if (words) wordsOf.set(plain, words);
            throw plain;
          }
        }
      }
    },
  };
}

/**
 * A fetch that asks OpenRouter for each answer's cost (usage accounting) and passes it to `onCost` in US dollars, for a
 * caller that keeps the cost of its calls (the workbook solve check, #312). An answer with no cost passes nothing.
 */
export function costingFetch(onCost: (usd: number) => void, base: typeof globalThis.fetch = globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    let body = init?.body;
    if (typeof body === "string") {
      try {
        body = JSON.stringify({ ...JSON.parse(body), usage: { include: true } });
      } catch {
        // Not JSON: sent as it is.
      }
    }
    const res = await base(input, { ...init, body });
    try {
      const cost = (JSON.parse(await res.clone().text()) as { usage?: { cost?: unknown } }).usage?.cost;
      if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) onCost(cost);
    } catch {
      // No JSON answer: no cost.
    }
    return res;
  };
}
