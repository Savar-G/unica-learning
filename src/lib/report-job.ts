import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reportModel, type Placement, type Province, type ReportModel, type WorkReview } from "@/lib/assessment";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { reportAlert, reportEmail } from "@/lib/report-email";
import { reportPath, type ReportView } from "@/lib/report-view";
import { adminClient } from "@/lib/supabase-auth";

// The report step after a test finishes (#65). The finish route runs it with after(), so it never blocks or fails the
// finish response. In order:
//   1. Load the finished assessment.
//   2. Review the child's shown work. Seam: #68 passes the AI reviewer here; #67 adds the work images it reads.
//   3. Build the report model with the assessment core, and store it: one report per assessment.
//   4. Email the report to the parent.
//   5. Email Savar an alert.
// Safe to run twice: the report is stored once, and each email is claimed in the row before it is sent. If the parent
// email fails, the report is still stored and visible in the account, and the alert tells Savar.

/** A completed assessment, as the job reads it with the secret key. */
export interface FinishedAssessment {
  id: string;
  parent_id: string;
  child_id: string;
  grade: number;
  province: Province;
  completed_at: string;
  placement: Placement;
}

/** Reviews of the child's shown work for the report model (spec #54, AI work reviewer). */
export type ReviewWork = (assessment: FinishedAssessment) => Promise<WorkReview[]>;

/** No reviews: the report shows no work comments. #68 replaces this with the AI reviewer, behind its switch. */
export const noReviews: ReviewWork = async () => [];

interface ReportRow {
  id: string;
  model: ReportModel;
  questions: number;
  minutes: number;
  emailed_at: string | null;
  email_id: string | null;
  alerted_at: string | null;
}
const REPORT_COLUMNS = "id, model, questions, minutes, emailed_at, email_id, alerted_at";

type Sent = { sent: true } | { sent: false; reason: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Builds, stores and emails the report for one finished assessment. Never throws: failures are logged and alerted. */
export async function runReportJob(assessmentId: string, origin: string, { reviewWork = noReviews }: { reviewWork?: ReviewWork } = {}): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  try {
    const assessment = await loadFinished(admin, assessmentId);
    if (!assessment) return;
    const completedInGrade = await countCompleted(admin, assessment.grade);
    const report = await storeReport(admin, assessment, completedInGrade, reviewWork);

    const [{ data: parent, error: parentError }, { data: child, error: childError }] = await Promise.all([
      admin.from("parents").select("name, email").eq("id", assessment.parent_id).maybeSingle<{ name: string; email: string }>(),
      admin.from("children").select("first_name").eq("id", assessment.child_id).maybeSingle<{ first_name: string }>(),
    ]);
    if (parentError || childError || !parent || !child) throw new Error(`parent or child not found: ${parentError?.message ?? childError?.message ?? "no row"}`);

    const view: ReportView = {
      id: report.id,
      childName: child.first_name,
      province: assessment.province,
      completedAt: assessment.completed_at,
      questions: report.questions,
      minutes: report.minutes,
      model: report.model,
    };
    const url = `${origin}${reportPath(report.id)}?src=email`;

    const parentEmail = await emailParent(admin, report, view, parent, url);
    // Another run is sending the parent email right now; it sends the alert too.
    if (parentEmail === "busy") return;
    await alertSavar(admin, report, reportAlert({ view, parent, url, flags: assessment.placement.flags ?? [], completedInGrade, parentEmail }), parent.email);
  } catch (e) {
    console.error("[report] failed", assessmentId, message(e));
    await send({ to: process.env.SIGNUP_NOTIFY_EMAIL, subject: `Report FAILED for assessment ${assessmentId}`, text: `The report step failed: ${message(e)}\nAssessment id: ${assessmentId}` });
  }
}

async function loadFinished(admin: SupabaseClient, id: string): Promise<FinishedAssessment | null> {
  const { data, error } = await admin.from("assessments")
    .select("id, parent_id, child_id, status, grade, province, completed_at, placement")
    .eq("id", id).maybeSingle<FinishedAssessment & { status: string }>();
  if (error) throw new Error(`assessment load: ${error.message}`);
  if (!data || data.status !== "completed" || !data.placement) {
    console.error("[report] not a finished assessment", id);
    return null;
  }
  return data;
}

/** Completed tests in this school grade: the comparison stage comes from this count (D-084). */
async function countCompleted(admin: SupabaseClient, grade: number): Promise<number> {
  const { count, error } = await admin.from("assessments").select("id", { count: "exact", head: true }).eq("status", "completed").eq("grade", grade);
  if (error) throw new Error(`count: ${error.message}`);
  return count ?? 0;
}

/** The stored report for the assessment, built now if there is none yet. */
async function storeReport(admin: SupabaseClient, a: FinishedAssessment, completedInGrade: number, reviewWork: ReviewWork): Promise<ReportRow> {
  const existing = await admin.from("reports").select(REPORT_COLUMNS).eq("assessment_id", a.id).maybeSingle<ReportRow>();
  if (existing.error) throw new Error(`report load: ${existing.error.message}`);
  if (existing.data) return existing.data;

  const model = reportModel(a.placement, { completedTestsInGrade: completedInGrade, workReviews: await reviewWork(a) });
  const { data: answers, error: answersError } = await admin.from("answers").select("time_ms").eq("assessment_id", a.id).returns<{ time_ms: number }[]>();
  if (answersError) throw new Error(`answers load: ${answersError.message}`);
  const ms = (answers ?? []).reduce((sum, row) => sum + row.time_ms, 0);
  const row = {
    assessment_id: a.id,
    parent_id: a.parent_id,
    child_id: a.child_id,
    model,
    questions: model.strands.reduce((n, s) => n + s.total, 0),
    minutes: Math.max(1, Math.round(ms / 60_000)),
  };
  // A second run that got here at the same time inserts nothing and reads the first run's report.
  const { data, error } = await admin.from("reports").upsert(row, { onConflict: "assessment_id", ignoreDuplicates: true }).select(REPORT_COLUMNS).returns<ReportRow[]>();
  if (error) throw new Error(`report insert: ${error.message}`);
  if (data?.[0]) return data[0];
  const raced = await admin.from("reports").select(REPORT_COLUMNS).eq("assessment_id", a.id).single<ReportRow>();
  if (raced.error) throw new Error(`report reload: ${raced.error.message}`);
  return raced.data;
}

/** Sets the email's time in the row if it is empty. False when another run set it first. */
async function claim(admin: SupabaseClient, id: string, column: "emailed_at" | "alerted_at"): Promise<boolean> {
  const { data, error } = await admin.from("reports").update({ [column]: new Date().toISOString() }).eq("id", id).is(column, null).select("id");
  if (error) throw new Error(`claim ${column}: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

async function emailParent(admin: SupabaseClient, report: ReportRow, view: ReportView, parent: { name: string; email: string }, url: string): Promise<Sent | "busy"> {
  if (report.emailed_at) return report.email_id ? { sent: true } : "busy";
  const from = process.env.EMAIL_FROM;
  if (!from) {
    await admin.from("reports").update({ email_error: "EMAIL_FROM is not set" }).eq("id", report.id);
    return { sent: false, reason: "EMAIL_FROM is not set" };
  }
  if (!(await claim(admin, report.id, "emailed_at"))) return "busy";
  const email = reportEmail({ view, parentName: parent.name, url });
  const result = await send({ from, to: parent.email, replyTo: SUPPORT_EMAIL, ...email });
  if ("error" in result) {
    console.error("[report] parent email failed", report.id, result.error);
    await admin.from("reports").update({ emailed_at: null, email_error: result.error.slice(0, 500) }).eq("id", report.id);
    return { sent: false, reason: result.error };
  }
  console.info("[report] parent email sent", report.id);
  // A sent email always has an email_id, so a later run can tell it from a claim still in flight.
  await admin.from("reports").update({ email_id: (result.id || "sent").slice(0, 100), email_error: null }).eq("id", report.id);
  return { sent: true };
}

async function alertSavar(admin: SupabaseClient, report: ReportRow, alert: { subject: string; text: string }, replyTo: string) {
  const to = process.env.SIGNUP_NOTIFY_EMAIL;
  if (report.alerted_at || !to) return;
  if (!(await claim(admin, report.id, "alerted_at"))) return;
  const result = await send({ to, replyTo, ...alert });
  if ("error" in result) {
    console.error("[report] alert failed", report.id, result.error);
    await admin.from("reports").update({ alerted_at: null, alert_error: result.error.slice(0, 500) }).eq("id", report.id);
    return;
  }
  console.info("[report] alert sent", report.id);
  // A retry that worked clears the error of the run before.
  await admin.from("reports").update({ alert_error: null }).eq("id", report.id);
}

/**
 * Sends one email through Resend. Alerts use EMAIL_FROM when it is set; else Resend's test sender, which the free plan
 * delivers only to the account owner (as the signup alert does).
 */
async function send(email: { to: string | undefined; subject: string; text: string; html?: string; from?: string; replyTo?: string }): Promise<{ id: string } | { error: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { error: "RESEND_API_KEY is not set" };
  if (!email.to) return { error: "no recipient" };
  const from = email.from ?? (process.env.EMAIL_FROM || "Unica Learning reports <onboarding@resend.dev>");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html, reply_to: email.replyTo }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { error: `Resend answered ${res.status}: ${(await res.text()).slice(0, 300)}` };
    const json = (await res.json()) as { id?: unknown };
    return { id: typeof json.id === "string" ? json.id : "" };
  } catch (e) {
    return { error: `Resend request failed: ${message(e)}` };
  }
}
