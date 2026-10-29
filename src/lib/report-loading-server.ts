import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
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
// The learner profile (#198): parents have no read access to public.learner_profiles (admins only, D-115), so the
// parent's reader reads it with the secret key, filtered on the test of the report the parent's own session found and
// on the parent's id. loadReportView passes on only the parent's part (reportFindings); the profile stays on the server.
// The admin reads it with their session (the admin read policy); the report job with the secret key.
// An id that is not a uuid finds nothing (Postgres would refuse it). A database error throws.

/** The report columns the view needs. A parent may read these columns of their own reports. */
const REPORT_COLUMNS = "id, assessment_id, child_id, model, questions, minutes";
/** The test with its stored test, for the report inputs. A parent may not read `test`. */
const ASSESSMENT_COLUMNS = "id, parent_id, child_id, status, grade, province, completed_at, placement, help, test";
const ANSWER_COLUMNS = "position, question_id, response, correct, misconception, time_ms, work_required, work_path, work_text, read_aloud_count, away_count, away_ms";

interface ReportRow {
  id: string;
  assessment_id: string;
  child_id: string;
  model: ReportModel;
  questions: number;
  minutes: number;
}
type ReportAssessmentRow = { completed_at: string | null; province: Province };
type ChildRow = { first_name: string };
interface AssessmentRow {
  id: string;
  parent_id: string;
  child_id: string;
  status: AttemptStatus;
  grade: number;
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
  /** #184 (migration add_answer_timeline): null on answers stored before it. */
  read_aloud_count: number | null;
  away_count: number | null;
  away_ms: number | null;
}

const record = (row: ReportRow, assessment: ReportAssessmentRow | null, child: ChildRow | null): ReportRecord => ({
  id: row.id,
  assessmentId: row.assessment_id,
  childId: row.child_id,
  model: row.model,
  questions: row.questions,
  minutes: row.minutes,
  // A report is only for a finished test, which always has its finish time (assessments_check).
  assessment: assessment?.completed_at ? { completedAt: assessment.completed_at, province: assessment.province } : null,
  child: child ? { firstName: child.first_name } : null,
});

const assessmentRecord = (row: AssessmentRow): AssessmentRecord => ({
  id: row.id,
  parentId: row.parent_id,
  childId: row.child_id,
  status: row.status,
  // A check constraint limits grade to 0-9 (0 is Kindergarten, D-156; rows from before hold 1-7).
  grade: row.grade as Grade,
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
  readAloud: row.read_aloud_count,
  away: row.away_count === null ? null : { count: row.away_count, ms: row.away_ms ?? 0 },
});

type Result<T> = { data: T; error: { message: string } | null };

function must<T>({ data, error }: Result<T>, what: string): T {
  if (error) throw new Error(`[report] ${what}: ${error.message}`);
  return data;
}

/** The report with its test and its child in one read, as this client may see them. */
async function embeddedReport(db: SupabaseClient<Database>, id: string, what: string): Promise<ReportRecord | null> {
  if (!isUuid(id)) return null;
  const row = must(await db.from("reports")
    .select(`${REPORT_COLUMNS}, assessment:assessments(completed_at, province), child:children(first_name)`)
    .eq("id", id).maybeSingle(), what);
  return row ? record(row, row.assessment, row.child) : null;
}

/** The stored learner profile JSON of a test, as this client may see it, filtered on its parent when given; null when none. */
async function profileRow(db: SupabaseClient<Database>, assessmentId: string, what: string, parentId?: string): Promise<unknown> {
  if (!isUuid(assessmentId)) return null;
  let query = db.from("learner_profiles").select("profile").eq("assessment_id", assessmentId);
  if (parentId !== undefined) query = query.eq("parent_id", parentId);
  const row = must(await query.maybeSingle(), what);
  return row?.profile ?? null;
}

/** The test's answers in test order, from the answers table as this client may see it. */
async function answerRows(db: SupabaseClient<Database>, assessmentId: string, what: string): Promise<StoredAnswer[]> {
  const rows = must(await db.from("answers").select(ANSWER_COLUMNS).eq("assessment_id", assessmentId).order("position"), what);
  return (rows ?? []).map(storedAnswer);
}

/**
 * The signed-in parent, with their own session client (sessionClient). `profiles` (#198): the secret key's client
 * (adminClient) and the signed-in parent's id, for the learner profile of their own test; without it, no profile.
 */
export function parentReportReader(db: SupabaseClient<Database>, profiles?: { admin: SupabaseClient<Database> | null; parentId: string }): ReportReader {
  return {
    report: (id) => embeddedReport(db, id, "parent report load"),
    // A parent may not read the stored test (its right answers) or the answers: there is no grant, so nothing is read.
    assessment: async () => null,
    answers: async () => [],
    sign: (paths) => signWork(db, paths),
    profile: async (assessmentId) => (profiles?.admin ? profileRow(profiles.admin, assessmentId, "parent profile load", profiles.parentId) : null),
  };
}

/** A signed-in admin (requireAdmin), with their own session client. */
export function adminReportReader({ db }: AdminSession): ReportReader {
  return {
    async report(id) {
      if (!isUuid(id)) return null;
      const row = must(await db.rpc("admin_reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle(), "admin report load");
      if (!row) return null;
      const [assessment, child] = await Promise.all([
        db.rpc("admin_assessments").select("completed_at, province").eq("id", row.assessment_id).maybeSingle()
          .then((r) => must(r, "admin report test load")),
        db.rpc("admin_children").select("first_name").eq("id", row.child_id).maybeSingle()
          .then((r) => must(r, "admin report child load")),
      ]);
      return record(row, assessment, child);
    },
    async assessment(id) {
      if (!isUuid(id)) return null;
      const row = must(await db.rpc("admin_assessments").select(ASSESSMENT_COLUMNS).eq("id", id).maybeSingle(), "admin test load");
      return row ? assessmentRecord(row) : null;
    },
    answers: (assessmentId) => answerRows(db, assessmentId, "admin answers load"),
    sign: (paths) => signWork(db, paths),
    profile: (assessmentId) => profileRow(db, assessmentId, "admin profile load"),
  };
}

/** The report job, with the secret key (adminClient). It signs nothing: the report email has no drawings. */
export function secretKeyReportReader(admin: SupabaseClient<Database>): ReportReader {
  return {
    report: (id) => embeddedReport(admin, id, "report load"),
    async assessment(id) {
      if (!isUuid(id)) return null;
      const row = must(await admin.from("assessments").select(ASSESSMENT_COLUMNS).eq("id", id).maybeSingle(), "test load");
      return row ? assessmentRecord(row) : null;
    },
    answers: (assessmentId) => answerRows(admin, assessmentId, "answers load"),
    sign: async () => ({}),
    profile: (assessmentId) => profileRow(admin, assessmentId, "profile load"),
  };
}
