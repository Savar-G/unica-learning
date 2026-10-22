import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesUpdate } from "@/lib/database";
import type { SendLedger } from "@/lib/email-delivery";
import { saveEmailCopy } from "@/lib/email-copies";

// The report row ledger (#151, spec #143): the send ledger of the report email and the report alert. The claims stay
// where they were before the delivery module, on the report row, so the admin view and the unsubscribe lookup (email
// log first, then report rows) do not change:
// - the report email: emailed_at (the claim), email_id, email_error, and unsubscribe_hash, the hash of the token in the
//   email's unsubscribe link, written in the claim's own write;
// - the report alert: alerted_at (the claim) and alert_error.
// Tests use the in-memory copy in src/lib/report-row-ledger-memory.ts, which keeps the take-over rule below.

/** Which email of a report: the report email to the parent, or the report alert to Savar. */
export interface ReportEmailKey {
  report: string;
  email: "parent" | "alert";
}

/** The report row ledger: a send ledger, and whether the parent email of a report went. */
export interface ReportLedger<H = unknown> extends SendLedger<ReportEmailKey, H> {
  /**
   * Whether the report email went to the parent (the row has its email id). A later run then sends only the alert
   * that did not go. Throws when the row cannot be read.
   */
  parentEmailSent(report: string): Promise<boolean>;
}

/**
 * A claim older than this, that a stopped run left, can be taken over, but only a parent-email claim with no email id
 * and no unsubscribe token: the claims from before the token (#80). A claim with a token may have sent an email even
 * if its answer or its email id write was lost; it keeps its hash, so that the delivered link keeps working, and needs
 * a check by hand. Vercel stops a function after 300 s, so no run is still sending when its claim is this old.
 */
export const STALE_CLAIM_MS = 10 * 60_000;

/**
 * Whether a new claim may take over a claim that is still held (the rule of the claim filter in `reportRowLedger`).
 * The alert claim is never taken over: a run that stops between the claim and the send loses that one alert.
 */
export function reportClaimTakeOver(
  key: ReportEmailKey,
  held: { claimedAt: number; emailId: string | null; unsubscribeHash: string | null },
  now: number,
): boolean {
  return key.email === "parent" && held.emailId === null && held.unsubscribeHash === null && now - held.claimedAt > STALE_CLAIM_MS;
}

/** A claim on the report row. `claimedAt` is the claim's own time in its column: the claim's generation. */
export interface ReportClaim extends ReportEmailKey {
  claimedAt: string;
}

const COLUMNS = {
  parent: { at: "emailed_at", error: "email_error" },
  alert: { at: "alerted_at", error: "alert_error" },
} as const satisfies Record<string, { at: keyof ReportUpdate; error: keyof ReportUpdate }>;

type ReportUpdate = TablesUpdate<"reports">;

/** The production report row ledger, on public.reports with the secret key. */
export function reportRowLedger(admin: SupabaseClient<Database>): ReportLedger<ReportClaim> {
  return {
    async claim(key, fields) {
      const { at } = COLUMNS[key.email];
      const claimedAt = new Date().toISOString();
      const write: ReportUpdate = { [at]: claimedAt };
      for (const [name, value] of Object.entries(fields)) {
        if (key.email !== "parent" || name !== "unsubscribe_hash") throw new Error(`claim ${at}: the report row has no claim field ${name}`);
        write.unsubscribe_hash = value;
      }
      let query = admin.from("reports").update(write).eq("id", key.report);
      // The rule of reportClaimTakeOver. A parent email that went (it has an email id) is never claimed again.
      query = key.email === "parent"
        ? query.is("email_id", null).or(`emailed_at.is.null,and(unsubscribe_hash.is.null,emailed_at.lt."${new Date(Date.parse(claimedAt) - STALE_CLAIM_MS).toISOString()}")`)
        : query.is(at, null);
      const { data, error } = await query.select("id");
      if (error) throw new Error(`claim ${at}: ${error.message}`);
      return (data?.length ?? 0) > 0 ? { ...key, claimedAt } : null;
    },
    async sent(claim, emailId) {
      // An email that went is recorded whichever run holds the claim now: no claim takes a row with an email id. A
      // retry that worked clears the error of the run before.
      await write(admin, claim, claim.email === "parent" ? { email_id: emailId.slice(0, 100), email_error: null } : { alert_error: null }, false);
    },
    async refused(claim, error) {
      const { at, error: column } = COLUMNS[claim.email];
      await write(admin, claim, { [at]: null, [column]: error.slice(0, 500) }, true);
    },
    async unknown(claim, error) {
      await write(admin, claim, { [COLUMNS[claim.email].error]: error.slice(0, 500) }, true);
    },
    // The admin's email view (D-103): the report email or alert as it was sent, beside the report row.
    async keepCopy(claim, key, copy) {
      const { data, error } = await admin.from("reports").select("parent_id").eq("id", key.report).maybeSingle();
      if (error || !data) return console.error("[report] copy not kept: no report row", key.report, error?.message ?? "");
      await saveEmailCopy(admin, { reportId: key.report, reportEmail: key.email }, data.parent_id, copy);
    },
    async parentEmailSent(report) {
      const { data, error } = await admin.from("reports").select("email_id").eq("id", report).maybeSingle();
      if (error) throw new Error(`report email state: ${error.message}`);
      return Boolean(data?.email_id);
    },
  };
}

/**
 * Writes an outcome to the report row. Never throws: the email itself already went or failed. `guarded`: only while
 * this claim still holds the row (its column keeps the claim's time), so a late write from a run whose claim another
 * run took over cannot release or change the other run's claim.
 */
async function write(admin: SupabaseClient<Database>, claim: ReportClaim, fields: ReportUpdate, guarded: boolean) {
  const columns = Object.keys(fields).join(",");
  try {
    let query = admin.from("reports").update(fields).eq("id", claim.report);
    if (guarded) query = query.eq(COLUMNS[claim.email].at, claim.claimedAt);
    const { data, error } = await query.select("id");
    if (error) console.error("[report] row update failed", claim.report, columns, error.message);
    else if (!data?.length) console.error("[report] row update matched no row: another run holds the claim, or the row is gone", claim.report, columns);
  } catch (e) {
    console.error("[report] row update failed", claim.report, columns, e instanceof Error ? e.message : e);
  }
}
