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

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-16T20:00:00Z"));
  f.admin.mockResolvedValue({ db: { rpc: f.rpc }, email: "admin@example.invalid" });
  f.rpc.mockResolvedValue({ data: { totals: { cost_usd: 2.92 } }, error: null });
  f.showTests.mockResolvedValue(false);
  f.receipts.mockResolvedValue(null);
  vi.stubEnv("OPENROUTER_API_KEY", "private-fake-key"); vi.stubEnv("OPENROUTER_BILLING_API_KEY", "");
  vi.stubEnv("SCAN_MARKING_OPENROUTER_API_KEY", ""); vi.stubEnv("PARENT_EXPLANATION_API_KEY", ""); vi.stubEnv("DECISIONS_OPENROUTER_API_KEY", "");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { total_credits: 65, total_usage: 64.63, usage_monthly: 4.28 } }))));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const props = (query: Record<string, string> = {}) => ({ searchParams: Promise.resolve(query), params: Promise.resolve({}) });

it("defaults to all app records despite the global test-family filter, while the selected range controls only recorded costs", async () => {
  for (const range of ["7d", "30d", "month"]) {
    const html = renderToStaticMarkup(await Page(props({ range })));
    expect(f.rpc).toHaveBeenLastCalledWith("admin_ai_usage", expect.objectContaining({ p_with_tests: true }));
    expect(html).toContain("USD 64.63"); expect(html).toContain("USD 2.92");
    expect(html).not.toContain("private-fake-key");
  }
  expect(f.showTests).not.toHaveBeenCalled();
});
it("enforces the existing admin gate before provider and database reads", async () => {
  f.admin.mockRejectedValueOnce(new Error("admin refused"));
  await expect(Page(props())).rejects.toThrow("admin refused");
  expect(globalThis.fetch).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
  expect(f.receipts).not.toHaveBeenCalled();
});
it("reads provider receipts with the verified admin and preserves the app range in provider links", async () => {
  const html = renderToStaticMarkup(await Page(props({ range: "7d", providerRange: "month" })));
  expect(f.receipts).toHaveBeenCalledWith(await f.admin.mock.results[0].value, expect.objectContaining({ range: "month", from: new Date("2026-11-01T07:00:00Z") }));
  expect(f.rpc).toHaveBeenCalledWith("admin_ai_usage", expect.objectContaining({ p_with_tests: true, p_from: "2026-11-10T07:00:00.000Z" }));
  expect(html).toContain("range=7d&amp;providerRange=30d");
  expect(html).toContain("OpenRouter provider receipts");
  expect(html).toContain("Do not add them together");
});
it("keeps account and app totals visible when the provider receipt read fails", async () => {
  f.receipts.mockRejectedValueOnce(new Error("private-receipt-error"));
  const html = renderToStaticMarkup(await Page(props()));
  expect(html).toContain("USD 64.63"); expect(html).toContain("USD 2.92");
  expect(html).toContain("Provider receipts are unavailable. The cost is unknown.");
  expect(html).not.toContain("private-receipt-error");
});
it("shows provider billing when the app ledger fails", async () => {
  f.rpc.mockRejectedValueOnce(new Error("private-db-error"));
  const html = renderToStaticMarkup(await Page(props()));
  expect(html).toContain("USD 64.63"); expect(html).toContain("AI usage could not be read"); expect(html).not.toContain("private-db-error");
});
it("includes each test-family child and its feature/model details in the reused child page", async () => {
  f.rpc.mockImplementation(async (name: string) => name === "admin_child_unit_cost_families" ? { error: null, data: [{ parent_id: "p", name: "Test parent", is_test: true, children: [{ id: "c", first_name: "Test child", created_at: "2026-01-01", plan_kind: "free_month" }] }] } : { error: null, data: { sums: [{ parent_id: "p", child_id: "c", ai_usd: 2, calls: 1, details: [{ parent_id: "p", child_id: "c", feature: "maya_review", model: "review-model", provider: "openrouter", context: "test-family", cost_usd: 2, calls: 1, key_alias: "main" }] }], budget: [] } });
  const html = renderToStaticMarkup(await Children(props()));
  for (const text of ["Test child", "Test parent", "maya_review", "review-model", "test-family"]) expect(html).toContain(text);
  expect(f.showTests).not.toHaveBeenCalled();
});
