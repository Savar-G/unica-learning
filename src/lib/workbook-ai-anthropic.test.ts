import { expect, it } from "vitest";
import { workbookAi, workbookModels } from "./workbook-ai";
import type { AiCallRecord } from "./ai-fallback";
import type { AiJsonRequest } from "./ai-client";

const env = { WORKBOOK_API_PROVIDER: "anthropic", WORKBOOK_AI_PRIMARY: "api", ANTHROPIC_API_KEY: "test-only" };
const request: AiJsonRequest = { name: "workbook_page", system: "Write a question", content: [{ type: "text", text: "U10" }], schema: { type: "object" } };
const signal = () => new AbortController().signal;
function api(status = 200) {
  const sent: string[] = [];
  const fetch: typeof globalThis.fetch = async (url) => {
    sent.push(String(url));
    return new Response(JSON.stringify(status === 200 ? {
      id: "msg_test", type: "message", role: "assistant", model: "claude-sonnet-5-5",
      content: [{ type: "text", text: '{"items":[]}' }], stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    } : { type: "error", error: { type: "authentication_error", message: "invalid test key" } }),
    { status, headers: { "content-type": "application/json" } });
  };
  return { sent, fetch };
}

it("uses the explicitly selected Anthropic API with recorded dispatch and usage cost", async () => {
  const provider = api();
  const calls: AiCallRecord[] = [];
  const intents: AiCallRecord[] = [];
  const live = workbookAi(env, { subscription: false, fetch: provider.fetch,
    onCall: (_, record) => { calls.push(record); }, onStart: (_, record) => { intents.push(record); } });
  expect(await live.ai?.json(request, signal())).toEqual({ items: [] });
  expect(provider.sent).toHaveLength(1);
  expect(provider.sent[0]).toContain("https://api.anthropic.com/v1/messages");
  expect(calls).toMatchObject([{ provider: "api", outcome: "answered", model: "claude-sonnet-5-5", requests: 1, usd: 0.0004 }]);
  expect(intents.length).toBeGreaterThan(0);
});

it("selects direct Anthropic model ids for writing and independent solving", () => {
  expect(workbookModels(env)).toMatchObject({ api: "claude-sonnet-5-5", apiSolve: "claude-haiku-5-5", write: "claude-sonnet-5-5", solve: "claude-haiku-5-5" });
});

it("does not substitute OpenRouter when the selected Anthropic key is missing", () => {
  expect(() => workbookAi({ ...env, ANTHROPIC_API_KEY: "", OPENROUTER_API_KEY: "other-account" }, { subscription: false })).toThrow(/Anthropic.*key/i);
});

it("rejects an unknown API provider rather than choosing an account", () => {
  expect(() => workbookAi({ ...env, WORKBOOK_API_PROVIDER: "typo" }, { subscription: false })).toThrow(/WORKBOOK_API_PROVIDER/);
});

it("keeps explicit Codex mode from silently switching to the Anthropic account", () => {
  expect(() => workbookAi({ ...env, WORKBOOK_SUBSCRIPTION_PROVIDER: "codex", WORKBOOK_CODEX_HOME: "/test/account" }, { subscription: true })).toThrow(/Codex.*Anthropic|Anthropic.*Codex/);
});

it("stops an unavailable Anthropic account without asking a subscription", async () => {
  const provider = api(401);
  let subscriptionCalls = 0;
  const live = workbookAi(env, { subscription: true, fetch: provider.fetch,
    spawn: async () => { subscriptionCalls++; throw new Error("No subscription should run"); } });
  await expect(live.ai?.json(request, signal())).rejects.toThrow(/Anthropic answered 401/);
  expect(provider.sent).toHaveLength(1);
  expect(subscriptionCalls).toBe(0);
  expect(live.gate.off.api).toContain("401");
});

it("requires a matching authorized child and spending guard for live usage", () => {
  const usage = { parentId: "parent", childId: "child", runId: "run" };
  for (const selected of [env, { ...env, WORKBOOK_ANTHROPIC_CHILD_ID: "another-child" }]) {
    expect(() => workbookAi(selected, { subscription: false, usage })).toThrow(/authorized child and spending guard/);
  }
  expect(() => workbookAi({ ...env, WORKBOOK_ANTHROPIC_CHILD_ID: "child" }, { subscription: false, usage })).toThrow(/spending guard/);
});

it("keeps a spending refusal visible and never dispatches or excludes the API account", async () => {
  const provider = api();
  const live = workbookAi(env, { subscription: false, fetch: provider.fetch,
    anthropicFetchWrapper: () => async () => { throw new Error("The $35 workbook budget cannot fund another request; no request sent"); } });
  await expect(live.ai?.json(request, signal())).rejects.toThrow(/\$35 workbook budget/);
  expect(provider.sent).toHaveLength(0);
  expect(live.gate.off.api).toBeUndefined();
});

it("does not resend a rejected schema in single-dispatch edit mode", async () => {
  let dispatched = 0;
  const fetch: typeof globalThis.fetch = async () => {
    dispatched++;
    return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "too many schema union types" } }),
      { status: 400, headers: { "content-type": "application/json" } });
  };
  const live = workbookAi(env, { subscription: false, singleDispatch: true, fetch });
  await expect(live.ai?.json(request, signal())).rejects.toThrow(/Anthropic answered 400/);
  expect(dispatched).toBe(1);
});
