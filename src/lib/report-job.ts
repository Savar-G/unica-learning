import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reportModel, type HelpAnswer, type Placement, type Province, type ReportModel } from "@/lib/assessment";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { reportAlert, reportEmail, type ParentContact } from "@/lib/report-email";
import { parentUnsubscribed } from "@/lib/reminder-store";
import { reportPath, type ReportView } from "@/lib/report-view";
import { newToken } from "@/lib/sign-in-link";
import { adminClient } from "@/lib/supabase-auth";
import { aiReport, aiReviewer, type AiOutcome, type WorkReviewer } from "@/lib/work-review";
import { reviewPieces, reviewStore } from "@/lib/work-review-store";
import { loadShownWork } from "@/lib/work-store";

// The report step after a test finishes (#65). The finish route runs it with after(), so it never blocks or fails the
// finish response. In order:
//   1. Load the finished assessment.
//   2. The AI step (#68, src/lib/work-review.ts), only when ANTHROPIC_API_KEY is set: review the child's shown work
//      (#67: from the answers and the private bucket), store the reviews (work_reviews), and write the report text.
//      It stops after at most REVIEW_STAGE_MS + TEXT_STAGE_MS (165 s; Vercel stops a function at 300 s). Off, failed or
//      timed out: the report has no AI comments and no AI text.
//   3. Build the report model with the assessment core, and store it: one report per assessment.
//   4. Email the report to the parent.
//   5. Email Savar an alert, with what the AI did.
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

type Sent = { sent: true } | { sent: false; reason: string; uncertain?: boolean };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Builds, stores and emails the report for one finished assessment. Never throws: failures are logged and alerted.
 * `reviewer`: the AI work reviewer; by default the switch (aiReviewer), which is null (off) without ANTHROPIC_API_KEY.
 */
export async function runReportJob(assessmentId: string, origin: string, { reviewer }: { reviewer?: WorkReviewer | null } = {}): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  try {
    const assessment = await loadFinished(admin, assessmentId);
    if (!assessment) return;
    const completedInGrade = await countCompleted(admin, assessment.grade);
    const { report, ai } = await storeReport(admin, assessment, completedInGrade, reviewer === undefined ? aiReviewer() : reviewer);

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

    const parentEmail = await emailParent(admin, report, view, { ...parent, id: assessment.parent_id }, `${url}?src=email`);
    // Another run is sending the parent email right now; it sends the alert too.
    if (parentEmail === "busy") return;
    // The link opens only in the parent's account until the admin area (#77).
    await alertSavar(admin, report, reportAlert({ view, parent, url, flags: assessment.placement.flags ?? [], help: assessment.help, completedInGrade, parentEmail, ai }), parent.email);
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

/**
 * The stored report for the assessment, built now if there is none yet. `ai` says what the AI step did; absent when an
 * earlier run built the report.
 */
async function storeReport(
  admin: SupabaseClient,
  a: FinishedAssessment,
  completedInGrade: number,
  reviewer: WorkReviewer | null,
): Promise<{ report: StoredReport; ai?: AiOutcome }> {
  const existing = await admin.from("reports").select(REPORT_COLUMNS).eq("assessment_id", a.id).maybeSingle<StoredReport>();
  if (existing.error) throw new Error(`report load: ${existing.error.message}`);
  if (existing.data) return { report: existing.data };

  // #67: the child's whiteboard work; the model picks what the report shows. #68: the AI reviews it first, when on.
  const shownWork = await loadShownWork(admin, a.id);
  const { model, ai } = await aiReport({
    reviewer,
    pieces: () => reviewPieces(admin, a.id, shownWork),
    store: reviewStore(admin, a),
    build: (workReviews, reportText) => reportModel(a.placement, { completedTestsInGrade: completedInGrade, workReviews, shownWork, reportText }),
  });
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
  if (data?.[0]) return { report: data[0], ai };
  const raced = await admin.from("reports").select(REPORT_COLUMNS).eq("assessment_id", a.id).single<StoredReport>();
  if (raced.error) throw new Error(`report reload: ${raced.error.message}`);
  return { report: raced.data };
}

/** Writes email state to the report row. A failed write is logged, never thrown: the email itself already happened or failed. */
async function mark(admin: SupabaseClient, id: string, fields: Record<string, string | null>) {
  const { error } = await admin.from("reports").update(fields).eq("id", id);
  if (error) console.error("[report] row update failed", id, Object.keys(fields).join(","), error.message);
}

/**
 * Only legacy claims with no unsubscribe token can be recovered after this long. A claim with a token may have sent
 * an email even if its response or email_id write was lost. Keep its hash so that the delivered link keeps working.
 * A stopped run with a token needs manual follow-up; automatic retry must not replace that token.
 */
const STALE_CLAIM_MS = 10 * 60_000;

/**
 * Sets the email's time in the row if it is empty, or if a stopped run left it, with `extra` in the same write. False
 * when a live run holds it.
 */
async function claim(admin: SupabaseClient, id: string, column: "emailed_at" | "alerted_at", extra: Record<string, string> = {}): Promise<boolean> {
  let query = admin.from("reports").update({ ...extra, [column]: new Date().toISOString() }).eq("id", id);
  query = column === "emailed_at"
    ? query.or(`emailed_at.is.null,and(email_id.is.null,unsubscribe_hash.is.null,emailed_at.lt."${new Date(Date.now() - STALE_CLAIM_MS).toISOString()}")`)
    : query.is(column, null);
  const { data, error } = await query.select("id");
  if (error) throw new Error(`claim ${column}: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

async function emailParent(admin: SupabaseClient, report: StoredReport, view: ReportView, parent: ParentContact & { id: string }, url: string): Promise<Sent | "busy"> {
  if (report.email_id) return { sent: true };
  const from = process.env.EMAIL_FROM;
  if (!from) {
    await mark(admin, report.id, { email_error: "EMAIL_FROM is not set" });
    return { sent: false, reason: "EMAIL_FROM is not set" };
  }
  // CASL (#80): the email offers a plan, so it carries an unsubscribe link. The token is new for each send; only its
  // hash is kept, in the claim's own write, so the link works as soon as the email can go. A parent who already
  // unsubscribed gets the report alone, without the plan or waitlist button.
  const offer = !(await parentUnsubscribed(admin, parent.id));
  const { token, hash } = newToken();
  if (!(await claim(admin, report.id, "emailed_at", { unsubscribe_hash: hash }))) return "busy";
  const origin = new URL(url).origin;
  const email = reportEmail({ view, parentName: parent.name, url, unsubscribeUrl: `${origin}/unsubscribe?t=${token}`, offer });
  // RFC 8058 one-click: mail apps POST here from their own Unsubscribe button.
  const headers = offer ? { "List-Unsubscribe": `<${origin}/api/unsubscribe?t=${token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined;
  const result = await send({ from, to: parent.email, replyTo: SUPPORT_EMAIL, headers, ...email });
  if ("error" in result) {
    console.error("[report] parent email failed", report.id, result.error);
    // A lost response can follow a delivered email. Keep both the claim and its hash until the outcome is checked.
    await mark(admin, report.id, { ...(result.uncertain ? {} : { emailed_at: null }), email_error: result.error.slice(0, 500) });
    return { sent: false, reason: result.error, uncertain: result.uncertain };
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
async function send(email: { to: string | undefined; subject: string; text: string; html?: string; from?: string; replyTo?: string; headers?: Record<string, string> }): Promise<{ id: string } | { error: string; uncertain?: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { error: "RESEND_API_KEY is not set" };
  if (!email.to) return { error: "no recipient" };
  const from = email.from ?? (process.env.EMAIL_FROM || "Unica Learning reports <onboarding@resend.dev>");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html, reply_to: email.replyTo, headers: email.headers }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { error: `Resend answered ${res.status}: ${(await res.text()).slice(0, 300)}`, uncertain: res.status >= 500 || res.status === 408 };
    const json = (await res.json()) as { id?: unknown };
    return { id: typeof json.id === "string" ? json.id : "" };
  } catch (e) {
    return { error: `Resend delivery is unknown: ${message(e)}. Check delivery before sending again.`, uncertain: true };
  }
}
