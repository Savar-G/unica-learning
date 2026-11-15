import { beforeEach, describe, expect, it, vi } from "vitest";

const spans: { options: { name: string; op: string; attributes: Record<string, unknown> }; set: Record<string, unknown>; status?: unknown }[] = [];
const metrics: [string, string, number, unknown][] = [];
vi.mock("@sentry/nextjs", () => ({
  startSpan: (options: { name: string; op: string; attributes: Record<string, unknown> }, run: (span: unknown) => unknown) => {
    const record: (typeof spans)[number] = { options, set: {} };
    spans.push(record);
    return run({ setAttributes: (a: Record<string, unknown>) => Object.assign(record.set, a), setStatus: (s: unknown) => { record.status = s; } });
  },
  metrics: {
    distribution: (name: string, value: number, o: unknown) => metrics.push(["distribution", name, value, o]),
    count: (name: string, value: number, o: unknown) => metrics.push(["count", name, value, o]),
  },
}));

const { openRouterClient } = await import("@/lib/ai-openrouter");

const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const request = { name: "work_review", system: "Review the child's work.", content: [{ type: "text" as const, text: "My answer is 7 because Iris said so" }], schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } };

beforeEach(() => { spans.length = 0; metrics.length = 0; });

describe("AI spans", () => {
  it("records the feature, model, tokens and cost, and never the prompt or the answer", async () => {
    const fetch = vi.fn(async () => answer({ id: "gen-1", usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0042 }, choices: [{ finish_reason: "stop", native_finish_reason: "stop", message: { content: "{\"ok\":true}" } }] }));
    const client = openRouterClient({ apiKey: "k", model: "anthropic/claude-sonnet-5.5", fetch, feature: "work_review" });
    await expect(client.json(request, new AbortController().signal)).resolves.toEqual({ ok: true });
    expect(spans).toHaveLength(1);
    expect(spans[0].options).toMatchObject({ op: "gen_ai.chat", attributes: { "gen_ai.request.model": "anthropic/claude-sonnet-5.5", "gen_ai.agent.name": "work_review", "gen_ai.provider.name": "openrouter" } });
    expect(spans[0].set).toMatchObject({ "gen_ai.usage.input_tokens": 100, "gen_ai.usage.output_tokens": 20 });
    expect(metrics).toContainEqual(["distribution", "ai.cost", 0.0042, { unit: "usd", attributes: { feature: "work_review", model: "anthropic/claude-sonnet-5.5" } }]);
    const recorded = JSON.stringify({ spans, metrics });
    expect(recorded).not.toContain("Iris");
    expect(recorded).not.toContain("Review the child");
    expect(recorded).not.toContain("\\\"ok\\\":true");
  });

  it("marks a failed request and counts it", async () => {
    const fetch = vi.fn(async () => answer({ error: { message: "bad" } }, 400));
    const client = openRouterClient({ apiKey: "k", model: "m", fetch, maxRetries: 0 });
    await expect(client.json(request, new AbortController().signal)).rejects.toThrow();
    expect(spans[0].status).toMatchObject({ code: 2 });
    expect(spans[0].options.attributes["gen_ai.agent.name"]).toBe("other");
    expect(metrics.map((m) => m[1])).toContain("ai.failures");
  });
});
