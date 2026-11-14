import "server-only";
import { isUuid } from "@/lib/workbook-content";

export interface ScanMaintenanceEnvironment {
  WORKBOOK_SCAN_PROGRESS_ENABLED?: string;
  WORKBOOK_SCAN_REMINDERS_ENABLED?: string;
  WORKBOOK_SCAN_TEST_PARENT_IDS?: string;
}
/**
 * `reminders`: who may get the inactivity reminder email. `test-only`: listed test parents. `families` (only with the
 * progress switch also `families`): also a real family; the email path reads no plan gate, the database decides who is
 * due (`_workbook_scan_reminder_program`: a running plan, not cancelled or paused, no open plan start; and no unsubscribe).
 */
export type ScanRelease = { mode: "test-only" | "families"; parents: readonly string[]; delivery: boolean; reminders: "off" | "test-only" | "families" };

export function scanMaintenanceRelease(env: ScanMaintenanceEnvironment): ScanRelease | null {
  const mode = env.WORKBOOK_SCAN_PROGRESS_ENABLED;
  if (mode !== "test-only" && mode !== "families") return null;
  const parents = (env.WORKBOOK_SCAN_TEST_PARENT_IDS ?? "").split(",").map(s => s.trim().toLowerCase());
  if (!parents.length || parents.length > 20 || parents.some(id => !isUuid(id)) || new Set(parents).size !== parents.length
    || ![undefined, "off", "test-only", "families"].includes(env.WORKBOOK_SCAN_REMINDERS_ENABLED)
    || (env.WORKBOOK_SCAN_REMINDERS_ENABLED === "families" && mode !== "families")) return null;
  const reminders = env.WORKBOOK_SCAN_REMINDERS_ENABLED === "test-only" || env.WORKBOOK_SCAN_REMINDERS_ENABLED === "families" ? env.WORKBOOK_SCAN_REMINDERS_ENABLED : "off";
  return { mode, parents, delivery: reminders !== "off", reminders };
}

