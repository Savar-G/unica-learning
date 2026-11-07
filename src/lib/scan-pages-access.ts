import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { childPlanAccess, familyPlanAccess } from "@/lib/plan-access";
import { adminClient } from "@/lib/supabase-auth";

/** A family marked in `test_accounts` or a user in `admin_users`, read on each call. No secret key, or a failed read, is not marked. */
export async function markedFamily(parent: string, db: SupabaseClient<Database> | null, signal?: AbortSignal): Promise<boolean> {
  if (!db) return false;
  try {
    const test = db.from("test_accounts").select("parent_id").eq("parent_id", parent);
    const admin = db.from("admin_users").select("user_id").eq("user_id", parent);
    const [testRow, adminRow] = await Promise.all([
      (signal ? test.abortSignal(signal) : test).maybeSingle(),
      (signal ? admin.abortSignal(signal) : admin).maybeSingle(),
    ]);
    return (!testRow.error && testRow.data?.parent_id === parent) || (!adminRow.error && adminRow.data?.user_id === parent);
  } catch { return false; }
}

/** The release with no plan: the exact value `on`, or a verified test family or admin. It covers every child of the family. */
export async function scanReleased(
  parent: string,
  db: SupabaseClient<Database> | null = adminClient(),
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<boolean> {
  if (env.SCAN_PAGES_ENABLED === "on") return true;
  return markedFamily(parent, db);
}

/**
 * Server-only gate of the family's way in: the release, or any child with an open plan (src/lib/plan-access.ts). Never cached.
 * Scanning is per child: a route or page that names a child also asks `scanChildAccess`, so one plan does not open a sibling.
 */
export async function scanPagesAccess(
  parent: string,
  db: SupabaseClient<Database> | null = adminClient(),
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<boolean> {
  return await scanReleased(parent, db, env) || (await familyPlanAccess({ parentId: parent }, { db })).open;
}

/** Scanning for one child: the release, or this child's own open plan. Never cached. */
export async function scanChildAccess(
  parent: string,
  child: string,
  db: SupabaseClient<Database> | null = adminClient(),
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<boolean> {
  return await scanReleased(parent, db, env) || (await childPlanAccess({ parentId: parent, childId: child }, { db })).open;
}
