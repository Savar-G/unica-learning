// Synthetic only. The controller's exports and app snapshots are never test inputs.
import { HISTORY_WORKSPACE, historySum, type HistoryView } from "./ai-cost-history";
import { HISTORY_HEADERS, historyHash, inspectHistoryCsv, type HistoryManifest } from "./ai-cost-history-package";

export const HISTORY_TEST_ID = "00000000-0000-4000-8000-000000000001";
export function historyFixture(source?: Partial<Record<string, string>>[], exportId = HISTORY_TEST_ID) {
  const input = source ?? [
    { generation_id: "gen-synthetic-one", created_at: "2026-11-01 12:00:00.123", cost_total: "0.100000000000000000001", cost_cache: "-0.02", model_permaslug: "test/model", api_key_name: "old shared label", tokens_prompt: "0", user: 'private, "quoted"\r\nsource', city: "private location" },
    { generation_id: "gen-synthetic-two", cost_total: "0.2000", model_permaslug: "test/model", api_key_name: "other label" },
    { generation_id: "gen-synthetic-three" },
    { generation_id: "gen-synthetic-four", cost_total: "0", created_at: "2026-01-01 00:00:00.000" },
  ];
  const quote = (v: string) => /[,"\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  const csv = Buffer.from(HISTORY_HEADERS.join(",") + "\r\n" + input.map((r) => HISTORY_HEADERS.map((k) => quote(r[k] ?? "")).join(",")).join("\r\n") + "\r\n");
  const evidence = inspectHistoryCsv(csv);
  const snapshot = Buffer.from("Synthetic analytics evidence");
  const { rows, ...summary } = evidence;
  const manifest: HistoryManifest = { version: 1, parser: "openrouter-logs-csv-v1", export_id: exportId, source_kind: "openrouter_logs_csv", workspace_id: HISTORY_WORKSPACE,
    workspace_basis: "controller_recorded_export_procedure", source: { sha256: historyHash(csv), bytes: csv.length }, headers: HISTORY_HEADERS,
    ...summary, selection: { control: "This Year", from: "2026-01-01T08:00:00.000Z", to: "2026-11-17T00:46:24.928Z" },
    verified_at: "2026-11-17T01:00:00.000Z", captured_at: null, row_time_zone: null,
    analytics: { total_usd: "0.2999", request_count: evidence.row_count, snapshots: [{ sha256: historyHash(snapshot), bytes: snapshot.length }] } };
  return { csv, manifest, snapshots: [snapshot], rows };
}

export function historyViewFixture(): HistoryView {
  const f = historyFixture();
  const group = { label: "test/model", parent_id: null, child_id: null, parent_name: null, child_name: null, feature: null,
    rows: 4, known_cost_usd: f.manifest.known_cost_usd, unknown_cost_count: 1 };
  return { exports: [{ export_id: HISTORY_TEST_ID, rows: 4 }], omitted_exports: 0, selection: "ok", selected: {
    export_id: HISTORY_TEST_ID, manifest: { ...f.manifest }, rows: 4, known_cost_usd: f.manifest.known_cost_usd, unknown_cost_count: 1, unknown_time_count: 4,
    matched_rows: 0, ambiguous_rows: 0, unknown_family_rows: 4, unknown_child_rows: 4, analytics_total_usd: f.manifest.analytics.total_usd,
    difference_usd: historySum([f.manifest.known_cost_usd, `-${f.manifest.analytics.total_usd}`]), models: [group], keys: [{ ...group, label: "old shared label" }],
    ownership: [{ ...group, label: null }], omitted_groups: 0, technical_rows: f.rows, omitted_rows: 0,
  } };
}
