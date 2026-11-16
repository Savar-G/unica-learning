import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/lib/database";
import { hideTokens } from "@/lib/email-copies";
import { isSecretSendKind, type SendTag } from "@/lib/email-send-kinds";
import { SUPABASE_URL } from "@/lib/supabase-public";

// The send log (public.email_sends, migration email_sends): one row per send attempt of every email that has no other
// durable row, so the admin Emails page shows every email the site sends. The delivery module (src/lib/email-delivery.ts)
// writes it after each attempt of a message that carries a `log` tag. A row that is not written never changes the
// email's outcome. The emails with a secret (sign-in links, delete codes) and the contact form keep no copy.

/** What one send attempt gave, as the delivery module saw it. */
export interface SendAttempt {
  outcome: "sent" | "refused" | "unknown";
  /** Resend's id of the email when it went; null otherwise. */
  emailId: string | null;
  error: string | null;
  /** The sender address the transport used; null when it had none. */
  from: string | null;
}

/** The message fields a row keeps. */
interface LoggedMessage { to: string; subject: string; text: string; html?: string; replyTo?: string }

const cut = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : null);

/** The public.email_sends row of one attempt. Secret kinds keep only the kind, the family, the outcome and Resend's id. */
export function sendRow(tag: SendTag, message: LoggedMessage, attempt: SendAttempt): TablesInsert<"email_sends"> {
  const secret = isSecretSendKind(tag.kind);
  const sent = attempt.outcome === "sent";
  return {
    kind: tag.kind,
    parent_id: tag.parentId ?? null,
    child_id: secret ? null : (tag.childId ?? null),
    outcome: attempt.outcome,
    // Resend answers "sent" without an id only in odd cases (see email-resend.ts); that stand-in finds no events.
    email_id: sent && attempt.emailId && attempt.emailId !== "sent" ? attempt.emailId.slice(0, 100) : null,
    error: sent ? null : cut(attempt.error ?? "No error was given", 500),
    from_address: cut(attempt.from, 320),
    to_address: secret ? null : cut(message.to, 320),
    reply_to: secret ? null : cut(message.replyTo, 320),
    subject: secret ? null : cut(message.subject, 500),
    text_body: secret ? null : hideTokens(message.text).slice(0, 200_000),
    html_body: secret || !message.html ? null : hideTokens(message.html).slice(0, 500_000),
  };
}

/** Writes one row of the send log. Never throws. */
export type SendRecorder = (row: TablesInsert<"email_sends">) => Promise<void>;

/** A write of the log gets this long, so a slow database never holds up the sender for long. */
const WRITE_MS = 2000;

let client: SupabaseClient<Database> | null = null;

/**
 * The recorder on the database, with the secret key. It makes its own client (not src/lib/supabase-auth.ts, which needs
 * the Next.js request), so the voice worker can use it too. Without SUPABASE_SECRET_KEY it writes nothing.
 */
export const supabaseSendRecorder: SendRecorder = async (row) => {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return;
  try {
    client ??= createClient<Database>(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } });
    const { error } = await client.from("email_sends").insert(row).abortSignal(AbortSignal.timeout(WRITE_MS));
    if (error) console.error("[email] send log row not written", row.kind, error.message);
  } catch (e) {
    console.error("[email] send log row not written", row.kind, e instanceof Error ? e.message : e);
  }
};
