import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminProviderReceipts } from "./admin-provider-receipts";
import type { ProviderReceiptView } from "@/lib/openrouter-provider-receipts";

beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const render = (view: ProviderReceiptView | null) => renderToStaticMarkup(createElement(AdminProviderReceipts, {
  view, periodLabel: "7 days", ranges: [{ key: "7d", label: "7 days", href: "/admin/ai?providerRange=7d", current: true }],
}));
it("shows an unavailable read as unknown with a usable period link", () => {
  const html = render(null);
  expect(html).toContain("Provider receipts are unavailable. The cost is unknown.");
  expect(html).toContain("providerRange=7d");
  expect(html).not.toContain("USD 0.00");
});
it("shows separate provider totals, unmatched coverage, unknown key/feature and child test cost", () => {
  const html = render({
    totals: { receipts: 2, known_cost_usd: 0.037, unknown_cost_receipts: 1, matched_receipts: 1, unmatched_receipts: 1, unmatched_known_cost_usd: 0,
      unmatched_unknown_cost_receipts: 1, first_receipt_at: null, last_receipt_at: null, last_received_at: null },
    models: [{ label: "test/model", receipts: 2, known_cost_usd: 0.037, unknown_cost_receipts: 1 }],
    keys: [{ workspace_id: "local", api_key_id: null, receipts: 2, known_cost_usd: 0.037, unknown_cost_receipts: 1 }],
    features: [{ label: null, receipts: 1, known_cost_usd: 0, unknown_cost_receipts: 1 }],
    children: [{ child_id: "synthetic-child", feature: "maya", model: "test/model", workspace_id: "local", api_key_id: "123", test_family: true, receipts: 1, known_cost_usd: 0.037, unknown_cost_receipts: 0 }], omitted_groups: 1,
  });
  for (const text of ["Do not add them together", "1 / 2", "50.0%", "Unknown key", "Unknown (no app match)", "Test / team", "USD 0.037", "1 detail groups are not shown"]) expect(html).toContain(text);
  expect(html).toContain('/admin/children/synthetic-child');
});
