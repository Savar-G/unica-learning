import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import fixtures from "./openrouter-workspace.fixtures.json";
import { periodFor, RANGES } from "@/lib/admin-ai-usage";
import { UNICA_WORKSPACE_ID, workspaceActivityUrl } from "@/lib/openrouter-workspace";
import { readWorkspaceUsage, WORKSPACE_DEADLINE_MS, WORKSPACE_QUERY_URL } from "@/lib/openrouter-workspace-store";

beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const env = { OPENROUTER_MANAGEMENT_API_KEY: "fake-management-key" };
const period = periodFor("30d", Date.parse("2026-11-16T20:00:00Z"));
type Dimension = keyof typeof fixtures;
const dimensionOf = (init?: RequestInit): Dimension => JSON.parse(String(init?.body)).dimensions[0];
const responseFor = (init?: RequestInit) => fixtures[dimensionOf(init)].response;
const json = (value: unknown) => new Response(JSON.stringify(value));
const success = () => vi.fn(async (_url: string | URL | Request, init?: RequestInit) => json(responseFor(init)));

it("matches the official Unica snapshot and returns every native key and model without feature or family guesses", async () => {
  const fetch = success();
  const out = await readWorkspaceUsage(period, env, fetch);
  expect(out.status).toBe("ok");
  expect(out.usage).toMatchObject({ costUsd: 56.741652, requests: 20281 });
  for (const [dimension, lines] of [["model", out.usage!.models], ["api_key_id", out.usage!.keys]] as const) {
    expect(lines).toEqual(fixtures[dimension].response.data.data.map((r) => ({ label: r[dimension as keyof typeof r], costUsd: r.total_usage, requests: r.request_count })));
    expect(lines.reduce((n, r) => n + r.costUsd, 0)).toBeCloseTo(out.usage!.costUsd, 6);
    expect(lines.reduce((n, r) => n + r.requests, 0)).toBe(out.usage!.requests);
  }
  expect(out.usage!.keys).toHaveLength(7); expect(out.usage!.models).toHaveLength(19);
  expect(JSON.stringify(out)).not.toContain(env.OPENROUTER_MANAGEMENT_API_KEY);
  expect(JSON.stringify(out)).not.toMatch(/feature|childId|parentId/);
});

it.each(RANGES)("fixes every request to Unica and the same $key period, with no account or key endpoint", async ({ key }) => {
  const fetch = success();
  const selected = periodFor(key, Date.parse("2026-11-16T20:00:00Z"));
  await readWorkspaceUsage(selected, { ...env, OPENROUTER_WORKSPACE_ID: "other", OPENROUTER_API_KEY: "other-key" }, fetch);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls.map(([, init]) => dimensionOf(init)).sort()).toEqual(["api_key_id", "model", "workspace"]);
  const signals = new Set<AbortSignal>();
  for (const [url, init] of fetch.mock.calls) {
    expect(url).toBe(WORKSPACE_QUERY_URL);
    expect(init).toMatchObject({ method: "POST", cache: "no-store", headers: { authorization: "Bearer fake-management-key", "content-type": "application/json" } });
    expect(JSON.parse(String(init!.body))).toEqual({
      metrics: ["total_usage", "request_count"], dimensions: [dimensionOf(init)],
      filters: [{ field: "workspace", operator: "eq", value: UNICA_WORKSPACE_ID }],
      time_range: { start: selected.from.toISOString(), end: selected.to.toISOString() },
      limit: 1000, order_by: { field: "total_usage", direction: "desc" },
    });
    signals.add(init!.signal!);
  }
  expect(signals.size).toBe(1);
  expect(selected.to.toISOString()).toBe("2026-11-17T07:00:00.000Z");
});

it("uses only the management credential; no credential means unknown without any request", async () => {
  const fetch = success();
  for (const source of [{}, { OPENROUTER_MANAGEMENT_API_KEY: " " }, { OPENROUTER_API_KEY: "fake-main", OPENROUTER_BILLING_API_KEY: "fake-billing" }]) {
    expect(await readWorkspaceUsage(period, source, fetch)).toEqual({ status: "no-key", usage: null });
  }
  expect(fetch).not.toHaveBeenCalled();
});

it("accepts valid zero usage only when the provider returns a complete Unica aggregate", async () => {
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const rows = dimensionOf(init) === "workspace" ? [{ workspace: "Unica Learning", total_usage: 0, request_count: 0 }] : [];
    return json({ data: { data: rows, metadata: { query_time_ms: 1, row_count: rows.length, truncated: false } } });
  });
  expect(await readWorkspaceUsage(period, env, fetch)).toEqual({ status: "ok", usage: { costUsd: 0, requests: 0, models: [], keys: [] } });
});

it("retains zero-charge request groups and permits only the provider's per-row rounding difference", async () => {
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const dimension = dimensionOf(init);
    const rows = dimension === "workspace" ? [{ workspace: "Unica Learning", total_usage: 0.123457, request_count: 4 }] : [
      { [dimension]: "paid", total_usage: 0.123456, request_count: 3 }, { [dimension]: "free", total_usage: 0, request_count: 1 },
    ];
    return json({ data: { data: rows, metadata: { query_time_ms: 1, row_count: rows.length, truncated: false }, warnings: [] } });
  });
  const result = await readWorkspaceUsage(period, env, fetch);
  expect(result.status).toBe("ok");
  expect(result.usage!.models).toContainEqual({ label: "free", costUsd: 0, requests: 1 });
  expect(result.usage!.keys).toContainEqual({ label: "free", costUsd: 0, requests: 1 });
});

const mutations: [string, (v: Record<string, unknown>) => unknown][] = [
  ["missing wrapper", () => ({})],
  ["missing metadata", (v) => { delete v.metadata; }],
  ["missing rows", (v) => { delete v.data; }],
  ["truncation", (v) => { (v.metadata as Record<string, unknown>).truncated = true; }],
  ["missing truncation flag", (v) => { delete (v.metadata as Record<string, unknown>).truncated; }],
  ["incorrect row count", (v) => { (v.metadata as Record<string, unknown>).row_count = 0; }],
  ["warning", (v) => { v.warnings = ["unresolved filter"]; }],
  ["malformed warning", (v) => { v.warnings = null; }],
  ["missing charge", (v) => { delete (v.data as Record<string, unknown>[])[0].total_usage; }],
  ["negative charge", (v) => { (v.data as Record<string, unknown>[])[0].total_usage = -1; }],
  ["string charge", (v) => { (v.data as Record<string, unknown>[])[0].total_usage = "56.741652"; }],
  ["nonfinite charge", (v) => { (v.data as Record<string, unknown>[])[0].total_usage = Infinity; }],
  ["fractional count", (v) => { (v.data as Record<string, unknown>[])[0].request_count = 0.5; }],
  ["negative count", (v) => { (v.data as Record<string, unknown>[])[0].request_count = -1; }],
  ["unsafe count", (v) => { (v.data as Record<string, unknown>[])[0].request_count = Number.MAX_SAFE_INTEGER + 1; }],
  ["missing count", (v) => { delete (v.data as Record<string, unknown>[])[0].request_count; }],
  ["omitted group", (v) => { (v.data as unknown[]).pop(); (v.metadata as Record<string, unknown>).row_count = (v.data as unknown[]).length; }],
  ["charge mismatch", (v) => { (v.data as Record<string, unknown>[])[0].total_usage = 0; }],
  ["count mismatch", (v) => { (v.data as Record<string, unknown>[])[0].request_count = 0; }],
  ["duplicate group", (v) => { const rows = v.data as unknown[]; rows.push(rows[0]); (v.metadata as Record<string, unknown>).row_count = rows.length; }],
  ["unresolved hash", (v) => { const row = (v.data as Record<string, unknown>[])[0]; row.model = row.api_key_id = row.workspace = "a".repeat(64); }],
  ["key value", (v) => { const row = (v.data as Record<string, unknown>[])[0]; row.model = row.api_key_id = row.workspace = "sk-or-v1-fake-secret"; }],
];
it.each(mutations)("rejects %s in any of the three responses without a partial or zero result", async (_name, mutate) => {
  for (const dimension of ["workspace", "model", "api_key_id"] as const) {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = structuredClone(responseFor(init));
      if (dimensionOf(init) === dimension) {
        const replacement = mutate(body.data as unknown as Record<string, unknown>);
        return { ok: true, json: async () => replacement ?? body } as Response;
      }
      return json(body);
    });
    expect(await readWorkspaceUsage(period, env, fetch)).toEqual({ status: "unavailable", usage: null });
  }
});

it("rejects a workspace label other than the exact Unica label", async () => {
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = structuredClone(responseFor(init));
    if (dimensionOf(init) === "workspace") Object.assign(body.data.data[0], { workspace: "Unify" });
    return json(body);
  });
  expect(await readWorkspaceUsage(period, env, fetch)).toEqual({ status: "unavailable", usage: null });
});

it.each(["http", "network", "json"])("rejects a single %s failure and cancels sibling requests", async (mode) => {
  const signals: AbortSignal[] = [];
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    signals.push(init!.signal!);
    if (dimensionOf(init) === "model") {
      if (mode === "network") throw new Error("private-error");
      if (mode === "http") return new Response("private-error", { status: 403 });
      return new Response("not json");
    }
    return json(responseFor(init));
  });
  expect(await readWorkspaceUsage(period, env, fetch)).toEqual({ status: "unavailable", usage: null });
  expect(signals.every((s) => s.aborted)).toBe(true);
});

it.each(["headers", "body"])("starts all reads concurrently and bounds stalled %s by one five-second deadline", async (stage) => {
  vi.useFakeTimers();
  const fetch = vi.fn((_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (dimensionOf(init) !== "api_key_id") return Promise.resolve(json(responseFor(init)));
    if (stage === "headers") return new Promise(() => {});
    return Promise.resolve({ ok: true, json: () => new Promise(() => {}) } as Response);
  });
  const pending = readWorkspaceUsage(period, env, fetch);
  expect(fetch).toHaveBeenCalledTimes(3);
  let settled = false; void pending.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(WORKSPACE_DEADLINE_MS - 1);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toEqual({ status: "unavailable", usage: null });
  expect(fetch.mock.calls.every(([, init]) => init!.signal!.aborted)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("links to the Unica slug with the exact selected period and fixed workspace", () => {
  const url = new URL(workspaceActivityUrl(period));
  expect(url.pathname).toBe("/workspaces/unica-learning/activity");
  expect(Object.fromEntries(url.searchParams)).toEqual({ workspace: UNICA_WORKSPACE_ID, startDate: "2026-10-18T07:00:00.000Z", endDate: "2026-11-17T07:00:00.000Z" });
});
