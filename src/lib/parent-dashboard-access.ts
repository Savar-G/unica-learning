import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { familyHasPlanHistory, familyPlanAccess } from "@/lib/plan-access";
import { adminClient } from "@/lib/supabase-auth";
import { markedFamily } from "@/lib/scan-pages-access";

/** The dashboard's switch, with no plan: only the exact value `on` opens it to every family; else verified test families and admins. Emails read this, never the gate below: opening a plan makes no email due. */
export async function dashboardSwitchOpen(
  parent: string,
  db: SupabaseClient<Database> | null = adminClient(),
  env: Readonly<Record<string, string | undefined>> = process.env,
  signal?: AbortSignal,
): Promise<boolean> {
  return env.PARENT_DASHBOARD_ENABLED === "on" || markedFamily(parent, db, signal);
}

/** Server-only gate of the dashboard: its switch, or any child of the family with an open plan (src/lib/plan-access.ts). The stage rules go on deciding each child's tabs. Never cached. */
export async function parentDashboardAccess(
  parent: string,
  db: SupabaseClient<Database> | null = adminClient(),
  env: Readonly<Record<string, string | undefined>> = process.env,
  signal?: AbortSignal,
): Promise<boolean> {
  return await dashboardSwitchOpen(parent, db, env, signal) || (await familyPlanAccess({ parentId: parent }, { db })).open;
}

/**
 * Who reaches the plan's controls, the card update, the invoices and the family and child delete: everyone the dashboard opens
 * to, and a family that has or had a plan, whose gate may be closed. A family with a failed payment must reach its card, and a
 * closed family must be able to cancel or leave. Wider than the dashboard, so no family that reached these loses them.
 */
export async function planManagementAccess(
  parent: string,
  db: SupabaseClient<Database> | null = adminClient(),
  env: Readonly<Record<string, string | undefined>> = process.env,
  signal?: AbortSignal,
): Promise<boolean> {
  return await parentDashboardAccess(parent, db, env, signal) || familyHasPlanHistory({ parentId: parent }, { db });
}
