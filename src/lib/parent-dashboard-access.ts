import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { adminClient } from "@/lib/supabase-auth";
import { markedFamily } from "@/lib/scan-pages-access";

/** Server-only release gate, as for scanning: only the exact value `on` opens the dashboard to every family. While it is off, only verified test families and admins get it. Never cached. */
export async function parentDashboardAccess(
  parent: string,
  db: SupabaseClient<Database> | null = adminClient(),
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<boolean> {
  return env.PARENT_DASHBOARD_ENABLED === "on" || markedFamily(parent, db);
}
