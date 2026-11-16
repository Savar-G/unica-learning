import "server-only";
import { parseWorkspaceUsage, UNICA_WORKSPACE_ID, type WorkspacePeriod, type WorkspaceReading } from "@/lib/openrouter-workspace";

export const WORKSPACE_QUERY_URL = "https://openrouter.ai/api/v1/analytics/query";
export const WORKSPACE_DEADLINE_MS = 5_000;

/** Three concurrent, uncached reads under one deadline, including response bodies. Never returns partial totals. */
export async function readWorkspaceUsage(
  period: WorkspacePeriod,
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<WorkspaceReading> {
  const key = env.OPENROUTER_MANAGEMENT_API_KEY?.trim();
  if (!key) return { status: "no-key", usage: null };
  const unavailable: WorkspaceReading = { status: "unavailable", usage: null };
  if (!Number.isFinite(period.from.getTime()) || !Number.isFinite(period.to.getTime()) || period.from >= period.to) return unavailable;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("Workspace deadline")); }, WORKSPACE_DEADLINE_MS);
    });
    const read = async (dimension: string) => {
      const response = await fetchImpl(WORKSPACE_QUERY_URL, {
        method: "POST", cache: "no-store", signal: controller.signal,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          metrics: ["total_usage", "request_count"], dimensions: [dimension],
          filters: [{ field: "workspace", operator: "eq", value: UNICA_WORKSPACE_ID }],
          time_range: { start: period.from.toISOString(), end: period.to.toISOString() },
          limit: 1000, order_by: { field: "total_usage", direction: "desc" },
        }),
      });
      if (!response.ok) throw new Error("Workspace response unavailable");
      return response.json() as Promise<unknown>;
    };
    const usage = await Promise.race([
      Promise.all([read("workspace"), read("model"), read("api_key_id")]).then(([aggregate, models, keys]) => parseWorkspaceUsage(aggregate, models, keys)),
      deadline,
    ]);
    return usage ? { status: "ok", usage } : unavailable;
  } catch { return unavailable; }
  finally { clearTimeout(timer); controller.abort(); }
}
