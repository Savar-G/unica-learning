import { timingSafeEqual } from "node:crypto";
import { linkOrigin } from "@/lib/account-server";
import { sweepOpenCancelsNow } from "@/lib/plan-cancel-recovery-server";
import { dueCardCount, duePlanReadCount, sweepCardsNow } from "@/lib/card-sweep-server";
import { emailConfigProblem, pacedTransport } from "@/lib/email-delivery";
import { resendTransport } from "@/lib/email-resend";
import { sweepAbandonedCallsNow } from "@/lib/maya-call-sweep-server";
import { dueWeeklyEmails, runWeeklyEmails } from "@/lib/maya-weekly-email";
import { mayaWeeklyStore } from "@/lib/maya-weekly-email-store";
import { dueMonthlyEmails, runMonthlyEmails } from "@/lib/monthly-summary-email";
import { monthlySummaryEmailStore } from "@/lib/monthly-summary-email-store";
import { reminderMessage, reminderStore } from "@/lib/reminder-store";
import { retryReportsNow } from "@/lib/report-retry-server";
import { REMINDER_KINDS, dueReminders, runReminders, type DueReminder } from "@/lib/reminders";
import { newToken } from "@/lib/sign-in-link";
import { runFirstPagesEmails } from "@/lib/first-pages-email";
import { firstPagesEmailStore } from "@/lib/first-pages-email-store";
import { firstPagesEmailEnabled, restartFirstPagesNow } from "@/lib/first-pages-server";
import { runScanTeamEmail } from "@/lib/scan-team-email";
import { scanTeamEmailStore } from "@/lib/scan-team-email-store";
import { stripe } from "@/lib/stripe";
import { adminClient } from "@/lib/supabase-auth";
import { reconcileBook1BaselinesNow } from "@/lib/workbook-book1-capture-server";
import { createWorkbookScanMaintenanceServer, scanMaintenanceRelease } from "@/lib/workbook-scan-maintenance-server";

// The reminder job (#73, D-085). Supabase pg_cron calls it every 15 minutes through pg_net, with
// "Authorization: Bearer <CRON_SECRET>" (the URL and the secret live in Supabase Vault; see
// supabase/migrations/20261011_add_reminder_cron.sql). Vercel cron here runs only once a day, so it cannot.
// After the reminders, the same run sends the weekly Maya emails (#332, src/lib/maya-weekly-email.ts) and then the
// monthly summary emails (#563, src/lib/monthly-summary-email.ts). Everything the run sends goes through one paced transport. Beside the emails, the same run ends abandoned Maya chats and calls (#528,
// src/lib/maya-call-sweep.ts): it starts no new end after SWEEP_START_MS and stops waiting at SWEEP_TIME_LIMIT_MS, inside
// the cron's 60-second request limit (timeout_milliseconds in migration add_reminder_cron). Also beside the emails, it brings
// Stripe to each child's newest card (#554, src/lib/card-reconcile.ts) and reads each plan row that can still change, not read for 24 hours, again. All the card sweep's work ends 45 seconds after the run began
// (SWEEP_END_MS in src/lib/card-sweep-server.ts), and the monthly emails' work 50 seconds after it (MONTHLY_END_MS).
// Also beside the emails, it retries the report job of each finished test that still has no report, or whose report
// email was refused (#771, src/lib/report-retry.ts): bounded retries, each started through the retry route, under one
// signal that ends 40 seconds after the run began (REPORT_RETRY_END_MS in src/lib/report-retry-server.ts).
// Last, the first pages' sample email (docs/first-pages.md), only with FIRST_PAGES_EMAIL_ENABLED "on", and (with
// WORKBOOK_RUNNER "server") a restart of the first pages that stopped on the server; both end 52 seconds after the run began.
// Also beside the emails, it captures the Book 1 baseline of up to 3 approved Book 1 revisions that have none and are not
// pending recovery (#870, src/lib/workbook-book1-capture.ts); none starts 30 seconds after the run began, and its
// database calls stop 45 seconds after it.
// ?dry=1 counts what is due and sends and ends nothing.
// The answer holds counts only, never a parent's details.

export const maxDuration = 60;

/** Resend's free plan takes 2 requests a second; one email every 600 ms stays under it. */
const SEND_GAP_MS = 600;
/** The monthly emails' work has ended this long after the run began, which leaves time to answer inside the 60-second limit; the next run does the rest. */
const MONTHLY_END_MS = 50_000;
/** No first pages email starts this long after the run began. */
const FIRST_PAGES_END_MS = 52_000;
/** No Book 1 baseline capture starts this long after the run began. */
const BOOK1_END_MS = 30_000;
/** Every database call of the Book 1 step is stopped this long after the run began, so a hung capture cannot hold the run. */
const BOOK1_ABORT_MS = 45_000;

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const byKind = (due: DueReminder[]) => Object.fromEntries(REMINDER_KINDS.map((kind) => [kind, due.filter((r) => r.kind === kind).length]));

export async function POST(request: Request) {
  // Never open: without a secret the job does not run at all.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[reminders] CRON_SECRET is not set");
    return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });
  const admin = adminClient();
  // Stop before anything is claimed: without the email configuration, a run would use up each due reminder's tries.
  const problem = admin ? emailConfigProblem() : "SUPABASE_SECRET_KEY is not set";
  if (!admin || problem) {
    console.error("[reminders]", problem);
    return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const now = Date.now();
  const store = reminderStore(admin);
  const origin = linkOrigin(request);
  let sweep: Promise<unknown> | null = null;
  let cards: Promise<unknown> | null = null;
  let cancels: Promise<unknown> | null = null;
  let reports: Promise<unknown> | null = null;
  let scanTeam: Promise<Awaited<ReturnType<typeof runScanTeamEmail>>> | null = null;
  let book1: Promise<unknown> | null = null;
  try {
    if (new URL(request.url).searchParams.get("dry") === "1") {
      const maya = dueWeeklyEmails(await mayaWeeklyStore(admin).load(now), now).length;
      const monthly = dueMonthlyEmails(await monthlySummaryEmailStore(admin).load(now), now).length;
      const abandoned = (await sweepAbandonedCallsNow(admin, { dry: true })).due;
      return Response.json({ ok: true, dry: true, due: byKind(dueReminders(await store.load(now), now)), maya, monthly, sweep: abandoned, cards: await dueCardCount(now), planReads: await duePlanReadCount(), reports: await retryReportsNow({ origin, startedAt: now, dry: true }) });
    }
    const scanEnv = {
      WORKBOOK_SCAN_PROGRESS_ENABLED: process.env.WORKBOOK_SCAN_PROGRESS_ENABLED,
      WORKBOOK_SCAN_REMINDERS_ENABLED: process.env.WORKBOOK_SCAN_REMINDERS_ENABLED,
      WORKBOOK_SCAN_TEST_PARENT_IDS: process.env.WORKBOOK_SCAN_TEST_PARENT_IDS,
    };
    const scanSignal = scanMaintenanceRelease(scanEnv) ? AbortSignal.timeout(55_000) : undefined;
    const scanDb = scanSignal ? adminClient(scanSignal) : null;
    const provider = resendTransport();
    const scan = scanDb ? createWorkbookScanMaintenanceServer(scanDb, {
      env: scanEnv, origin, provider, gapMs: SEND_GAP_MS, signal: scanSignal,
    }) : null;
    const transport = scan?.transport ?? pacedTransport(provider, SEND_GAP_MS);
    // Run beside the other work, with bounded database calls and time for one request and its ledger write.
    const teamDb = adminClient(AbortSignal.timeout(Math.max(1, now + 55_000 - Date.now())), { retry: false });
    scanTeam = teamDb ? runScanTeamEmail(scanTeamEmailStore(teamDb), now, {
      to: process.env.SIGNUP_NOTIFY_EMAIL, origin, transport, time: { now: () => Date.now(), endAt: now + 55_000 },
    }).then((r) => {
      if (!["too_early", "none_waiting", "already_sent"].includes(r.status)) console.info("[scan team email] run", JSON.stringify(r));
      return r;
    }, (e) => {
      console.error("[scan team email] run failed", e instanceof Error ? e.message : e);
      return { status: "failed" as const };
    }) : Promise.resolve({ status: "failed" });
    // The sweep runs beside the emails and never fails the run.
    sweep = sweepAbandonedCallsNow(admin, { origin, startedAt: now, transport }).then(
      (r) => {
        if (r.due > 0) console.info("[maya sweep] run", JSON.stringify(r));
        return r;
      },
      (e) => {
        console.error("[maya sweep] run failed", e instanceof Error ? e.message : e);
        return { error: "run_failed" as const };
      },
    );
    cards = sweepCardsNow({ origin, startedAt: now, transport });
    cancels = sweepOpenCancelsNow({ origin, startedAt: now, transport });
    reports = retryReportsNow({ origin, startedAt: now, transport }).then((r) => {
      if ("due" in r && r.due > 0) console.info("[report retry] run", JSON.stringify(r));
      return r;
    });
    // The Book 1 baselines run beside the emails; the step never throws, so a failure never hides the other results.
    book1 = reconcileBook1BaselinesNow(adminClient(AbortSignal.timeout(BOOK1_ABORT_MS), { retry: false }) ?? admin, { inTime: () => Date.now() < now + BOOK1_END_MS }).then((r) => {
      if (!("error" in r) && r.due > 0) console.info("[book1 baseline] run", JSON.stringify(r));
      return r;
    }, (e) => {
      console.error("[book1 baseline] run failed", e instanceof Error ? e.message : e);
      return { error: "run_failed" as const };
    });
    const result = await runReminders(store, now, {
      newToken,
      message: (reminder, token, state) => reminderMessage(reminder, token, state, origin),
      transport,
    });
    if (result.due > 0) console.info("[reminders] run", JSON.stringify(result));
    // A failed Maya run never hides the reminders' result.
    let maya: Awaited<ReturnType<typeof runWeeklyEmails>> | { error: "run_failed" };
    try {
      maya = await runWeeklyEmails(mayaWeeklyStore(admin), now, { origin, newToken, transport });
      if (maya.due > 0) console.info("[maya weekly] run", JSON.stringify(maya));
    } catch (e) {
      console.error("[maya weekly] run failed", e instanceof Error ? e.message : e);
      maya = { error: "run_failed" };
    }
    // A failed monthly run never hides the other results.
    let monthly: Awaited<ReturnType<typeof runMonthlyEmails>> | { error: "run_failed" };
    try {
      monthly = await runMonthlyEmails(monthlySummaryEmailStore(admin), now, { origin, newToken, transport, time: { now: () => Date.now(), endAt: now + MONTHLY_END_MS } });
      if (monthly.due > 0 || monthly.outOfTime) console.info("[monthly summary] run", JSON.stringify(monthly));
    } catch (e) {
      console.error("[monthly summary] run failed", e instanceof Error ? e.message : e);
      monthly = { error: "run_failed" };
    }
    // The first pages: off unless switched on; a failure never hides the other results.
    let firstPages: unknown;
    try {
      const restarted = await restartFirstPagesNow(origin);
      const emails = await runFirstPagesEmails(firstPagesEmailStore(admin, stripe()), {
        enabled: firstPagesEmailEnabled(), origin, transport, newToken, inTime: () => Date.now() < now + FIRST_PAGES_END_MS,
      });
      firstPages = { restarted, emails };
      if (!("off" in emails) && emails.due > 0) console.info("[first pages email] run", JSON.stringify(emails));
    } catch (e) {
      console.error("[first pages] run failed", e instanceof Error ? e.message : e);
      firstPages = { error: "run_failed" };
    }
    let scans: Awaited<ReturnType<NonNullable<typeof scan>["run"]>> | { error: "run_failed" } | undefined;
    if (scan) {
      try { scans = await scan.run({ now: () => Date.now(), endAt: now + 55_000 }); }
      catch {
        console.error("[scan progress] scheduled turn stopped");
        scans = { error: "run_failed" };
      }
    }
    return Response.json({ ok: true, ...result, maya, scanTeam: await scanTeam, monthly, firstPages, book1: await book1, sweep: await sweep, cards: await cards, cancels: await cancels, reports: await reports,
      ...(scans ? { scans } : {}) });
  } catch (e) {
    console.error("[reminders] run failed", e instanceof Error ? e.message : e);
    // The sweep finishes before the answer, so the function is not stopped in the middle of a call's end.
    await sweep;
    await cards;
    await cancels;
    await reports;
    await book1;
    await scanTeam;
    return Response.json({ ok: false, error: "run_failed" }, { status: 500 });
  }
}
