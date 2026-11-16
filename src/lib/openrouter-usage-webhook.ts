import { createHash, timingSafeEqual } from "node:crypto";

export const WEBHOOK_MAX_BYTES = 1_048_576;
export const WEBHOOK_MAX_SPANS = 256;
export const WEBHOOK_TIMEOUT_MS = 8_000;

/** The entire persistence allowlist. No trace, span, request, user, or metadata objects cross this boundary. */
export interface ProviderReceipt {
  workspace_id: string;
  generation_id: string;
  occurred_at: string;
  model: string;
  api_key_id: string | null;
  cost_usd: number | null;
  input_cost_usd: number | null;
  output_cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

type Obj = Record<string, unknown>;
const object = (v: unknown): Obj => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("invalid");
  return v as Obj;
};
const list = (v: unknown): unknown[] => {
  if (!Array.isArray(v)) throw new Error("invalid");
  return v;
};

/** Read only named scalar attributes. Duplicate keys and ambiguous OTLP values are errors. */
function attributes(v: unknown, allowed: readonly string[]): Map<string, unknown> {
  const result = new Map<string, unknown>();
  for (const item of list(v ?? [])) {
    const a = object(item);
    if (typeof a.key !== "string" || !allowed.includes(a.key)) continue;
    if (result.has(a.key)) throw new Error("invalid");
    const value = object(a.value);
    const keys = Object.keys(value);
    if (keys.length !== 1 || !["stringValue", "intValue", "doubleValue"].includes(keys[0])) throw new Error("invalid");
    const kind = keys[0], scalar = value[kind];
    if (kind === "stringValue" && typeof scalar !== "string") throw new Error("invalid");
    if (kind === "doubleValue" && (typeof scalar !== "number" || !Number.isFinite(scalar))) throw new Error("invalid");
    if (kind === "intValue" && !(typeof scalar === "string" && /^-?\d+$/.test(scalar)) &&
      !(typeof scalar === "number" && Number.isSafeInteger(scalar))) throw new Error("invalid");
    result.set(a.key, scalar);
  }
  return result;
}

const prefix = "span.metadata.openrouter_generation.";
const allowed = [
  "gen_ai.response.id", "gen_ai.response.model", "gen_ai.request.model", "gen_ai.usage.total_cost",
  "gen_ai.usage.input_cost", "gen_ai.usage.output_cost", "gen_ai.usage.input_tokens", "gen_ai.usage.output_tokens",
  "gen_ai.usage.prompt_tokens", "gen_ai.usage.completion_tokens",
  `${prefix}workspace_id`, `${prefix}api_key_id`, `${prefix}api_key.id`, `${prefix}usage`,
];
const identity = (v: unknown): string => {
  const s = typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? String(v) : v;
  if (typeof s !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(s)) throw new Error("invalid");
  return s;
};
const number = (v: unknown): number | null => {
  if (v === undefined) return null;
  if (typeof v !== "number" && !(typeof v === "string" && /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v))) throw new Error("invalid");
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n >= 1_000_000) throw new Error("invalid");
  // A tiny nonzero decimal must never become a counted zero.
  if (n === 0 && typeof v === "string" && /[1-9]/.test(v.split(/[eE]/)[0])) throw new Error("invalid");
  return n;
};
const tokens = (v: unknown): number | null => {
  if (v === undefined) return null;
  if (typeof v !== "number" && !(typeof v === "string" && /^\d+$/.test(v))) throw new Error("invalid");
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0 || n > 2_147_483_647) throw new Error("invalid");
  return n;
};
function same<T>(a: T | null, b: T | null): T | null {
  if (a !== null && b !== null && a !== b) throw new Error("invalid");
  return a ?? b;
}

/**
 * Only generation observations carry a response id and generation totals. Provider attempts and timing spans do not.
 * OTLP parentSpanId is not a generation discriminator: a generation can have an external or grouping parent.
 * Never use traceId, spanId, names, or trace.metadata.* as a generation identity or an attribution source.
 * A malformed batch fails before any write; retrying it can never acknowledge only its valid portion.
 */
export function parseProviderReceipts(payload: unknown, workspaceId: string): ProviderReceipt[] {
  const workspace = identity(workspaceId);
  const receipts: ProviderReceipt[] = [];
  let count = 0;
  for (const resource of list(object(payload).resourceSpans)) {
    const r = object(resource);
    const service = attributes(object(r.resource).attributes, ["service.name"]).get("service.name");
    if (service !== "openrouter") throw new Error("invalid");
    for (const scope of list(r.scopeSpans)) {
      for (const span of list(object(scope).spans)) {
        if (++count > WEBHOOK_MAX_SPANS) throw new Error("invalid");
        const s = object(span);
        const a = attributes(s.attributes, allowed);
        const id = a.get("gen_ai.response.id");
        const hasCost = a.has("gen_ai.usage.total_cost") || a.has(`${prefix}usage`);
        // No generation accounting fields: an ordinary wrapper, attempt, or timing span.
        if (id === undefined && !hasCost) continue;
        // A response id alone cannot distinguish an incomplete generation from an attempt.
        if (!hasCost && !["gen_ai.usage.input_tokens", "gen_ai.usage.output_tokens",
          "gen_ai.usage.prompt_tokens", "gen_ai.usage.completion_tokens"].some((key) => a.has(key))) throw new Error("invalid");
        if (typeof id !== "string" || !/^gen-[a-zA-Z0-9_-]{1,196}$/.test(id)) throw new Error("invalid");
        const model = a.get("gen_ai.response.model") ?? a.get("gen_ai.request.model");
        if (typeof model !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_./:@+~-]{0,199}$/.test(model)) throw new Error("invalid");
        const suppliedWorkspace = a.get(`${prefix}workspace_id`);
        if (suppliedWorkspace !== undefined && identity(suppliedWorkspace) !== workspace) throw new Error("invalid");
        const nano = s.startTimeUnixNano;
        if (typeof nano !== "string" || !/^\d{1,20}$/.test(nano)) throw new Error("invalid");
        const ms = Number(BigInt(nano) / BigInt(1_000_000));
        if (ms < Date.UTC(2020, 0, 1) || ms >= Date.UTC(2100, 0, 1)) throw new Error("invalid");
        const keyA = a.get(`${prefix}api_key_id`), keyB = a.get(`${prefix}api_key.id`);
        receipts.push({
          workspace_id: workspace, generation_id: id, occurred_at: new Date(ms).toISOString(), model,
          api_key_id: same(keyA === undefined ? null : identity(keyA), keyB === undefined ? null : identity(keyB)),
          cost_usd: same(number(a.get("gen_ai.usage.total_cost")), number(a.get(`${prefix}usage`))),
          input_cost_usd: number(a.get("gen_ai.usage.input_cost")), output_cost_usd: number(a.get("gen_ai.usage.output_cost")),
          input_tokens: same(tokens(a.get("gen_ai.usage.input_tokens")), tokens(a.get("gen_ai.usage.prompt_tokens"))),
          output_tokens: same(tokens(a.get("gen_ai.usage.output_tokens")), tokens(a.get("gen_ai.usage.completion_tokens"))),
        });
      }
    }
  }
  return receipts;
}

export function webhookAuthorized(header: string | null, secret: string): boolean {
  // Hash both operands to fixed lengths before the constant-time comparison.
  if (!secret || secret.length < 32 || secret.length > 512) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(header ?? ""), digest(`Bearer ${secret}`));
}

async function boundedBody(request: Request, signal: AbortSignal): Promise<string> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > WEBHOOK_MAX_BYTES)) throw new Error("invalid");
  if (!request.body) throw new Error("invalid");
  const reader = request.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > WEBHOOK_MAX_BYTES) throw new Error("invalid");
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } finally {
    signal.removeEventListener("abort", abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export interface WebhookOptions {
  secret?: string;
  workspaceId?: string;
  write: (rows: ProviderReceipt[], signal: AbortSignal) => Promise<void>;
}

/** Authentication precedes body reads and the database. Only an empty authenticated test skips persistence. */
export async function receiveProviderUsage(request: Request, options: WebhookOptions): Promise<Response> {
  const response = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });
  if (!options.secret || !options.workspaceId) return response(503);
  if (!webhookAuthorized(request.headers.get("authorization"), options.secret)) return response(401);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || request.headers.has("content-encoding")) return response(415);
  const signal = AbortSignal.timeout(WEBHOOK_TIMEOUT_MS);
  let rows: ProviderReceipt[];
  try {
    const body: unknown = JSON.parse(await boundedBody(request, signal));
    // OpenRouter Test Connection uses an empty OTLP export. It must still authenticate and parse.
    if (request.headers.get("x-test-connection") === "true") {
      const o = object(body);
      if (Object.keys(o).some((k) => k !== "resourceSpans") || (o.resourceSpans !== undefined && list(o.resourceSpans).length !== 0)) return response(400);
      return response(204);
    }
    rows = parseProviderReceipts(body, options.workspaceId);
  } catch { return response(400); }
  if (!rows.length) return response(204);
  try {
    await options.write(rows, signal);
    return response(204);
  } catch { return response(503); }
}
