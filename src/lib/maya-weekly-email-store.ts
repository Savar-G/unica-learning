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

type CallRow = Pick<Database["public"]["Tables"]["maya_calls"]["Row"], "id" | "parent_id" | "child_id" | "ended_at" | "note_pending">;
type NoteRow = Database["public"]["Tables"]["maya_call_notes"]["Row"];
type LogRow = Pick<Database["public"]["Tables"]["email_log"]["Row"], "id" | "kind" | "parent_id" | "week_start" | "status" | "attempts">;

type Result<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Read after the last key, so deleting earlier rows cannot move an unread row behind an offset. */
async function allPages<T>(read: (after: T | null) => Result<T>): Promise<T[]> {
  const out: T[] = [];
  let after: T | null = null;
  for (;;) {
    const { data, error } = await read(after);
    if (error) throw new Error(`maya weekly load: ${error.message}`);
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

export function mayaWeeklyStore(admin: SupabaseClient<Database>): WeeklyStore {
  return {
    async load(now) {
      const since = new Date(now - (LOOKBACK_DAYS + SLACK_DAYS) * 24 * 60 * 60_000).toISOString();
      // Completed calls are the count, including calls whose note is still pending (#403).
      // Read calls before notes so a note saved during this load can complete the already-read call.
      const callRows = await allPages<CallRow>((after) => {
        const query = admin.from("maya_calls").select("id, parent_id, child_id, ended_at, note_pending")
          .eq("status", "ended").gte("ended_at", since).order("ended_at").order("id").limit(PAGE);
        return after ? query.or(`ended_at.gt.${after.ended_at},and(ended_at.eq.${after.ended_at},id.gt.${after.id})`) : query;
      });
      const noteRows = await allPages<NoteRow>((after) => {
        const query = admin.from("maya_call_notes").select("*").gte("call_ended_at", since).order("call_ended_at").order("call_id").limit(PAGE);
        return after ? query.or(`call_ended_at.gt.${after.call_ended_at},and(call_ended_at.eq.${after.call_ended_at},call_id.gt.${after.call_id})`) : query;
      });
      const notes = noteRows.map(fromNoteRow);
      const calls = callRows.map((c) => ({ callId: c.id, parentId: c.parent_id, childId: c.child_id, endedAt: c.ended_at!, notePending: c.note_pending !== null }));
      const parentIds = [...new Set(calls.map((c) => c.parentId))];
      const childIds = [...new Set(calls.map((c) => c.childId))];
      // Only the log rows that matter: each parent's Maya unsubscribe, and the weekly claims of the weeks in the window.
      const sinceDay = since.slice(0, 10);
      const [parents, children, unsubscribes, weekly] = await Promise.all([
        // Each id chunk has at most CHUNK rows, below the server page limit.
        inChunks(parentIds, async (ids) => {
          const { data, error } = await admin.from("parents").select("id, name, email, postal").in("id", ids);
          if (error) throw new Error(`maya weekly load: ${error.message}`);
          return data ?? [];
        }),
        inChunks(childIds, async (ids) => {
          const { data, error } = await admin.from("children").select("id, parent_id, first_name").in("id", ids);
          if (error) throw new Error(`maya weekly load: ${error.message}`);
          return data ?? [];
        }),
        inChunks(parentIds, (ids) => allPages<LogRow>((after) => {
          const query = admin.from("email_log").select("id, kind, parent_id, week_start, status, attempts").eq("kind", "maya_unsubscribe").in("parent_id", ids).order("id").limit(PAGE);
          return after ? query.gt("id", after.id) : query;
        })),
        inChunks(parentIds, (ids) => allPages<LogRow>((after) => {
          const query = admin.from("email_log").select("id, kind, parent_id, week_start, status, attempts").eq("kind", "maya_weekly").in("parent_id", ids).gte("week_start", sinceDay).order("id").limit(PAGE);
          return after ? query.gt("id", after.id) : query;
        })),
      ]);
      return {
        parents: parents.map((p) => ({ id: p.id, name: p.name, email: p.email, postal: p.postal })),
        children: children.map((c) => ({ id: c.id, parentId: c.parent_id, firstName: c.first_name })),
        calls,
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
