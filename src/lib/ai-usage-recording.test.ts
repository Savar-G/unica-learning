import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { aiClient } from "@/lib/ai-client";
import { openRouterClient } from "@/lib/ai-openrouter";
import { configureAiUsage, configureAiUsageLifetime, flushAiUsage, insertUsageRow, recordAiUsage, usageRow, type AiUsageRow } from "@/lib/ai-usage";
import { parseUsageReceipt } from "@/lib/ai-usage-receipts";
import { keyAlias, keyIdentity, usageContext } from "@/lib/ai-usage-context";

let dir: string;
beforeEach(() => {
  vi.clearAllMocks(); dir = mkdtempSync(join(tmpdir(), "ai-receipts-"));
  vi.stubEnv("VITEST", ""); vi.stubEnv("VERCEL", ""); vi.stubEnv("SUPABASE_SECRET_KEY", "");
  vi.stubEnv("AI_USAGE_RECEIPT_FILE", join(dir, "receipts.jsonl"));
  vi.stubEnv("AI_USAGE_CONTEXT", "practice"); vi.stubEnv("AI_USAGE_RUN_ID", "c1afcfc0-2a36-4e41-b74b-6a05cb456456");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected network call"); }));
  configureAiUsage(null); configureAiUsageLifetime(null);
});
afterEach(async () => { await flushAiUsage(); configureAiUsage(null); configureAiUsageLifetime(null); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); rmSync(dir, { recursive: true, force: true }); });
const request = { name: "test", system: "private-prompt", content: [{ type: "text" as const, text: "private-child-answer" }], schema: { type: "object" } };
const response = (id: string) => new Response(JSON.stringify({ id, choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 20, completion_tokens: 3, cost: 0.7 } }));

it("records a direct local practice call before exit with no database key; retains real cost, context and a safe key identity", async () => {
  const fetch = vi.fn(async () => response("gen-local"));
  const client = openRouterClient({ apiKey: "never-print-this-key", model: "m", usage: { feature: "maya", context: "practice" }, fetch });
  await client.json(request, new AbortController().signal);
  const text = readFileSync(join(dir, "receipts.jsonl"), "utf8");
  const rows = text.trim().split("\n").map((s) => parseUsageReceipt(JSON.parse(s)));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ usage_context: "practice", cost_usd: 0.7, cost_basis: "provider", parent_id: null, child_id: null, key_alias: "local", run_id: "c1afcfc0-2a36-4e41-b74b-6a05cb456456", generation_id: "gen-local" });
  expect(rows[0].key_id).toBe(keyIdentity("never-print-this-key"));
  expect(text).not.toMatch(/never-print-this-key|private-prompt|private-child-answer/);
  await flushAiUsage(); expect(globalThis.fetch).not.toHaveBeenCalled();
});
it("records the shared client once, rather than once in each adapter layer", async () => {
  await aiClient({ OPENROUTER_API_KEY: "k" }, "m", { fetch: async () => response("gen-one"), usage: { feature: "marking", parentId: "parent", childId: "child" } })!.json(request, new AbortController().signal);
  const rows = readFileSync(join(dir, "receipts.jsonl"), "utf8").trim().split("\n");
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0])).toMatchObject({ feature: "marking", parent_id: "parent", child_id: "child", key_alias: "main" });
});
it("retains each in-flight write through the host callback and flushes concurrent writes before exit", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const retained: Promise<void>[] = [], rows: AiUsageRow[] = [];
  configureAiUsageLifetime((p) => retained.push(p));
  for (let i = 0; i < 2; i++) recordAiUsage({ feature: "other" }, { provider: "openrouter", model: "m" }, async (r) => { await gate; rows.push(r); });
  expect(retained).toHaveLength(2); expect(rows).toHaveLength(0);
  const flushed = flushAiUsage(); release(); await flushed; await Promise.all(retained);
  expect(rows).toHaveLength(2);
});
it("preserves unknown contexts, rejects secret-like aliases and does not count subscription as a paid charge", () => {
  expect(keyAlias("k", { OPENROUTER_API_KEY: " k ", SCAN_MARKING_OPENROUTER_API_KEY: "k" })).toBe("main");
  expect(usageContext({ AI_USAGE_CONTEXT: "secret" })).toBe("unknown");
  expect(usageContext({ VERCEL_ENV: "production" })).toBe("production");
  expect(usageRow({ feature: "other" }, { provider: "subscription", model: "m", costUsd: 9, keyAlias: "secret" as never, keyId: "secret" })).toMatchObject({ cost_usd: null, key_alias: "unknown", key_id: null });
});
it("replays the same receipt or generation at most once; a foreign-key conflict stays a failure", async () => {
  const row = usageRow({ feature: "other" }, { provider: "openrouter", model: "m", generationId: "gen-repeat", costUsd: 4 })!;
  expect(parseUsageReceipt(row)).toEqual(row);
  expect(() => parseUsageReceipt({ ...row, key_id: "a-secret" })).toThrow("Invalid usage receipt");
  const saved = new Set<string>();
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const r = JSON.parse(String(init?.body));
    if (saved.has(r.generation_id)) return new Response(JSON.stringify({ code: "23505", message: "ai_usage_events_generation_key" }), { status: 409 });
    saved.add(r.generation_id); return new Response(null, { status: 201 });
  });
  for (const receipt of [row, row, { ...row, receipt_id: "aabbccdd-1234-4123-8234-123456789abc" }]) expect(await insertUsageRow(parseUsageReceipt(receipt), { url: "https://fake.invalid", key: "fake", fetch })).toBe(true);
  expect(saved.size).toBe(1);
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await insertUsageRow(row, { url: "https://fake.invalid", key: "fake", fetch: async () => new Response(JSON.stringify({ code: "23503", message: "secret child data" }), { status: 409 }) })).toBe(false);
  expect(console.error).toHaveBeenCalledWith("[ai-usage] write failed: 409");
});
