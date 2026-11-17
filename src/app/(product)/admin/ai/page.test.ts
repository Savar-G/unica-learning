import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), showTests: vi.fn(), receipts: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-store", () => ({ requireAdmin: f.admin }));
vi.mock("@/lib/openrouter-provider-receipts-store", () => ({ readProviderReceipts: f.receipts }));
vi.mock("@/components/admin-frame", () => ({ AdminFrame: ({ children }: { children: ReactNode }) => createElement("main", null, children) }));
vi.mock("@/lib/admin-test-families-server", () => ({ showTestFamilies: f.showTests }));
vi.mock("@/lib/maya-spend", () => ({ spendConfig: () => ({ usdToCad: 1.4 }) }));
import Page from "./page";
import Children from "./children/page";
import fixtures from "@/lib/openrouter-workspace.fixtures.json";
import { periodFor } from "@/lib/admin-ai-usage";
import { WORKSPACE_QUERY_URL } from "@/lib/openrouter-workspace-store";
import { UNICA_WORKSPACE_ID } from "@/lib/openrouter-workspace";

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-16T20:00:00Z"));
  f.admin.mockResolvedValue({ db: { rpc: f.rpc }, email: "admin@example.invalid" });
  f.rpc.mockResolvedValue({ data: { totals: { cost_usd: 2.92 } }, error: null });
  f.showTests.mockResolvedValue(false);
  f.receipts.mockResolvedValue(null);
  vi.stubEnv("OPENROUTER_MANAGEMENT_API_KEY", "fake-management-key"); vi.stubEnv("OPENROUTER_API_KEY", "private-fake-key"); vi.stubEnv("OPENROUTER_BILLING_API_KEY", "");
  vi.stubEnv("SCAN_MARKING_OPENROUTER_API_KEY", ""); vi.stubEnv("PARENT_EXPLANATION_API_KEY", ""); vi.stubEnv("DECISIONS_OPENROUTER_API_KEY", "");
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const dimension = JSON.parse(String(init?.body)).dimensions[0] as keyof typeof fixtures;
    return new Response(JSON.stringify(fixtures[dimension].response));
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const props = (query: Record<string, string> = {}) => ({ searchParams: Promise.resolve(query), params: Promise.resolve({}) });

it("defaults to all app records despite the global test-family filter, while the selected range controls workspace and app costs", async () => {
  for (const range of ["7d", "30d", "month", "year"] as const) {
    const html = renderToStaticMarkup(await Page(props({ range })));
    expect(f.rpc).toHaveBeenLastCalledWith("admin_ai_usage", expect.objectContaining({ p_with_tests: true }));
    expect(html).toContain("USD 56.741652"); expect(html).toContain("USD 2.92");
    expect(html).not.toContain("private-fake-key");
    expect(html).not.toContain("fake-management-key");
    expect(html).not.toContain("USD 64.63");
    const selected = periodFor(range, Date.parse("2026-11-16T20:00:00Z"));
    expect(f.rpc).toHaveBeenLastCalledWith("admin_ai_usage", expect.objectContaining({ p_from: selected.from.toISOString(), p_to: selected.to.toISOString() }));
    expect(f.receipts).toHaveBeenLastCalledWith(await f.admin.mock.results.at(-1)!.value, selected);
    const requests = vi.mocked(globalThis.fetch).mock.calls.slice(-3);
    expect(requests).toHaveLength(3);
    for (const [url, init] of requests) {
      expect(url).toBe(WORKSPACE_QUERY_URL);
      expect(JSON.parse(String(init!.body))).toMatchObject({ filters: [{ field: "workspace", operator: "eq", value: UNICA_WORKSPACE_ID }], time_range: { start: selected.from.toISOString(), end: selected.to.toISOString() } });
    }
  }
  expect(f.showTests).not.toHaveBeenCalled();
});
it("enforces the existing admin gate before provider and database reads", async () => {
  f.admin.mockRejectedValueOnce(new Error("admin refused"));
  await expect(Page(props())).rejects.toThrow("admin refused");
  expect(globalThis.fetch).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
  expect(f.receipts).not.toHaveBeenCalled();
});
it("uses the app period for receipts even when an old independent receipt filter is present", async () => {
  const html = renderToStaticMarkup(await Page(props({ range: "7d", providerRange: "month", report: "records" })));
  expect(f.receipts).toHaveBeenCalledWith(await f.admin.mock.results[0].value, expect.objectContaining({ range: "7d", from: new Date("2026-11-10T07:00:00Z") }));
  expect(f.rpc).toHaveBeenCalledWith("admin_ai_usage", expect.objectContaining({ p_with_tests: true, p_from: "2026-11-10T07:00:00.000Z" }));
  expect(html).not.toContain("providerRange=");
  expect(html).toContain("OpenRouter provider receipts");
  expect(html).toContain("Do not add them together");
});
it("keeps workspace and app totals visible when the provider receipt read fails", async () => {
  f.receipts.mockRejectedValueOnce(new Error("private-receipt-error"));
  const html = renderToStaticMarkup(await Page(props({ report: "records" })));
  expect(html).toContain("USD 56.741652"); expect(html).toContain("USD 2.92");
  expect(html).toContain("Provider receipts are unavailable. The cost is unknown.");
  expect(html).not.toContain("private-receipt-error");
});
it("shows workspace totals when the app ledger fails", async () => {
  f.rpc.mockRejectedValueOnce(new Error("private-db-error"));
  const html = renderToStaticMarkup(await Page(props()));
  expect(html).toContain("USD 56.741652"); expect(html).toContain("AI usage could not be read"); expect(html).not.toContain("private-db-error");
});
it("keeps app records and receipt reads visible when a workspace request fails", async () => {
  vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("private-workspace-error"));
  f.receipts.mockResolvedValueOnce({
    totals: { receipts: 1, known_cost_usd: 0.037, unknown_cost_receipts: 0, matched_receipts: 0, unmatched_receipts: 1,
      unmatched_known_cost_usd: 0.037, unmatched_unknown_cost_receipts: 0, first_receipt_at: null, last_receipt_at: null, last_received_at: null },
    models: [], keys: [], features: [], children: [], omitted_groups: 0,
  });
  const html = renderToStaticMarkup(await Page(props({ report: "records" })));
  expect(html).toContain("Unica workspace usage is unavailable"); expect(html).toContain("USD 2.92");
  expect(f.receipts).toHaveBeenCalledTimes(1);
  expect(html).toContain("USD 0.037");
  expect(html).toContain("OpenRouter provider receipts"); expect(html).not.toContain("private-workspace-error");
});
it("has no configured account fallback when the management credential is absent", async () => {
  vi.stubEnv("OPENROUTER_MANAGEMENT_API_KEY", "");
  const html = renderToStaticMarkup(await Page(props()));
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(html).toContain("No management key is configured"); expect(html).toContain("USD 2.92");
  expect(html).not.toContain("USD 64.63");
});
it("ignores caller workspace settings for all provider requests", async () => {
  await Page(props({ workspace: "unify", workspaceId: "other", range: "month" }));
  for (const [, init] of vi.mocked(globalThis.fetch).mock.calls) expect(JSON.parse(String(init!.body)).filters).toEqual([{ field: "workspace", operator: "eq", value: UNICA_WORKSPACE_ID }]);
});
it("includes each test-family child and its feature/model details in the reused child page", async () => {
  f.rpc.mockImplementation(async (name: string) => name === "admin_child_unit_cost_families" ? { error: null, data: [{ parent_id: "p", name: "Test parent", is_test: true, children: [{ id: "c", first_name: "Test child", created_at: "2026-01-01", plan_kind: "free_month" }] }] } : { error: null, data: { sums: [{ parent_id: "p", child_id: "c", ai_usd: 2, calls: 1, details: [{ parent_id: "p", child_id: "c", feature: "maya_review", model: "review-model", provider: "openrouter", context: "test-family", cost_usd: 2, calls: 1, key_alias: "main" }] }], budget: [] } });
  const html = renderToStaticMarkup(await Children(props()));
  for (const text of ["Test child", "Test parent", "maya_review", "review-model", "test-family"]) expect(html).toContain(text);
  expect(f.showTests).not.toHaveBeenCalled();
});


it("uses a safe report selection without changing any data scope", async () => {
  for (const report of ["features", "models", "keys", "families", "records", "untrusted"]) {
    const html = renderToStaticMarkup(await Page(props({ report, range: "year" })));
    const label = report === "untrusted" ? "Features" : ({ features: "Features", models: "Models", keys: "API keys", families: "Families", records: "Records" } as Record<string, string>)[report];
    expect(html).toMatch(new RegExp(`aria-current="page"[^>]*>${label}`));
    expect(f.rpc).toHaveBeenLastCalledWith("admin_ai_usage", expect.objectContaining({ p_with_tests: true }));
    expect(html).toContain("range=year&amp;report=");
  }
});
