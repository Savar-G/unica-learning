import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AiUsagePage, UsageDetails, parseAiUsageReport, type AiUsageReport } from "@/components/admin-ai-usage";
import { parseUsage, periodFor } from "@/lib/admin-ai-usage";
import { parseWorkspaceUsage, workspaceActivityUrl, type WorkspaceReading } from "@/lib/openrouter-workspace";
import fixtures from "@/lib/openrouter-workspace.fixtures.json";

beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const workspace: WorkspaceReading = { status: "ok", usage: parseWorkspaceUsage(fixtures.workspace.response, fixtures.model.response, fixtures.api_key_id.response)! };
const period = periodFor("30d", Date.parse("2026-11-16T20:00:00Z"));
const view = parseUsage({ totals: { cost_usd: 2.92, calls: 990 }, by_feature: [{ feature: "maya", cost_usd: 1, calls: 1 }, { feature: "marking", cost_usd: 0, calls: 2 }], dimensions_version: 1, lifetime_receipts: [{ key_id: "a".repeat(64), cost_usd: 1 }], dimensions: [{ context: "practice", feature: "maya", provider: "openrouter", model: "m", key_alias: "local", key_id: "a".repeat(64), cost_usd: 1, calls: 1 }, { parent_id: "p", child_id: "c1", parent_name: "Parent", child_name: "Ada", context: "test-family", feature: "marking", provider: "subscription", model: "m", cost_usd: null, calls: 2 }] });
const render = (v = view, w: WorkspaceReading = workspace, report: AiUsageReport = "features") =>
  renderToStaticMarkup(createElement(AiUsagePage, { view: v, workspace: w, period, rate: 1.4, report }));

it("puts totals before report navigation and keeps the default page focused on features", () => {
  const html = render();
  for (const text of ["Workspace spend (USD)", "USD 56.74", "20,281", "Recorded app cost", "USD 2.92", "Partial history", "These recorded app data are incomplete", "not provider totals", "Do not add these subtotals"]) expect(html).toContain(text);
  expect(html.indexOf('aria-label="AI cost totals"')).toBeLessThan(html.indexOf('aria-label="Cost reports"'));
  expect(html.indexOf('aria-label="Cost reports"')).toBeLessThan(html.indexOf('Recorded cost by feature'));
  expect(html).toMatch(/aria-current="page"[^>]*>Features/);
  expect(html).not.toContain("Workspace cost by model");
  expect(html).not.toContain("Workspace cost by API key");
  expect(html).not.toContain("OpenRouter provider receipts");
  expect(html).not.toMatch(/<details[^>]* open/);
  for (const text of ["Account lifetime spent", "Total credits", "Credit balance", "Configured API keys", "USD 64.63"]) expect(html).not.toContain(text);
});

it("retains every provider model and key on its report, with an exact-value title and one scoped activity link", () => {
  for (const report of ["models", "keys"] as const) {
    const html = render(view, workspace, report);
    for (const group of workspace.usage![report]) expect(html).toContain(group.label.replaceAll("&", "&amp;"));
    const links = [...html.matchAll(/href="(https:\/\/openrouter.ai[^"]+)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));
    expect(links).toEqual([workspaceActivityUrl(period)]);
    expect(html).toContain('title="USD 56.741652"');
  }
});

it("preserves the selected report in date links and the selected period in report links", () => {
  const html = render(view, workspace, "families");
  for (const range of ["7d", "30d", "month", "year"]) expect(html).toContain(`range=${range}&amp;report=families`);
  for (const report of ["features", "models", "keys", "families", "records"]) expect(html).toContain(`range=30d&amp;report=${report}`);
  expect(html).toMatch(/aria-current="page"[^>]*>Families/);
});

it("retains unknown prices, subscription meaning, safe keys and ownership in collapsed records", () => {
  const html = render(view, workspace, "records");
  for (const text of ["practice", "test-family", "Ada", "No child assigned", "No per-call charge"]) expect(html).toContain(text);
  expect(html).toContain("Technical details");
  expect(html).not.toMatch(/<details[^>]* open/);
});

it.each([undefined, "invalid", [], ["bad", "models"]])("defaults an unsupported report to Features: %s", (input) => {
  expect(parseAiUsageReport(input)).toBe("features");
});
it("accepts only the first report value", () => {
  expect(parseAiUsageReport(["models", "keys"])).toBe("models");
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
});
it("keeps unknown detail costs and missing migration coverage visible", () => {
  expect(renderToStaticMarkup(createElement(UsageDetails, { rows: null }))).toContain("Detailed records are unavailable");
  const unknown = { ...view.details![0], costUsd: null, unpricedCalls: 1 };
  const html = renderToStaticMarkup(createElement(UsageDetails, { rows: [unknown], more: true }));
  expect(html).toContain("Unknown"); expect(html).toContain("5,000"); expect(html).toContain("1 calls with unknown cost");
});
