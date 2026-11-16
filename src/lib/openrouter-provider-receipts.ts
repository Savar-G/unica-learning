import { PACIFIC_ZONE, addDays, localDateTime, localDay } from "@/lib/family-time";

/** An independent provider subtotal. No application or legacy ledger money is included. */
export interface ReceiptGroup {
  label?: string | null;
  workspace_id?: string;
  api_key_id?: string | null;
  child_id?: string;
  feature?: string;
  model?: string;
  test_family?: boolean;
  receipts: number;
  known_cost_usd: number;
  unknown_cost_receipts: number;
}
export interface ProviderReceiptView {
  totals: {
    receipts: number;
    known_cost_usd: number;
    unknown_cost_receipts: number;
    matched_receipts: number;
    unmatched_receipts: number;
    unmatched_known_cost_usd: number;
    unmatched_unknown_cost_receipts: number;
    first_receipt_at: string | null;
    last_receipt_at: string | null;
    last_received_at: string | null;
  };
  models: ReceiptGroup[];
  keys: ReceiptGroup[];
  features: ReceiptGroup[];
  children: ReceiptGroup[];
  omitted_groups: number;
}

/** Fail closed on a missing or malformed database read; an outage must never become zero spend. */
export function parseProviderReceiptView(raw: unknown): ProviderReceiptView {
  const obj = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Provider receipts unavailable");
    return v as Record<string, unknown>;
  };
  const o = obj(raw), t = obj(o.totals);
  const num = (v: unknown): number => {
    const n = typeof v === "string" && /^\d+(?:\.\d+)?$/.test(v) ? Number(v) : v;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) throw new Error("Provider receipts unavailable");
    return n;
  };
  const count = (v: unknown): number => {
    const n = num(v);
    if (!Number.isSafeInteger(n)) throw new Error("Provider receipts unavailable");
    return n;
  };
  const stamp = (v: unknown): string | null => {
    if (v === null) return null;
    if (typeof v !== "string" || !Number.isFinite(Date.parse(v))) throw new Error("Provider receipts unavailable");
    return v;
  };
  const groups = (v: unknown): ReceiptGroup[] => {
    if (!Array.isArray(v)) throw new Error("Provider receipts unavailable");
    return v.map((r) => {
      const row = obj(r);
      for (const k of ["label", "workspace_id", "api_key_id", "child_id", "feature", "model"]) {
        if (row[k] !== undefined && row[k] !== null && typeof row[k] !== "string") throw new Error("Provider receipts unavailable");
      }
      if (row.test_family !== undefined && typeof row.test_family !== "boolean") throw new Error("Provider receipts unavailable");
      return { ...row, receipts: count(row.receipts), known_cost_usd: num(row.known_cost_usd), unknown_cost_receipts: count(row.unknown_cost_receipts) } as ReceiptGroup;
    });
  };
  const view: ProviderReceiptView = {
    totals: {
      receipts: count(t.receipts), known_cost_usd: num(t.known_cost_usd), unknown_cost_receipts: count(t.unknown_cost_receipts),
      matched_receipts: count(t.matched_receipts), unmatched_receipts: count(t.unmatched_receipts),
      unmatched_known_cost_usd: num(t.unmatched_known_cost_usd), unmatched_unknown_cost_receipts: count(t.unmatched_unknown_cost_receipts),
      first_receipt_at: stamp(t.first_receipt_at), last_receipt_at: stamp(t.last_receipt_at), last_received_at: stamp(t.last_received_at),
    },
    models: groups(o.models), keys: groups(o.keys), features: groups(o.features), children: groups(o.children), omitted_groups: count(o.omitted_groups),
  };
  if (view.totals.matched_receipts + view.totals.unmatched_receipts !== view.totals.receipts || view.totals.unknown_cost_receipts > view.totals.receipts) throw new Error("Provider receipts unavailable");
  return view;
}

export const PROVIDER_RECEIPT_RANGES = [
  { key: "7d", label: "7 days" }, { key: "30d", label: "30 days" }, { key: "month", label: "This month" },
] as const;
export type ProviderReceiptRange = (typeof PROVIDER_RECEIPT_RANGES)[number]["key"];

/** Independent period selector. Pass providerRange from the page's query, without changing the app period. */
export function providerReceiptPeriod(value: string | string[] | undefined, now: number): {
  range: ProviderReceiptRange; from: Date; to: Date; label: string;
} {
  const key = Array.isArray(value) ? value[0] : value;
  const selected = PROVIDER_RECEIPT_RANGES.find((r) => r.key === key) ?? PROVIDER_RECEIPT_RANGES[1];
  const today = localDay(now, PACIFIC_ZONE);
  const first = selected.key === "month" ? `${today.slice(0, 8)}01` : addDays(today, selected.key === "7d" ? -6 : -29);
  return { range: selected.key, from: new Date(localDateTime(first, PACIFIC_ZONE)),
    to: new Date(localDateTime(addDays(today, 1), PACIFIC_ZONE)), label: `${selected.label} (${first} to ${today}, Vancouver)` };
}
