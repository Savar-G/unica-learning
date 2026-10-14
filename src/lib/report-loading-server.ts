import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttemptStatus, Grade, HelpAnswer, Placement, Province, ReportModel, StoredTest } from "@/lib/assessment";
import type { AdminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import type { AssessmentRecord, ReportReader, ReportRecord, StoredAnswer } from "@/lib/report-loading";
import { signWork } from "@/lib/work-store";

// The report-loading module's Supabase readers (src/lib/report-loading.ts, #161, #162).
//   - The parent's session: row-level security returns only the parent's own reports (and their tests and children),
//     so another family's report id finds nothing. Drawings are signed with the parent's session, so storage checks
//     that each file is in their folder. A parent may not read the stored test or the answers (no grant).
//   - The admin's session: the admin_* functions (migration add_admin_area) return every row to an admin and nothing to
//     anyone else; the answers through their admin read policy. Drawings are signed with the admin's session under the
//     bucket's admin read policy. Never the secret key.
//   - The secret key, for the report job only: it reads every row, and signs nothing (the report email has no drawings).
// An id that is not a uuid finds nothing (Postgres would refuse it). A database error throws.

/** The report columns the view needs. A parent may read these columns of their own reports. */
const REPORT_COLUMNS = "id, assessment_id, child_id, model, questions, minutes";
/** The test with its stored test, for the report inputs. A parent may not read `test`. */
const ASSESSMENT_COLUMNS = "id, parent_id, child_id, status, grade, province, completed_at, placement, help, test";
const ANSWER_COLUMNS = "position, question_id, response, correct, misconception, time_ms, work_required, work_path, work_text";

interface ReportRow {
  id: string;
  assessment_id: string;
  child_id: string;
  model: ReportModel;
  questions: number;
  minutes: number;
}
type ReportAssessmentRow = { completed_at: string; province: Province };
type ChildRow = { first_name: string };
interface AssessmentRow {
  id: string;
  parent_id: string;
  child_id: string;
  status: AttemptStatus;
  grade: Grade;
  province: Province;
  completed_at: string | null;
  placement: Placement | null;
  help: HelpAnswer | null;
  test: StoredTest;
}
interface AnswerRow {
  position: number;
  question_id: string;
  response: string;
  correct: boolean;
  misconception: string | null;
  time_ms: number;
  work_required: boolean;
  work_path: string | null;
  work_text: string | null;
}

const record = (row: ReportRow, assessment: ReportAssessmentRow | null, child: ChildRow | null): ReportRecord => ({
  id: row.id,
  assessmentId: row.assessment_id,
  childId: row.child_id,
  model: row.model,
  questions: row.questions,
  minutes: row.minutes,
  assessment: assessment ? { completedAt: assessment.completed_at, province: assessment.province } : null,
  child: child ? { firstName: child.first_name } : null,
});

const assessmentRecord = (row: AssessmentRow): AssessmentRecord => ({
  id: row.id,
  parentId: row.parent_id,
  childId: row.child_id,
  status: row.status,
  grade: row.grade,
  province: row.province,
  completedAt: row.completed_at,
  placement: row.placement,
  help: row.help,
  test: row.test,
});

const storedAnswer = (row: AnswerRow): StoredAnswer => ({
  position: row.position,
  questionId: row.question_id,
  response: row.response,
  correct: row.correct,
  misconception: row.misconception,
  timeMs: row.time_ms,
  workRequired: row.work_required,
  workPath: row.work_path,
  workText: row.work_text,
});

type Result<T> = { data: T; error: { message: string } | null };

function must<T>({ data, error }: Result<T>, what: string): T {
  if (error) throw new Error(`[report] ${what}: ${error.message}`);
  return data;
}

/** The report with its test and its child in one read, as this client may see them. */
async function embeddedReport(db: SupabaseClient, id: string, what: string): Promise<ReportRecord | null> {
  if (!isUuid(id)) return null;
  const row = must(await db.from("reports")
    .select(`${REPORT_COLUMNS}, assessment:assessments(completed_at, province), child:children(first_name)`)
    .eq("id", id).maybeSingle<ReportRow & { assessment: ReportAssessmentRow | null; child: ChildRow | null }>(), what);
  return row ? record(row, row.assessment, row.child) : null;
}

/** The test's answers in test order, from the answers table as this client may see it. */
async function answerRows(db: SupabaseClient, assessmentId: string, what: string): Promise<StoredAnswer[]> {
  const rows = must(await db.from("answers").select(ANSWER_COLUMNS).eq("assessment_id", assessmentId).order("position").returns<AnswerRow[]>(), what);
  return (rows ?? []).map(storedAnswer);
}

/** The signed-in parent, with their own session client (sessionClient). */
export function parentReportReader(db: SupabaseClient): ReportReader {
  return {
    report: (id) => embeddedReport(db, id, "parent report load"),
    // A parent may not read the stored test (its right answers) or the answers: there is no grant, so nothing is read.
    assessment: async () => null,
    answers: async () => [],
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
        db.rpc("admin_assessments").select("completed_at, province").eq("id", row.assessment_id).maybeSingle<ReportAssessmentRow>()
          .then((r) => must(r, "admin report test load")),
        db.rpc("admin_children").select("first_name").eq("id", row.child_id).maybeSingle<ChildRow>()
          .then((r) => must(r, "admin report child load")),
      ]);
      return record(row, assessment, child);
    },
    async assessment(id) {
      if (!isUuid(id)) return null;
      const row = must(await db.rpc("admin_assessments").select(ASSESSMENT_COLUMNS).eq("id", id).maybeSingle<AssessmentRow>(), "admin test load");
      return row ? assessmentRecord(row) : null;
    },
    answers: (assessmentId) => answerRows(db, assessmentId, "admin answers load"),
    sign: (paths) => signWork(db, paths),
  };
}

/** The report job, with the secret key (adminClient). It signs nothing: the report email has no drawings. */
export function secretKeyReportReader(admin: SupabaseClient): ReportReader {
  return {
    report: (id) => embeddedReport(admin, id, "report load"),
    async assessment(id) {
      if (!isUuid(id)) return null;
      const row = must(await admin.from("assessments").select(ASSESSMENT_COLUMNS).eq("id", id).maybeSingle<AssessmentRow>(), "test load");
      return row ? assessmentRecord(row) : null;
    },
    answers: (assessmentId) => answerRows(admin, assessmentId, "answers load"),
    sign: async () => ({}),
  };
}
