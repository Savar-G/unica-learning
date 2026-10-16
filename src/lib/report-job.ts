import "server-only";
import { reportModel } from "@/lib/assessment";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { adminTestPath } from "@/lib/admin-view";
import { loadComparisonInput } from "@/lib/comparison-store";
import { sendEmail, sendEmailOnce, type MailTransport, type Sender } from "@/lib/email-delivery";
import { storeLearnerProfile, type LearnerProfileStore } from "@/lib/learner-profile";
import { learnerProfileStore } from "@/lib/learner-profile-store";
import { reportAlert, reportEmail, type ParentContact } from "@/lib/report-email";
import { reportJobStore, type ReportJobStore, type StoredReport } from "@/lib/report-job-store";
import { loadReportInputs, loadReportView, type ComparisonRead, type ReportInputs, type ReportReader } from "@/lib/report-loading";
import { secretKeyReportReader } from "@/lib/report-loading-server";
import { reportRowLedger, type ReportLedger } from "@/lib/report-row-ledger";
import { reportPath, type ReportView } from "@/lib/report-view";
import { newToken } from "@/lib/sign-in-link";
import { adminClient } from "@/lib/supabase-auth";
import { aiReport, aiReviewer, type AiOutcome, type WorkReviewer } from "@/lib/work-review";

// The report step after a test finishes (#65). The finish route runs it with after(), so it never blocks or fails the
// finish response. In order:
//   1. Load the finished assessment and everything the report needs, in one call to the report-loading module (#162):
//      one read of the stored test and one of its answers.
//   2. The AI step (#68, src/lib/work-review.ts), only when OPENROUTER_API_KEY is set: review the child's shown work
//      (#67: from the answers and the private bucket), store the reviews (work_reviews), and write the report text.
//      It stops after at most REVIEW_STAGE_MS + TEXT_STAGE_MS (165 s; Vercel stops a function at 300 s). Off, failed or
//      timed out: the report has no AI comments and no AI text.
//   3. Build the report model with the assessment core, and store it: one report per assessment.
//   3b. Build the learner profile (#196, src/lib/learner-profile.ts) from the same inputs and store it: one per test,
//      built again on each run, so a run after an extra round (#190) or a later answer on the learning card counts.
//      A failure is logged; the report and its emails go on.
//   4. Email the report to the parent. The email and the alert show the report view of the stored report, from the
//      report-loading module (#163): the same view that the report page and the admin report view show.
//   5. Email Savar an alert, with what the AI did, and whether the parent email was sent, refused or unknown.
// Safe to run twice: the report is stored once, and each email is sent at most once through the delivery module
// (src/lib/email-delivery.ts, #151), which claims it on the report row (src/lib/report-row-ledger.ts) before it is
// sent. If the parent email fails, the report is still stored and visible in the account, and the alert tells Savar.
// Its database seams: the report-loading module's reader (the inputs and the view; it signs nothing, as the emails have
// no drawings) and the comparison read, the job's own store (src/lib/report-job-store.ts: the report insert, the stored
// AI reviews, the parent, the unsubscribe check), the learner profile's store, and the report row ledger. By default
// each is Supabase with the secret key; tests give the in-memory adapters.

/** What the alert says about the parent email: sent, refused (not sent), or unknown (uncertain). */
type ParentEmail = Parameters<typeof reportAlert>[0]["parentEmail"];

/** Alerts to Savar: EMAIL_FROM, else Resend's test sender as "Unica Learning reports". */
const TO_SAVAR: Sender = { to: "savar", testSenderName: "Unica Learning reports" };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The job's seams. Each one left out is the production adapter. */
export interface ReportJobOptions {
  /** The AI work reviewer; by default the switch (aiReviewer), which is null (off) without OPENROUTER_API_KEY. */
  reviewer?: WorkReviewer | null;
  /** The delivery module's transport; by default Resend. */
  transport?: MailTransport;
  /** The report row ledger of the two emails. */
  ledger?: ReportLedger;
  /** The report-loading module's reader: the secret key's. */
  reader?: ReportReader;
  /** The comparison read (src/lib/comparison-store.ts). */
  comparison?: ComparisonRead;
  /** The job's own reads and writes. */
  store?: ReportJobStore;
  /** The learner profile's store (#196). */
  profiles?: LearnerProfileStore;
}

/** The given database seams; the missing ones are Supabase with the secret key. Null without the key. */
function database({ ledger, reader, comparison, store, profiles }: ReportJobOptions) {
  if (ledger && reader && comparison && store && profiles) return { ledger, reader, comparison, store, profiles };
  const admin = adminClient();
  if (!admin) return null;
  return {
    ledger: ledger ?? reportRowLedger(admin),
    reader: reader ?? secretKeyReportReader(admin),
    comparison: comparison ?? ((id: string) => loadComparisonInput(admin, id)),
    store: store ?? reportJobStore(admin),
    profiles: profiles ?? learnerProfileStore(admin),
  };
}

/**
 * Builds, stores and emails the report for one finished assessment. Never throws: failures are logged and alerted.
 * Tests give the in-memory adapters (src/lib/report-loading-memory.ts, src/lib/report-job-memory.ts,
 * src/lib/email-delivery-memory.ts, src/lib/report-row-ledger-memory.ts, src/lib/learner-profile-memory.ts) and the
 * fake reviewer.
 */
export async function runReportJob(assessmentId: string, origin: string, options: ReportJobOptions = {}): Promise<void> {
  const db = database(options);
  if (!db) return;
  const { ledger: book, store } = db;
  const { reviewer, transport } = options;
  try {
    const inputs = await loadReportInputs(db.reader, assessmentId, db.comparison);
    if (!inputs) {
      console.error("[report] not a finished assessment", assessmentId);
      return;
    }
    const { assessment } = inputs;
    const { report, ai } = await storeReport(store, inputs, reviewer === undefined ? aiReviewer() : reviewer);
    await profileStep(db.profiles, inputs);

    // The view of the email and the alert, from the report-loading module with the secret key (#163): the same view
    // that the report page and the admin report view show. The secret key signs nothing: the email has no drawings.
    const [parent, loaded] = await Promise.all([store.parent(assessment.parentId), loadReportView(db.reader, report.id)]);
    if (!parent) throw new Error("parent not found: no row");
    // A missing child or test: the view is not found.
    if (!loaded) throw new Error("report view not found: no child or test row");
    const { view } = loaded;
    const url = `${origin}${reportPath(report.id)}`;

    const parentEmail = await emailParent(store, book, transport, report.id, view, { ...parent, id: assessment.parentId }, `${url}?src=email`);
    // Another run holds the claim of the parent email: it is sending now, or its send's outcome is unknown. That run
    // sends (or sent) the alert.
    if (parentEmail === "busy") return;
    await alertSavar(book, transport, report.id, reportAlert({ view, parent, url: `${origin}${adminTestPath(assessment.id)}`, flags: assessment.placement.flags ?? [], help: assessment.help, parentEmail, ai }), parent.email);
  } catch (e) {
    console.error("[report] failed", assessmentId, message(e));
    await alertFailure(transport, assessmentId, message(e));
  }
}

/**
 * The stored report for the assessment, built now if there is none yet. `ai` says what the AI step did; absent when an
 * earlier run built the report. #190: a report built before an extra round finished from the report is built again,
 * in place; the AI reviews only the new work (the stored reviews are kept). Its emails went with the first report, so
 * the ledger sends none again: no second email.
 */
async function storeReport(store: ReportJobStore, inputs: ReportInputs, reviewer: WorkReviewer | null): Promise<{ report: StoredReport; ai?: AiOutcome }> {
  const { assessment: a, shownWork } = inputs;
  const existing = await store.report(a.id);
  const rebuild = existing !== null && !!a.placement.extraRound && !existing.model.extraRound;
  if (existing && !rebuild) return { report: existing };

  const comparison = await inputs.comparison();
  // #67: the child's whiteboard work; the model picks what the report shows. #68: the AI reviews it first, when on.
  const { model, ai } = await aiReport({
    reviewer,
    pieces: async () => inputs.reviewPieces(),
    store: store.reviews(a),
    build: (workReviews, reportText) => reportModel(a.placement, { comparison, workReviews, shownWork, reportText }),
  });
  if (existing) return { report: await store.updateReport(existing.id, { model, questions: inputs.questions, minutes: inputs.minutes }), ai };
  const report = await store.insertReport({ assessmentId: a.id, parentId: a.parentId, childId: a.childId, model, questions: inputs.questions, minutes: inputs.minutes });
  if (report) return { report, ai };
  // A second run that got here at the same time inserted nothing: it reads the first run's report.
  const raced = await store.report(a.id);
  if (!raced) throw new Error("report reload: no row");
  return { report: raced };
}

/** The learner profile (#196), built and stored again on each run. Never throws: the report and its emails go on. */
async function profileStep(profiles: LearnerProfileStore, inputs: ReportInputs) {
  try {
    await storeLearnerProfile(profiles, inputs);
  } catch (e) {
    console.error("[profile] failed", inputs.assessment.id, message(e));
  }
}

/**
 * Emails the report to the parent once, through the delivery module. "busy": another run holds the claim (it is
 * sending now, or the outcome of its send is unknown); nothing was sent.
 */
async function emailParent(
  store: ReportJobStore,
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
  const offer = !(await store.unsubscribed(parent.id));
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
