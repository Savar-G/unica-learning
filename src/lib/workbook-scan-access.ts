import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { childPlanAccess } from "@/lib/plan-access";
import { isUuid } from "@/lib/workbook-content";

export { scanMaintenanceRelease } from "@/lib/workbook-scan-release";
import type { ScanRelease } from "@/lib/workbook-scan-release";

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
