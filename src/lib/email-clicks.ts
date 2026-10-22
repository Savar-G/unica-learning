import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { ReminderKind } from "@/lib/reminders";

// Our own click tracking (D-105): a click on an email's button counts when the parent lands on our page from it, signed
// in, so a link scanner does not count. The database functions keep the count; landings less than 30 minutes apart are
// one visit. Never throws: a click that is not counted never stops the page.

/** A parent landed on the start screen from a reminder. `assessmentId`: the test of a continue or come back reminder. */
export async function recordReminderClick(admin: SupabaseClient<Database>, parentId: string, childId: string, kind: ReminderKind, assessmentId: string | null): Promise<void> {
  const { error } = await admin.rpc("record_reminder_click", { p_parent: parentId, p_child: childId, p_kind: kind, p_assessment: assessmentId });
  if (error) console.error("[email] reminder click not counted", kind, error.message);
}

/** A parent landed on the report from the report email. */
export async function recordReportEmailClick(admin: SupabaseClient<Database>, parentId: string, reportId: string): Promise<void> {
  const { error } = await admin.rpc("record_report_email_click", { p_parent: parentId, p_report: reportId });
  if (error) console.error("[email] report email click not counted", error.message);
}
