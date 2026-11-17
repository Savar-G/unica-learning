import { createHash } from "node:crypto";
import { HISTORY_FIELDS, HISTORY_UUID, HISTORY_WORKSPACE, historyDecimal, historySum, type HistoryRow } from "./ai-cost-history";
export { HISTORY_FIELDS, type HistoryRow } from "./ai-cost-history";

export const HISTORY_HEADERS = "generation_id,created_at,cost_total,cost_web_search,cost_cache,cost_file_processing,byok_usage_inference,tokens_prompt,tokens_completion,tokens_reasoning,tokens_cached,model_permaslug,provider_name,variant,cancelled,streamed,user,finish_reason_raw,finish_reason_normalized,generation_time_ms,time_to_first_token_ms,user_agent,country,city,asn,asn_organization,app_name,api_key_name,api_key_disabled".split(",");
export interface HistoryManifest {
  version: 1;
  parser: "openrouter-logs-csv-v1";
  export_id: string;
  source_kind: "openrouter_logs_csv";
  workspace_id: typeof HISTORY_WORKSPACE;
  workspace_basis: "controller_recorded_export_procedure";
  source: { sha256: string; bytes: number };
  headers: string[];
  source_row_count: number;
  row_count: number;
  distinct_generation_count: number;
  known_cost_usd: string;
  unknown_cost_count: number;
  rows_sha256: string;
  selection: { control: "This Year"; from: string; to: string };
  verified_at: string;
  captured_at: null;
  row_time_zone: null;
  analytics: { total_usd: string; request_count: number; snapshots: { sha256: string; bytes: number }[] };
}
export interface HistoryPackage { manifest: HistoryManifest; rows: HistoryRow[] }
const fail = (): never => { throw new Error("Invalid historical evidence package"); };
export const historyHash = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
const plain = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : fail();
const keys = (v: Record<string, unknown>, allowed: readonly string[]) => { if (Object.keys(v).sort().join() !== [...allowed].sort().join()) fail(); };
const integer = (v: unknown, min = 0, max = 250_000): number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : fail();
const utc = (v: unknown): string => typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v ? v : fail();
const binding = (v: unknown, bytes?: Uint8Array) => {
  const b = plain(v); keys(b, ["sha256", "bytes"]);
  if (typeof b.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(b.sha256)) fail();
  integer(b.bytes, 1, 50_000_000);
  if (bytes && (b.bytes !== bytes.byteLength || b.sha256 !== historyHash(bytes))) fail();
};

/** RFC 4180 quoting, including doubled quotes, embedded newlines and CRLF. No permissive column repair. */
function csvRecords(text: string): string[][] {
  const records: string[][] = []; let row: string[] = [], field = "", quoted = false, ended = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else { quoted = false; ended = true; }
    } else if (c === '"') {
      if (field || ended) fail(); quoted = true;
    } else if (c === "," || c === "\n" || c === "\r") {
      row.push(field); field = ""; ended = false;
      if (c !== ",") {
        if (c === "\r") { if (text[i + 1] !== "\n") fail(); i++; }
        records.push(row); row = [];
      }
    } else { if (ended) fail(); field += c; }
    if (field.length > 16_384 || records.length > 250_001) fail();
  }
  if (quoted) fail();
  if (field || row.length || ended) { row.push(field); records.push(row); }
  return records;
}

export function historyRowsHash(rows: readonly HistoryRow[]): string {
  return historyHash(rows.map((r) => HISTORY_FIELDS.map((k) => r[k] ?? "").join("\t") + "\n").join(""));
}

/** Full source read, privacy filtering and exact arithmetic precede any database call. */
export function inspectHistoryCsv(bytes: Uint8Array) {
  if (!bytes.byteLength || bytes.byteLength > 50_000_000) fail();
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return fail(); }
  // A UTF-8 BOM is accepted by TextDecoder. Hashes still bind the original bytes.
  const records = csvRecords(text);
  if (JSON.stringify(records.shift()) !== JSON.stringify(HISTORY_HEADERS) || !records.length || records.length > 250_000) fail();
  const rows: HistoryRow[] = [], seen = new Map<string, string>();
  for (const [offset, values] of records.entries()) {
    if (values.length !== HISTORY_HEADERS.length || values.some((v) => /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(v))) fail();
    const data = Object.fromEntries(HISTORY_HEADERS.map((k, i) => [k, values[i]]));
    if (!/^gen-[a-zA-Z0-9_-]{1,196}$/.test(data.generation_id)) fail();
    const encoded = JSON.stringify(values), previous = seen.get(data.generation_id);
    if (previous !== undefined) { if (previous !== encoded) fail(); continue; }
    seen.set(data.generation_id, encoded);
    const nullable = (name: string, re: RegExp): string | null => {
      const v = data[name]; if (!v) return null; if (!re.test(v)) return fail(); return v;
    };
    const amount = (name: string, signed = false): string | null => {
      const v = data[name]; if (!v) return null;
      historyDecimal(v, signed); if (v.replace(/^-/, "").split(".")[0].length > 12) fail(); return v;
    };
    const created = nullable("created_at", /^20\d\d-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}$/);
    if (created) {
      // Validate calendar fields without assigning a time zone or creating an event instant.
      const [year, month, day, hour, minute, second] = created.match(/\d+/g)!.map(Number);
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) fail();
    }
    const label = nullable("api_key_name", /^[a-zA-Z0-9][a-zA-Z0-9 ._:/()-]{0,79}$/);
    if (label && /sk-|sb_secret|bearer|eyJ|[a-f0-9]{32}|[a-zA-Z0-9_-]{40}/i.test(label)) fail();
    rows.push({ row_number: rows.length + 1, source_row_number: offset + 1, generation_id: data.generation_id,
      created_at_text: created, cost_total_text: amount("cost_total"), cost_web_search_text: amount("cost_web_search"), cost_cache_text: amount("cost_cache", true),
      cost_file_processing_text: amount("cost_file_processing"), byok_usage_inference_text: amount("byok_usage_inference"),
      tokens_prompt_text: nullable("tokens_prompt", /^(?:0|[1-9]\d{0,14})$/), tokens_completion_text: nullable("tokens_completion", /^(?:0|[1-9]\d{0,14})$/),
      tokens_reasoning_text: nullable("tokens_reasoning", /^(?:0|[1-9]\d{0,14})$/), tokens_cached_text: nullable("tokens_cached", /^(?:0|[1-9]\d{0,14})$/),
      model_permaslug: nullable("model_permaslug", /^[a-zA-Z0-9][a-zA-Z0-9_./:@+~-]{0,199}$/),
      provider_name: nullable("provider_name", /^[a-zA-Z0-9][a-zA-Z0-9 ._:/()-]{0,79}$/),
      generation_time_ms_text: amount("generation_time_ms"), time_to_first_token_ms_text: amount("time_to_first_token_ms"), api_key_label: label,
      api_key_disabled: nullable("api_key_disabled", /^(?:true|false)$/) });
  }
  return { rows, source_row_count: records.length, row_count: rows.length, distinct_generation_count: rows.length,
    known_cost_usd: historySum(rows.flatMap((r) => r.cost_total_text === null ? [] : [r.cost_total_text])),
    unknown_cost_count: rows.filter((r) => r.cost_total_text === null).length, rows_sha256: historyRowsHash(rows) };
}

/** Controller metadata binds snapshots; it does not establish row-level workspace or event-zone proof. */
export function validateHistoryPackage(csv: Uint8Array, rawManifest: unknown, snapshots: readonly Uint8Array[]): HistoryPackage {
  const m = plain(rawManifest);
  keys(m, ["version", "parser", "export_id", "source_kind", "workspace_id", "workspace_basis", "source", "headers", "source_row_count", "row_count", "distinct_generation_count",
    "known_cost_usd", "unknown_cost_count", "rows_sha256", "selection", "verified_at", "captured_at", "row_time_zone", "analytics"]);
  if (m.version !== 1 || m.parser !== "openrouter-logs-csv-v1" || typeof m.export_id !== "string" || !HISTORY_UUID.test(m.export_id) || m.source_kind !== "openrouter_logs_csv" ||
    m.workspace_id !== HISTORY_WORKSPACE || m.workspace_basis !== "controller_recorded_export_procedure" || m.captured_at !== null || m.row_time_zone !== null || JSON.stringify(m.headers) !== JSON.stringify(HISTORY_HEADERS)) fail();
  binding(m.source, csv); utc(m.verified_at);
  const selection = plain(m.selection); keys(selection, ["control", "from", "to"]);
  if (selection.control !== "This Year" || utc(selection.from) >= utc(selection.to)) fail();
  const a = plain(m.analytics); keys(a, ["total_usd", "request_count", "snapshots"]); historyDecimal(a.total_usd); integer(a.request_count);
  const bindings = a.snapshots;
  if (!Array.isArray(bindings) || bindings.length < 1 || bindings.length > 8 || bindings.length !== snapshots.length) return fail();
  bindings.forEach((b, i) => binding(b, snapshots[i]));
  const evidence = inspectHistoryCsv(csv);
  for (const k of ["source_row_count", "row_count", "distinct_generation_count", "known_cost_usd", "unknown_cost_count", "rows_sha256"] as const) if (m[k] !== evidence[k]) fail();
  if (a.request_count !== evidence.distinct_generation_count) fail();
  return { manifest: m as unknown as HistoryManifest, rows: evidence.rows };
}

export interface HistoryImportTransport { call(name: string, args: Record<string, unknown>): Promise<unknown> }

/** Validation is repeated at the public import boundary, including the default dry run. */
export async function importHistoryPackage(input: { csv: Uint8Array; manifest: unknown; snapshots: readonly Uint8Array[] }, transport?: HistoryImportTransport) {
  const pack = validateHistoryPackage(input.csv, input.manifest, input.snapshots);
  if (!transport) return { rows: pack.rows.length, applied: false };
  const id = pack.manifest.export_id;
  await transport.call("begin_ai_cost_history", { p_manifest: pack.manifest });
  for (let i = 0; i < pack.rows.length; i += 128) await transport.call("ingest_ai_cost_history_rows", { p_export_id: id, p_rows: pack.rows.slice(i, i + 128) });
  const done = await transport.call("finalize_ai_cost_history", { p_export_id: id });
  if (done !== true) throw new Error("Historical import is incomplete");
  return { rows: pack.rows.length, applied: true };
}
