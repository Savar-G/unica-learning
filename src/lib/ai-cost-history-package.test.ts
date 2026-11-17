import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { historyFixture } from "./ai-cost-history.fixtures";
import { HISTORY_FIELDS, HISTORY_HEADERS, historyHash, importHistoryPackage, inspectHistoryCsv, validateHistoryPackage } from "./ai-cost-history-package";
import { historySum } from "./ai-cost-history";

beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("validates a complete quoted CRLF file and preserves original decimals, zero, blank and negative cache evidence", () => {
  const f = historyFixture(), p = validateHistoryPackage(f.csv, f.manifest, f.snapshots);
  expect(p.rows).toHaveLength(4);
  expect(p.rows.map((r) => r.cost_total_text)).toEqual(["0.100000000000000000001", "0.2000", null, "0"]);
  expect(p.manifest.known_cost_usd).toBe("0.300000000000000000001");
  expect(p.manifest.unknown_cost_count).toBe(1);
  expect(p.rows[0].cost_cache_text).toBe("-0.02"); expect(p.rows[0].tokens_prompt_text).toBe("0");
  expect(p.rows[0].created_at_text).toBe("2026-11-01 12:00:00.123");
  expect(p.rows[1].created_at_text).toBeNull(); expect(p.manifest.row_time_zone).toBeNull();
  expect(historySum(["0.100000000000000000001", "0.2000", "-0.3"])).toBe("0.000000000000000000001");
});
it("retains only the allowlist and never copies private source strings", () => {
  const f = historyFixture(), { rows } = validateHistoryPackage(f.csv, f.manifest, f.snapshots);
  for (const row of rows) expect(Object.keys(row)).toEqual(HISTORY_FIELDS);
  expect(JSON.stringify(rows)).not.toMatch(/private|city|user|finish_reason|app_name|variant|streamed/);
  expect(rows[0].api_key_label).toBe("old shared label");
});
it.each(["source", "snapshot", "rows", "count", "amount", "zone", "workspace", "extra", "parser"])("rejects a changed %s binding before any request", async (change) => {
  const f = historyFixture(); const call = vi.fn();
  if (change === "source") f.csv[10] ^= 1;
  if (change === "snapshot") f.snapshots[0][0] ^= 1;
  if (change === "rows") f.manifest.rows_sha256 = "a".repeat(64);
  if (change === "count") f.manifest.row_count++;
  if (change === "amount") f.manifest.known_cost_usd = "0.30";
  if (change === "zone") Object.assign(f.manifest, { row_time_zone: "UTC" });
  if (change === "workspace") Object.assign(f.manifest, { workspace_id: "other" });
  if (change === "extra") Object.assign(f.manifest, { private: "unexpected" });
  if (change === "parser") Object.assign(f.manifest, { parser: "other" });
  await expect(importHistoryPackage(f, { call })).rejects.toThrow(); expect(call).not.toHaveBeenCalled();
});
it.each([
  { generation_id: "invalid" }, { cost_total: "-0.1" }, { cost_total: "1e-9" }, { cost_total: "NaN" }, { cost_total: "0." + "1".repeat(31) },
  { cost_cache: "bad" }, { created_at: "2026-02-30 12:00:00.000" }, { created_at: "2026-01-01T00:00:00.000Z" },
  { created_at: "2026-01-01 24:00:00.000" }, { model_permaslug: "<unsafe>" }, { api_key_name: "sk-or-secret" },
  { api_key_name: "a".repeat(64) }, { tokens_prompt: "-1" }, { user: "bad\u0000source" }, { api_key_disabled: "maybe" },
])("rejects invalid source evidence without leaking its value", (override) => {
  expect(() => historyFixture([{ generation_id: "gen-synthetic-valid", ...override }])).toThrow();
});
it("deduplicates identical records without losing source row positions, and rejects conflicting duplicates", () => {
  const first = { generation_id: "gen-synthetic-repeat", cost_total: "0.0100" };
  const f = historyFixture([first, first, { generation_id: "gen-synthetic-next", cost_total: "0" }]);
  const p = validateHistoryPackage(f.csv, f.manifest, f.snapshots);
  expect(p.manifest.source_row_count).toBe(3); expect(p.manifest.row_count).toBe(2);
  expect(p.rows.map((r) => [r.row_number, r.source_row_number])).toEqual([[1, 1], [2, 3]]);
  expect(() => historyFixture([first, { ...first, cost_total: "0.02" }])).toThrow();
});
it.each(["header", "width", "quote", "utf8", "empty", "trailing"])("rejects malformed full files: %s", (change) => {
  let csv = historyFixture().csv;
  if (change === "header") csv = Buffer.from(csv.toString().replace("generation_id", "wrong_header"));
  if (change === "width") csv = Buffer.from(csv.toString() + "gen-short,0\n");
  if (change === "quote") csv = Buffer.from(HISTORY_HEADERS.join(",") + '\n"unterminated');
  if (change === "utf8") csv = Buffer.from([255, 254, 253]);
  if (change === "empty") csv = Buffer.from(HISTORY_HEADERS.join(",") + "\n");
  if (change === "trailing") csv = Buffer.from(csv.toString() + "\n");
  expect(() => inspectHistoryCsv(csv)).toThrow();
});
it("rejects incomplete snapshot packages and analytics count drift", () => {
  const f = historyFixture();
  expect(() => validateHistoryPackage(f.csv, f.manifest, [])).toThrow();
  f.manifest.analytics.request_count++;
  expect(() => validateHistoryPackage(f.csv, f.manifest, f.snapshots)).toThrow();
});
it("defaults to a validated dry run and never mixes source components into totals", async () => {
  const f = historyFixture([{ generation_id: "gen-synthetic-components", cost_total: "0.00100", cost_cache: "-0.2", cost_web_search: "20", cost_file_processing: "30", byok_usage_inference: "40" }]);
  expect(await importHistoryPackage(f)).toEqual({ rows: 1, applied: false });
  expect(f.manifest.known_cost_usd).toBe("0.001");
});
it("uses bounded batches, can restart after an interruption, and requires acknowledged finalization", async () => {
  const f = historyFixture(Array.from({ length: 260 }, (_, i) => ({ generation_id: `gen-synthetic-batch-${i}`, cost_total: "0" })));
  const names: string[] = []; const stored = new Set<number>(); let interrupted = false;
  const call = vi.fn(async (name, args) => {
    names.push(name);
    if (name === "ingest_ai_cost_history_rows") {
      expect(args.p_rows.length).toBeLessThanOrEqual(128);
      for (const row of args.p_rows) stored.add(row.row_number);
      if (!interrupted) { interrupted = true; throw new Error("lost response"); }
    }
    return name === "finalize_ai_cost_history" ? true : null;
  });
  await expect(importHistoryPackage(f, { call })).rejects.toThrow("lost response");
  expect(names).not.toContain("finalize_ai_cost_history");
  expect(await importHistoryPackage(f, { call })).toEqual({ rows: 260, applied: true });
  expect(stored.size).toBe(260);
  await expect(importHistoryPackage(f, { call: async () => null })).rejects.toThrow("incomplete");
});
it("binds bytes before parse and accepts CSV BOM/LF without replacing source bytes", () => {
  const f = historyFixture();
  const csv = Buffer.concat([Buffer.from([239, 187, 191]), Buffer.from(f.csv.toString().replaceAll("\r\n", "\n"))]);
  expect(inspectHistoryCsv(csv).row_count).toBe(4);
  expect(historyHash(csv)).not.toBe(f.manifest.source.sha256);
});
