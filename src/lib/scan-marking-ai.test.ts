import { expect, it } from "vitest";
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
