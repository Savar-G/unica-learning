import "server-only";
// The sample email's store in Supabase (docs/first-pages.md): the due sets, the checks right before the claim, the PDF
// from the private bucket, and the email log as the send ledger (kind first_pages, one row per test: the unique index
// email_log_one_per_test makes a second claim fail). Pass a client with the secret key. Stripe answers the card check
// for the child; a card saved for any child of the family in card_setups also stops the email.
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { Database } from "@/lib/database";
import { saveEmailCopy } from "@/lib/email-copies";
import type { SendLedger } from "@/lib/email-delivery";
import type { DueFirstPagesEmail, FirstPagesEmailStore } from "@/lib/first-pages-email";
import type { FirstPagesResult } from "@/lib/first-pages";
import { parentUnsubscribed } from "@/lib/reminder-store";
import { MAX_SEND_ATTEMPTS } from "@/lib/reminders";
import { checkCard } from "@/lib/saved-card";
import { savedCards } from "@/lib/saved-card-server";
import { WORKBOOK_FILES_BUCKET } from "@/lib/workbook-content";

/** A sample email goes only this long after its test finished; later it would be about an old test. */
export const FIRST_PAGES_EMAIL_DAYS = 7;
/** Ready sets read at a time, and the most one run looks through. */
const DUE_PAGE = 100;
const DUE_SCAN_MOST = 2000;

function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`first pages email ${what}: ${r.error.message}`);
  return r.data;
}

export function firstPagesEmailLedger(admin: SupabaseClient<Database>): SendLedger<DueFirstPagesEmail, string> {
  return {
    async claim(d, { unsubscribe_hash }) {
      if (d.retry) {
        const { data, error } = await admin.from("email_log")
          .update({ status: "claimed", attempts: d.retry.attempts + 1, unsubscribe_hash, error: null })
          .eq("id", d.retry.logId).eq("status", "failed").eq("attempts", d.retry.attempts).lt("attempts", MAX_SEND_ATTEMPTS).select("id");
        if (error) throw new Error(`claim retry: ${error.message}`);
        return data?.[0]?.id ?? null;
      }
      const { data, error } = await admin.from("email_log")
        .insert({ parent_id: d.parentId, child_id: d.childId, assessment_id: d.assessmentId, kind: "first_pages", status: "claimed", attempts: 1, unsubscribe_hash })
        .select("id").single();
      if (error?.code === "23505") return null;
      if (error) throw new Error(`claim: ${error.message}`);
      return data.id;
    },
    async sent(logId, emailId) {
      const { error } = await admin.from("email_log").update({ status: "sent", sent_at: new Date().toISOString(), email_id: emailId.slice(0, 100), error: null }).eq("id", logId);
      if (error) console.error("[first pages email] sent mark failed; the row stays claimed", logId, error.message);
    },
    async refused(logId, message) {
      const { error } = await admin.from("email_log").update({ status: "failed", error: message.slice(0, 500) }).eq("id", logId);
      if (error) console.error("[first pages email] failed mark failed; the row stays claimed", logId, error.message);
    },
    async unknown(logId, message) {
      const { error } = await admin.from("email_log").update({ error: message.slice(0, 500) }).eq("id", logId);
      if (error) console.error("[first pages email] unknown mark failed; the row stays claimed", logId, error.message);
    },
    keepCopy: (logId, d, copy) => saveEmailCopy(admin, { emailLogId: logId }, d.parentId, copy),
  };
}

export function firstPagesEmailStore(admin: SupabaseClient<Database>, stripe: Stripe | null): FirstPagesEmailStore {
  return {
    async due(limit) {
      const out: DueFirstPagesEmail[] = [];
      // Page through the ready sets, oldest first, past those whose email went: a long tail of sent ones never hides a
      // newer set. Only sets of tests that finished within FIRST_PAGES_EMAIL_DAYS can still be sent.
      const since = new Date(Date.now() - FIRST_PAGES_EMAIL_DAYS * 86_400_000).toISOString();
      for (let from = 0; out.length < limit && from < DUE_SCAN_MOST; from += DUE_PAGE) {
        const sets = must(await admin.from("workbook_first_pages").select("id, assessment_id, parent_id, child_id, result, decision, kept_by")
          .eq("status", "ready").is("kept_by", null).gte("ready_at", since).order("ready_at").order("id").range(from, from + DUE_PAGE - 1), "due load") ?? [];
        for (const s of sets) {
          if (out.length >= limit) break;
          if (s.decision === "drop") continue;
          const result = s.result as unknown as FirstPagesResult | null;
          if (!result?.files?.pdf?.path) continue;
          const log = must(await admin.from("email_log").select("id, status, attempts").eq("assessment_id", s.assessment_id).eq("kind", "first_pages").maybeSingle(), "log load");
          if (log && (log.status !== "failed" || log.attempts >= MAX_SEND_ATTEMPTS)) continue;
          const [parent, child, report] = await Promise.all([
            admin.from("parents").select("name, email").eq("id", s.parent_id).maybeSingle(),
            admin.from("children").select("first_name").eq("id", s.child_id).maybeSingle(),
            admin.from("reports").select("id").eq("assessment_id", s.assessment_id).maybeSingle(),
          ]);
          const p = must(parent, "parent load"), c = must(child, "child load"), r = must(report, "report load");
          if (!p || !c || !r) continue;
          const d: DueFirstPagesEmail = {
            firstPagesId: s.id, assessmentId: s.assessment_id, reportId: r.id, parentId: s.parent_id, childId: s.child_id,
            parentName: p.name, parentEmail: p.email, childName: c.first_name, pdfPath: result.files.pdf.path,
            retry: log ? { logId: log.id, attempts: log.attempts } : null,
          };
          // A set the database already stops (unsubscribed, a stored card, an old test, a deletion) takes no place in
          // the list, so it never keeps a later set out.
          if (await databaseBlocked(admin, d).catch(() => "unreadable")) continue;
          out.push(d);
        }
        if (sets.length < DUE_PAGE) break;
      }
      return out;
    },
    async blocked(d) {
      try {
        // Stripe first (its reads can take seconds), then the database checks, the last thing before the claim.
        const setups = must(await admin.from("card_setups").select("child_id, card_saved_at").eq("parent_id", d.parentId), "card load") ?? [];
        if (setups.some((c) => c.card_saved_at)) return "the family saved a card";
        // Every card setup of the family (a sibling's card may be saved in Stripe before the row says so); an answer
        // that is not known stops the email too.
        const cards = savedCards(admin, stripe);
        for (const childId of new Set([d.childId, ...setups.map((c) => c.child_id)])) {
          const card = await checkCard({ parentId: d.parentId, childId }, cards);
          if (card.state === "saved") return "the family saved a card";
          if (card.state === "unknown") return "the card could not be checked";
        }
        return await databaseBlocked(admin, d);
      } catch (e) {
        return `the checks could not be read: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    admit: async (d) => (await databaseBlocked(admin, d).catch(() => "unreadable")) === null,
    async pdf(path) {
      const { data, error } = await admin.storage.from(WORKBOOK_FILES_BUCKET).download(path);
      if (error || !data) throw new Error(`first pages PDF: ${error?.message ?? "no file"}`);
      return new Uint8Array(await data.arrayBuffer());
    },
    ledger: firstPagesEmailLedger(admin),
  };
}

/**
 * The database's reasons an email may not go now, or null: the set is no longer ready (hidden, kept by a run, another
 * family's), the test finished too long ago, the family or the child is being deleted, the parent unsubscribed, or a
 * card of the family is stored as saved. Throws when a read fails.
 */
async function databaseBlocked(admin: SupabaseClient<Database>, d: DueFirstPagesEmail): Promise<string | null> {
  const [set, test, parent, removing, cards] = await Promise.all([
    admin.from("workbook_first_pages").select("status, decision, kept_by, parent_id").eq("id", d.firstPagesId).maybeSingle(),
    admin.from("assessments").select("completed_at").eq("id", d.assessmentId).maybeSingle(),
    admin.from("parents").select("deletion_requested_at").eq("id", d.parentId).maybeSingle(),
    admin.from("child_deletions").select("child_id").eq("child_id", d.childId).maybeSingle(),
    admin.from("card_setups").select("child_id").eq("parent_id", d.parentId).not("card_saved_at", "is", null).limit(1),
  ]);
  const s = must(set, "set load");
  if (!s || s.status !== "ready" || s.decision === "drop" || s.kept_by) return "the first pages are not ready to send";
  if (s.parent_id !== d.parentId) return "the first pages are another family's";
  const t = must(test, "test load");
  if (!t?.completed_at || Date.parse(t.completed_at) < Date.now() - FIRST_PAGES_EMAIL_DAYS * 86_400_000) return "the test finished too long ago";
  const p = must(parent, "parent load");
  if (!p || p.deletion_requested_at || must(removing, "child deletion load")) return "the family or the child is being deleted";
  if ((must(cards, "card load") ?? []).length) return "the family saved a card";
  if (await parentUnsubscribed(admin, d.parentId)) return "the parent unsubscribed";
  return null;
}
