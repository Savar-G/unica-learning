// The OpenRouter adapter of the AI client (#183): the chat completions API with structured output (a strict JSON
// schema) and image input. Server only, and only with an OpenRouter API key. No SDK: one fetch per try, so tests fake
// fetch. API: https://openrouter.ai/docs/api/reference/overview (read 2026-10-16).
// provider.require_parameters: only providers that support every parameter sent (the JSON schema above all) get the
// request. Which providers may train on inputs is an account setting on OpenRouter (#182), not a request field.
import type { AiClient, AiJsonRequest, AiPart } from "@/lib/ai-client";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/** One request stops after this long. A time-out, a lost connection, a 408, a 429 or a 5xx gets one more try. */
export const AI_REQUEST_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 16_000;

function part(p: AiPart) {
  if (p.type === "text") return { type: "text", text: p.text };
  return { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${Buffer.from(p.data).toString("base64")}` } };
}

function body(model: string, request: AiJsonRequest) {
  return {
    model,
    stream: false,
    max_tokens: request.maxTokens ?? MAX_TOKENS,
    messages: [
      { role: "system", content: request.system },
      // OpenRouter parses the text first, then the images (its image guide).
      { role: "user", content: request.content.map(part) },
    ],
    response_format: { type: "json_schema", json_schema: { name: request.name, strict: true, schema: request.schema } },
    provider: { require_parameters: true },
    ...(request.effort ? { reasoning: { effort: request.effort, exclude: true } } : {}),
  };
}

/** An error worth one more try: a time-out, a lost connection, a 408, a 429 or a 5xx. */
class Retryable extends Error {}

interface ErrorBody {
  code?: number | string;
  message?: string;
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
async function once(fetch: typeof globalThis.fetch, init: RequestInit, signal: AbortSignal, timeout: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]) });
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
  if (!res.ok) {
    const error = `OpenRouter answered ${res.status}: ${short(data?.error?.message ?? text)}`;
    throw retryableStatus(res.status) ? new Retryable(error) : new Error(error);
  }
  if (!data) throw new Error("OpenRouter answered 200 with a body that is not JSON");
  // After the provider accepts the request, OpenRouter reports a failure inside a 200 answer.
  if (data.error) throw new Error(`OpenRouter error ${short(data.error.code)}: ${short(data.error.message)}`);
  const choice = data.choices?.[0];
  if (!choice) throw new Error("OpenRouter answered with no choices");
  if (choice.error) throw new Error(`OpenRouter error ${short(choice.error.code)}: ${short(choice.error.message)}`);
  if (choice.message?.refusal) throw new Error("the model refused");
  if (choice.native_finish_reason === "refusal") throw new Error("the model refused");
  if (choice.finish_reason !== "stop") throw new Error(`the model stopped: ${short(choice.finish_reason)} (${short(choice.native_finish_reason)})`);
  const content = choice.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("no output");
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("the output is not valid JSON");
  }
}

export function openRouterClient({
  apiKey,
  model,
  fetch = globalThis.fetch,
  maxRetries = 1,
  timeout = AI_REQUEST_TIMEOUT_MS,
}: {
  apiKey: string;
  model: string;
  /** For tests: the fetch to use. */
  fetch?: typeof globalThis.fetch;
  maxRetries?: number;
  timeout?: number;
}): AiClient {
  return {
    model,
    async json(request, signal) {
      const init: RequestInit = {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-openrouter-title": "Unica Learning" },
        body: JSON.stringify(body(model, request)),
      };
      for (let attempt = 0; ; attempt++) {
        try {
          return await once(fetch, init, signal, timeout);
        } catch (e) {
          if (!(e instanceof Retryable) || attempt >= maxRetries || signal.aborted) throw e instanceof Retryable ? new Error(e.message) : e;
        }
      }
    },
  };
}
