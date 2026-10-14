import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reportModel, type HelpAnswer, type Placement, type Province, type ReportModel } from "@/lib/assessment";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { adminTestPath } from "@/lib/admin-view";
import { sendEmail, sendEmailOnce, type MailTransport, type Sender } from "@/lib/email-delivery";
import { reportAlert, reportEmail, type ParentContact } from "@/lib/report-email";
import { reportRowLedger, type ReportLedger } from "@/lib/report-row-ledger";
import { parentUnsubscribed } from "@/lib/reminder-store";
import { reportPath, type ReportView } from "@/lib/report-view";
import { newToken } from "@/lib/sign-in-link";
import { adminClient } from "@/lib/supabase-auth";
import { aiReport, aiReviewer, type AiOutcome, type WorkReviewer } from "@/lib/work-review";
import { reviewPieces, reviewStore } from "@/lib/work-review-store";
import { loadShownWork } from "@/lib/work-store";
import { loadComparisonInput } from "@/lib/comparison-store";

// The report step after a test finishes (#65). The finish route runs it with after(), so it never blocks or fails the
// finish response. In order:
//   1. Load the finished assessment.
//   2. The AI step (#68, src/lib/work-review.ts), only when ANTHROPIC_API_KEY is set: review the child's shown work
//      (#67: from the answers and the private bucket), store the reviews (work_reviews), and write the report text.
//      It stops after at most REVIEW_STAGE_MS + TEXT_STAGE_MS (165 s; Vercel stops a function at 300 s). Off, failed or
//      timed out: the report has no AI comments and no AI text.
//   3. Build the report model with the assessment core, and store it: one report per assessment.
//   4. Email the report to the parent.
//   5. Email Savar an alert, with what the AI did, and whether the parent email was sent, refused or unknown.
// Safe to run twice: the report is stored once, and each email is sent at most once through the delivery module
// (src/lib/email-delivery.ts, #151), which claims it on the report row (src/lib/report-row-ledger.ts) before it is
// sent. If the parent email fails, the report is still stored and visible in the account, and the alert tells Savar.

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
}
const REPORT_COLUMNS = "id, model, questions, minutes";

/** What the alert says about the parent email: sent, refused (not sent), or unknown (uncertain). */
type ParentEmail = Parameters<typeof reportAlert>[0]["parentEmail"];

/** Alerts to Savar: EMAIL_FROM, else Resend's test sender as "Unica Learning reports". */
const TO_SAVAR: Sender = { to: "savar", testSenderName: "Unica Learning reports" };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Builds, stores and emails the report for one finished assessment. Never throws: failures are logged and alerted.
 * `reviewer`: the AI work reviewer; by default the switch (aiReviewer), which is null (off) without ANTHROPIC_API_KEY.
 * `transport` and `ledger`: the delivery module's seams; by default Resend and the report row. Tests give the
 * in-memory adapters (src/lib/email-delivery-memory.ts, src/lib/report-row-ledger-memory.ts).
 */
export async function runReportJob(
  assessmentId: string,
  origin: string,
  { reviewer, transport, ledger }: { reviewer?: WorkReviewer | null; transport?: MailTransport; ledger?: ReportLedger } = {},
): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  const book = ledger ?? reportRowLedger(admin);
  try {
    const assessment = await loadFinished(admin, assessmentId);
    if (!assessment) return;
    const { report, ai } = await storeReport(admin, assessment, reviewer === undefined ? aiReviewer() : reviewer);

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

    const parentEmail = await emailParent(admin, book, transport, report.id, view, { ...parent, id: assessment.parent_id }, `${url}?src=email`);
    // Another run holds the claim of the parent email: it is sending now, or its send's outcome is unknown. That run
    // sends (or sent) the alert.
    if (parentEmail === "busy") return;
    await alertSavar(book, transport, report.id, reportAlert({ view, parent, url: `${origin}${adminTestPath(assessment.id)}`, flags: assessment.placement.flags ?? [], help: assessment.help, parentEmail, ai }), parent.email);
  } catch (e) {
    console.error("[report] failed", assessmentId, message(e));
    await alertFailure(transport, assessmentId, message(e));
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

/**
 * The stored report for the assessment, built now if there is none yet. `ai` says what the AI step did; absent when an
 * earlier run built the report.
 */
async function storeReport(
  admin: SupabaseClient,
  a: FinishedAssessment,
  reviewer: WorkReviewer | null,
): Promise<{ report: StoredReport; ai?: AiOutcome }> {
  const existing = await admin.from("reports").select(REPORT_COLUMNS).eq("assessment_id", a.id).maybeSingle<StoredReport>();
  if (existing.error) throw new Error(`report load: ${existing.error.message}`);
  if (existing.data) return { report: existing.data };

  const comparison = await loadComparisonInput(admin, a.id);

  // #67: the child's whiteboard work; the model picks what the report shows. #68: the AI reviews it first, when on.
  const shownWork = await loadShownWork(admin, a.id);
  const { model, ai } = await aiReport({
    reviewer,
    pieces: () => reviewPieces(admin, a.id, shownWork),
    store: reviewStore(admin, a),
    build: (workReviews, reportText) => reportModel(a.placement, { comparison, workReviews, shownWork, reportText }),
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

/**
 * Emails the report to the parent once, through the delivery module. "busy": another run holds the claim (it is
 * sending now, or the outcome of its send is unknown); nothing was sent.
 */
async function emailParent(
  admin: SupabaseClient,
  ledger: ReportLedger,
  transport: MailTransport | undefined,
  reportId: string,
  view: ReportView,
  parent: ParentContact & { id: string },
  url: string,
): Promise<ParentEmail | "busy"> {
  // The parent email went in an earlier run, so this run sends only the alert that did not go.
  if (await ledger.parentEmailSent(reportId)) return { sent: true };
  // CASL (#80): the email offers a plan, so it carries an unsubscribe link. The token is new for each send; only its
  // hash is kept, in the claim's own write, so the link works as soon as the email can go. A parent who already
  // unsubscribed gets the report alone, without the plan or waitlist button and without the unsubscribe headers.
  const offer = !(await parentUnsubscribed(admin, parent.id));
  const { token, hash } = newToken();
  const origin = new URL(url).origin;
  const email = reportEmail({ view, parentName: parent.name, url, unsubscribeUrl: `${origin}/unsubscribe?t=${token}`, offer });
  const outcome = await sendEmailOnce(
    ledger,
    { report: reportId, email: "parent" },
    {
      sender: { to: "parent" },
      to: parent.email,
      replyTo: SUPPORT_EMAIL,
      // RFC 8058 one-click: mail apps POST here from their own Unsubscribe button.
      ...(offer && { headers: { "List-Unsubscribe": `<${origin}/api/unsubscribe?t=${token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }),
      ...email,
    },
    { transport, claimFields: { unsubscribe_hash: hash } },
  );
  switch (outcome.status) {
    case "busy":
      return "busy";
    case "sent":
      console.info("[report] parent email sent", reportId);
      return { sent: true };
    case "refused":
      // The claim is released: a later run sends it again.
      console.error("[report] parent email failed", reportId, outcome.status, outcome.error);
      return { sent: false, reason: outcome.error };
    case "unknown":
      // The email may have gone: the claim and its token's hash stay until Savar checks delivery.
      console.error("[report] parent email failed", reportId, outcome.status, outcome.error);
      return { sent: false, reason: outcome.error, uncertain: true };
  }
}

// One alert per report. A run that stops between the claim and the send loses this one alert; the parent email above is
// the one that matters.
async function alertSavar(ledger: ReportLedger, transport: MailTransport | undefined, reportId: string, alert: { subject: string; text: string }, replyTo: string) {
  const to = process.env.SIGNUP_NOTIFY_EMAIL;
  if (!to) return;
  const outcome = await sendEmailOnce(ledger, { report: reportId, email: "alert" }, { sender: TO_SAVAR, to, replyTo, ...alert }, { transport });
  if (outcome.status === "sent") console.info("[report] alert sent", reportId);
  else if (outcome.status !== "busy") console.error("[report] alert failed", reportId, outcome.status, outcome.error);
}

/** The report step failed. Sent without a send key: each failed run alerts again. Never throws. */
async function alertFailure(transport: MailTransport | undefined, assessmentId: string, reason: string) {
  const to = process.env.SIGNUP_NOTIFY_EMAIL;
  if (!to) return;
  const outcome = await sendEmail(
    { sender: TO_SAVAR, to, subject: `Report FAILED for assessment ${assessmentId}`, text: `The report step failed: ${reason}\nAssessment id: ${assessmentId}` },
    { transport },
  );
  if (outcome.status !== "sent") console.error("[report] failure alert failed", assessmentId, outcome.status, outcome.error);
}
