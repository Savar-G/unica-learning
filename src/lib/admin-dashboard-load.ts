import "server-only";
import { connection } from "next/server";
import { buildDashboard, pickRange, type Dashboard } from "@/lib/admin-dashboard";
import { demoRows } from "@/lib/admin-demo";
import { dashboardRows, requireAdmin } from "@/lib/admin-store";

// What the dashboard and activity pages (D-099) share: the admin gate, the rows and the query. ?demo=1 shows made-up
// families, in local development only (`next dev`); every other build ignores it and asks for an admin.

export interface DashboardLoad {
  /** The admin's email, or "demo data". */
  who: string;
  d: Dashboard;
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
  if (demo) return { who: "demo data", d: buildDashboard(demoRows(now), pickRange(query.range), now, options), query, demo };
  const admin = await requireAdmin();
  return { who: admin.email, d: buildDashboard(await dashboardRows(admin), pickRange(query.range), now, options), query, demo };
}
