import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { MailTransport } from "@/lib/email-delivery";
import { REPORT_RETRY, runReportRetries, type ReportRetryPolicy, type ReportRetryResult, type ReportRetryStore } from "@/lib/report-retry";
import { adminClient } from "@/lib/supabase-auth";

// The retries' store in Supabase, with the secret key (#771, migration report_retries), and the run's part of the
// /api/reminders run: each retry goes to the retry route (src/app/api/report-jobs/[id]/retry), which answers at once and
// runs the report job after its answer, with its own 300 seconds.

/** The part of the run ends this long after it began, inside the run's 60-second limit. */
export const REPORT_RETRY_END_MS = 40_000;

const seconds = (ms: number) => Math.round(ms / 1000);

/** A claim of the give-up alert: the test and the claim's time, as the row keeps it. */
interface GiveUpClaim {
  assessmentId: string;
  at: string;
}

/** The store over public.report_retries and its functions. */
export function reportRetryStore(admin: SupabaseClient<Database>, policy: ReportRetryPolicy = REPORT_RETRY): ReportRetryStore<GiveUpClaim> {
  const ages = { p_min_age_s: seconds(policy.minAgeMs), p_email_age_s: seconds(policy.emailAgeMs) };
  /** Writes to the row only while this claim holds it. Never throws. */
  const write = async (claim: GiveUpClaim, fields: Database["public"]["Tables"]["report_retries"]["Update"]) => {
    try {
      const { data, error } = await admin.from("report_retries").update(fields).eq("assessment_id", claim.assessmentId).eq("gave_up_at", claim.at).select("assessment_id");
      if (error) console.error("[report retry] row update failed", claim.assessmentId, error.message);
      return !error && (data?.length ?? 0) > 0;
    } catch (e) {
      console.error("[report retry] row update failed", claim.assessmentId, e instanceof Error ? e.message : e);
      return false;
    }
  };
  return {
    async due(limit) {
      const { data, error } = await admin.rpc("report_retries_due", { p_limit: limit, ...ages });
      if (error) throw new Error(`report retries due: ${error.message}`);
      return (data ?? []).map((r) => ({ assessmentId: r.out_assessment, attempts: r.out_attempts }));
    },
    async mayEmail(assessmentId) {
      const { data, error } = await admin.rpc("report_retry_may_email", { p_assessment: assessmentId, ...ages });
      if (error) throw new Error(`report retry email check: ${error.message}`);
      return data === true;
    },
    async claimAttempt(assessmentId) {
      const { data, error } = await admin.rpc("claim_report_retry", {
        p_assessment: assessmentId, ...ages, p_max_attempts: policy.maxAttempts, p_delays_s: policy.delaysMs.map(seconds),
      });
      if (error) throw new Error(`claim report retry: ${error.message}`);
      const row = data?.[0];
      return row ? { attempt: row.out_attempt, email: row.out_email } : null;
    },
    giveUp: {
      async claim(assessmentId) {
        const { data, error } = await admin.rpc("claim_report_give_up", { p_assessment: assessmentId, ...ages, p_max_attempts: policy.maxAttempts });
        if (error) throw new Error(`claim report give-up: ${error.message}`);
        return data ? { assessmentId, at: data } : null;
      },
      async sent(claim, emailId) {
        await write(claim, { alert_email_id: emailId.slice(0, 100), alert_error: null });
      },
      async refused(claim, error) {
        await write(claim, { gave_up_at: null, alert_error: error.slice(0, 500) });
      },
      async unknown(claim, error) {
        await write(claim, { alert_error: error.slice(0, 500) });
      },
      async release(claim) {
        return write(claim, { gave_up_at: null });
      },
    },
  };
}

/**
 * The retry route's check right before the parent email (#771 review): whether report_retry_need is still "send" by the
 * database's clock. False without the secret key. Throws on a database error (the job then sends nothing).
 */
export async function reportEmailAllowed(assessmentId: string): Promise<boolean> {
  const admin = adminClient();
  return admin ? reportRetryStore(admin).mayEmail(assessmentId) : false;
}

/** The retry route's path for a test. */
export const retryPath = (assessmentId: string) => `/api/report-jobs/${assessmentId}/retry`;

/** Starts the report job of one test through the retry route, with CRON_SECRET (and the preview bypass when set). */
async function startRetry(origin: string, assessmentId: string, { email, signal }: { email: boolean; signal: AbortSignal }): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is not set");
  const headers: Record<string, string> = { authorization: `Bearer ${secret}`, "content-type": "application/json" };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  const res = await fetch(`${origin}${retryPath(assessmentId)}`, { method: "POST", headers, body: JSON.stringify({ email }), signal });
  if (!res.ok) throw new Error(`the retry route answered ${res.status}`);
}

/**
 * The run's part (#771): one signal, from `startedAt`, ends every database call, retry start and alert in it. `dry`
 * counts the due tests and starts nothing. Never throws.
 */
export async function retryReportsNow({ origin, startedAt, transport, dry = false }: { origin: string; startedAt: number; transport?: MailTransport; dry?: boolean }): Promise<ReportRetryResult | { due: number } | { error: "run_failed" }> {
  const signal = AbortSignal.timeout(Math.max(0, startedAt + REPORT_RETRY_END_MS - Date.now()));
  const admin = adminClient(signal);
  if (!admin) return { error: "run_failed" };
  const store = reportRetryStore(admin);
  try {
    if (dry) return { due: (await store.due(REPORT_RETRY.perRun)).length };
    const mail: MailTransport | undefined = transport && { send: (message, options) => transport.send(message, { signal, ...options }) };
    return await runReportRetries({
      store, signal, origin, transport: mail, alertTo: process.env.SIGNUP_NOTIFY_EMAIL || undefined,
      retry: (id, o) => startRetry(origin, id, o),
    });
  } catch (e) {
    console.error("[report retry] run failed", e instanceof Error ? e.message : e);
    return { error: "run_failed" };
  }
}
