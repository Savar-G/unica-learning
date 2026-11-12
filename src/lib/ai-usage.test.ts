import { describe, expect, it } from "vitest";
import { aiClient } from "@/lib/ai-client";
import { flushAiUsage, recordAiUsage, usageRow, type AiUsageRow } from "@/lib/ai-usage";

const reading = { provider: "openrouter" as const, model: "anthropic/claude-sonnet-5.5", inputTokens: 1200, outputTokens: 80, costUsd: 0.0123456789, generationId: "gen-1" };

describe("usageRow", () => {
  it("keeps ids, tokens and the cost, with the cost rounded to 8 places", () => {
    const row = usageRow({ feature: "maya", parentId: "p1", childId: "c1", source: { kind: "maya_call", id: "call-1" } }, reading)!;
    expect(row).toMatchObject({ feature: "maya", provider: "openrouter", model: reading.model, input_tokens: 1200, output_tokens: 80, cost_usd: 0.01234568, calls: 1, generation_id: "gen-1", parent_id: "p1", child_id: "c1", source_kind: "maya_call", source_id: "call-1" });
  });
  it("stores a subscription call with no cost, whatever the reading says", () => {
    expect(usageRow({ feature: "workbook" }, { ...reading, provider: "subscription", costUsd: 5 })!.cost_usd).toBeNull();
  });
  it("holds a child only with the family", () => {
    expect(usageRow({ feature: "report", childId: "c1" }, reading)!.child_id).toBeNull();
  });
  it("refuses a bad cost, a bad token count and an empty model", () => {
    const row = usageRow({ feature: "other" }, { ...reading, costUsd: -1, inputTokens: 1.5, outputTokens: -3 })!;
    expect([row.cost_usd, row.input_tokens, row.output_tokens]).toEqual([null, null, null]);
    expect(usageRow({ feature: "other" }, { ...reading, model: "" })).toBeNull();
  });
  it("falls back to feature other for an unknown feature, and clamps calls", () => {
    expect(usageRow({ feature: "nope" as never }, { ...reading, calls: 99999 })).toMatchObject({ feature: "other", calls: 1000 });
  });
});

describe("recordAiUsage", () => {
  it("returns at once and writes the row once", async () => {
    const rows: AiUsageRow[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    recordAiUsage({ feature: "explain", parentId: "p1" }, reading, async (row) => { await gate; rows.push(row); });
    expect(rows).toHaveLength(0);
    release();
    await flushAiUsage();
    expect(rows).toHaveLength(1);
  });
  it("never throws when the sink throws or rejects", async () => {
    expect(() => recordAiUsage({ feature: "other" }, reading, () => { throw new Error("db down"); })).not.toThrow();
    expect(() => recordAiUsage({ feature: "other" }, reading, async () => { throw new Error("db down"); })).not.toThrow();
    await expect(flushAiUsage()).resolves.toBeUndefined();
  });
});

describe("the OpenRouter adapter's usage", () => {
  const answer = (usage: unknown, content = '{"a":1}') => ({ id: "gen-abc", choices: [{ finish_reason: "stop", message: { content } }], ...(usage === undefined ? {} : { usage }) });
  const make = (body: unknown) => {
    const sent: { body: Record<string, unknown> }[] = [];
    const fetch = (async (_u: string, init?: RequestInit) => { sent.push({ body: JSON.parse(String(init?.body)) }); return new Response(JSON.stringify(body), { status: 200 }); }) as unknown as typeof globalThis.fetch;
    return { sent, fetch };
  };
  const request = { name: "t", system: "s", content: [{ type: "text" as const, text: "x" }], schema: { type: "object", properties: { a: { type: "number" } }, required: ["a"], additionalProperties: false } };

  it("asks for usage accounting and reports the answer's tokens, cost and generation id", async () => {
    const { sent, fetch } = make(answer({ prompt_tokens: 10, completion_tokens: 4, cost: 0.002 }));
    const client = aiClient({ OPENROUTER_API_KEY: "k" }, "m/x", { fetch });
    await expect(client!.json(request, new AbortController().signal)).resolves.toEqual({ a: 1 });
    expect(sent[0].body.usage).toEqual({ include: true });
  });
  it("does not fail the call when the answer has no usage", async () => {
    const { fetch } = make(answer(undefined));
    await expect(aiClient({ OPENROUTER_API_KEY: "k" }, "m/x", { fetch })!.json(request, new AbortController().signal)).resolves.toEqual({ a: 1 });
  });
});
