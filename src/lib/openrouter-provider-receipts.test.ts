import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseProviderReceiptView, providerReceiptPeriod } from "./openrouter-provider-receipts";

beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const receiptViewFixture = () => ({
  totals: { receipts: 3, known_cost_usd: 0.037, unknown_cost_receipts: 1, matched_receipts: 1, unmatched_receipts: 2,
    unmatched_known_cost_usd: 0, unmatched_unknown_cost_receipts: 1, first_receipt_at: "2026-11-16T10:00:00Z", last_receipt_at: "2026-11-16T12:00:00Z", last_received_at: "2026-11-16T12:01:00Z" },
  models: [{ label: "test/model", known_cost_usd: 0.037, receipts: 3, unknown_cost_receipts: 1 }],
  keys: [{ workspace_id: "local", api_key_id: null, known_cost_usd: 0.037, receipts: 3, unknown_cost_receipts: 1 }],
  features: [{ label: null, known_cost_usd: 0.037, receipts: 3, unknown_cost_receipts: 1 }],
  children: [{ child_id: "00000000-0000-0000-0000-000000000001", feature: "maya", model: "test/model", workspace_id: "local", api_key_id: "123", test_family: true, known_cost_usd: 0.037, receipts: 1, unknown_cost_receipts: 0 }],
  omitted_groups: 0,
});

it("fails a missing or malformed read without showing a false zero", () => {
  for (const raw of [null, {}, { totals: {} }, { ...receiptViewFixture(), models: null }, { ...receiptViewFixture(), totals: { ...receiptViewFixture().totals, known_cost_usd: null } },
    { ...receiptViewFixture(), totals: { ...receiptViewFixture().totals, matched_receipts: 2 } }]) expect(() => parseProviderReceiptView(raw)).toThrow();
});
it("retains unknowns and test-family attribution", () => {
  const view = parseProviderReceiptView(receiptViewFixture());
  expect(view.totals.known_cost_usd).toBe(0.037);
  expect(view.totals.unknown_cost_receipts).toBe(1);
  expect(view.features[0].label).toBeNull();
  expect(view.children[0].test_family).toBe(true);
});
it("selects bounded Vancouver periods with the dated BC daylight override", () => {
  const now = Date.parse("2026-11-02T20:00:00Z");
  const week = providerReceiptPeriod("7d", now);
  expect(week.from.toISOString()).toBe("2026-10-27T07:00:00.000Z");
  expect(week.to.toISOString()).toBe("2026-11-03T07:00:00.000Z");
  expect(providerReceiptPeriod("month", now).from.toISOString()).toBe("2026-11-01T07:00:00.000Z");
  expect(providerReceiptPeriod(undefined, now).range).toBe("30d");
});
