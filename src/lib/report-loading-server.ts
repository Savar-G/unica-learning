import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Province, ReportModel } from "@/lib/assessment";
import type { AdminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import type { ReportReader, ReportRecord } from "@/lib/report-loading";
import { signWork } from "@/lib/work-store";

// The report-loading module's Supabase readers (src/lib/report-loading.ts, #161). Each one reads with a session, never
// the secret key: the database decides what the reader sees.
//   - The parent's session: row-level security returns only the parent's own reports (and their tests and children),
//     so another family's report id finds nothing. Drawings are signed with the parent's session, so storage checks
//     that each file is in their folder.
//   - The admin's session: the admin_* functions (migration add_admin_area) return every row to an admin and nothing to
//     anyone else. Drawings are signed with the admin's session under the bucket's admin read policy.
// A report id that is not a uuid finds nothing (Postgres would refuse it). A database error throws.

/** The report columns the view needs. A parent may read these columns of their own reports. */
const REPORT_COLUMNS = "id, assessment_id, child_id, model, questions, minutes";

interface ReportRow {
  id: string;
  assessment_id: string;
  child_id: string;
  model: ReportModel;
  questions: number;
  minutes: number;
}
type AssessmentRow = { completed_at: string; province: Province };
type ChildRow = { first_name: string };

const record = (row: ReportRow, assessment: AssessmentRow | null, child: ChildRow | null): ReportRecord => ({
  id: row.id,
  assessmentId: row.assessment_id,
  childId: row.child_id,
  model: row.model,
  questions: row.questions,
  minutes: row.minutes,
  assessment: assessment ? { completedAt: assessment.completed_at, province: assessment.province } : null,
  child: child ? { firstName: child.first_name } : null,
});

type Result<T> = { data: T; error: { message: string } | null };

function must<T>({ data, error }: Result<T>, what: string): T {
  if (error) throw new Error(`[report] ${what}: ${error.message}`);
  return data;
}

/** The signed-in parent, with their own session client (sessionClient). */
export function parentReportReader(db: SupabaseClient): ReportReader {
  return {
    async report(id) {
      if (!isUuid(id)) return null;
      const row = must(await db.from("reports")
        .select(`${REPORT_COLUMNS}, assessment:assessments(completed_at, province), child:children(first_name)`)
        .eq("id", id).maybeSingle<ReportRow & { assessment: AssessmentRow | null; child: ChildRow | null }>(), "parent report load");
      return row ? record(row, row.assessment, row.child) : null;
    },
    sign: (paths) => signWork(db, paths),
  };
}

/** A signed-in admin (requireAdmin), with their own session client. */
export function adminReportReader({ db }: AdminSession): ReportReader {
  return {
    async report(id) {
      if (!isUuid(id)) return null;
      const row = must(await db.rpc("admin_reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle<ReportRow>(), "admin report load");
      if (!row) return null;
      const [assessment, child] = await Promise.all([
        db.rpc("admin_assessments").select("completed_at, province").eq("id", row.assessment_id).maybeSingle<AssessmentRow>()
          .then((r) => must(r, "admin report test load")),
        db.rpc("admin_children").select("first_name").eq("id", row.child_id).maybeSingle<ChildRow>()
          .then((r) => must(r, "admin report child load")),
      ]);
      return record(row, assessment, child);
    },
    sign: (paths) => signWork(db, paths),
  };
}
