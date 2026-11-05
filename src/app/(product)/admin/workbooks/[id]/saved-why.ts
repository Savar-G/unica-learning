import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { workbookWhy } from "@/lib/workbook-why";

/** Read the original saved plan through the admin's session, including a run that has no draft yet. */
export async function savedWorkbookWhy(admin: AdminSession, runId: string | null) {
  if (!runId || !isUuid(runId)) return null;
  const { data, error } = await admin.db.from("workbook_run_frames").select("frame").eq("run_id", runId).maybeSingle();
  if (error) throw new Error("Could not read the saved workbook plan.");
  const frame = data?.frame;
  if (!frame?.plan || !curriculumFor(frame.curriculum)) return null;
  return workbookWhy(frame.plan) ?? frame.plan.personal?.why ?? null;
}
