import { expect, it } from "vitest";
import { markingAiClient } from "@/lib/scan-marking-ai";
import { MARKING_MODEL } from "@/lib/scan-marking";
import { OPENROUTER_URL } from "@/lib/ai-openrouter";

const request = { name: "readings", system: "Read only", content: [{ type: "text" as const, text: "local aliases" }, { type: "image" as const, mediaType: "image/jpeg" as const, data: new Uint8Array([1]) }], schema: {}, effort: "low" as const, maxTokens: 4096 };
it("the real AiClient adapter reserves before each fetch, uses the marking override and records transport cost", async () => {
  const order: string[] = [], bodies: Record<string, unknown>[] = [], costs: (number | null)[] = [];
  let count = 0;
  const fake: typeof fetch = async (url, init) => {
    expect(url).toBe(OPENROUTER_URL); order.push("fetch"); bodies.push(JSON.parse(String(init?.body))); count++;
    if (count === 1) return Response.json({ error: { message: "synthetic retry" } }, { status: 503 });
    return Response.json({ usage: { cost: 0.003001 }, choices: [{ finish_reason: "stop", message: { content: '{"readings":[]}' } }] });
  };
  const transport = markingAiClient({ OPENROUTER_API_KEY: "synthetic", AI_MODEL: "must-not-enter-marking" }, fake)(async () => { order.push("reserve"); costs.push(transport!.costMicros()); });
  expect(await transport!.client.json(request, new AbortController().signal)).toEqual({ readings: [] });
  expect(order).toEqual(["reserve", "fetch", "reserve", "fetch"]); expect(costs).toEqual([null, null]); expect(transport!.costMicros()).toBe(3001);
  expect(bodies.every((b) => b.model === MARKING_MODEL && b.max_tokens === 4096 && !("user" in b))).toBe(true);
});
it("a refused retry makes no second fetch and a missing key never calls admission", async () => {
  let admitted = 0, fetched = 0;
  const fake: typeof fetch = async () => { fetched++; return new Response("", { status: 503 }); };
  const ai = markingAiClient({ OPENROUTER_API_KEY: "synthetic" }, fake)(async () => { if (++admitted > 1) throw Error("budget"); });
  await expect(ai!.client.json(request, new AbortController().signal)).rejects.toThrow("budget"); expect(fetched).toBe(1);
  expect(markingAiClient({}, fake)(async () => { throw Error("must not run"); })).toBeNull();
});
