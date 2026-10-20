import "server-only";
import { connection } from "next/server";
import { buildDashboard, pickRange, type Dashboard } from "@/lib/admin-dashboard";
import { demoProgress, demoRows } from "@/lib/admin-demo";
import { progressSnapshot, type ProgressSnapshot } from "@/lib/admin-progress";
import { dashboardRows, progressRows, requireAdmin } from "@/lib/admin-store";

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

export async function loadDashboard(raw: Record<string, string | string[] | undefined>): Promise<DashboardLoad> {
  await connection();
  const query = Object.fromEntries(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" && v ? [[k, v]] : []))) as Record<string, string>;
  const demo = query.demo === "1" && process.env.NODE_ENV === "development";
  const now = new Date();
  // ?tests=1 counts the team and test families too
  const options = { withTests: query.tests === "1" };
  if (demo) {
    const rows = demoRows(now);
    return { who: "demo data", d: buildDashboard(rows, pickRange(query.range), now, options), progress: demoProgress(rows, now), query, demo };
  }
  const admin = await requireAdmin();
  const [rows, progress] = await Promise.all([dashboardRows(admin), progressRows(admin, now)]);
  return { who: admin.email, d: buildDashboard(rows, pickRange(query.range), now, options), progress: progressSnapshot(progress, now), query, demo };
}
