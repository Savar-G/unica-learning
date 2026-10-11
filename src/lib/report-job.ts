import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reportModel, type HelpAnswer, type Placement, type Province, type ReportModel, type WorkReview } from "@/lib/assessment";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { reportAlert, reportEmail, type ParentContact } from "@/lib/report-email";
import { reportPath, type ReportView } from "@/lib/report-view";
import { adminClient } from "@/lib/supabase-auth";
import { loadShownWork } from "@/lib/work-store";

// The report step after a test finishes (#65). The finish route runs it with after(), so it never blocks or fails the
// finish response. In order:
//   1. Load the finished assessment.
//   2. Review the child's shown work. Seam: #68 passes the AI reviewer here. The work itself (#67) comes from the
//      answers and the private bucket (src/lib/work-store.ts, loadShownWork).
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
  /** The child's answer to "Did anyone help?" (#71); null when the test did not ask it. */
  help: HelpAnswer | null;
}

/** Reviews of the child's shown work for the report model (spec #54, AI work reviewer). */
export type ReviewWork = (assessment: FinishedAssessment) => Promise<WorkReview[]>;

/** No reviews: the report shows no work comments. #68 replaces this with the AI reviewer, behind its switch. */
export const noReviews: ReviewWork = async () => [];

interface StoredReport {
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
      admin.from("parents").select("name, email").eq("id", assessment.parent_id).maybeSingle<ParentContact>(),
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
    const url = `${origin}${reportPath(report.id)}`;

    const parentEmail = await emailParent(admin, report, view, parent, `${url}?src=email`);
    // Another run is sending the parent email right now; it sends the alert too.
    if (parentEmail === "busy") return;
    // The link opens only in the parent's account until the admin area (#77).
    await alertSavar(admin, report, reportAlert({ view, parent, url, flags: assessment.placement.flags ?? [], help: assessment.help, completedInGrade, parentEmail }), parent.email);
  } catch (e) {
    console.error("[report] failed", assessmentId, message(e));
    await send({ to: process.env.SIGNUP_NOTIFY_EMAIL, subject: `Report FAILED for assessment ${assessmentId}`, text: `The report step failed: ${message(e)}\nAssessment id: ${assessmentId}` });
  }
}

async function loadFinished(admin: SupabaseClient, id: string): Promise<FinishedAssessment | null> {
  const { data, error } = await admin.from("assessments")
    .select("id, parent_id, child_id, status, grade, province, completed_at, placement, help")
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
async function storeReport(admin: SupabaseClient, a: FinishedAssessment, completedInGrade: number, reviewWork: ReviewWork): Promise<StoredReport> {
  const existing = await admin.from("reports").select(REPORT_COLUMNS).eq("assessment_id", a.id).maybeSingle<StoredReport>();
  if (existing.error) throw new Error(`report load: ${existing.error.message}`);
  if (existing.data) return existing.data;

  // #67: the child's whiteboard work; the model picks what the report shows.
  const [workReviews, shownWork] = await Promise.all([reviewWork(a), loadShownWork(admin, a.id)]);
  const model = reportModel(a.placement, { completedTestsInGrade: completedInGrade, workReviews, shownWork });
  const { data: answers, error: answersError } = await admin.from("answers").select("time_ms").eq("assessment_id", a.id).returns<{ time_ms: number }[]>();
  if (answersError) throw new Error(`answers load: ${answersError.message}`);
  const ms = (answers ?? []).reduce((sum, row) => sum + row.time_ms, 0);
  const row = {
    assessment_id: a.id,
    parent_id: a.parent_id,
    child_id: a.child_id,
    model,
    // Every marked question, also those above the school grade that the areas leave out.
    questions: a.placement.levels.reduce((n, l) => n + l.total, 0),
    minutes: Math.max(1, Math.round(ms / 60_000)),
  };
  // A second run that got here at the same time inserts nothing and reads the first run's report.
  const { data, error } = await admin.from("reports").upsert(row, { onConflict: "assessment_id", ignoreDuplicates: true }).select(REPORT_COLUMNS).returns<StoredReport[]>();
  if (error) throw new Error(`report insert: ${error.message}`);
  if (data?.[0]) return data[0];
  const raced = await admin.from("reports").select(REPORT_COLUMNS).eq("assessment_id", a.id).single<StoredReport>();
  if (raced.error) throw new Error(`report reload: ${raced.error.message}`);
  return raced.data;
}

/** Writes email state to the report row. A failed write is logged, never thrown: the email itself already happened or failed. */
async function mark(admin: SupabaseClient, id: string, fields: Record<string, string | null>) {
  const { error } = await admin.from("reports").update(fields).eq("id", id);
  if (error) console.error("[report] row update failed", id, Object.keys(fields).join(","), error.message);
}

/**
 * A parent-email claim with no email_id after this long belongs to a run that stopped (a function stops after at most
 * 300 seconds on Vercel), so a later run may take it over. The cost: an email whose email_id write failed can go twice.
 */
const STALE_CLAIM_MS = 10 * 60_000;

/** Sets the email's time in the row if it is empty, or if a stopped run left it. False when a live run holds it. */
async function claim(admin: SupabaseClient, id: string, column: "emailed_at" | "alerted_at"): Promise<boolean> {
  let query = admin.from("reports").update({ [column]: new Date().toISOString() }).eq("id", id);
  query = column === "emailed_at"
    ? query.or(`emailed_at.is.null,and(email_id.is.null,emailed_at.lt."${new Date(Date.now() - STALE_CLAIM_MS).toISOString()}")`)
    : query.is(column, null);
  const { data, error } = await query.select("id");
  if (error) throw new Error(`claim ${column}: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

async function emailParent(admin: SupabaseClient, report: StoredReport, view: ReportView, parent: ParentContact, url: string): Promise<Sent | "busy"> {
  if (report.email_id) return { sent: true };
  const from = process.env.EMAIL_FROM;
  if (!from) {
    await mark(admin, report.id, { email_error: "EMAIL_FROM is not set" });
    return { sent: false, reason: "EMAIL_FROM is not set" };
  }
  if (!(await claim(admin, report.id, "emailed_at"))) return "busy";
  const email = reportEmail({ view, parentName: parent.name, url });
  const result = await send({ from, to: parent.email, replyTo: SUPPORT_EMAIL, ...email });
  if ("error" in result) {
    console.error("[report] parent email failed", report.id, result.error);
    await mark(admin, report.id, { emailed_at: null, email_error: result.error.slice(0, 500) });
    return { sent: false, reason: result.error };
  }
  console.info("[report] parent email sent", report.id);
  // A sent email always has an email_id, so a later run can tell it from a claim still in flight.
  await mark(admin, report.id, { email_id: (result.id || "sent").slice(0, 100), email_error: null });
  return { sent: true };
}

// A run that stops between the claim and the send loses this one alert; the parent email above is the one that matters.
async function alertSavar(admin: SupabaseClient, report: StoredReport, alert: { subject: string; text: string }, replyTo: string) {
  const to = process.env.SIGNUP_NOTIFY_EMAIL;
  if (report.alerted_at || !to) return;
  if (!(await claim(admin, report.id, "alerted_at"))) return;
  const result = await send({ to, replyTo, ...alert });
  if ("error" in result) {
    console.error("[report] alert failed", report.id, result.error);
    await mark(admin, report.id, { alerted_at: null, alert_error: result.error.slice(0, 500) });
    return;
  }
  console.info("[report] alert sent", report.id);
  // A retry that worked clears the error of the run before.
  await mark(admin, report.id, { alert_error: null });
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
