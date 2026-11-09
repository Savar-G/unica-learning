import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { childPlanAccess } from "@/lib/plan-access";
import { isUuid } from "@/lib/workbook-content";

export interface ScanMaintenanceEnvironment {
  WORKBOOK_SCAN_PROGRESS_ENABLED?: string;
  WORKBOOK_SCAN_REMINDERS_ENABLED?: string;
  WORKBOOK_SCAN_TEST_PARENT_IDS?: string;
}
export type ScanRelease = { mode: "test-only" | "families"; parents: readonly string[]; delivery: boolean };

export function scanMaintenanceRelease(env: ScanMaintenanceEnvironment): ScanRelease | null {
  const mode = env.WORKBOOK_SCAN_PROGRESS_ENABLED;
  if (mode !== "test-only" && mode !== "families") return null;
  const parents = (env.WORKBOOK_SCAN_TEST_PARENT_IDS ?? "").split(",").map(s => s.trim().toLowerCase());
  if (!parents.length || parents.length > 20 || parents.some(id => !isUuid(id)) || new Set(parents).size !== parents.length
    || ![undefined, "off", "test-only"].includes(env.WORKBOOK_SCAN_REMINDERS_ENABLED)) return null;
  return { mode, parents, delivery: env.WORKBOOK_SCAN_REMINDERS_ENABLED === "test-only" };
}

export function scanProgressAccess(db: SupabaseClient<Database>, release: ScanRelease) {
  async function testParent(parentId: string): Promise<boolean> {
    if (!release.parents.includes(parentId.toLowerCase())) return false;
    const { data, error } = await db.from("test_accounts").select("parent_id").eq("parent_id", parentId).maybeSingle();
    if (error) throw new Error("scan_maintenance_test_gate_read");
    return data?.parent_id === parentId;
  }
  async function allowed(parentId: string, childId: string): Promise<boolean> {
    if (!isUuid(parentId) || !isUuid(childId)) return false;
    if (release.parents.includes(parentId.toLowerCase())) return testParent(parentId);
    if (release.mode !== "families") return false;
    const marker = await db.from("test_accounts").select("parent_id").eq("parent_id", parentId).maybeSingle();
    if (marker.error) throw new Error("scan_maintenance_test_gate_read");
    if (marker.data) return false;
    const plan = await childPlanAccess({ parentId, childId }, { db });
    if (plan.reason === "read_failed") throw new Error("scan_maintenance_plan_gate_read");
    return plan.open === true && (plan.reason === "open" || plan.reason === "ending_until_end");
  }
  return { allowed, testParent };
}
