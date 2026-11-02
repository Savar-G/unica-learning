import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { saveEmailCopy } from "@/lib/email-copies";
import type { SendLedger } from "@/lib/email-delivery";
import { fromNoteRow } from "@/lib/maya-call-note-store";
import { LOOKBACK_DAYS, type DailyLogEntry, type DailyStore, type DueDaily } from "@/lib/maya-daily-email";
import { MAX_SEND_ATTEMPTS } from "@/lib/reminders";

// The daily Maya email's store (#332): reads and writes with the secret key. The rules are in
// src/lib/maya-daily-email.ts; this loads the notes of recent calls (public.maya_call_notes), their parents and
// children, and the parents' maya_daily and maya_unsubscribe rows, and keeps the claims in public.email_log (migration
// add_maya_daily_email). Tests use src/lib/maya-daily-email-memory.ts.

/** Ids per `in` filter, so a request URL stays short. */
const CHUNK = 100;
/** Reads two days wider than the rules: a call's local day can be a day off its UTC date. */
const SLACK_DAYS = 2;

async function inChunks<T>(ids: readonly string[], read: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await read(ids.slice(i, i + CHUNK));
    if (error) throw new Error(`maya daily load: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

export function mayaDailyStore(admin: SupabaseClient<Database>): DailyStore {
  return {
    async load(now) {
      const since = new Date(now - (LOOKBACK_DAYS + SLACK_DAYS) * 24 * 60 * 60_000).toISOString();
      // A few notes a day per family at most: one page holds them. More would be cut, and the run says so.
      const { data: noteRows, error } = await admin.from("maya_call_notes").select("*").gte("call_ended_at", since).order("call_ended_at").limit(1000);
      if (error) throw new Error(`maya daily load: ${error.message}`);
      if ((noteRows ?? []).length === 1000) console.error("[maya daily] 1000 notes read; later ones wait for the next run");
      const notes = (noteRows ?? []).map(fromNoteRow);
      const parentIds = [...new Set(notes.map((n) => n.parentId))];
      const childIds = [...new Set(notes.map((n) => n.childId))];
      const [parents, children, log] = await Promise.all([
        inChunks(parentIds, (ids) => admin.from("parents").select("id, name, email, postal").in("id", ids)),
        inChunks(childIds, (ids) => admin.from("children").select("id, parent_id, first_name").in("id", ids)),
        inChunks(parentIds, (ids) => admin.from("email_log").select("id, kind, parent_id, day, status, attempts").in("parent_id", ids).in("kind", ["maya_daily", "maya_unsubscribe"])),
      ]);
      return {
        parents: parents.map((p) => ({ id: p.id, name: p.name, email: p.email, postal: p.postal })),
        children: children.map((c) => ({ id: c.id, parentId: c.parent_id, firstName: c.first_name })),
        notes,
        log: log.map((e) => ({ id: e.id, kind: e.kind as DailyLogEntry["kind"], parentId: e.parent_id, day: e.day, status: e.status, attempts: e.attempts })),
      };
    },
    ledger: mayaDailyLedger(admin),
  };
}

/**
 * public.email_log as the delivery module's send ledger for the daily Maya email: one maya_daily row per parent per
 * day (unique index). A retry takes a failed row back only once (a guarded update) and only before MAX_SEND_ATTEMPTS.
 * Refused marks the row failed; unknown keeps it claimed. The writes after a claim never throw.
 */
function mayaDailyLedger(admin: SupabaseClient<Database>): SendLedger<DueDaily, string> {
  return {
    async claim(d, { unsubscribe_hash }) {
      if (d.retry) {
        const { data, error } = await admin.from("email_log")
          .update({ status: "claimed", attempts: d.retry.attempts + 1, unsubscribe_hash, error: null })
          .eq("id", d.retry.logId).eq("kind", "maya_daily").eq("status", "failed").eq("attempts", d.retry.attempts).lt("attempts", MAX_SEND_ATTEMPTS)
          .select("id");
        if (error) throw new Error(`maya daily claim retry: ${error.message}`);
        return data?.[0]?.id ?? null;
      }
      const { data, error } = await admin.from("email_log")
        .insert({ parent_id: d.parentId, kind: "maya_daily", day: d.day, status: "claimed", attempts: 1, unsubscribe_hash })
        .select("id").single();
      if (error?.code === "23505") return null;
      if (error) throw new Error(`maya daily claim: ${error.message}`);
      return data.id;
    },
    async sent(id, emailId) {
      const { error } = await admin.from("email_log").update({ status: "sent", sent_at: new Date().toISOString(), email_id: emailId.slice(0, 100), error: null }).eq("id", id);
      if (error) console.error("[maya daily] sent mark failed; the row stays claimed", id, error.message);
    },
    async refused(id, message) {
      const { error } = await admin.from("email_log").update({ status: "failed", error: message.slice(0, 500) }).eq("id", id);
      if (error) console.error("[maya daily] failed mark failed; the row stays claimed", id, error.message);
    },
    async unknown(id, message) {
      const { error } = await admin.from("email_log").update({ error: message.slice(0, 500) }).eq("id", id);
      if (error) console.error("[maya daily] unknown mark failed; the row stays claimed", id, error.message);
    },
    keepCopy: (id, d, copy) => saveEmailCopy(admin, { emailLogId: id }, d.parentId, copy),
  };
}
