// The OpenRouter adapter of the AI client (#183): the chat completions API with structured output (a strict JSON
// schema) and image input. Server only, and only with an OpenRouter API key. No SDK: one fetch per try, so tests fake
// fetch. API: https://openrouter.ai/docs/api/reference/overview (read 2026-10-16).
// provider.require_parameters: only providers that support every parameter sent (the JSON schema above all) get the
// request. Which providers may train on inputs is an account setting on OpenRouter (#182), not a request field.
import type { AiClient, AiJsonRequest, AiPart } from "@/lib/ai-client";
import { noteFenced } from "@/lib/ai-fenced";
import { openRouterJsonOutput } from "@/lib/ai-openrouter-schema";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/** One request stops after this long. A time-out, a lost connection, a 408, a 429 or a 5xx gets one more try. */
export const AI_REQUEST_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 16_000;

/** A prompt-cache breakpoint (Anthropic models through OpenRouter; 5 minutes, renewed by each read). */
const EPHEMERAL = { type: "ephemeral" } as const;

function part(p: AiPart) {
  if (p.type === "text") return { type: "text", text: p.text, ...(p.cache ? { cache_control: EPHEMERAL } : {}) };
  return { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${Buffer.from(p.data).toString("base64")}` } };
}

export interface OpenRouterProvider {
  only: string[];
  order: string[];
  allow_fallbacks: false;
  require_parameters: true;
  ignore?: string[];
  zdr?: true;
  data_collection?: "deny";
}

function body(model: string, request: AiJsonRequest, provider?: OpenRouterProvider) {
  const output = openRouterJsonOutput(model, request);
  return {
    model,
    stream: request.onText !== undefined,
    max_tokens: request.maxTokens ?? MAX_TOKENS,
    messages: [
      { role: "system", content: request.cacheSystem ? [{ type: "text", text: output.system, cache_control: EPHEMERAL }] : output.system },
      // OpenRouter parses the text first, then the images (its image guide).
      { role: "user", content: request.content.map(part) },
    ],
    ...(output.response_format ? { response_format: output.response_format } : {}),
    provider: provider ?? { require_parameters: true },
    ...(request.effort && request.effort !== "none" ? { reasoning: { effort: request.effort, exclude: true } } : {}),
    // Usage accounting: the answer (the last event of a stream) then holds its cost.
    ...(request.onCost ? { usage: { include: true } } : {}),
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

/** Exactly one outer Markdown code fence, ```json or ```, around the whole output: its inside, or null. */
const ONE_FENCE = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```$/i;

/**
 * The output as JSON. A request that sent `response_format` (`strict`) reads it as it is, as before. A request that went
 * out without it (the schema is in its instructions) also reads JSON inside exactly one outer ```json or ``` fence, and
 * notes it (ai-fenced.ts). Prose before or after, a second block, a fence inside, or an unclosed fence is still not JSON.
 * The caller checks the output against the same schema either way.
 */
function readOutput(content: string, strict: boolean): unknown {
  try {
    return JSON.parse(content);
  } catch {
    // Not plain JSON: only the one fence below may hold it.
  }
  const inside = strict ? null : ONE_FENCE.exec(content.trim())?.[1];
  if (inside !== undefined && inside !== null && !inside.includes("```")) {
    try {
      const value: unknown = JSON.parse(inside);
      noteFenced(value);
      return value;
    } catch {
      // Not JSON inside the fence either.
    }
  }
  throw new Error("the output is not valid JSON");
}

const reportCost = (cost: unknown, onCost?: (usd: number) => void) => {
  if (onCost && typeof cost === "number" && Number.isFinite(cost) && cost >= 0) onCost(cost);
};

/**
 * A streamed answer (server-sent events, D-341): each `data:` line is one chunk of the completion, and the output text
 * is the chunks' `delta.content` in order. `onText` gets the text so far after each chunk. The end is the same checks
 * as an answer sent whole: an error, a refusal, a finish reason other than "stop", or no output throws.
 */
async function readStream(res: Response, strict: boolean, onText: (soFar: string) => void, onCost?: (usd: number) => void): Promise<unknown> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("no output");
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finish: string | null = null;
  let native: string | null = null;
  const take = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "" || data === "[DONE]") return;
    let chunk: Completion & { choices?: { delta?: { content?: unknown; refusal?: string | null } }[] };
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    if (chunk.error) throw new Error(`OpenRouter error ${short(chunk.error.code)}: ${short(chunk.error.message)}`);
    reportCost((chunk as { usage?: { cost?: unknown } }).usage?.cost, onCost);
    const choice = chunk.choices?.[0] as (NonNullable<Completion["choices"]>[number] & { delta?: { content?: unknown; refusal?: string | null } }) | undefined;
    if (!choice) return;
    if (choice.error) throw new Error(`OpenRouter error ${short(choice.error.code)}: ${short(choice.error.message)}`);
    if (choice.delta?.refusal) throw new Error("the model refused");
    if (typeof choice.delta?.content === "string" && choice.delta.content !== "") {
      content += choice.delta.content;
      onText(content);
    }
    if (choice.finish_reason) finish = choice.finish_reason;
    if (choice.native_finish_reason) native = choice.native_finish_reason;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let at = buffer.indexOf("\n");
    while (at !== -1) {
      take(buffer.slice(0, at).replace(/\r$/, ""));
      buffer = buffer.slice(at + 1);
      at = buffer.indexOf("\n");
    }
    if (done) break;
  }
  if (buffer) take(buffer);
  if (native === "refusal") throw new Error("the model refused");
  if (finish !== "stop") throw new Error(`the model stopped: ${short(finish)} (${short(native)})`);
  if (!content.trim()) throw new Error("no output");
  return readOutput(content, strict);
}

/** One try: the parsed JSON output, or an error. Error messages hold codes and OpenRouter's words, never the output. */
async function once(fetch: typeof globalThis.fetch, init: RequestInit, signal: AbortSignal, timeout: number, strict: boolean, onDispatch?: () => void, onText?: (soFar: string) => void, onCost?: (usd: number) => void): Promise<unknown> {
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
  if (onText && res.ok && (res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    try {
      return await readStream(res, strict, onText, onCost);
    } catch (e) {
      if (signal.aborted) throw new Error("time is up");
      throw e;
    }
  }
  const text = await res.text().catch(() => "");
  let data: Completion | null = null;
  try {
    data = JSON.parse(text) as Completion;
  } catch {
    data = null;
  }
  reportCost((data as { usage?: { cost?: unknown } } | null)?.usage?.cost, onCost);
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
  return readOutput(content, strict);
}

export function openRouterClient({
  apiKey,
  model,
  fetch = globalThis.fetch,
  maxRetries = 1,
  timeout = AI_REQUEST_TIMEOUT_MS,
  onRequest,
  onDispatch,
  provider,
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
  /** Optional feature-owned route. The default route is unchanged. */
  provider?: OpenRouterProvider;
}): AiClient {
  return {
    model,
    async json(request, signal) {
      const sent = body(model, request, provider);
      const init: RequestInit = {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-openrouter-title": "Unica Learning" },
        body: JSON.stringify(sent),
      };
      // A request with `response_format` keeps its strict reading: a fenced output stays not JSON.
      const strict = "response_format" in sent;
      for (let attempt = 0; ; attempt++) {
        if (signal.aborted) throw new Error("time is up");
        await onRequest?.();
        if (signal.aborted) throw new Error("time is up");
        try {
          return await once(fetch, init, signal, timeout, strict, onDispatch, request.onText, request.onCost);
        } catch (e) {
          if (!(e instanceof Retryable) || attempt >= maxRetries || signal.aborted) throw e instanceof Retryable ? new Error(e.message) : e;
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
