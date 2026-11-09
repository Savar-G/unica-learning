import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { workbookWhy } from "@/lib/workbook-why";
import type { InstructionsTrace } from "@/lib/workbook-instructions";

/** Read the original saved plan through the admin's session, including a run that has no draft yet. */
export async function savedWorkbookWhy(admin: AdminSession, runId: string | null) {
  if (!runId || !isUuid(runId)) return null;
  const { data, error } = await admin.db.from("workbook_run_frames").select("frame").eq("run_id", runId).maybeSingle();
  if (error) throw new Error("Could not read the saved workbook plan.");
  const frame = data?.frame;
  if (!frame?.plan || !curriculumFor(frame.curriculum)) return null;
  return workbookWhy(frame.plan) ?? frame.plan.personal?.why ?? null;
}

/** The book instructions the run's saved plan was made with, and what each did; null without any. */
export async function savedWorkbookInstructions(admin: AdminSession, runId: string | null): Promise<InstructionsTrace | null> {
  if (!runId || !isUuid(runId)) return null;
  const { data, error } = await admin.db.from("workbook_run_frames").select("instructions:frame->plan->instructions").eq("run_id", runId).maybeSingle();
  if (error) throw new Error("Could not read the saved book instructions.");
  const trace = data?.instructions as InstructionsTrace | null | undefined;
  return trace && Array.isArray(trace.outcomes) ? trace : null;
}
