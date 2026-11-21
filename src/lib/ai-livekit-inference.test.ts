import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const usageRows = vi.hoisted(() => [] as { provider: string; model: string; costUsd: number | null }[]);
vi.mock("@/lib/ai-usage", async (load) => ({
  ...(await load<typeof import("@/lib/ai-usage")>()),
  recordAiUsage: (_tag: unknown, reading: { provider: string; model: string; costUsd: number | null }) => { usageRows.push({ provider: reading.provider, model: reading.model, costUsd: reading.costUsd }); },
}));

import { callModel, callReviewer } from "@/lib/maya-call-seams";
import { mayaAiClient, MAYA_DEFAULT_MODEL, MAYA_PROVIDER } from "@/lib/maya-ai-route";
import { LIVEKIT_INFERENCE_URL, livekitCost } from "@/lib/ai-livekit-inference";
import { OPENROUTER_URL } from "@/lib/ai-openrouter";
import { createSpendLedger, spendConfig, usdToMicros } from "@/lib/maya-spend";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { TUTOR_OUTPUT_SCHEMA } from "@/lib/maya/tutor-prompt";

// D-348: Maya's turn model is GPT-5.4 mini on LiveKit Inference by default, paid from the LiveKit Cloud credits.
// MAYA_MODEL names another model; MAYA_MODEL=anthropic/claude-sonnet-5.5 goes back to Sonnet through OpenRouter.

const base = { MAYA_OPENROUTER_API_KEY: "test-key", AI_MODEL: "anthropic/claude-sonnet-5.5", NODE_ENV: "test", LIVEKIT_API_KEY: "lk-key", LIVEKIT_API_SECRET: "lk-secret-that-is-long-enough-for-hs256" };
const gemma = { ...base, MAYA_MODEL: "livekit/google/gemma-4-31b-it" };
const request = { name: "maya_reply", system: "s", cacheSystem: true as const, content: [{ type: "text" as const, text: "stable", cache: true as const }, { type: "text" as const, text: "turn" }], schema: { type: "object", additionalProperties: false, properties: { say: { type: "string" } }, required: ["say"] }, effort: "low" as const, maxTokens: 1_500 };
const usage = { prompt_tokens: 1_000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 400 } };
const signal = () => new AbortController().signal;
const claimsOf = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
const P = "00000000-0000-4000-8000-0000000000a1", C = "00000000-0000-4000-8000-0000000000c1";
const call = { id: "00000000-0000-4000-8000-0000000000f1", kind: "chat", parentId: P, childId: C };

let sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
function answer(make: () => Response) {
  sent = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return make();
  }));
}
const whole = () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{\"say\":\"Hi\"}" } }], usage }), { status: 200, headers: { "content-type": "application/json" } });
const streamed = () => new Response([
  `data: ${JSON.stringify({ choices: [{ delta: { content: "{\"say\":" } }] })}`,
  `data: ${JSON.stringify({ choices: [{ delta: { content: "\"Hi\"}" }, finish_reason: "stop" }] })}`,
  `data: ${JSON.stringify({ choices: [], usage })}`,
  "data: [DONE]", "",
].join("\n"), { status: 200, headers: { "content-type": "text/event-stream" } });

function meter() {
  let n = 0;
  const now = Date.parse("2026-11-20T18:00:00Z");
  const store = memorySpendStore({ clock: () => now });
  const ledger = createSpendLedger({ store, clock: () => now, config: spendConfig({}), zone: async () => "America/Vancouver", alert: async () => {} });
  return { ledger, store, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` };
}

beforeEach(() => { sent = []; usageRows.length = 0; });
afterEach(() => vi.unstubAllGlobals());

describe("Maya's turn model on LiveKit Inference (D-348)", () => {
  it("is GPT-5.4 mini on LiveKit by default; its reviews stay on OpenRouter's Maya route", async () => {
    answer(whole);
    const model = callModel(null, base)!;
    expect(model.id).toBe(MAYA_DEFAULT_MODEL);
    expect(MAYA_DEFAULT_MODEL).toBe("livekit/openai/gpt-5.4-mini");
    await model.propose({} as never, signal()).catch(() => {});
    expect(sent.map((s) => s.url)).toEqual([LIVEKIT_INFERENCE_URL]);
    expect(sent[0].body.model).toBe("openai/gpt-5.4-mini");
    sent = [];
    await callReviewer(model.id, base)!.review({} as never, signal()).catch(() => {});
    expect(sent.map((s) => s.url)).toEqual([OPENROUTER_URL]);
    expect(sent[0].body.provider).toEqual(MAYA_PROVIDER);
  });

  it("MAYA_MODEL=anthropic/claude-sonnet-5.5 goes back to Sonnet through OpenRouter's Maya route", async () => {
    answer(whole);
    const model = callModel(null, { ...base, MAYA_MODEL: "anthropic/claude-sonnet-5.5" })!;
    expect(model.id).toBe("anthropic/claude-sonnet-5.5");
    await model.propose({} as never, signal()).catch(() => {});
    expect(sent.map((s) => s.url)).toEqual([OPENROUTER_URL]);
    expect(sent[0].body.provider).toEqual(MAYA_PROVIDER);
  });

  it("without a LiveKit key, a new call uses AI_MODEL through OpenRouter, never the rule player", async () => {
    answer(whole);
    const model = callModel(null, { ...base, LIVEKIT_API_KEY: undefined })!;
    expect(model.id).toBe("anthropic/claude-sonnet-5.5");
    await model.propose({} as never, signal()).catch(() => {});
    expect(sent.map((s) => s.url)).toEqual([OPENROUTER_URL]);
  });

  it("a call keeps the model it started with when the setting changes", async () => {
    answer(whole);
    const sonnet = callModel("anthropic/claude-sonnet-5.5", base)!;
    expect(sonnet.id).toBe("anthropic/claude-sonnet-5.5");
    await sonnet.propose({} as never, signal()).catch(() => {});
    expect(sent.map((s) => s.url)).toEqual([OPENROUTER_URL]);
    sent = [];
    const mini = callModel(MAYA_DEFAULT_MODEL, { ...base, MAYA_MODEL: "anthropic/claude-sonnet-5.5" })!;
    expect(mini.id).toBe(MAYA_DEFAULT_MODEL);
    await mini.propose({} as never, signal()).catch(() => {});
    expect(sent.map((s) => s.url)).toEqual([LIVEKIT_INFERENCE_URL]);
  });

  it("a metered turn reserves before the attempt and settles it with LiveKit's cost; the usage record says livekit", async () => {
    answer(whole);
    const m = meter();
    const model = callModel(null, base, { ...m, call })!;
    await model.propose({} as never, signal()).catch(() => {});
    expect(sent.map((s) => s.url)).toEqual([LIVEKIT_INFERENCE_URL]);
    // The ledger's own field never reaches the gateway.
    expect(sent[0].body).not.toHaveProperty("usage");
    const usd = livekitCost("openai/gpt-5.4-mini", usage)!;
    expect(usd).toBeCloseTo((600 * 0.75 + 400 * 0.075 + 100 * 4.5) / 1e6, 12);
    const rows = m.store.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ what: "model", settled: true, cost: usdToMicros(usd, m.ledger.config) });
    expect(usageRows).toEqual([{ provider: "livekit", model: MAYA_DEFAULT_MODEL, costUsd: usd }]);
  });

  it("sends a livekit/ model to the gateway with an inference token and OpenAI parameters, and prices the answer", async () => {
    answer(whole);
    const costs: number[] = [];
    const out = await mayaAiClient(gemma, gemma.MAYA_MODEL)!.json({ ...request, effort: "high", onCost: (usd) => costs.push(usd) }, signal());
    expect(out).toEqual({ say: "Hi" });
    const [{ url, headers, body }] = sent;
    expect(url).toBe(LIVEKIT_INFERENCE_URL);
    const claims = claimsOf(headers.authorization.replace(/^Bearer /, ""));
    expect(claims.iss).toBe("lk-key");
    expect(claims.inference).toEqual({ perform: true });
    expect(body.model).toBe("google/gemma-4-31b-it");
    for (const field of ["provider", "usage", "max_tokens", "reasoning"]) expect(body).not.toHaveProperty(field);
    expect(body.max_completion_tokens).toBe(1_500);
    expect(body.reasoning_effort).toBe("high");
    expect(JSON.stringify(body.messages)).not.toContain("cache_control");
    expect((body.response_format as { json_schema: { strict: boolean } }).json_schema.strict).toBe(true);
    expect(costs).toHaveLength(1);
    expect(costs[0]).toBeCloseTo((600 * 0.4 + 400 * 0.2 + 100 * 1.2) / 1e6, 12);
  });

  it("reads a streamed answer with its usage priced", async () => {
    answer(streamed);
    const costs: number[] = [];
    const texts: string[] = [];
    const out = await mayaAiClient(base, MAYA_DEFAULT_MODEL)!.json({ ...request, onText: (t) => texts.push(t), onCost: (usd) => costs.push(usd) }, signal());
    expect(out).toEqual({ say: "Hi" });
    expect(sent[0].body.stream).toBe(true);
    expect(sent[0].body.stream_options).toEqual({ include_usage: true });
    expect(texts.at(-1)).toBe("{\"say\":\"Hi\"}");
    expect(costs[0]).toBeCloseTo(livekitCost("openai/gpt-5.4-mini", usage)!, 12);
  });

  it("gives every const and single-kind enum a type, as OpenAI's strict mode needs, and changes nothing else in Maya's tutor schema", async () => {
    answer(whole);
    await mayaAiClient(base, MAYA_DEFAULT_MODEL)!.json({ ...request, schema: TUTOR_OUTPUT_SCHEMA as unknown as Record<string, unknown> }, signal()).catch(() => {});
    const schema = (sent[0].body.response_format as { json_schema: { schema: Record<string, unknown> } }).json_schema.schema;
    const untyped: string[] = [];
    const walk = (node: unknown, at: string) => {
      if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${at}[${i}]`));
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (("const" in n || "enum" in n) && n.type === undefined) untyped.push(at);
      for (const [k, v] of Object.entries(n)) if (k !== "const" && k !== "enum") walk(v, `${at}.${k}`);
    };
    walk(schema, "$");
    expect(untyped).toEqual([]);
    const strip = (node: unknown, source: unknown): unknown => {
      if (Array.isArray(node)) return node.map((n, i) => strip(n, (source as unknown[])[i]));
      if (!node || typeof node !== "object") return node;
      const had = source as Record<string, unknown>;
      return Object.fromEntries(Object.entries(node).filter(([k]) => k !== "type" || "type" in had).map(([k, v]) => [k, k === "const" || k === "enum" ? v : strip(v, had[k])]));
    };
    expect(strip(schema, TUTOR_OUTPUT_SCHEMA)).toEqual(JSON.parse(JSON.stringify(TUTOR_OUTPUT_SCHEMA)));
  });

  it("sends Gemma no reasoning effort for a low-effort request (its one level is full reasoning)", async () => {
    answer(whole);
    await mayaAiClient(gemma, gemma.MAYA_MODEL)!.json(request, signal());
    expect(sent.at(-1)!.body).not.toHaveProperty("reasoning_effort");
    await mayaAiClient(base, MAYA_DEFAULT_MODEL)!.json(request, signal());
    expect(sent.at(-1)!.body.reasoning_effort).toBe("low");
  });

  it("a livekit/ model without a LiveKit key makes no client", () => {
    expect(mayaAiClient({ ...gemma, LIVEKIT_API_KEY: undefined }, gemma.MAYA_MODEL)).toBeNull();
  });
});
