import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { workbookWhy } from "@/lib/workbook-why";
import type { InstructionsTrace } from "@/lib/workbook-instructions";
import type { Book1BaselineStatus } from "./book1-baseline";

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

/**
 * #870 Whether the run's approved Book 1 revision has its starting record (the Book 1 baseline), read through the admin's
 * session. Null for a run that is not Book 1 or has no approval.
 */
export async function savedBook1Baseline(admin: AdminSession, runId: string | null): Promise<Book1BaselineStatus | null> {
  if (!runId || !isUuid(runId)) return null;
  const run = await admin.db.from("workbook_runs").select("number, draft_id").eq("id", runId).maybeSingle();
  if (run.error) throw new Error("Could not read the run.");
  if (!run.data || run.data.number !== 1 || !run.data.draft_id) return null;
  const draftId = run.data.draft_id;
  const approval = await admin.db.from("workbook_audit").select("detail").eq("workbook_id", draftId).eq("action", "workbook-approved")
    .order("id", { ascending: false }).limit(1).maybeSingle();
  if (approval.error) throw new Error("Could not read the approval.");
  const revision = (approval.data?.detail as { revision?: unknown } | null | undefined)?.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision)) return null;
  const [baseline, pending] = await Promise.all([
    admin.db.from("workbook_book1_baselines").select("planning_kind").eq("draft_id", draftId).eq("draft_revision", revision).maybeSingle(),
    admin.db.from("workbook_book1_baseline_pending").select("reason").eq("draft_id", draftId).eq("revision", revision).maybeSingle(),
  ]);
  if (baseline.error || pending.error) throw new Error("Could not read the starting record.");
  if (baseline.data) return { revision, state: "saved" };
  if (pending.data) return { revision, state: "pending", reason: pending.data.reason };
  return { revision, state: "not-yet" };
}
