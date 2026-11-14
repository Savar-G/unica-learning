import { describe, expect, it } from "vitest";
import { MARKING_CLAUDE_ENDPOINTS, markingAiClient, markingClientReady } from "@/lib/scan-marking-ai";
import { MARKING_MODEL } from "@/lib/scan-marking";
import { OPENROUTER_URL } from "@/lib/ai-openrouter";

const request = { name: "readings", system: "Read only", content: [{ type: "text" as const, text: "local aliases" }, { type: "image" as const, mediaType: "image/jpeg" as const, data: new Uint8Array([1]) }], schema: {}, effort: "low" as const, maxTokens: 4096 };
it("uses Terra only through an explicit evaluation route with the common low-effort request", async () => {
  const env = { SCAN_MARKING_OPENROUTER_API_KEY: "synthetic", SCAN_MARKING_MODEL: "openai/gpt-6.1-terra" };
  let body: Record<string, unknown> | null = null;
  const fake: typeof fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] });
  };
  expect(markingAiClient(env, fake)(async () => {})).toBeNull();
  const provider = { only: ["azure"], order: ["azure"], allow_fallbacks: false as const, require_parameters: true as const, zdr: true as const };
  const ai = markingAiClient(env, fake, { model: "openai/gpt-6.1-terra", provider, maxRetries: 0 })(async () => {});
  expect(ai).not.toBeNull();
  await ai!.client.json(request, new AbortController().signal);
  expect(body).toMatchObject({ model: "openai/gpt-6.1-terra", provider, max_tokens: 4096, reasoning: { effort: "low", exclude: true } });
});
it("the real AiClient adapter reserves before each fetch, uses the marking override and records transport cost", async () => {
  const order: string[] = [], bodies: Record<string, unknown>[] = [], costs: (number | null)[] = [];
  let count = 0;
  const fake: typeof fetch = async (url, init) => {
    expect(url).toBe(OPENROUTER_URL); order.push("fetch"); bodies.push(JSON.parse(String(init?.body))); count++;
    if (count === 1) return Response.json({ error: { message: "synthetic retry" } }, { status: 503 });
    return Response.json({ usage: { cost: 0.003001 }, choices: [{ finish_reason: "stop", message: { content: '{"readings":[]}' } }] });
  };
  const transport = markingAiClient({ SCAN_MARKING_OPENROUTER_API_KEY: "synthetic", OPENROUTER_API_KEY: "shared-must-not-enter", AI_MODEL: "must-not-enter-marking" }, fake)(async () => { order.push("reserve"); costs.push(transport!.costMicros()); });
  expect(await transport!.client.json(request, new AbortController().signal)).toEqual({ readings: [] });
  expect(order).toEqual(["reserve", "fetch", "reserve", "fetch"]); expect(costs).toEqual([null, null]); expect(transport!.costMicros()).toBe(3001);
  expect(bodies.every((b) => b.model === MARKING_MODEL && b.max_tokens === 4096 && !("user" in b))).toBe(true);
});
it("a refused retry makes no second fetch and a missing key never calls admission", async () => {
  let admitted = 0, fetched = 0;
  const fake: typeof fetch = async () => { fetched++; return new Response("", { status: 503 }); };
  const ai = markingAiClient({ SCAN_MARKING_OPENROUTER_API_KEY: "synthetic" }, fake)(async () => { if (++admitted > 1) throw Error("budget"); });
  await expect(ai!.client.json(request, new AbortController().signal)).rejects.toThrow("budget"); expect(fetched).toBe(1);
  expect(markingAiClient({}, fake)(async () => { throw Error("must not run"); })).toBeNull();
  expect(markingAiClient({ OPENROUTER_API_KEY: "shared-only" }, fake)(async () => { throw Error("must not run"); })).toBeNull();
  expect(markingAiClient({ SCAN_MARKING_OPENROUTER_API_KEY: "  ", OPENROUTER_API_KEY: "shared-only" }, fake)(async () => { throw Error("must not run"); })).toBeNull();
});
it("uses only the dedicated key and marking model override in a real captured transport request", async () => {
  let authorization: string | null = null, model: string | null = null;
  const fake: typeof fetch = async (_url, init) => {
    authorization = new Headers(init?.headers).get("authorization"); model = JSON.parse(String(init?.body)).model;
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] });
  };
  const ai = markingAiClient({ SCAN_MARKING_OPENROUTER_API_KEY: " dedicated ", OPENROUTER_API_KEY: "shared", SCAN_MARKING_MODEL: "z-ai/glm-5.3-flash", AI_MODEL: "shared-model" }, fake)(async () => {});
  await ai!.client.json(request, new AbortController().signal);
  expect(authorization).toBe("Bearer dedicated"); expect(model).toBe("z-ai/glm-5.3-flash");
  expect(markingAiClient({ SCAN_MARKING_OPENROUTER_API_KEY: "synthetic", SCAN_MARKING_MODEL: "unmapped-host" }, fake)(async () => {})).toBeNull();
});
describe("#868: the transport names a clean provider failure", () => {
  const env = { SCAN_MARKING_OPENROUTER_API_KEY: "synthetic" };
  const clean429 = JSON.stringify({ error: { code: 429, message: "Rate limit exceeded", metadata: { provider_name: "Anthropic" } } });
  async function failureOf(answer: () => Promise<Response>) {
    const transport = markingAiClient(env, answer, { model: MARKING_MODEL, provider: { require_parameters: true }, maxRetries: 0 })(async () => {})!;
    await transport.client.json(request, new AbortController().signal).catch(() => null);
    return transport.failure!();
  }
  it("reads a clean 429 with its Retry-After in seconds or as a date, and keeps the body for the store", async () => {
    expect(await failureOf(async () => new Response(clean429, { status: 429, headers: { "retry-after": "3" } })))
      .toEqual({ kind: "rate-limit", retryAfterMs: 3_000, evidence: { status: 429, body: clean429 } });
    const at = new Date(Date.now() + 5_000).toUTCString();
    const dated = await failureOf(async () => new Response(clean429, { status: 429, headers: { "retry-after": at } }));
    expect(dated?.retryAfterMs).toBeGreaterThan(3_000); expect(dated?.retryAfterMs).toBeLessThanOrEqual(5_000);
    expect((await failureOf(async () => new Response(clean429, { status: 429, headers: { "retry-after": "soon" } })))?.retryAfterMs).toBeNull();
  });
  it("a 429 or 5xx that shows a generation, usage or a cost is not clean", async () => {
    for (const body of [{ error: { code: 429, message: "x" }, usage: { cost: 0.01 } }, { id: "gen-1", error: { code: 429, message: "x" } }, { error: { code: 429, message: "x", metadata: { raw: '{"usage":{}}' } } }, { error: { code: 503, message: "x" } }])
      expect(await failureOf(async () => Response.json(body, { status: 429 }))).toBeNull();
    expect(await failureOf(async () => Response.json({ error: { code: 502, message: "x" }, usage: { cost: 0.002 } }, { status: 502 }))).toBeNull();
  });
  it("a 5xx, 408, time-out or lost connection is never a clean failure: it may have been charged", async () => {
    expect(await failureOf(async () => Response.json({ error: { code: 502, message: "Bad gateway" } }, { status: 502, headers: { "retry-after": "1" } }))).toBeNull();
    expect(await failureOf(async () => new Response("upstream down", { status: 503 }))).toBeNull();
    expect(await failureOf(async () => new Response("", { status: 408 }))).toBeNull();
    expect(await failureOf(async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); })).toBeNull();
    expect(await failureOf(async () => { throw new TypeError("fetch failed"); })).toBeNull();
  });
  it("an answer or a refused request is no clean failure", async () => {
    expect(await failureOf(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: "not json" } }] }))).toBeNull();
    expect(await failureOf(async () => Response.json({ error: { code: 400, message: "bad" } }, { status: 400 }))).toBeNull();
  });
  it("reads Retry-After only as whole seconds or an HTTP date (IMF-fixdate); anything else uses the default wait", async () => {
    const after = async (value: string) => (await failureOf(async () => new Response(clean429, { status: 429, headers: { "retry-after": value } })))?.retryAfterMs;
    expect(await after("0")).toBe(0);
    expect(await after("120")).toBe(120_000);
    for (const value of ["3.5", "-1", "1e3", "+3", "0x10", "3 s", "2026-11-14T00:00:00Z", "Saturday, 14-Nov-26 00:00:00 GMT", "Sat Nov 14 00:00:00 2026",
      "Sat, 32 Nov 2026 00:00:00 GMT", "Fri, 14 Nov 2026 00:00:00 GMT", "Sat, 14 Nov 2026 00:00:00 UTC", "Sat, 14 Nov 2026 00:00:00 +0000"])
      expect(await after(value), value).toBeNull();
    const at = new Date(Math.ceil((Date.now() + 5_000) / 1000) * 1000).toUTCString();
    const dated = await after(at);
    expect(dated).toBeGreaterThan(3_000); expect(dated).toBeLessThanOrEqual(6_000);
    expect(await after(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
  });
  it("each attempt starts with no failure, so a retry that answers clears it", async () => {
    let n = 0;
    const transport = markingAiClient(env, async () => ++n === 1 ? new Response(clean429, { status: 429 }) : Response.json({ usage: { cost: 0.001 }, choices: [{ finish_reason: "stop", message: { content: "{}" } }] }))(async () => {})!;
    await transport.client.json(request, new AbortController().signal);
    expect(transport.failure!()).toBeNull(); expect(transport.costMicros()).toBe(1_000);
  });
});

// #900 (D-337): a child's page photo goes to Claude only on Anthropic or Azure's global endpoint, never to Google.
it("sends production marking to Anthropic or Azure global only, never to Google", async () => {
  const bodies: Record<string, unknown>[] = [];
  const fake: typeof fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"readings":[]}' } }] });
  };
  for (const model of [MARKING_MODEL, "anthropic/claude-haiku-5.5"]) {
    const t = markingAiClient({ SCAN_MARKING_OPENROUTER_API_KEY: "synthetic", SCAN_MARKING_MODEL: model }, fake)(async () => {});
    await t!.client.json(request, new AbortController().signal);
  }
  expect(MARKING_CLAUDE_ENDPOINTS).toEqual(["anthropic", "azure/global"]);
  for (const b of bodies) {
    expect(b.provider).toEqual({ only: ["anthropic", "azure/global"], order: ["anthropic", "azure/global"], allow_fallbacks: false, require_parameters: true, ignore: ["google-vertex", "google-ai-studio"] });
    expect(JSON.stringify(b.provider)).not.toMatch(/"only":\[[^\]]*google/);
  }
});
it("has no production client for a model that runs only on Google", () => {
  const env = { SCAN_MARKING_OPENROUTER_API_KEY: "synthetic", SCAN_MARKING_MODEL: "google/gemini-3.8-flash" };
  expect(markingAiClient(env, fetch)(async () => {})).toBeNull();
  expect(markingClientReady(env)).toBe(false);
  expect(markingClientReady({ SCAN_MARKING_OPENROUTER_API_KEY: "synthetic" })).toBe(true);
});
