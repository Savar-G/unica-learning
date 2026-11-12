import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { childPlanAccess, familyPlanAccess, type PlanAccess, type PlanAccessDeps } from "@/lib/plan-access";
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

/**
 * The access answers of ONE request, each read once and then reused by the checks of that request: whether the family is
 * marked (markedFamily) and each child's stored plan (childPlanAccess), for the one secret-key client `db`. A read through
 * another client, with a signal or with a clock goes to the database as before. Make a new one for each request and
 * never keep it: the next request reads again, so a plan change or a removed test mark counts at once. Only for checks
 * that run together at the start of a request (the scan stack poll); a check made again after long work reads again.
 */
export interface ScanAccessReads {
  marked(parent: string, db: SupabaseClient<Database> | null): Promise<boolean>;
  childPlan(input: { parentId: string; childId: string }, deps?: PlanAccessDeps): Promise<PlanAccess>;
}

export function scanAccessReads(db: SupabaseClient<Database> | null): ScanAccessReads {
  const marked = new Map<string, Promise<boolean>>();
  const plans = new Map<string, Promise<PlanAccess>>();
  return {
    marked(parent, client) {
      if (client !== db) return markedFamily(parent, client);
      let read = marked.get(parent);
      if (!read) marked.set(parent, read = markedFamily(parent, client));
      return read;
    },
    childPlan(input, deps = {}) {
      if (deps.db !== db || deps.now) return childPlanAccess(input, deps);
      const key = `${input.parentId}\n${input.childId}`;
      let read = plans.get(key);
      if (!read) plans.set(key, read = childPlanAccess({ parentId: input.parentId, childId: input.childId }, { db }));
      return read;
    },
  };
}

/** The release with no plan: the exact value `on`, or a verified test family or admin. It covers every child of the family. */
export async function scanReleased(
  parent: string,
  db: SupabaseClient<Database> | null = adminClient(),
  env: Readonly<Record<string, string | undefined>> = process.env,
  reads?: ScanAccessReads,
): Promise<boolean> {
  if (env.SCAN_PAGES_ENABLED === "on") return true;
  return reads ? reads.marked(parent, db) : markedFamily(parent, db);
}

/**
 * Server-only gate of the family's way in: the release, or any child with an open plan (src/lib/plan-access.ts). Never cached.
 * Scanning is per child: a route or page that names a child also asks `scanChildAccess`, so one plan does not open a sibling.
 */
export async function scanPagesAccess(
  parent: string,
  db: SupabaseClient<Database> | null = adminClient(),
  env: Readonly<Record<string, string | undefined>> = process.env,
  reads?: ScanAccessReads,
): Promise<boolean> {
  return await scanReleased(parent, db, env, reads) || (await familyPlanAccess({ parentId: parent }, { db })).open;
}

/** Scanning for one child: the release, or this child's own open plan. Never cached across requests (`reads`: one request's answers). */
export async function scanChildAccess(
  parent: string,
  child: string,
  db: SupabaseClient<Database> | null = adminClient(),
  env: Readonly<Record<string, string | undefined>> = process.env,
  reads?: ScanAccessReads,
): Promise<boolean> {
  const plan = reads ? reads.childPlan.bind(reads) : childPlanAccess;
  return await scanReleased(parent, db, env, reads) || (await plan({ parentId: parent, childId: child }, { db })).open;
}
