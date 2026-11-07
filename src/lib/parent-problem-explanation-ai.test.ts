import { expect, it, vi } from "vitest";
import { explanationAiClient } from "@/lib/parent-problem-explanation-ai";
import { EXPLANATION_MAX_BYTES, EXPLANATION_MAX_TOKENS, EXPLANATION_MODEL } from "@/lib/parent-problem-explanation";
const request = { name: "parent_problem_explanation", system: "Use the stored answer.", content: [{ type: "text" as const, text: "Stored answer: 42" }], schema: { type: "object" }, maxTokens: EXPLANATION_MAX_TOKENS, effort: "low" as const };
const valid = { steps: ["Add the ones."], say: "Start with the ones." };
const response = (usage: unknown = { cost: 0.0002, prompt_tokens: 100, completion_tokens: 40 }) => Response.json({ model: EXPLANATION_MODEL, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(valid) } }], usage });
// Synthetic key, intercepted transport. No provider or credential access.
const env = { PARENT_EXPLANATION_API_KEY: "synthetic-key-never-network", OPENROUTER_API_KEY: "another-feature-key-must-not-be-used", AI_MODEL: "must-not-be-used" };
it("uses a separate bounded model and reserves independently before every shared-client retry", async () => {
  const order: string[] = [], costs: (number | null)[] = []; let calls = 0;
  const base: typeof fetch = async (_url, init) => { order.push("fetch"); calls++; const body = JSON.parse(String(init?.body));
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer synthetic-key-never-network");
    expect(body.model).toBe(EXPLANATION_MODEL); expect(body.max_tokens).toBe(768); expect(body.reasoning).toEqual({ effort: "low", exclude: true }); expect(body.usage).toEqual({ include: true }); expect(Buffer.byteLength(String(init?.body))).toBeLessThanOrEqual(EXPLANATION_MAX_BYTES);
    expect(body.provider).toEqual({ require_parameters: true, only: ["anthropic"], allow_fallbacks: false, max_price: { prompt: 1, completion: 3, request: 0 } });
    return calls === 1 ? Response.json({ model: EXPLANATION_MODEL, usage: { cost: 0.0001, prompt_tokens: 100, completion_tokens: 0 } }, { status: 503 }) : response(); };
  const transport = explanationAiClient(env, base)(async () => { costs.push(transport!.costMicros()); order.push("reserve"); })!;
  expect(await transport.client.json(request, new AbortController().signal)).toEqual(valid);
  expect(order).toEqual(["reserve", "fetch", "reserve", "fetch"]); expect(costs).toEqual([null, 100]); expect(transport.costMicros()).toBe(200);
});
it("a denied second admission prevents the retry transport", async () => {
  let admitted = 0; const base = vi.fn(async () => new Response("unknown", { status: 503 }));
  const transport = explanationAiClient(env, base)(async () => { if (++admitted === 2) throw Error("cap"); })!;
  await expect(transport.client.json(request, new AbortController().signal)).rejects.toThrow("cap"); expect(base).toHaveBeenCalledTimes(1); expect(transport.costMicros()).toBeNull();
});
it.each([undefined, { cost: "0", prompt_tokens: 1, completion_tokens: 1 }, { cost: -1, prompt_tokens: 1, completion_tokens: 1 }, { cost: 0 }, { cost: 0.01, prompt_tokens: null, completion_tokens: 10 }])("unverified usage %j never frees its hold", async usage => {
  const transport = explanationAiClient(env, async () => response(usage === undefined ? null : usage))(async () => {})!;
  await transport.client.json(request, new AbortController().signal); expect(transport.costMicros()).toBeNull();
});
it("body-read failures and unknown network errors retain a reservation for each attempt", async () => {
  let admitted = 0; const base = vi.fn(async () => { throw Error("synthetic-network-loss"); });
  const transport = explanationAiClient(env, base)(async () => { admitted++; })!;
  await expect(transport.client.json(request, new AbortController().signal)).rejects.toThrow(); expect(admitted).toBe(2); expect(base).toHaveBeenCalledTimes(2); expect(transport.costMicros()).toBeNull();
});
it("an aborted retry cannot settle its new hold using the previous response cost", async () => {
  let attempts = 0; const controller = new AbortController();
  const transport = explanationAiClient(env, async () => Response.json({ model: EXPLANATION_MODEL, usage: { cost: 0.1, prompt_tokens: 10, completion_tokens: 0 } }, { status: 503 }))(async () => {
    if (++attempts === 2) { controller.abort(); throw Error("refused-after-reserve"); }
  })!;
  await expect(transport.client.json(request, controller.signal)).rejects.toThrow("refused-after-reserve"); expect(transport.costMicros()).toBeNull();
});
it("oversize input and changed output limits never reach the transport", async () => {
  const base = vi.fn(async () => response()); const transport = explanationAiClient(env, base)(async () => {})!;
  await expect(transport.client.json({ ...request, content: [{ type: "text", text: "x".repeat(EXPLANATION_MAX_BYTES) }] }, new AbortController().signal)).rejects.toThrow();
  await expect(transport.client.json({ ...request, maxTokens: 769 }, new AbortController().signal)).rejects.toThrow(); expect(base).not.toHaveBeenCalled();
});
it("AI off constructs no client", () => { expect(explanationAiClient({})(async () => {})).toBeNull(); });
it("another feature's global key cannot enable explanations", () => {
  expect(explanationAiClient({ OPENROUTER_API_KEY: env.OPENROUTER_API_KEY })(async () => {})).toBeNull();
});
