import "server-only";
// The progress preview on Parent home (round r-progress-preview-5): each child's newest report, read with the parent's
// own session through the report-loading module, as the report page reads it. A failed read shows no card.
import type { Database } from "@/lib/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { progressPreview, type ProgressPreview } from "@/lib/progress-preview";
import { loadReportView } from "@/lib/report-loading";
import { parentReportReader } from "@/lib/report-loading-server";
import { reportPath } from "@/lib/report-view";
import { adminClient } from "@/lib/supabase-auth";

export interface HomeProgress {
  preview: ProgressPreview;
  /** The report's progress section. */
  href: string;
}

/** One read may not hold Parent home: a slow one shows no card. */
const LOAD_MS = 2000;

/** By child id: the preview of the child's newest report (`reports` oldest first, as Parent home reads them). Pass only the children to show: each costs a report read and a plan. */
export async function homeProgress(db: SupabaseClient<Database>, parentId: string, reports: readonly { id: string; child_id: string }[]): Promise<Map<string, HomeProgress>> {
  const newest = new Map(reports.map((r) => [r.child_id, r.id]));
  // Parent home shows no drawings, so nothing is signed.
  const reader = { ...parentReportReader(db, { admin: adminClient(), parentId }), sign: async () => ({}) };
  const found = await Promise.all([...newest].map(async ([childId, id]) => {
    try {
      const loaded = await Promise.race([loadReportView(reader, id), new Promise<null>((resolve) => setTimeout(() => resolve(null), LOAD_MS))]);
      // `now`: a goal date already past shows nothing on Parent home.
      const preview = loaded ? progressPreview(loaded.view, undefined, Date.now()) : null;
      return preview ? ([childId, { preview, href: `${reportPath(id)}#rpt-progress` }] as const) : null;
    } catch (e) {
      console.error("[progress] home preview failed", id, e instanceof Error ? e.message : String(e));
      return null;
    }
  }));
  return new Map(found.filter((f) => f !== null));
}
