/** Source amounts stay decimal strings. No floating-point money or date-zone inference. */
export const HISTORY_WORKSPACE = "2468d17e-b7eb-467f-b1ef-feec9e328d58";
export const HISTORY_DATABASE = "https://cdjobwsyzndtltzfpyqa.supabase.co";
export const HISTORY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const HISTORY_DECIMAL = /^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,30})?$/;
export const HISTORY_FIELDS = ["row_number", "source_row_number", "generation_id", "created_at_text", "cost_total_text", "cost_web_search_text", "cost_cache_text",
  "cost_file_processing_text", "byok_usage_inference_text", "tokens_prompt_text", "tokens_completion_text", "tokens_reasoning_text", "tokens_cached_text",
  "model_permaslug", "provider_name", "generation_time_ms_text", "time_to_first_token_ms_text", "api_key_label", "api_key_disabled"] as const;
export type HistoryRow = { row_number: number; source_row_number: number; generation_id: string } & Record<Exclude<typeof HISTORY_FIELDS[number], "row_number" | "source_row_number" | "generation_id">, string | null>;

export function historyDecimal(value: unknown, signed = false): string {
  if (typeof value !== "string" || !HISTORY_DECIMAL.test(value) || (!signed && value.startsWith("-"))) throw new Error("Invalid historical evidence");
  return value;
}

export function historySum(values: readonly string[]): string {
  let total = BigInt(0), scale = 0;
  for (const value of values) {
    historyDecimal(value, true);
    const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
    const nextScale = Math.max(scale, fraction.length);
    total *= BigInt(10) ** BigInt(nextScale - scale);
    total += (value.startsWith("-") ? -BigInt(1) : BigInt(1)) * BigInt(whole + fraction) * BigInt(10) ** BigInt(nextScale - fraction.length);
    scale = nextScale;
  }
  const sign = total < BigInt(0) ? "-" : "";
  const digits = (total < BigInt(0) ? -total : total).toString().padStart(scale + 1, "0");
  const fraction = scale ? digits.slice(-scale).replace(/0+$/, "") : "";
  return `${sign}${scale ? digits.slice(0, -scale) : digits}${fraction ? `.${fraction}` : ""}`;
}

export interface HistoryGroup {
  label: string | null;
  parent_id: string | null;
  child_id: string | null;
  parent_name: string | null;
  child_name: string | null;
  feature: string | null;
  rows: number;
  known_cost_usd: string;
  unknown_cost_count: number;
}
export interface HistoryView {
  exports: { export_id: string; rows: number }[];
  omitted_exports: number;
  selection: "ok" | "empty" | "missing";
  selected: null | {
    export_id: string;
    manifest: Record<string, unknown>;
    rows: number;
    known_cost_usd: string;
    unknown_cost_count: number;
    unknown_time_count: number;
    matched_rows: number;
    ambiguous_rows: number;
    unknown_family_rows: number;
    unknown_child_rows: number;
    analytics_total_usd: string;
    difference_usd: string;
    models: HistoryGroup[];
    keys: HistoryGroup[];
    ownership: HistoryGroup[];
    omitted_groups: number;
    technical_rows: HistoryRow[];
    omitted_rows: number;
  };
}

/** No partial or malformed read can become a zero-cost export. */
export function parseHistoryView(raw: unknown): HistoryView {
  const fail = (): never => { throw new Error("Historical exports unavailable"); };
  const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : fail();
  const count = (v: unknown): number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : fail();
  const id = (v: unknown): string => typeof v === "string" && HISTORY_UUID.test(v) ? v : fail();
  const text = (v: unknown): string | null => v === null ? null : typeof v === "string" && v.length <= 200 && !/[\x00-\x1f\x7f]/.test(v) ? v : fail();
  const money = (v: unknown, signed = false): string => { try { return historyDecimal(v, signed); } catch { return fail(); } };
  const groups = (v: unknown): HistoryGroup[] => {
    if (!Array.isArray(v) || v.length > 1000) return fail();
    return v.map((item) => {
      const r = obj(item), rows = count(r.rows), unknown = count(r.unknown_cost_count);
      if (unknown > rows) return fail();
      return { label: text(r.label), parent_id: r.parent_id === null ? null : id(r.parent_id), child_id: r.child_id === null ? null : id(r.child_id),
        parent_name: text(r.parent_name), child_name: text(r.child_name), feature: text(r.feature), rows,
        known_cost_usd: money(r.known_cost_usd), unknown_cost_count: unknown };
    });
  };
  const o = obj(raw);
  if (!Array.isArray(o.exports) || o.exports.length > 50 || !["ok", "empty", "missing"].includes(String(o.selection))) return fail();
  const exports = o.exports.map((v) => { const e = obj(v); return { export_id: id(e.export_id), rows: count(e.rows) }; });
  const view: HistoryView = { exports, omitted_exports: count(o.omitted_exports), selection: o.selection as HistoryView["selection"], selected: null };
  if (o.selected === null) { if (view.selection === "ok") return fail(); return view; }
  if (view.selection !== "ok") return fail();
  const s = obj(o.selected), rows = count(s.rows);
  if (!Array.isArray(s.technical_rows) || s.technical_rows.length > 100) return fail();
  const technical = s.technical_rows.map((v) => {
    const r = obj(v);
    if (Object.keys(r).sort().join() !== [...HISTORY_FIELDS].sort().join()) return fail();
    for (const key of HISTORY_FIELDS) {
      if (key === "row_number" || key === "source_row_number") { if (count(r[key]) < 1) return fail(); }
      else text(r[key]);
    }
    if (typeof r.generation_id !== "string" || !/^gen-[a-zA-Z0-9_-]{1,196}$/.test(r.generation_id)) return fail();
    return r as HistoryRow;
  });
  const counts = { unknown_cost_count: count(s.unknown_cost_count), unknown_time_count: count(s.unknown_time_count), matched_rows: count(s.matched_rows),
    ambiguous_rows: count(s.ambiguous_rows), unknown_family_rows: count(s.unknown_family_rows), unknown_child_rows: count(s.unknown_child_rows) };
  if (Object.values(counts).some((v) => v > rows) || counts.matched_rows + counts.ambiguous_rows > rows) return fail();
  view.selected = { export_id: id(s.export_id), manifest: obj(s.manifest), rows, ...counts, known_cost_usd: money(s.known_cost_usd),
    analytics_total_usd: money(s.analytics_total_usd), difference_usd: money(s.difference_usd, true),
    models: groups(s.models), keys: groups(s.keys), ownership: groups(s.ownership), omitted_groups: count(s.omitted_groups), technical_rows: technical, omitted_rows: count(s.omitted_rows) };
  if (technical.length + view.selected.omitted_rows !== rows) return fail();
  if (historySum([view.selected.known_cost_usd, `-${view.selected.analytics_total_usd}`]) !== historySum([view.selected.difference_usd])) return fail();
  return view;
}
