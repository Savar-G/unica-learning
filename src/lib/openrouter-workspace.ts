import type { Period } from "@/lib/admin-ai-usage";

// This scope is fixed in code. Neither request parameters nor configuration can select another workspace.
export const UNICA_WORKSPACE_ID = "2468d17e-b7eb-467f-b1ef-feec9e328d58";
export const UNICA_WORKSPACE_NAME = "Unica Learning";
export const OPENROUTER_ACTIVITY_URL = "https://openrouter.ai/workspaces/unica-learning/activity";
export type WorkspacePeriod = Pick<Period, "from" | "to">;
export interface WorkspaceGroup { label: string; costUsd: number; requests: number }
export interface WorkspaceUsage {
  costUsd: number;
  requests: number;
  models: WorkspaceGroup[];
  keys: WorkspaceGroup[];
}
export type WorkspaceReading = { status: "ok"; usage: WorkspaceUsage } | { status: "unavailable" | "no-key"; usage: null };

export function workspaceActivityUrl(period: WorkspacePeriod): string {
  const url = new URL(OPENROUTER_ACTIVITY_URL);
  url.searchParams.set("workspace_id", UNICA_WORKSPACE_ID);
  url.searchParams.set("from", period.from.toISOString());
  url.searchParams.set("to", new Date(period.to.getTime() - 1).toISOString());
  return url.toString();
}

const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

/** Reject incomplete or ambiguous provider snapshots instead of turning them into zero costs. */
function groups(raw: unknown, dimension: "workspace" | "model" | "api_key_id"): WorkspaceGroup[] | null {
  const root = object(raw);
  const data = object(root?.data);
  const meta = object(data?.metadata);
  if (!root || root.error !== undefined || !data || !meta || !Array.isArray(data.data) || meta.truncated !== false ||
      meta.row_count !== data.data.length || !Number.isSafeInteger(meta.row_count) ||
      typeof meta.query_time_ms !== "number" || !Number.isFinite(meta.query_time_ms) || meta.query_time_ms < 0 ||
      (data.warnings !== undefined && (!Array.isArray(data.warnings) || data.warnings.length !== 0))) return null;
  const result: WorkspaceGroup[] = [];
  const seen = new Set<string>();
  for (const value of data.data) {
    const row = object(value);
    const label = row?.[dimension];
    const cost = row?.total_usage;
    const requests = row?.request_count;
    // The API returns enriched key names. Do not expose a key value or an unresolved hash.
    if (typeof label !== "string" || !label.trim() || label.length > 512 || /\bsk-(?:or-|ant-)?[A-Za-z0-9_-]+/i.test(label) || /^[a-f0-9]{64}$/i.test(label) || seen.has(label) ||
        typeof cost !== "number" || !Number.isFinite(cost) || cost < 0 ||
        typeof requests !== "number" || !Number.isSafeInteger(requests) || requests < 0) return null;
    seen.add(label);
    result.push({ label, costUsd: cost, requests });
  }
  return result;
}

/** Each detail group must account for the complete aggregate, including zero-charge requests. */
export function parseWorkspaceUsage(aggregate: unknown, models: unknown, keys: unknown): WorkspaceUsage | null {
  const total = groups(aggregate, "workspace");
  const byModel = groups(models, "model");
  const byKey = groups(keys, "api_key_id");
  if (!total || total.length !== 1 || total[0].label !== UNICA_WORKSPACE_NAME || !byModel || !byKey) return null;
  const t = total[0];
  for (const lines of [byModel, byKey]) {
    const cost = lines.reduce((sum, r) => sum + r.costUsd, 0);
    const requests = lines.reduce((sum, r) => sum + r.requests, 0);
    // API charges are rounded to six decimals per row. Allow half a unit per rounded row and total.
    const tolerance = (lines.length + 1) * 0.0000005 + Number.EPSILON * Math.max(1, t.costUsd) * (lines.length + 1);
    if (!Number.isFinite(cost) || !Number.isSafeInteger(requests) || requests !== t.requests || Math.abs(cost - t.costUsd) > tolerance) return null;
  }
  return { costUsd: t.costUsd, requests: t.requests, models: byModel, keys: byKey };
}
