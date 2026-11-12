import "server-only";
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

