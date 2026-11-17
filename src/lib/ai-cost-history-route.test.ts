import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-store", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin-ai-usage-store", () => ({ readAiUsage: vi.fn() }));
vi.mock("@/lib/openrouter-workspace-store", () => ({ readWorkspaceUsage: vi.fn() }));
vi.mock("@/lib/openrouter-provider-receipts-store", () => ({ readProviderReceipts: vi.fn() }));
vi.mock("@/lib/ai-cost-history-store", () => ({ readAiCostHistory: vi.fn() }));
vi.mock("@/components/admin-frame", () => ({ AdminFrame: ({ children }: { children: ReactNode }) => createElement("main", null, children) }));
import Route from "@/app/(product)/admin/ai/page";
import { requireAdmin } from "./admin-store";
import { readAiUsage } from "./admin-ai-usage-store";
import { readWorkspaceUsage } from "./openrouter-workspace-store";
import { readProviderReceipts } from "./openrouter-provider-receipts-store";
import { readAiCostHistory } from "./ai-cost-history-store";
import { parseUsage } from "./admin-ai-usage";
import { historyViewFixture, HISTORY_TEST_ID } from "./ai-cost-history.fixtures";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ email: "synthetic-admin" } as Awaited<ReturnType<typeof requireAdmin>>);
  vi.mocked(readAiUsage).mockResolvedValue(parseUsage({ totals: { cost_usd: 2, calls: 1 } }));
  vi.mocked(readWorkspaceUsage).mockResolvedValue({ status: "ok", usage: { costUsd: 7, requests: 3, models: [], keys: [] } });
  vi.mocked(readProviderReceipts).mockRejectedValue(new Error("synthetic provider failure"));
  vi.mocked(readAiCostHistory).mockResolvedValue(historyViewFixture());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const render = async (report: string, historicalExport?: string) => renderToStaticMarkup(await Route({ searchParams: Promise.resolve({ report, range: "7d", historicalExport }), params: Promise.resolve({}) }));

it("runs no historical database read outside Records", async () => {
  for (const report of ["features", "models", "keys", "families", "invalid"]) await render(report);
  expect(readAiCostHistory).not.toHaveBeenCalled();
  await render("records", HISTORY_TEST_ID);
  expect(readAiCostHistory).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ email: "synthetic-admin" }), HISTORY_TEST_ID);
});
it("keeps every read behind the existing admin boundary", async () => {
  vi.mocked(requireAdmin).mockRejectedValue(new Error("denied"));
  await expect(render("records")).rejects.toThrow("denied");
  for (const read of [readAiUsage, readWorkspaceUsage, readProviderReceipts, readAiCostHistory]) expect(read).not.toHaveBeenCalled();
});
it("isolates historical and ordinary report failures in both directions", async () => {
  vi.mocked(readAiCostHistory).mockRejectedValue(new Error("synthetic history failure"));
  let html = await render("records");
  expect(html).toContain("Historical exports are unavailable"); expect(html).toContain("USD 7.00"); expect(html).toContain("USD 2.00");
  vi.mocked(readAiCostHistory).mockResolvedValue(historyViewFixture());
  vi.mocked(readAiUsage).mockRejectedValue(new Error("synthetic app failure"));
  vi.mocked(readWorkspaceUsage).mockRejectedValue(new Error("synthetic workspace failure"));
  html = await render("records");
  expect(html).toContain("USD 0.300000000000000000001"); expect(html).toContain("AI usage could not be read");
});
