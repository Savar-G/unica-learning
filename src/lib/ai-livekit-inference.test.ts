import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const usageRows = vi.hoisted(() => [] as import("@/lib/ai-usage").AiUsageReading[]);
vi.mock("@/lib/ai-usage", async (load) => ({
  ...(await load<typeof import("@/lib/ai-usage")>()),
  recordAiUsage: (_tag: unknown, reading: import("@/lib/ai-usage").AiUsageReading) => { usageRows.push(reading); },
}));

import { callModel, callReviewer } from "@/lib/maya-call-seams";
import { mayaAiClient, MAYA_PROVIDER } from "@/lib/maya-ai-route";
import { LIVEKIT_INFERENCE_URL, livekitCost } from "@/lib/ai-livekit-inference";
import { OPENROUTER_URL } from "@/lib/ai-openrouter";
import { chargeOf, createSpendLedger, spendConfig, usdToMicros } from "@/lib/maya-spend";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { TUTOR_OUTPUT_SCHEMA } from "@/lib/maya/tutor-prompt";

const base = { MAYA_OPENROUTER_API_KEY: "test-key", AI_MODEL: "anthropic/claude-sonnet-5.5", NODE_ENV: "test", LIVEKIT_API_KEY: "lk-key", LIVEKIT_API_SECRET: "lk-secret-that-is-long-enough-for-hs256" };
const MINI = "livekit/openai/gpt-5.4-mini";
const miniEnv = { ...base, MAYA_MODEL: MINI };
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

describe("Maya's turn model on LiveKit Inference (D-349)", () => {
  it("routes the configured LiveKit turn model and keeps its reviews on OpenRouter's Maya route", async () => {
    answer(whole);
    const model = callModel(null, miniEnv)!;
    expect(model.id).toBe(MINI);
    await model.propose({} as never, signal()).catch(() => {});
    expect(sent.map((s) => s.url)).toEqual([LIVEKIT_INFERENCE_URL]);
    expect(sent[0].body.model).toBe("openai/gpt-5.4-mini");
    sent = [];
    await callReviewer(model.id, miniEnv)!.review({} as never, signal()).catch(() => {});
    expect(sent.map((s) => s.url)).toEqual([OPENROUTER_URL]);
    expect(sent[0].body.provider).toEqual(MAYA_PROVIDER);
  });

  it("uses the existing Sonnet default even when LiveKit credentials are present", async () => {
    answer(whole);
    const model = callModel(null, { ...base, AI_MODEL: undefined })!;
    expect(model.id).toBe("anthropic/claude-sonnet-5.5");
    await model.propose({} as never, signal()).catch(() => {});
    expect(sent.map((s) => s.url)).toEqual([OPENROUTER_URL]);
    expect(sent[0].body.provider).toEqual(MAYA_PROVIDER);
  });

  it("without a LiveKit key, a new call uses AI_MODEL through OpenRouter, never the rule player", async () => {
    answer(whole);
    const model = callModel(null, { ...miniEnv, LIVEKIT_API_KEY: undefined })!;
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
    const mini = callModel(MINI, { ...base, MAYA_MODEL: "anthropic/claude-sonnet-5.5" })!;
    expect(mini.id).toBe(MINI);
    await mini.propose({} as never, signal()).catch(() => {});
    expect(sent.map((s) => s.url)).toEqual([LIVEKIT_INFERENCE_URL]);
  });

  it("a metered turn reserves before the attempt and settles it with LiveKit's cost; the usage record says livekit", async () => {
    answer(whole);
    const m = meter();
    const model = callModel(null, miniEnv, { ...m, call })!;
    await model.propose({} as never, signal()).catch(() => {});
    expect(sent.map((s) => s.url)).toEqual([LIVEKIT_INFERENCE_URL]);
    // The ledger's own field never reaches the gateway.
    expect(sent[0].body).not.toHaveProperty("usage");
    const usd = livekitCost("openai/gpt-5.4-mini", usage)!;
    expect(usd).toBeCloseTo((600 * 0.75 + 400 * 0.075 + 100 * 4.5) / 1e6, 12);
    const rows = m.store.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ what: "model", settled: true, cost: usdToMicros(usd, m.ledger.config) });
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]).toMatchObject({ provider: "livekit", model: MINI, costUsd: usd, costBasis: "estimate" });
    expect(usageRows[0].keyId).toBeUndefined();
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

  it("uses the existing voice preparation reservation and reports the final stream cost", async () => {
    answer(streamed);
    const m = meter();
    const voice = { ...call, kind: "voice" as const };
    const budget = m.ledger.block({ charge: chargeOf(voice), callId: voice.id, budgetKey: "prepared", newId: m.newId });
    await budget.open();
    const handle = budget.seam.take("speculative")!;
    const costs: number[] = [];
    const model = callModel(MINI, miniEnv, { ...m, call: voice, prepared: { budget, handle } })!;
    await model.propose({} as never, signal(), () => {}, (cost) => costs.push(cost)).catch(() => {});
    expect(sent.map((s) => s.url)).toEqual([LIVEKIT_INFERENCE_URL]);
    expect(costs).toEqual([livekitCost("openai/gpt-5.4-mini", usage)]);
    expect(m.store.log().filter((operation) => operation === "reserve")).toHaveLength(1);
    budget.seam.settle(handle, costs[0], { used: true });
    await budget.stop();
    expect(m.store.rows()[0].cost).toBe(usdToMicros(costs[0], m.ledger.config));
  });

  it("reads a streamed answer with its usage priced", async () => {
    answer(streamed);
    const costs: number[] = [];
    const texts: string[] = [];
    const out = await mayaAiClient(base, MINI)!.json({ ...request, onText: (t) => texts.push(t), onCost: (usd) => costs.push(usd) }, signal());
    expect(out).toEqual({ say: "Hi" });
    expect(sent[0].body.stream).toBe(true);
    expect(sent[0].body.stream_options).toEqual({ include_usage: true });
    expect(texts.at(-1)).toBe("{\"say\":\"Hi\"}");
    expect(costs[0]).toBeCloseTo(livekitCost("openai/gpt-5.4-mini", usage)!, 12);
  });

  it("gives every const and single-kind enum a type, as OpenAI's strict mode needs, and changes nothing else in Maya's tutor schema", async () => {
    answer(whole);
    await mayaAiClient(base, MINI)!.json({ ...request, schema: TUTOR_OUTPUT_SCHEMA as unknown as Record<string, unknown> }, signal()).catch(() => {});
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
    await mayaAiClient(base, MINI)!.json(request, signal());
    expect(sent.at(-1)!.body.reasoning_effort).toBe("low");
  });

  it("a livekit/ model without a LiveKit key makes no client", () => {
    expect(mayaAiClient({ ...gemma, LIVEKIT_API_KEY: undefined }, gemma.MAYA_MODEL)).toBeNull();
  });

  it("leaves cost unknown when the gateway does not report complete token counts", () => {
    expect(livekitCost("openai/gpt-5.4-mini", { prompt_tokens: 1_000 })).toBeNull();
    expect(livekitCost("openai/gpt-5.4-mini", { prompt_tokens: 0, completion_tokens: 0 })).toBe(0);
  });
});
