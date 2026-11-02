import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { adminClient } from "@/lib/supabase-auth";

/** Server-only release gate. Unset/off hides scanning except for verified test families and admins. Never cached. */
export async function scanPagesAccess(
  parent: string,
  db: SupabaseClient<Database> | null = adminClient(),
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<boolean> {
  if (env.SCAN_PAGES_ENABLED === "on") return true;
  if (!db) return false;
  try {
    const [test, admin] = await Promise.all([
      db.from("test_accounts").select("parent_id").eq("parent_id", parent).maybeSingle(),
      db.from("admin_users").select("user_id").eq("user_id", parent).maybeSingle(),
    ]);
    return (!test.error && test.data?.parent_id === parent) || (!admin.error && admin.data?.user_id === parent);
  } catch { return false; }
}
