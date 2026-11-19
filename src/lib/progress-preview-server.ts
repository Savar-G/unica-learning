import "server-only";
// The progress preview on Parent home (round r-progress-preview-5): each child's newest report, read with the parent's
// own session through the report-loading module, as the report page reads it. A failed read shows no card.
import type { Database } from "@/lib/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { progressPreview, type ProgressPreview } from "@/lib/progress-preview";
import { loadReportView } from "@/lib/report-loading";
import { parentReportReader } from "@/lib/report-loading-server";
import { levelSentence, reportPath } from "@/lib/report-view";
import { adminClient } from "@/lib/supabase-auth";

export type HomeProgress =
  | { preview: ProgressPreview; href: string; placement?: string }
  | { placement: string; href: string; preview?: never };

/** One read may not hold Parent home: a slow one shows no card. */
const LOAD_MS = 2000;

/** By child id: the preview of the child's newest report (`reports` oldest first, as Parent home reads them). Pass only the children to show: each costs a report read and a plan. */
export async function homeProgress(db: SupabaseClient<Database>, parentId: string, reports: readonly { id: string; child_id: string }[], shipped: ReadonlySet<string> = new Set()): Promise<Map<string, HomeProgress>> {
  const newest = new Map(reports.map((r) => [r.child_id, r.id]));
  // Parent home shows no drawings, so nothing is signed.
  const reader = { ...parentReportReader(db, { admin: adminClient(), parentId }), sign: async () => ({}) };
  const found = await Promise.all([...newest].map(async ([childId, id]) => {
    try {
      const loaded = await Promise.race([loadReportView(reader, id), new Promise<null>((resolve) => setTimeout(() => resolve(null), LOAD_MS))]);
      if (!loaded) return null;
      const { view } = loaded;
      const href = reportPath(id);
      const placement = view.model.level.adaptiveVersion === 2 ? levelSentence(view) : undefined;
      // `now`: a goal date already past shows nothing on Parent home.
      const preview = shipped.has(childId) ? null : progressPreview(view, undefined, Date.now());
      if (preview) return [childId, { preview, href: `${href}#rpt-progress`, placement }] as const;
      return placement ? [childId, { placement, href }] as const : null;
    } catch (e) {
      console.error("[progress] home preview failed", id, e instanceof Error ? e.message : String(e));
      return null;
    }
  }));
  return new Map<string, HomeProgress>(found.filter((f) => f !== null));
}
