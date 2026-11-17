import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import { SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase-public";
import { HISTORY_DATABASE, HISTORY_UUID, parseHistoryView, type HistoryView } from "./ai-cost-history";

/** The route calls this independent reader only for Records, after requireAdmin. */
export async function readAiCostHistory(admin: AdminSession, selected: string | string[] | undefined): Promise<HistoryView> {
  if (selected !== undefined && (typeof selected !== "string" || !HISTORY_UUID.test(selected))) throw new Error("Historical export selection unavailable");
  const { data, error } = await admin.db.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Historical exports unavailable");
  try {
    const response = await fetch(`${HISTORY_DATABASE}/rest/v1/rpc/admin_ai_cost_history`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(5_000),
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${data.session.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ p_export_id: selected ?? null }) });
    if (!response.ok) throw new Error("Historical exports unavailable");
    const view = parseHistoryView(await response.json());
    if (selected && view.selected && view.selected.export_id !== selected) throw new Error("Historical export selection unavailable");
    return view;
  } catch { throw new Error("Historical exports unavailable"); }
}
