import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { saveEmailCopy } from "@/lib/email-copies";
import type { ReleasableLedger } from "@/lib/email-delivery";
import { loadFamilyChildren } from "@/lib/family-time-server";
import { CLAIM_LIMIT_MS, type DueMonthly, type MonthlyLogEntry, type MonthlyState, type MonthlyStore } from "@/lib/monthly-summary-email";
import { dashboardSwitchOpen } from "@/lib/parent-dashboard-access";
import { MAX_SEND_ATTEMPTS } from "@/lib/reminders";

// The monthly summary email's store (#563): reads and writes with the secret key. The rules are in
// src/lib/monthly-summary-email.ts; this loads the confirmed deliveries and their corrections, the families of those
// children, whether the dashboard switch opens to each (dashboardSwitchOpen, never the plan gate, so opening a plan makes no email due: a failed read of
// a mark counts as not marked), and the parents' rows of this email, and keeps the claims in public.email_log (migration
// monthly_summary_email). A failed read throws, so no run emails from a partial picture; so does an aborted load.
// Tests use src/lib/monthly-summary-email-memory.ts.

/** Ids per `in` filter, so a request URL stays short. */
const CHUNK = 100;
/** PostgREST answers at most this many rows per request (max-rows), so a shorter page is the last one. */
const PAGE = 1000;
/** The access checks at one time: while the switch is off, each is two reads. */
const ACCESS_AT_ONCE = 10;
/** The longest a release of a claim waits. It fits in the time a claim leaves for its send. */
const RELEASE_LIMIT_MS = 3_000;
const RELEASED = "Not sent: the run ran out of time after the claim. A later run tries again.";

const EMPTY: MonthlyState = { parents: [], children: [], deliveries: [], corrections: [], log: [] };

/**
 * No family's send window (the 1st at 7 a.m. to the end of the 7th, family time) touches these UTC days, in any time zone
 * (UTC-12 to UTC+14), so the job that runs every 15 minutes reads nothing on them.
 */
const outsideEveryWindow = (now: number) => {
  const day = new Date(now).getUTCDate();
  return day > 8 && day < 28;
};

type Result<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Read after the last key, so a row deleted during the read cannot move an unread row behind an offset. */
async function allPages<T>(read: (after: T | null) => Result<T>): Promise<T[]> {
  const out: T[] = [];
  let after: T | null = null;
  for (;;) {
    const { data, error } = await read(after);
    if (error) throw new Error(`monthly summary load: ${error.message}`);
    const page = data ?? [];
    out.push(...page);
    if (page.length < PAGE) return out;
    after = page[page.length - 1];
  }
}

async function inChunks<T>(ids: readonly string[], read: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await read(ids.slice(i, i + CHUNK))));
  return out;
}

type ReceiptRow = Pick<Database["public"]["Tables"]["workbook_delivery_receipts"]["Row"], "workbook_id" | "child_id" | "parent_id" | "delivered_at">;
type CorrectionRow = Pick<Database["public"]["Tables"]["workbook_delivery_corrections"]["Row"], "id" | "workbook_id" | "delivered_at" | "audit_id">;
type LogRow = Pick<Database["public"]["Tables"]["email_log"]["Row"], "id" | "kind" | "parent_id" | "summary_month" | "status" | "attempts">;

export function monthlySummaryEmailStore(
  admin: SupabaseClient<Database>,
  env: Readonly<Record<string, string | undefined>> = process.env,
  { claimLimitMs = CLAIM_LIMIT_MS }: { claimLimitMs?: number } = {},
): MonthlyStore {
  return {
    async load(now, given) {
      if (env.MONTHLY_SUMMARY_EMAIL_ENABLED !== "on" || outsideEveryWindow(now)) return EMPTY;
      const signal = given ?? new AbortController().signal;
      const receipts = await allPages<ReceiptRow>((after) => {
        const query = admin.from("workbook_delivery_receipts").select("workbook_id, child_id, parent_id, delivered_at").order("workbook_id").limit(PAGE).abortSignal(signal);
        return after ? query.gt("workbook_id", after.workbook_id) : query;
      });
      if (receipts.length === 0) return EMPTY;
      const parentIds = [...new Set(receipts.map((r) => r.parent_id))];
      const [corrections, parents, children, log] = await Promise.all([
        inChunks(receipts.map((r) => r.workbook_id), (ids) => allPages<CorrectionRow>((after) => {
          const query = admin.from("workbook_delivery_corrections").select("id, workbook_id, delivered_at, audit_id").in("workbook_id", ids).order("id").limit(PAGE).abortSignal(signal);
          return after ? query.gt("id", after.id) : query;
        })),
        // Each id chunk has at most CHUNK rows, below the server page limit.
        inChunks(parentIds, async (ids) => {
          const { data, error } = await admin.from("parents").select("id, name, email, postal, time_zone").in("id", ids).abortSignal(signal);
          if (error) throw new Error(`monthly summary load: ${error.message}`);
          return data ?? [];
        }),
        loadFamilyChildren(admin, parentIds, signal),
        inChunks(parentIds, (ids) => allPages<LogRow>((after) => {
          const query = admin.from("email_log").select("id, kind, parent_id, summary_month, status, attempts")
            .in("kind", ["monthly_summary", "monthly_summary_unsubscribe"]).in("parent_id", ids).order("id").limit(PAGE).abortSignal(signal);
          return after ? query.gt("id", after.id) : query;
        })),
      ]);
      const open = new Set<string>();
      for (let i = 0; i < parents.length; i += ACCESS_AT_ONCE) {
        await Promise.all(parents.slice(i, i + ACCESS_AT_ONCE).map(async (p) => {
          if (await dashboardSwitchOpen(p.id, admin, env, signal)) open.add(p.id);
        }));
      }
      // A failed read of a mark counts as not marked, so an aborted one must not reach the state as an answer.
      signal.throwIfAborted();
      return {
        parents: parents.map((p) => ({ id: p.id, name: p.name, email: p.email, postal: p.postal, timeZone: p.time_zone, dashboardOpen: open.has(p.id) })),
        children: children.map((c) => ({ id: c.id, parentId: c.parent_id, firstName: c.first_name, province: c.province, created_at: c.created_at })),
        deliveries: receipts.map((r) => ({ childId: r.child_id, workbookId: r.workbook_id, deliveredAt: r.delivered_at })),
        corrections: corrections.map((c) => ({ workbookId: c.workbook_id, deliveredAt: c.delivered_at, auditId: c.audit_id })),
        log: log.map((e) => ({ id: e.id, kind: e.kind as MonthlyLogEntry["kind"], parentId: e.parent_id, month: e.summary_month?.slice(0, 7) ?? null, status: e.status, attempts: e.attempts })),
      };
    },
    ledger: monthlyLedger(admin, claimLimitMs, env),
  };
}

/**
 * public.email_log as the delivery module's send ledger for this email: one monthly_summary row per parent per month
 * (unique index). A retry takes a failed row back only once (a guarded update) and only before MAX_SEND_ATTEMPTS. Refused
 * marks the row failed; unknown keeps it claimed. The writes after a claim never throw.
 *
 * A claim aborts at its time limit. The write may still have landed, so the claim is given back by its own unsubscribe
 * hash, which no other claim has. One limit remains: if the database applies the write after that release looked, the row
 * stays claimed and nothing sends that month's email (one lost email, never two).
 */
function monthlyLedger(admin: SupabaseClient<Database>, claimLimitMs: number, env: Readonly<Record<string, string | undefined>>): ReleasableLedger<DueMonthly, string> {
  /** Puts a claimed row back: a retry is failed again at its old count, a first claim is gone, as if neither was taken. */
  const giveBack = async (d: DueMonthly, own: { column: "id" | "unsubscribe_hash"; value: string }): Promise<number | null> => {
    const signal = AbortSignal.timeout(RELEASE_LIMIT_MS);
    const { data, error } = d.retry
      ? await admin.from("email_log").update({ status: "failed", attempts: d.retry.attempts, error: RELEASED })
        .eq(own.column, own.value).eq("id", d.retry.logId).eq("kind", "monthly_summary").eq("status", "claimed").eq("attempts", d.retry.attempts + 1)
        .select("id").abortSignal(signal)
      : await admin.from("email_log").delete()
        .eq(own.column, own.value).eq("parent_id", d.parentId).eq("kind", "monthly_summary").eq("summary_month", `${d.month}-01`).eq("status", "claimed").eq("attempts", 1)
        .select("id").abortSignal(signal);
    if (error) {
      console.error("[monthly summary] release failed; the row stays claimed", d.month, error.message);
      return null;
    }
    return data?.length ?? 0;
  };
  return {
    async claim(d, { unsubscribe_hash }) {
      // Check again for direct claims and candidates loaded before the monthly email switch was disabled.
      if (env.MONTHLY_SUMMARY_EMAIL_ENABLED !== "on") return null;
      const limit = AbortSignal.timeout(claimLimitMs);
      const timedOut = async () => {
        if (limit.aborted) await giveBack(d, { column: "unsubscribe_hash", value: unsubscribe_hash });
      };
      if (d.retry) {
        if (d.retry.attempts >= MAX_SEND_ATTEMPTS) return null;
        const { data, error } = await admin.from("email_log")
          .update({ status: "claimed", attempts: d.retry.attempts + 1, unsubscribe_hash, error: null, copy_child_ids: d.childIds })
          .eq("id", d.retry.logId).eq("kind", "monthly_summary").eq("status", "failed").eq("attempts", d.retry.attempts)
          .select("id").abortSignal(limit);
        if (error) {
          await timedOut();
          throw new Error(`monthly summary claim retry: ${error.message}`);
        }
        return data?.[0]?.id ?? null;
      }
      const { data, error } = await admin.from("email_log")
        .insert({ parent_id: d.parentId, kind: "monthly_summary", summary_month: `${d.month}-01`, status: "claimed", attempts: 1, unsubscribe_hash, copy_child_ids: d.childIds })
        .select("id").abortSignal(limit).single();
      // One row per parent and month (unique index): another run claimed it first.
      if (error?.code === "23505") return null;
      if (error) {
        await timedOut();
        throw new Error(`monthly summary claim: ${error.message}`);
      }
      return data.id;
    },
    async sent(id, emailId) {
      const { error } = await admin.from("email_log").update({ status: "sent", sent_at: new Date().toISOString(), email_id: emailId.slice(0, 100), error: null }).eq("id", id);
      if (error) console.error("[monthly summary] sent mark failed; the row stays claimed", id, error.message);
    },
    async refused(id, message) {
      const { error } = await admin.from("email_log").update({ status: "failed", error: message.slice(0, 500) }).eq("id", id);
      if (error) console.error("[monthly summary] failed mark failed; the row stays claimed", id, error.message);
    },
    async unknown(id, message) {
      const { error } = await admin.from("email_log").update({ error: message.slice(0, 500) }).eq("id", id);
      if (error) console.error("[monthly summary] unknown mark failed; the row stays claimed", id, error.message);
    },
    release: async (id, d) => (await giveBack(d, { column: "id", value: id })) === 1,
    keepCopy: (id, d, copy) => saveEmailCopy(admin, { emailLogId: id }, d.parentId, copy),
  };
}
