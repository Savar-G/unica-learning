import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AiUsagePage, UsageDetails } from "@/components/admin-ai-usage";
import { parseUsage, periodFor } from "@/lib/admin-ai-usage";
import { parseWorkspaceUsage, workspaceActivityUrl, type WorkspaceReading } from "@/lib/openrouter-workspace";
import fixtures from "@/lib/openrouter-workspace.fixtures.json";

beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const workspace: WorkspaceReading = { status: "ok", usage: parseWorkspaceUsage(fixtures.workspace.response, fixtures.model.response, fixtures.api_key_id.response)! };
const period = periodFor("30d", Date.parse("2026-11-16T20:00:00Z"));
const view = parseUsage({ totals: { cost_usd: 2.92, calls: 990 }, dimensions_version: 1, lifetime_receipts: [{ key_id: "a".repeat(64), cost_usd: 1 }], dimensions: [{ context: "practice", feature: "maya", provider: "openrouter", model: "m", key_alias: "local", key_id: "a".repeat(64), cost_usd: 1, calls: 1 }, { parent_id: "p", child_id: "c1", parent_name: "Parent", child_name: "Ada", context: "test-family", feature: "marking", provider: "subscription", model: "m", cost_usd: null, calls: 2 }] });
const render = (v = view, w: WorkspaceReading = workspace) => renderToStaticMarkup(createElement(AiUsagePage, { view: v, workspace: w, period, rate: 1.4 }));

it("shows only Unica workspace charges, all native key/model groups and separate incomplete app data", () => {
  const html = render();
  for (const text of ["Workspace spend (USD)", "USD 56.741652", "20,281", "Recorded app cost", "USD 2.92", "practice", "test-family", "Ada", "No child assigned", "No per-call charge", "These recorded app data are incomplete", "not provider totals", "Do not add these subtotals", "These totals do not assign costs to a feature or child."]) expect(html).toContain(text);
  for (const group of [...workspace.usage!.models, ...workspace.usage!.keys]) expect(html).toContain(group.label.replaceAll("&", "&amp;"));
  for (const text of ["Account lifetime spent", "Total credits", "Credit balance", "Configured API keys", "USD 64.63", "Unreconciled / unassigned"]) expect(html).not.toContain(text);
  const links = [...html.matchAll(/href="(https:\/\/openrouter.ai[^"]+)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));
  expect(links).toHaveLength(2);
  expect(links.every((link) => link === workspaceActivityUrl(period))).toBe(true);
});
it("preserves workspace totals when the app read fails", () => {
  const html = renderToStaticMarkup(createElement(AiUsagePage, { view: null, workspace, period, rate: 1.4, error: "Ledger unavailable" }));
  expect(html).toContain("USD 56.741652"); expect(html).toContain("20,281"); expect(html).toContain("Ledger unavailable");
});
it.each(["unavailable", "no-key"] as const)("keeps %s workspace costs unknown and still shows app records", (status) => {
  const html = render(view, { status, usage: null });
  expect(html).toContain("Unica workspace usage is unavailable"); expect(html).toContain("USD 2.92");
  expect(html).toMatch(/Workspace spend \(USD\)<\/dt><dd><b>Unknown/);
  expect(html).toMatch(/Workspace requests<\/dt><dd><b>Unknown/);
  expect(html).not.toContain("USD 0.00");
});
it("keeps unknown detail costs and missing migration coverage visible", () => {
  expect(renderToStaticMarkup(createElement(UsageDetails, { rows: null }))).toContain("Detailed records are unavailable");
  const unknown = { ...view.details![0], costUsd: null, unpricedCalls: 1 };
  const html = renderToStaticMarkup(createElement(UsageDetails, { rows: [unknown], more: true }));
  expect(html).toContain("Unknown"); expect(html).toContain("5,000"); expect(html).toContain("1 calls with unknown cost");
});
