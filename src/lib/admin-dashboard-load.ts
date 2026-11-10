import "server-only";
import { connection } from "next/server";
import { buildDashboard, pickRange, progressTestIds, type Dashboard } from "@/lib/admin-dashboard";
import { demoProgress, demoRows } from "@/lib/admin-demo";
import { progressSnapshot, type ProgressSnapshot } from "@/lib/admin-progress";
import { PROGRESS_MAX, dashboardRows, progressRows, requireAdmin } from "@/lib/admin-store";
import { showTestFamilies } from "@/lib/admin-test-families-server";

// What the dashboard and activity pages (D-099) share: the admin gate, the rows and the query. ?demo=1 shows made-up
// families, in local development only (`next dev`); every other build ignores it and asks for an admin.

export interface DashboardLoad {
  /** The admin's email, or "demo data". */
  who: string;
  d: Dashboard;
  /** How far each open test got (admin-progress.ts), for the families table and the family panel. */
  progress: ProgressSnapshot;
  query: Record<string, string>;
  demo: boolean;
}

/** `withTests`: list the test families whatever the switch says; only for a detail page (one email), never a list. */
export async function loadDashboard(raw: Record<string, string | string[] | undefined>, { withTests }: { withTests?: boolean } = {}): Promise<DashboardLoad> {
  await connection();
  const query = Object.fromEntries(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" && v ? [[k, v]] : []))) as Record<string, string>;
  const demo = query.demo === "1" && process.env.NODE_ENV === "development";
  const now = new Date();
  // "Show test families" lists the team and test families too; no number counts them
  const options = { withTests: withTests ?? (await showTestFamilies()) };
  if (demo) {
    const rows = demoRows(now);
    return { who: "demo data", d: buildDashboard(rows, pickRange(query.range), now, options), progress: demoProgress(rows, now), query, demo };
  }
  const admin = await requireAdmin();
  const d = buildDashboard(await dashboardRows(admin), pickRange(query.range), now, options);
  // The open tests of the families shown: one more small read, after the rows that say which they are.
  const progress = await progressRows(admin, progressTestIds(d.families, PROGRESS_MAX));
  return { who: admin.email, d, progress: progressSnapshot(progress, now), query, demo };
}
