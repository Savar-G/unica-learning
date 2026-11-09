import "server-only";
import { adminTestPath } from "@/lib/admin-view";
import { sendEmailOnceInTime, type MailTransport, type ReleasableLedger } from "@/lib/email-delivery";

// Report retries (#771). The report job (src/lib/report-job.ts) ran only from the finish route's after(): a job that
// stopped before the report row was written, or a parent report email the provider refused, was never run again. The
// 15-minute /api/reminders run now goes through the tests that still need their report or its email, and runs the job
// again for each, through the retry route (src/app/api/report-jobs/[id]/retry), which has the job's own 300 seconds.
//
// The rules, decided by the database's clock (migration report_retries, src/lib/report-retry-server.ts):
// - A test is picked up only REPORT_RETRY.minAgeMs after it finished, when the finish route's own job has ended (a
//   Vercel function stops at 300 s). Each retry waits its delay after the one before, longer than a job can run.
// - Each test gets at most REPORT_RETRY.maxAttempts retries. Its place in the list is the time of its next retry, so a
//   test that always fails moves back after each retry and never holds up the others. Each run takes at most
//   REPORT_RETRY.perRun tests.
// - The email: only a test that finished under REPORT_RETRY.emailAgeMs ago, in a family that is not a test family or a
//   team account, gets its report email from a retry. Any other test with no report row gets its report built, with no
//   email, so the parent's page stops saying the report is on its way. The rule is asked twice: when the retry is
//   claimed, and again right before the email is claimed (mayEmail), by the database's clock, because the job runs
//   minutes after its claim and the retry route's caller only narrows it (`email: false`).
// - The email goes once: the job claims it on the report row (src/lib/report-row-ledger.ts) before it sends. A retry
//   sends it again only when that claim was released (the provider refused it). A sent email, or one whose outcome is
//   unknown, keeps its claim, so no retry sends it again. The report alert has its own claim, so it never doubles.
// - The job's own "Report FAILED" alert goes from the finish route's run only. A retry that fails alerts no one; after
//   the last retry, the team gets one alert, claimed on the retry row, so two runs at once send it once.
// - One abort signal stops the run's part: no new test is started after it, and the give-up alert does not start.

/** The retry policy. The database is given these numbers; its clock decides. */
export interface ReportRetryPolicy {
  /** A test is retried only this long after it finished. */
  minAgeMs: number;
  /** A retry emails the report only for a test that finished less than this long ago. */
  emailAgeMs: number;
  /** Retries per test, after the finish route's own run. */
  maxAttempts: number;
  /** The wait after each retry before the next (the last one also before the give-up); the last delay repeats. */
  delaysMs: number[];
  /** Tests one run takes at most. */
  perRun: number;
}

const MINUTE = 60_000;

export const REPORT_RETRY: ReportRetryPolicy = {
  minAgeMs: 10 * MINUTE,
  emailAgeMs: 48 * 60 * MINUTE,
  maxAttempts: 4,
  delaysMs: [15 * MINUTE, 30 * MINUTE, 60 * MINUTE, 15 * MINUTE],
  perRun: 10,
};

/** A test the run may act on: a retry, or, with its retries used up, the give-up. */
export interface DueRetry {
  assessmentId: string;
  /** Retries made so far. */
  attempts: number;
}

/** The retries' store: Supabase (src/lib/report-retry-server.ts) or memory (src/lib/report-retry-memory.ts). */
export interface ReportRetryStore<H = unknown> {
  /** The tests due now, in list order, at most `limit`. Throws on a database error. */
  due(limit: number): Promise<DueRetry[]>;
  /**
   * Counts one retry of the test, if it is still due: the attempt number and whether the job may email. Null when another
   * run took it, the test needs nothing now, or its retries are used up. Throws on a database error.
   */
  claimAttempt(assessmentId: string): Promise<{ attempt: number; email: boolean } | null>;
  /**
   * Whether the report email of the test may go now, by the store's clock: the same rule as the claim's ("send"), asked
   * again right before the send, as a retry's job runs minutes after its claim. Throws on a database error.
   */
  mayEmail(assessmentId: string): Promise<boolean>;
  /** The give-up alert's send ledger, keyed by the test's id: its claim is made only when the give-up is due. */
  giveUp: ReleasableLedger<string, H>;
}

export interface ReportRetryRun<H = unknown> {
  store: ReportRetryStore<H>;
  /** Runs the report job for one test, with or without its email (in production, through the retry route). */
  retry(assessmentId: string, options: { email: boolean; signal: AbortSignal }): Promise<void>;
  /** The run's one stop signal. */
  signal: AbortSignal;
  /** The run's transport, for the give-up alert. */
  transport?: MailTransport;
  /** Where the give-up alert goes (SIGNUP_NOTIFY_EMAIL); none: no alert, and the give-up is still recorded. */
  alertTo?: string;
  /** This site, for the admin link in the alert. */
  origin: string;
  policy?: ReportRetryPolicy;
}

/** What one run did. Counts only. */
export interface ReportRetryResult {
  due: number;
  retried: number;
  emailing: number;
  gaveUp: number;
  skipped: number;
  failed: number;
  outOfTime: boolean;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** One run's part: the due tests in list order, one at a time. Never throws. */
export async function runReportRetries<H>(run: ReportRetryRun<H>): Promise<ReportRetryResult> {
  const { store, signal, policy = REPORT_RETRY } = run;
  const result: ReportRetryResult = { due: 0, retried: 0, emailing: 0, gaveUp: 0, skipped: 0, failed: 0, outOfTime: false };
  let due: DueRetry[];
  try {
    due = signal.aborted ? [] : await store.due(policy.perRun);
  } catch (e) {
    console.error("[report retry] list failed", message(e));
    return { ...result, failed: 1, outOfTime: signal.aborted };
  }
  result.due = due.length;
  for (const test of due) {
    if (signal.aborted) {
      result.outOfTime = true;
      break;
    }
    try {
      if (test.attempts >= policy.maxAttempts) {
        if (await giveUp(run, test)) result.gaveUp++;
        else result.skipped++;
        continue;
      }
      const claim = await store.claimAttempt(test.assessmentId);
      if (!claim) {
        result.skipped++;
        continue;
      }
      result.retried++;
      if (claim.email) result.emailing++;
      console.info("[report retry] retry", test.assessmentId, claim.attempt, claim.email ? "with email" : "build only");
      await run.retry(test.assessmentId, { email: claim.email, signal });
    } catch (e) {
      result.failed++;
      console.error("[report retry] failed", test.assessmentId, message(e));
    }
  }
  return result;
}

/** The one alert to the team after the last retry. True when this run made the give-up. */
async function giveUp<H>(run: ReportRetryRun<H>, test: DueRetry): Promise<boolean> {
  const { store, signal, policy = REPORT_RETRY } = run;
  if (!run.alertTo) {
    // No alert address: the give-up is still recorded, so the test leaves the list.
    const held = await store.giveUp.claim(test.assessmentId, {});
    if (held !== null) console.error("[report retry] gave up, no alert address", test.assessmentId);
    return held !== null;
  }
  const outcome = await sendEmailOnceInTime(store.giveUp, test.assessmentId, {
    sender: { to: "savar" },
    to: run.alertTo,
    subject: `Report still not sent for assessment ${test.assessmentId}`,
    text: [
      `The report step was retried ${test.attempts} times after the finish, and the test still has no report, or its parent email did not go.`,
      `No more retries run. The parent page says the result is taking longer than it should.`,
      `Assessment id: ${test.assessmentId}`,
      `Admin: ${run.origin}${adminTestPath(test.assessmentId)}`,
      `Retries stop after ${policy.maxAttempts}; the email goes only within ${Math.round(policy.emailAgeMs / 3_600_000)} hours of the finish.`,
    ].join("\n"),
  }, { transport: run.transport, inTime: () => !signal.aborted });
  if (outcome.status === "busy" || outcome.status === "not_sent") return false;
  if (outcome.status === "sent") console.info("[report retry] gave up, alert sent", test.assessmentId);
  else console.error("[report retry] gave up, alert", outcome.status, test.assessmentId, outcome.error);
  return outcome.status !== "refused";
}
