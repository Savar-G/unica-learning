import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AiUsagePage, UsageDetails } from "@/components/admin-ai-usage";
import { parseUsage, periodFor, type OpenRouterBilling } from "@/lib/admin-ai-usage";

beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const billing: OpenRouterBilling = { checkedAt: "2026-11-16T18:00:00Z", account: { source: "billing", keyId: "a".repeat(64), status: "ok", spentUsd: 64.63, creditsUsd: 65, balanceUsd: 0.37 }, month: { monthUsd: 4.28, asked: 1, answered: 1, keys: [{ label: "main (safe-id)", monthUsd: 4.28 }] } };
const view = parseUsage({ totals: { cost_usd: 2.92, calls: 990 }, dimensions_version: 1, lifetime_receipts: [{ key_id: "a".repeat(64), cost_usd: 1 }], dimensions: [{ context: "practice", feature: "maya", provider: "openrouter", model: "m", key_alias: "local", key_id: "a".repeat(64), cost_usd: 1, calls: 1 }, { parent_id: "p", child_id: "c1", parent_name: "Parent", child_name: "Ada", context: "test-family", feature: "marking", provider: "subscription", model: "m", cost_usd: null, calls: 2 }] });
const render = (v = view, b = billing) => renderToStaticMarkup(createElement(AiUsagePage, { view: v, billing: b, period: periodFor("30d", Date.parse(b.checkedAt)), rate: 1.4 }));

it("shows large account spend, smaller key-month usage and a small recorded subtotal without asserting a false gap", () => {
  const html = render();
  for (const text of ["Account lifetime spent", "USD 64.63", "USD 65.00", "USD 0.37", "USD 4.28", "Recorded app cost", "USD 2.92", "USD 63.63", "Unreconciled / unassigned", "2026-11-16T18:00:00Z", "practice", "test-family", "Ada", "No child assigned", "No per-call charge"]) expect(html).toContain(text);
  expect(html).not.toContain("every paid call has a cost");
  expect(html).not.toContain("Not recorded</dt>");
  expect(html).not.toContain("Total cost</dt>");
});
it("preserves account and key success when the app read fails", () => {
  const html = renderToStaticMarkup(createElement(AiUsagePage, { view: null, billing, period: periodFor("7d", Date.now()), rate: 1.4, error: "Ledger unavailable" }));
  expect(html).toContain("USD 64.63"); expect(html).toContain("USD 4.28"); expect(html).toContain("Ledger unavailable");
  expect(html).not.toContain("USD 63.63");
});
it("does not turn a failed account read into zero and still shows the app records", () => {
  const html = render(view, { ...billing, account: { ...billing.account, status: "unavailable", spentUsd: null, creditsUsd: null, balanceUsd: null } });
  expect(html).toContain("Account billing is unavailable"); expect(html).toContain("USD 2.92");
  expect(html).toMatch(/Account lifetime spent<\/dt><dd><b>Unavailable/);
});
it("keeps unknown detail costs and missing migration coverage visible", () => {
  expect(renderToStaticMarkup(createElement(UsageDetails, { rows: null }))).toContain("Detailed records are unavailable");
  const unknown = { ...view.details![0], costUsd: null, unpricedCalls: 1 };
  const html = renderToStaticMarkup(createElement(UsageDetails, { rows: [unknown], more: true }));
  expect(html).toContain("Unknown"); expect(html).toContain("5,000"); expect(html).toContain("1 calls with unknown cost");
});
