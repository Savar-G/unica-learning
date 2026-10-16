import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailCopy } from "@/lib/email-delivery";

// The email copies (D-103): what each logged email looked like when the site sent it, in public.email_copies, for the
// admin's email view. The send ledgers write them (the email log ledger and the report row ledger); the admin reads
// them. The secret in each link is taken out first: a copy can show the email, but cannot unsubscribe the parent.

/** Which logged email a copy belongs to: a reminder (its email log row), or one email of a report. */
export type CopyTarget = { emailLogId: string } | { reportId: string; reportEmail: "parent" | "alert" };

/** The token in a link (the unsubscribe token `t`, or a sign-in token), in text and in HTML (`&amp;`). */
const TOKEN = /((?:\?|&amp;|&)(?:t|token|token_hash)=)[^&"'\s<>]+/g;
/** Replaces the value of every token in the links of `s` with "hidden". */
export const hideTokens = (s: string) => s.replace(TOKEN, "$1hidden");

/** The public.email_copies row of a copy. */
export function copyRow(target: CopyTarget, parentId: string, copy: EmailCopy): Record<string, string | null> {
  const { message: m } = copy;
  return {
    parent_id: parentId,
    ...("emailLogId" in target ? { email_log_id: target.emailLogId } : { report_id: target.reportId, report_email: target.reportEmail }),
    outcome: copy.outcome,
    from_address: copy.from?.slice(0, 320) ?? null,
    to_address: m.to.slice(0, 320),
    reply_to: m.replyTo?.slice(0, 320) ?? null,
    subject: m.subject.slice(0, 500),
    text_body: hideTokens(m.text).slice(0, 200_000),
    html_body: m.html ? hideTokens(m.html).slice(0, 500_000) : null,
    updated_at: new Date().toISOString(),
  };
}

/** Keeps the copy, over the copy of an attempt before. Never throws: the email itself already went or failed. */
export async function saveEmailCopy(admin: SupabaseClient, target: CopyTarget, parentId: string, copy: EmailCopy): Promise<void> {
  try {
    const onConflict = "emailLogId" in target ? "email_log_id" : "report_id,report_email";
    const { error } = await admin.from("email_copies").upsert(copyRow(target, parentId, copy), { onConflict });
    if (error) console.error("[email] copy not kept", onConflict, error.message);
  } catch (e) {
    console.error("[email] copy not kept", e instanceof Error ? e.message : e);
  }
}
