import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { saveEmailCopy } from "@/lib/email-copies";
import type { SendLedger } from "@/lib/email-delivery";
import { loadFamilyChildren } from "@/lib/family-time-server";
import type { DueMonthly, MonthlyLogEntry, MonthlyState, MonthlyStore } from "@/lib/monthly-summary-email";
import { parentDashboardAccess } from "@/lib/parent-dashboard-access";
import { MAX_SEND_ATTEMPTS } from "@/lib/reminders";

// The monthly summary email's store (#563): reads and writes with the secret key. The rules are in
// src/lib/monthly-summary-email.ts; this loads the confirmed deliveries and their corrections, the families of those
// children, whether the dashboard switch opens to each (parentDashboardAccess, as the dashboard reads it: a failed read of
// a mark counts as not marked), and the parents' rows of this email, and keeps the claims in public.email_log (migration
// monthly_summary_email). A failed read throws, so no run emails from a partial picture.
// Tests use src/lib/monthly-summary-email-memory.ts.

/** Ids per `in` filter, so a request URL stays short. */
const CHUNK = 100;
/** PostgREST answers at most this many rows per request (max-rows), so a shorter page is the last one. */
const PAGE = 1000;
/** The access checks at one time: while the switch is off, each is two reads. */
const ACCESS_AT_ONCE = 10;

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
): MonthlyStore {
  return {
    async load(now) {
      if (outsideEveryWindow(now)) return EMPTY;
      const receipts = await allPages<ReceiptRow>((after) => {
        const query = admin.from("workbook_delivery_receipts").select("workbook_id, child_id, parent_id, delivered_at").order("workbook_id").limit(PAGE);
        return after ? query.gt("workbook_id", after.workbook_id) : query;
      });
      if (receipts.length === 0) return EMPTY;
      const parentIds = [...new Set(receipts.map((r) => r.parent_id))];
      const [corrections, parents, children, log] = await Promise.all([
        inChunks(receipts.map((r) => r.workbook_id), (ids) => allPages<CorrectionRow>((after) => {
          const query = admin.from("workbook_delivery_corrections").select("id, workbook_id, delivered_at, audit_id").in("workbook_id", ids).order("id").limit(PAGE);
          return after ? query.gt("id", after.id) : query;
        })),
        // Each id chunk has at most CHUNK rows, below the server page limit.
        inChunks(parentIds, async (ids) => {
          const { data, error } = await admin.from("parents").select("id, name, email, postal, time_zone").in("id", ids);
          if (error) throw new Error(`monthly summary load: ${error.message}`);
          return data ?? [];
        }),
        loadFamilyChildren(admin, parentIds),
        inChunks(parentIds, (ids) => allPages<LogRow>((after) => {
          const query = admin.from("email_log").select("id, kind, parent_id, summary_month, status, attempts")
            .in("kind", ["monthly_summary", "monthly_summary_unsubscribe"]).in("parent_id", ids).order("id").limit(PAGE);
          return after ? query.gt("id", after.id) : query;
        })),
      ]);
      const open = new Set<string>();
      for (let i = 0; i < parents.length; i += ACCESS_AT_ONCE) {
        await Promise.all(parents.slice(i, i + ACCESS_AT_ONCE).map(async (p) => {
          if (await parentDashboardAccess(p.id, admin, env)) open.add(p.id);
        }));
      }
      return {
        parents: parents.map((p) => ({ id: p.id, name: p.name, email: p.email, postal: p.postal, timeZone: p.time_zone, dashboardOpen: open.has(p.id) })),
        children: children.map((c) => ({ id: c.id, parentId: c.parent_id, firstName: c.first_name, province: c.province, created_at: c.created_at })),
        deliveries: receipts.map((r) => ({ childId: r.child_id, workbookId: r.workbook_id, deliveredAt: r.delivered_at })),
        corrections: corrections.map((c) => ({ workbookId: c.workbook_id, deliveredAt: c.delivered_at, auditId: c.audit_id })),
        log: log.map((e) => ({ id: e.id, kind: e.kind as MonthlyLogEntry["kind"], parentId: e.parent_id, month: e.summary_month?.slice(0, 7) ?? null, status: e.status, attempts: e.attempts })),
      };
    },
    ledger: monthlyLedger(admin),
  };
}

/**
 * public.email_log as the delivery module's send ledger for this email: one monthly_summary row per parent per month
 * (unique index). A retry takes a failed row back only once (a guarded update) and only before MAX_SEND_ATTEMPTS. Refused
 * marks the row failed; unknown keeps it claimed. The writes after a claim never throw.
 */
function monthlyLedger(admin: SupabaseClient<Database>): SendLedger<DueMonthly, string> {
  return {
    async claim(d, { unsubscribe_hash }) {
      if (d.retry) {
        if (d.retry.attempts >= MAX_SEND_ATTEMPTS) return null;
        const { data, error } = await admin.from("email_log")
          .update({ status: "claimed", attempts: d.retry.attempts + 1, unsubscribe_hash, error: null })
          .eq("id", d.retry.logId).eq("kind", "monthly_summary").eq("status", "failed").eq("attempts", d.retry.attempts)
          .select("id");
        if (error) throw new Error(`monthly summary claim retry: ${error.message}`);
        return data?.[0]?.id ?? null;
      }
      const { data, error } = await admin.from("email_log")
        .insert({ parent_id: d.parentId, kind: "monthly_summary", summary_month: `${d.month}-01`, status: "claimed", attempts: 1, unsubscribe_hash })
        .select("id").single();
      // One row per parent and month (unique index): another run claimed it first.
      if (error?.code === "23505") return null;
      if (error) throw new Error(`monthly summary claim: ${error.message}`);
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
    keepCopy: (id, d, copy) => saveEmailCopy(admin, { emailLogId: id }, d.parentId, copy),
  };
}
