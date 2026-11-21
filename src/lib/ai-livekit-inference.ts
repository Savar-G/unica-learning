// LiveKit Inference behind the AI client, for Maya's models (#1137, D-349). A model id that starts with
// `livekit/` (for example `livekit/google/gemma-4-31b-it`) goes to LiveKit Cloud's OpenAI-compatible chat completions
// gateway instead of OpenRouter, authorized with a short LiveKit access token that has the inference grant (the
// worker's LIVEKIT_API_KEY and LIVEKIT_API_SECRET, or LIVEKIT_INFERENCE_API_KEY and LIVEKIT_INFERENCE_API_SECRET, as in
// @livekit/agents). The OpenRouter adapter (src/lib/ai-openrouter.ts) still builds and reads each request: this module
// is a fetch that rewrites the request for the gateway and adds each answer's cost from LiveKit's price list, so the
// strict JSON reading, streaming, retries and usage records stay the same. Docs read 2026-11-20:
// https://docs.livekit.io/agents/models/inference/ (zero data retention on every model and plan).
// Only Maya's clients use it (src/lib/maya-ai-route.ts): her turn model (MAYA_MODEL) and any
// review model set to a `livekit/` id. Usage records carry provider "livekit"; the spending ledger settles each attempt
// with the cost added here.
import { AccessToken } from "livekit-server-sdk";

export const LIVEKIT_MODEL_PREFIX = "livekit/";
export const LIVEKIT_INFERENCE_URL = "https://agent-gateway.livekit.cloud/v1/chat/completions";

/** USD per 1,000,000 tokens on the Scale plan, and the company that serves the model (LiveKit pricing data, 2026-11-20). */
export const LIVEKIT_LLM_PRICES: Readonly<Record<string, { input: number; cachedInput: number; output: number; servedBy: string }>> = {
  "google/gemma-4-31b-it": { input: 0.4, cachedInput: 0.2, output: 1.2, servedBy: "LiveKit" },
  "deepseek-ai/deepseek-v4.1-flash": { input: 0.3, cachedInput: 0.007, output: 1.2, servedBy: "Baseten" },
  "google/gemini-3.8-flash": { input: 0.75, cachedInput: 0.075, output: 3.75, servedBy: "Google" },
  "openai/gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5, servedBy: "Azure" },
  "openai/gpt-5.4": { input: 5, cachedInput: 0.5, output: 22.5, servedBy: "Azure" },
  "openai/gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2, servedBy: "Azure" },
  "openai/gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5, servedBy: "Azure" },
  "openai/gpt-6.1-terra": { input: 1, cachedInput: 0.05, output: 5, servedBy: "OpenAI" },
  "google/gemini-4-hydrogen": { input: 1.5, cachedInput: 0.075, output: 7.5, servedBy: "Google" },
  "moonshotai/kimi-k2.6": { input: 0.95, cachedInput: 0.95, output: 4, servedBy: "Vercel" },
  "xai/grok-4.3": { input: 1.25, cachedInput: 0.2, output: 2.5, servedBy: "xAI" },
  "xai/grok-4.7": { input: 2, cachedInput: 0.5, output: 6, servedBy: "xAI" },
};

export const isLivekitModel = (model: string) => model.startsWith(LIVEKIT_MODEL_PREFIX);
/** The gateway's own id of a `livekit/` model. */
export const livekitModelId = (model: string) => model.slice(LIVEKIT_MODEL_PREFIX.length);

type Env = Readonly<Record<string, string | undefined>>;
export interface LivekitCredentials { apiKey: string; apiSecret: string }

/** The LiveKit Cloud key for inference, as @livekit/agents resolves it; null when either part is missing. */
export function livekitCredentials(env: Env): LivekitCredentials | null {
  const apiKey = env.LIVEKIT_INFERENCE_API_KEY?.trim() || env.LIVEKIT_API_KEY?.trim();
  const apiSecret = env.LIVEKIT_INFERENCE_API_SECRET?.trim() || env.LIVEKIT_API_SECRET?.trim();
  return apiKey && apiSecret ? { apiKey, apiSecret } : null;
}

interface Usage { prompt_tokens?: unknown; completion_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown } | null; cost?: unknown }
const count = (n: unknown) => (typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null);

/** The cost of one answer in USD from its token counts; null for a model with no price here. */
export function livekitCost(model: string, usage: Usage): number | null {
  const price = LIVEKIT_LLM_PRICES[model];
  if (!price) return null;
  const input = count(usage.prompt_tokens);
  const output = count(usage.completion_tokens);
  if (input === null || output === null) return null;
  const cached = Math.min(input, count(usage.prompt_tokens_details?.cached_tokens) ?? 0);
  return ((input - cached) * price.input + cached * price.cachedInput + output * price.output) / 1e6;
}

/**
 * A JSON schema with a `type` beside every `const` and every `enum` of one kind of value. OpenAI's strict mode refuses a
 * schema position with no `type` ("schema must have a 'type' key", 2026-11-20); the added type says what the `const` or
 * `enum` already says, so other models read the same schema.
 */
export function typedSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(typedSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    // Property names, enum values and constants are data, not schema positions.
    if (key === "const" || key === "enum") out[key] = value;
    else if (key === "properties" && value && typeof value === "object") out[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typedSchema(v)]));
    else out[key] = typedSchema(value);
  }
  if (out.type === undefined) {
    const values = "const" in out ? [out.const] : Array.isArray(out.enum) ? out.enum : [];
    const kinds = new Set(values.map((v) => (v === null ? "null" : Number.isInteger(v) ? "integer" : typeof v)));
    if (values.length > 0 && kinds.size === 1) {
      const kind = [...kinds][0];
      if (["string", "integer", "number", "boolean", "null"].includes(kind)) out.type = kind;
    }
  }
  return out;
}

/**
 * Gemma has one reasoning level: any `reasoning_effort` but "none" turns full reasoning on (LiveKit docs, 2026-11-20). A
 * request that asks for little thinking ("minimal" or "low") goes without it: with it, one tutor turn took 14 s and ran
 * out of tokens (probe, 2026-11-20).
 */
const LOW_EFFORT = new Set(["minimal", "low"]);
const gemma = (model: unknown) => typeof model === "string" && livekitModelId(model).startsWith("google/gemma-");

type Body = Record<string, unknown> & { model?: unknown; messages?: unknown; max_tokens?: unknown; reasoning?: { effort?: unknown }; stream?: unknown };

/** The OpenRouter request body as a gateway request: its own model id, no OpenRouter fields, OpenAI parameter names. */
export function gatewayBody(sent: Body): Body {
  const { reasoning, max_tokens, ...rest } = sent;
  delete rest.provider;
  delete rest.usage;
  const strip = (content: unknown) => Array.isArray(content) ? content.map((p) => {
    if (!p || typeof p !== "object") return p;
    const part = { ...(p as Record<string, unknown>) };
    delete part.cache_control;
    return part;
  }) : content;
  const messages = Array.isArray(sent.messages)
    ? sent.messages.map((m: { role?: unknown; content?: unknown }) => ({ ...m, content: strip(m.content) }))
    : sent.messages;
  const format = rest.response_format as { json_schema?: { schema?: unknown } } | undefined;
  if (format?.json_schema?.schema) rest.response_format = { ...format, json_schema: { ...format.json_schema, schema: typedSchema(format.json_schema.schema) } };
  return {
    ...rest,
    model: typeof sent.model === "string" ? livekitModelId(sent.model) : sent.model,
    messages,
    ...(max_tokens !== undefined ? { max_completion_tokens: max_tokens } : {}),
    ...(reasoning && typeof reasoning.effort === "string" && !(gemma(sent.model) && LOW_EFFORT.has(reasoning.effort)) ? { reasoning_effort: reasoning.effort } : {}),
    ...(sent.stream === true ? { stream_options: { include_usage: true } } : {}),
  };
}

/** One answer's JSON with `usage.cost` set from LiveKit's price list (kept as it was when there is no usage or price). */
function priced(model: string, data: Record<string, unknown>): Record<string, unknown> {
  const usage = data.usage as Usage | undefined;
  if (!usage || typeof usage !== "object") return data;
  const cost = livekitCost(model, usage);
  return cost === null ? data : { ...data, usage: { ...usage, cost } };
}

/** Each `data:` line of a streamed answer with its usage priced. */
function pricedStream(model: string, body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const line = (text: string) => {
    if (!text.startsWith("data:")) return text;
    const data = text.slice(5).trim();
    if (data === "" || data === "[DONE]") return text;
    try { return `data: ${JSON.stringify(priced(model, JSON.parse(data)))}`; } catch { return text; }
  };
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, out) {
      buffer += decoder.decode(chunk, { stream: true });
      let at = buffer.indexOf("\n");
      while (at !== -1) {
        out.enqueue(encoder.encode(`${line(buffer.slice(0, at).replace(/\r$/, ""))}\n`));
        buffer = buffer.slice(at + 1);
        at = buffer.indexOf("\n");
      }
    },
    flush(out) { if (buffer) out.enqueue(encoder.encode(line(buffer))); },
  }));
}

/**
 * A fetch for the OpenRouter adapter that sends each request to LiveKit Inference instead. A fresh access token is made
 * when the last one is older than 5 minutes (it lives 10). `now` is for tests.
 */
export function livekitInferenceFetch(credentials: LivekitCredentials, base: typeof globalThis.fetch = globalThis.fetch, now: () => number = Date.now): typeof globalThis.fetch {
  let token: { jwt: string; at: number } | null = null;
  const jwt = async () => {
    if (!token || now() - token.at > 5 * 60_000) {
      const t = new AccessToken(credentials.apiKey, credentials.apiSecret, { identity: "maya-model", ttl: 600 });
      t.addInferenceGrant({ perform: true });
      token = { jwt: await t.toJwt(), at: now() };
    }
    return token.jwt;
  };
  return async (_input, init) => {
    const sent = JSON.parse(String(init?.body ?? "{}")) as Body;
    const body = gatewayBody(sent);
    const model = String(body.model);
    const res = await base(LIVEKIT_INFERENCE_URL, {
      ...init,
      cache: "no-store",
      redirect: "error",
      headers: { authorization: `Bearer ${await jwt()}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return res;
    if ((res.headers.get("content-type") ?? "").includes("text/event-stream") && res.body) {
      return new Response(pricedStream(model, res.body), { status: res.status, headers: res.headers });
    }
    const text = await res.text();
    try {
      return new Response(JSON.stringify(priced(model, JSON.parse(text))), { status: res.status, headers: res.headers });
    } catch {
      return new Response(text, { status: res.status, headers: res.headers });
    }
  };
}
