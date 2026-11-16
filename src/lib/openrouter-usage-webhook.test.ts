import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseProviderReceipts, receiveProviderUsage, WEBHOOK_MAX_BYTES, WEBHOOK_MAX_SPANS, WEBHOOK_TIMEOUT_MS } from "./openrouter-usage-webhook";

const secret = "local-only-synthetic-secret-32-characters";
const prefix = "span.metadata.openrouter_generation.";
const attr = (key: string, value: unknown) => ({ key, value: typeof value === "number" ? { doubleValue: value } : { stringValue: value } });
const span = (extra: ReturnType<typeof attr>[] = []) => ({
  startTimeUnixNano: "1794859200123456000", parentSpanId: "external-parent", name: "not-an-identity",
  attributes: [attr("gen_ai.response.id", "gen-synthetic-1"), attr("gen_ai.response.model", "openai/test"),
    attr("gen_ai.usage.total_cost", 0.037), attr("gen_ai.usage.input_cost", 0.01), attr("gen_ai.usage.output_cost", 0.02),
    attr("gen_ai.usage.input_tokens", "40"), attr("gen_ai.usage.output_tokens", "20"), attr(`${prefix}api_key_id`, "123"), ...extra],
});
const payload = (spans: unknown[] = [span()]) => ({ resourceSpans: [{ resource: { attributes: [attr("service.name", "openrouter")] }, scopeSpans: [{ spans }] }] });
const req = (data: unknown, headers: Record<string, string> = {}) => new Request("http://local/api/openrouter-usage", {
  method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}`, ...headers }, body: JSON.stringify(data),
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("provider receipt boundary", () => {
  it("uses the generation total including its fee, not the input/output sum", () => {
    expect(parseProviderReceipts(payload(), "workspace-1")[0]).toEqual({
      workspace_id: "workspace-1", generation_id: "gen-synthetic-1", occurred_at: "2026-11-16T20:00:00.123Z", model: "openai/test", api_key_id: "123",
      cost_usd: 0.037, input_cost_usd: 0.01, output_cost_usd: 0.02, input_tokens: 40, output_tokens: 20,
    });
  });
  it("retains actual zero, and keeps missing cost unknown", () => {
    const zero = span(); zero.attributes = zero.attributes.filter((a) => a.key !== "gen_ai.usage.total_cost");
    expect(parseProviderReceipts(payload([zero]), "workspace-1")[0].cost_usd).toBeNull();
    zero.attributes.push(attr("gen_ai.usage.total_cost", 0));
    expect(parseProviderReceipts(payload([zero]), "workspace-1")[0].cost_usd).toBe(0);
  });
  it("does not count wrapper, provider attempt, and timing spans", () => {
    expect(parseProviderReceipts(payload([{ attributes: [attr("span.type", "SPAN")] }, span(), { attributes: [] }]), "workspace-1")).toHaveLength(1);
  });
  it("rejects a response id without accounting evidence instead of counting an ambiguous attempt", () => {
    const s = span(); s.attributes = s.attributes.filter((a) => !a.key.startsWith("gen_ai.usage."));
    expect(() => parseProviderReceipts(payload([s]), "workspace-1")).toThrow();
  });
  it("ignores all custom metadata and private fields, even if they look like billing fields", () => {
    const sensitive = "PRIVATE_CHILD_PROMPT_STOP_OUTPUT_USER";
    const extra = ["gen_ai.prompt", "gen_ai.completion", "gen_ai.input.messages", "gen_ai.output.messages", "user.id", "session.id", "gen_ai.request.stop_sequences",
      "trace.metadata.feature", "trace.metadata.child_id", "trace.metadata.gen_ai.response.id", "trace.metadata.gen_ai.usage.total_cost",
      "trace.metadata.openrouter_generation.api_key_id", "trace.metadata.openrouter_generation.usage", `${prefix}upstream_raw_response_usage`, "openrouter.api_key.name"];
    const parsed = parseProviderReceipts(payload([span(extra.map((key) => attr(key, sensitive)))]), "workspace-1");
    expect(JSON.stringify(parsed)).not.toContain(sensitive);
    expect(Object.keys(parsed[0]).sort()).toEqual(["workspace_id", "generation_id", "occurred_at", "model", "api_key_id", "cost_usd", "input_cost_usd", "output_cost_usd", "input_tokens", "output_tokens"].sort());
    expect(parsed[0].generation_id).toBe("gen-synthetic-1");
    expect(parsed[0].cost_usd).toBe(0.037);
  });
  it.each([
    ["gen_ai.response.id", "gen-other"], ["gen_ai.usage.total_cost", 0], [`${prefix}usage`, 0],
    [`${prefix}workspace_id`, "other"], [`${prefix}api_key.id`, "different"], ["gen_ai.usage.prompt_tokens", "41"],
  ])("rejects ambiguous or conflicting %s", (key, value) => {
    expect(() => parseProviderReceipts(payload([span([attr(key, value)])]), "workspace-1")).toThrow();
  });
  it.each([NaN, -1, "NaN", "Infinity", "-1", "1e-999", "0x01", "", " ", {}, null])("rejects malformed cost %j", (cost) => {
    const s = span(); s.attributes = s.attributes.filter((a) => a.key !== "gen_ai.usage.total_cost");
    s.attributes.push(attr("gen_ai.usage.total_cost", cost));
    expect(() => parseProviderReceipts(payload([s]), "workspace-1")).toThrow();
  });
  it("rejects malformed containers and excessive spans", () => {
    for (const data of [{}, { resourceSpans: null }, payload([null]), payload(Array(WEBHOOK_MAX_SPANS + 1).fill({ attributes: [] }))]) {
      expect(() => parseProviderReceipts(data, "workspace-1")).toThrow();
    }
  });
});

describe("authenticated bounded delivery", () => {
  it("authenticates before reading the body or writing, including test requests", async () => {
    const write = vi.fn(), read = vi.fn();
    const request = req({}, { authorization: "Bearer wrong", "x-test-connection": "true" });
    Object.defineProperty(request, "body", { get: read });
    expect((await receiveProviderUsage(request, { secret, workspaceId: "workspace-1", write })).status).toBe(401);
    expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
  it.each([{}, { resourceSpans: [] }])("accepts empty authenticated connection test without a spending row", async (data) => {
    const write = vi.fn();
    expect((await receiveProviderUsage(req(data, { "x-test-connection": "true" }), { secret, workspaceId: "workspace-1", write })).status).toBe(204);
    expect(write).not.toHaveBeenCalled();
  });
  it("does not accept nonempty connection tests or silently bypass their costs", async () => {
    const write = vi.fn();
    expect((await receiveProviderUsage(req(payload(), { "x-test-connection": "true" }), { secret, workspaceId: "workspace-1", write })).status).toBe(400);
    expect(write).not.toHaveBeenCalled();
  });
  it("writes valid mixed batches only after complete parsing", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    expect((await receiveProviderUsage(req(payload([span(), { attributes: [] }])), { secret, workspaceId: "workspace-1", write })).status).toBe(204);
    expect(write).toHaveBeenCalledTimes(1); expect(write.mock.calls[0][0]).toHaveLength(1);
    write.mockClear();
    expect((await receiveProviderUsage(req(payload([span(), { attributes: [attr("gen_ai.usage.total_cost", 1)] }])), { secret, workspaceId: "workspace-1", write })).status).toBe(400);
    expect(write).not.toHaveBeenCalled();
  });
  it("returns a generic retryable error after a write fails or the first acknowledgement is lost", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("PRIVATE DATABASE DETAIL")).mockResolvedValue(undefined);
    const response = await receiveProviderUsage(req(payload()), { secret, workspaceId: "workspace-1", write });
    expect(response.status).toBe(503); expect(await response.text()).toBe("");
    expect((await receiveProviderUsage(req(payload()), { secret, workspaceId: "workspace-1", write })).status).toBe(204);
    expect(write.mock.calls[0][0]).toEqual(write.mock.calls[1][0]);
  });
  it("rejects unsupported content, excess bytes, malformed JSON and bad UTF-8", async () => {
    const write = vi.fn();
    const cases: [Request, number][] = [
      [req({}, { "content-type": "text/plain" }), 415], [req({}, { "content-encoding": "gzip" }), 415],
      [req({}, { "content-length": String(WEBHOOK_MAX_BYTES + 1) }), 400],
      [new Request("http://local", { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: "x".repeat(WEBHOOK_MAX_BYTES + 1) }), 400],
      [new Request("http://local", { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: new Uint8Array([255]) }), 400],
    ];
    for (const [request, status] of cases) expect((await receiveProviderUsage(request, { secret, workspaceId: "workspace-1", write })).status).toBe(status);
    expect(write).not.toHaveBeenCalled();
  });
  it("bounds a stalled request stream", async () => {
    vi.useFakeTimers();
    const request = new Request("http://local", { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: new ReadableStream({ start() {} }), duplex: "half" } as RequestInit);
    // AbortSignal.timeout uses a native timer, so replace only that boundary for a deterministic local deadline.
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => controller.signal);
    const write = vi.fn();
    const result = receiveProviderUsage(request, { secret, workspaceId: "workspace-1", write });
    controller.abort();
    expect((await result).status).toBe(400);
    expect(AbortSignal.timeout).toHaveBeenCalledWith(WEBHOOK_TIMEOUT_MS);
    expect(write).not.toHaveBeenCalled(); vi.restoreAllMocks();
  });
});
