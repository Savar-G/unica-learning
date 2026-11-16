// The Anthropic adapter of the AI client (#183): the Claude Messages API, through the official SDK, with structured
// output (output_config.format, a JSON schema) and image input. Used by local samples and explicitly authorized,
// budgeted workbook API runs. Other site AI stays on its existing provider.
// API: https://platform.claude.com/docs/en/build-with-claude/structured-outputs (read 2026-10-31).
// Constrained output has limits (16 union-type parameters, 24 optional ones: the generator's item schemas have about
// 70 nullable fields). When the API refuses a schema, the adapter sends that request name with the schema in the
// instructions instead, and parses the JSON from the text; the caller checks the output's shape in both cases.
// fallbacks "default" (beta server-side-fallback-2026-07-01): a request the model declines is re-run on Anthropic's
// recommended fallback model inside the same call.
import Anthropic from "@anthropic-ai/sdk";
import type { AiClient, AiJsonRequest, AiPart } from "@/lib/ai-client";

/** The model when none is given: Claude Sonnet 5.5, the model the live site uses through OpenRouter. */
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 16_000;
class RequestGuardError extends Error {}

/** The tokens of one answer, for the caller's cost count. */
export interface AnthropicUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

function part(p: AiPart): Anthropic.Beta.BetaContentBlockParam {
  if (p.type === "text") return { type: "text", text: p.text };
  return { type: "image", source: { type: "base64", media_type: p.mediaType, data: Buffer.from(p.data).toString("base64") } };
}

const short = (s: unknown) => String(s ?? "").slice(0, 160);

/** The API refused the schema itself (too complex, or a feature it does not support), not the request. */
const schemaRefused = (e: unknown) =>
  e instanceof Anthropic.BadRequestError && /schema|union types|optional parameters|output_config/i.test(e.message);

/** The instructions for a request whose schema goes in the text. */
const schemaInText = (system: string, schema: Record<string, unknown>) =>
  `${system}\n\nAnswer with one JSON object and nothing else: no code fence, no words before or after it. It must match this JSON Schema exactly: give every property, and use null only where the schema allows null.\n${JSON.stringify(schema)}`;

/** The first complete JSON object in the text, from its first "{" to the "}" that closes it (strings read whole). */
function firstObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** The start of the text, on one line, for an error: what the model wrote instead of JSON. */
const head = (text: string) => JSON.stringify(text.slice(0, 300).replace(/\s+/g, " "));

/**
 * The JSON object in the text: the text itself, else its first complete object (words or a code fence around it, or a
 * note after it with braces of its own). When there is none, the error names why and quotes the first 300 characters.
 */
function jsonIn(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    const object = firstObject(text);
    if (object) {
      try {
        return JSON.parse(object);
      } catch (inner) {
        throw new Error(`the output is not valid JSON (${short(inner instanceof Error ? inner.message : inner)}): ${head(text)}`);
      }
    }
    throw new Error(`the output is not valid JSON (${object === null && text.includes("{") ? "an object that never closes" : short(e instanceof Error ? e.message : e)}): ${head(text)}`);
  }
}

export function anthropicClient({
  apiKey,
  model = ANTHROPIC_DEFAULT_MODEL,
  fetch,
  maxRetries = 2,
  timeout = 200_000,
  onUsage,
  onRequest,
  onDispatch,
  fetchWrapper,
  singleDispatch = false,
  fallbacks = true,
}: {
  apiKey: string;
  model?: string;
  /** For tests: the fetch the SDK uses. */
  fetch?: typeof globalThis.fetch;
  /** Tries after the first for a lost connection, a 408, 409, 429 or 5xx (the SDK's rule). */
  maxRetries?: number;
  timeout?: number;
  /** Called once for each answer that has usage, also when its output is refused or cut off. */
  onUsage?: (usage: AnthropicUsage) => void;
  /** Persist the request intent before each HTTP attempt, including a refused-schema retry. */
  onRequest?: () => Promise<void>;
  /** Record dispatch only after the intent and cancellation checks pass. */
  onDispatch?: () => void;
  /** A spending guard wraps the final transport, before its durable intent and dispatch hooks. */
  fetchWrapper?: (send: typeof globalThis.fetch) => typeof globalThis.fetch;
  /** Edit batches record one physical dispatch, so schema rejection must not issue another request. */
  singleDispatch?: boolean;
  /** Ask for the server-side fallback on a decline (default). Off for a model that has none, such as Claude Haiku 5.5. */
  fallbacks?: boolean;
}): AiClient {
  const baseFetch = fetch ?? globalThis.fetch;
  const trackedFetch: typeof globalThis.fetch = async (input, init) => {
    init?.signal?.throwIfAborted();
    try { await onRequest?.(); }
    catch (error) { throw new RequestGuardError(error instanceof Error ? error.message : "Request intent could not be saved"); }
    init?.signal?.throwIfAborted();
    onDispatch?.();
    return baseFetch(input, init);
  };
  const guarded = fetchWrapper ? fetchWrapper(trackedFetch) : trackedFetch;
  const transport: typeof globalThis.fetch = async (input, init) => {
    try { return await guarded(input, init); }
    catch (error) {
      if (error instanceof TypeError || error instanceof RequestGuardError) throw error;
      throw new RequestGuardError(error instanceof Error ? error.message : "Workbook request guard failed");
    }
  };
  const client = new Anthropic({ apiKey, maxRetries: singleDispatch ? 0 : maxRetries, timeout, fetch: transport });
  /** Request names whose schema the API refused: they go with the schema in the instructions. */
  const inText = new Set<string>();
  const send = (request: AiJsonRequest, signal: AbortSignal, constrained: boolean) =>
    client.beta.messages.create(
      {
        model,
        max_tokens: request.maxTokens ?? MAX_TOKENS,
        system: constrained ? request.system : schemaInText(request.system, request.schema),
        messages: [{ role: "user", content: request.content.map(part) }],
        thinking: { type: "adaptive" },
        output_config: {
          ...(constrained ? { format: { type: "json_schema" as const, schema: request.schema } } : {}),
          ...(request.effort && request.effort !== "none" && request.effort !== "minimal" ? { effort: request.effort } : {}),
        },
        ...(fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal },
    );
  return {
    model,
    async json(request: AiJsonRequest, signal: AbortSignal) {
      let message: Anthropic.Beta.BetaMessage;
      try {
        if (inText.has(request.name)) message = await send(request, signal, false);
        else {
          try {
            message = await send(request, signal, true);
          } catch (e) {
            if (singleDispatch || !schemaRefused(e) || signal.aborted) throw e;
            inText.add(request.name);
            message = await send(request, signal, false);
          }
        }
      } catch (e) {
        if (signal.aborted) throw new Error("time is up");
        if (e instanceof Anthropic.APIConnectionError && e.cause instanceof RequestGuardError) throw e.cause;
        if (e instanceof Anthropic.APIError) throw new Error(`Anthropic answered ${e.status ?? "no status"}: ${short(e.message)}`);
        throw new Error(`Anthropic could not be reached: ${short(e instanceof Error ? e.message : e)}`);
      }
      const u = message.usage;
      onUsage?.({
        model: message.model,
        inputTokens: u?.input_tokens ?? 0,
        outputTokens: u?.output_tokens ?? 0,
        cacheReadTokens: u?.cache_read_input_tokens ?? 0,
        cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
      });
      if (message.stop_reason === "refusal") throw new Error("the model refused");
      if (message.stop_reason !== "end_turn") throw new Error(`the model stopped: ${short(message.stop_reason)}`);
      const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      if (!text.trim()) throw new Error("no output");
      return jsonIn(text);
    },
  };
}
