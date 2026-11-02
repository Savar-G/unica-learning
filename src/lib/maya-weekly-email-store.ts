import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { saveEmailCopy } from "@/lib/email-copies";
import type { SendLedger } from "@/lib/email-delivery";
import { fromNoteRow } from "@/lib/maya-call-note-store";
import { LOOKBACK_DAYS, type WeeklyLogEntry, type WeeklyStore, type DueWeekly } from "@/lib/maya-weekly-email";
import { MAX_SEND_ATTEMPTS } from "@/lib/reminders";

// The weekly Maya email's store (#332): reads and writes with the secret key. The rules are in
// src/lib/maya-weekly-email.ts; this loads the notes of recent calls (public.maya_call_notes), their parents and
// children, and the parents' maya_weekly and maya_unsubscribe rows, and keeps the claims in public.email_log (migration
// add_maya_weekly_email). Tests use src/lib/maya-weekly-email-memory.ts.

/** Ids per `in` filter, so a request URL stays short. */
const CHUNK = 100;
/** PostgREST answers at most this many rows per request (max-rows), so a shorter page is the last one. */
const PAGE = 1000;
/** Reads two days wider than the rules: a call's local day can be a day off its UTC date. */
const SLACK_DAYS = 2;

type Result<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Every row of a read, page by page. The read must have a stable order. */
async function allPages<T>(read: (from: number, to: number) => Result<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw new Error(`maya weekly load: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return out;
  }
}

async function inChunks<T>(ids: readonly string[], read: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await read(ids.slice(i, i + CHUNK))));
  return out;
}

export function mayaWeeklyStore(admin: SupabaseClient<Database>): WeeklyStore {
  return {
    async load(now) {
      const since = new Date(now - (LOOKBACK_DAYS + SLACK_DAYS) * 24 * 60 * 60_000).toISOString();
      // Every note in the window, so a parent's week is whole before its claim. A note written between two pages can
      // come twice (offset paging); the map keeps one per call.
      const noteRows = await allPages((from, to) => admin.from("maya_call_notes").select("*").gte("call_ended_at", since).order("call_ended_at").order("call_id").range(from, to));
      const notes = [...new Map(noteRows.map((r) => [r.call_id, fromNoteRow(r)])).values()];
      const parentIds = [...new Set(notes.map((n) => n.parentId))];
      const childIds = [...new Set(notes.map((n) => n.childId))];
      // Only the log rows that matter: each parent's Maya unsubscribe, and the weekly claims of the weeks in the window.
      const sinceDay = since.slice(0, 10);
      const [parents, children, unsubscribes, weekly] = await Promise.all([
        inChunks(parentIds, (ids) => allPages((from, to) => admin.from("parents").select("id, name, email, postal").in("id", ids).order("id").range(from, to))),
        inChunks(childIds, (ids) => allPages((from, to) => admin.from("children").select("id, parent_id, first_name").in("id", ids).order("id").range(from, to))),
        inChunks(parentIds, (ids) => allPages((from, to) => admin.from("email_log").select("id, kind, parent_id, week_start, status, attempts").eq("kind", "maya_unsubscribe").in("parent_id", ids).order("id").range(from, to))),
        inChunks(parentIds, (ids) => allPages((from, to) => admin.from("email_log").select("id, kind, parent_id, week_start, status, attempts").eq("kind", "maya_weekly").in("parent_id", ids).gte("week_start", sinceDay).order("id").range(from, to))),
      ]);
      return {
        parents: parents.map((p) => ({ id: p.id, name: p.name, email: p.email, postal: p.postal })),
        children: children.map((c) => ({ id: c.id, parentId: c.parent_id, firstName: c.first_name })),
        notes,
        log: [...unsubscribes, ...weekly].map((e) => ({ id: e.id, kind: e.kind as WeeklyLogEntry["kind"], parentId: e.parent_id, weekStart: e.week_start, status: e.status, attempts: e.attempts })),
      };
    },
    ledger: mayaWeeklyLedger(admin),
  };
}

/**
 * public.email_log as the delivery module's send ledger for the weekly Maya email: one maya_weekly row per parent per
 * week (unique index). A retry takes a failed row back only once (a guarded update) and only before MAX_SEND_ATTEMPTS.
 * Refused marks the row failed; unknown keeps it claimed. The writes after a claim never throw.
 */
function mayaWeeklyLedger(admin: SupabaseClient<Database>): SendLedger<DueWeekly, string> {
  return {
    async claim(d, { unsubscribe_hash }) {
      if (d.retry) {
        const { data, error } = await admin.from("email_log")
          .update({ status: "claimed", attempts: d.retry.attempts + 1, unsubscribe_hash, error: null })
          .eq("id", d.retry.logId).eq("kind", "maya_weekly").eq("status", "failed").eq("attempts", d.retry.attempts).lt("attempts", MAX_SEND_ATTEMPTS)
          .select("id");
        if (error) throw new Error(`maya weekly claim retry: ${error.message}`);
        return data?.[0]?.id ?? null;
      }
      const { data, error } = await admin.from("email_log")
        .insert({ parent_id: d.parentId, kind: "maya_weekly", week_start: d.weekStart, status: "claimed", attempts: 1, unsubscribe_hash })
        .select("id").single();
      if (error?.code === "23505") return null;
      if (error) throw new Error(`maya weekly claim: ${error.message}`);
      return data.id;
    },
    async sent(id, emailId) {
      const { error } = await admin.from("email_log").update({ status: "sent", sent_at: new Date().toISOString(), email_id: emailId.slice(0, 100), error: null }).eq("id", id);
      if (error) console.error("[maya weekly] sent mark failed; the row stays claimed", id, error.message);
    },
    async refused(id, message) {
      const { error } = await admin.from("email_log").update({ status: "failed", error: message.slice(0, 500) }).eq("id", id);
      if (error) console.error("[maya weekly] failed mark failed; the row stays claimed", id, error.message);
    },
    async unknown(id, message) {
      const { error } = await admin.from("email_log").update({ error: message.slice(0, 500) }).eq("id", id);
      if (error) console.error("[maya weekly] unknown mark failed; the row stays claimed", id, error.message);
    },
    keepCopy: (id, d, copy) => saveEmailCopy(admin, { emailLogId: id }, d.parentId, copy),
  };
}
