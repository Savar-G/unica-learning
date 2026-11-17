import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
vi.mock("server-only", () => ({}));
import { AdminAiCostHistory } from "./admin-ai-cost-history";
import { AiUsagePage } from "./admin-ai-usage";
import { HISTORY_TEST_ID, historyViewFixture } from "@/lib/ai-cost-history.fixtures";
import { parseUsage, periodFor } from "@/lib/admin-ai-usage";
beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("uses closed native disclosures and exact separate amounts with explicit uncertainty", () => {
  const html = renderToStaticMarkup(createElement(AdminAiCostHistory, { view: historyViewFixture(), range: "year" }));
  expect(html).not.toMatch(/<details[^>]* open/);
  for (const text of ["Historical exports", "USD 0.300000000000000000001", "USD 0.2999", "USD 0.000100000000000000001", "Difference unresolved", "1 unknown costs", "4 generations have an unknown event time zone", "Capture time is unknown", "full snapshot", "date filter does not apply", "Do not add them", "Unknown child", "Unknown family", "old shared label", "50 completed exports"]) expect(html).toContain(text);
});
it("keeps source IDs, hashes and selection timestamps inside Technical details", () => {
  const view = historyViewFixture();
  const html = renderToStaticMarkup(createElement(AdminAiCostHistory, { view, range: "year" }));
  const paths: string[][] = [];
  const needles = [HISTORY_TEST_ID, String(view.selected!.manifest.rows_sha256), "2026-01-01T08:00:00.000Z", "gen-synthetic-one", "2026-11-01 12:00:00.123"];
  const visit = (node: DefaultTreeAdapterMap["node"], ancestors: string[]) => {
    const children = "childNodes" in node ? node.childNodes : [];
    const summary = node.nodeName === "details" ? children.find((n) => n.nodeName === "summary") : undefined;
    const label = summary && "childNodes" in summary ? summary.childNodes.map((n) => "value" in n ? n.value : "").join("") : null;
    const path = label === null ? ancestors : [...ancestors, label];
    if ("value" in node && needles.some((n) => node.value.includes(n))) paths.push(path);
    for (const child of children) visit(child, path);
  };
  visit(parseFragment(html), []);
  expect(paths).toEqual([["Historical exports", "Technical details"], ["Historical exports", "Technical details"]]);
});
it("distinguishes failure, no completed exports, and a missing explicit selection", () => {
  const render = (view: Parameters<typeof AdminAiCostHistory>[0]["view"], selected?: string) => renderToStaticMarkup(createElement(AdminAiCostHistory, { view, range: "7d", selected }));
  expect(render(null)).toContain("cost is unknown");
  expect(render(null, "bad")).toContain("No other export is shown");
  expect(render({ exports: [], omitted_exports: 0, selection: "empty", selected: null })).toContain("does not establish zero");
  expect(render({ exports: [], omitted_exports: 0, selection: "missing", selected: null })).toContain("missing or incomplete");
});
it("preserves range, report and export links, discloses limits and never shows an ID as a label", () => {
  const view = historyViewFixture(); view.omitted_exports = 3; view.selected!.omitted_groups = 2;
  const html = renderToStaticMarkup(createElement(AiUsagePage, { view: parseUsage({ totals: { cost_usd: 2, calls: 1 } }), period: periodFor("year", Date.parse("2026-11-16T12:00:00Z")),
    rate: 1.4, workspace: { status: "unavailable", usage: null }, report: "records", history: view, historySelection: HISTORY_TEST_ID }));
  expect(html).toContain(`range=7d&amp;report=records&amp;historicalExport=${HISTORY_TEST_ID}`);
  expect(html).toContain(`range=year&amp;report=models&amp;historicalExport=${HISTORY_TEST_ID}`);
  expect(html).toContain("3 older exports are not listed"); expect(html).toContain("2 groups are not shown");
  expect(html).not.toContain(`>${HISTORY_TEST_ID}</a>`);
});
it.each([true, false])("keeps the Records sources independent when the app is available: %s", (available) => {
  const props = { view: available ? parseUsage({ totals: { cost_usd: 2, calls: 1 } }) : null, period: periodFor("7d", Date.parse("2026-11-16T12:00:00Z")),
    rate: 1.4, workspace: { status: "ok" as const, usage: { costUsd: 7, requests: 5, models: [], keys: [] } }, report: "records" as const };
  const html = renderToStaticMarkup(createElement(AiUsagePage, { ...props, history: historyViewFixture() }));
  expect(html).toContain("USD 7.00"); expect(html).toContain("USD 0.300000000000000000001");
  const failed = renderToStaticMarkup(createElement(AiUsagePage, { ...props, history: null }));
  expect(failed).toContain("USD 7.00"); expect(failed).toContain("Historical exports are unavailable");
  if (available) expect(failed).toContain("USD 2.00");
  const features = renderToStaticMarkup(createElement(AiUsagePage, { ...props, report: "features", history: historyViewFixture() }));
  expect(features).not.toContain("Historical exports");
});
