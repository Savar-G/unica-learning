import "server-only";
import { resendConfigProblem, resendTransport } from "@/lib/email-resend";

// The parent email delivery module (#149, spec #143): every email the site sends goes through here. A caller gives a
// finished message and, when the email must go at most once, a send key. The module owns the "send once" protocol:
// claim the key, send, record the email id; release the claim when the email was refused; keep it when the outcome is
// unknown. One lost email is acceptable; two copies of one email are not.
//
// Two seams: the mail transport (Resend in production, src/lib/email-resend.ts) and the send ledger (where the claims
// live). Tests use the in-memory adapters in src/lib/email-delivery-memory.ts.

/** Who the email goes to decides its sender address. */
export type Sender =
  /** A parent: EMAIL_FROM. When it is not set, the email is refused. */
  | { to: "parent" }
  /** Savar: EMAIL_FROM, else Resend's test sender with this display name (the free plan delivers it only to the account owner). */
  | { to: "savar"; testSenderName: string };

/** A finished email. The caller decides its content; the module only sends it. */
export interface EmailMessage {
  sender: Sender;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Extra mail headers, for example the RFC 8058 one-click unsubscribe headers. */
  headers?: Record<string, string>;
}

/** What one send through the transport did. */
export type SendResult =
  /** The email went. `emailId` is the provider's id. */
  | { status: "sent"; emailId: string }
  /** The provider or the configuration said no. The email did not go; a later run may try again. */
  | { status: "refused"; error: string }
  /** The email may have gone (a 5xx or 408 answer, a timeout, no answer). Nothing sends it again automatically. */
  | { status: "unknown"; error: string };

/** The mail transport seam: Resend in production (src/lib/email-resend.ts), in memory in tests. */
export interface MailTransport {
  /** Sends one message. Never throws: a request that ends without an answer is "unknown". */
  send(message: EmailMessage): Promise<SendResult>;
}

/**
 * The send ledger seam: where the claims live. Production adapters keep claims where they are today (the report row,
 * the email log); tests use the in-memory ledger (src/lib/email-delivery-memory.ts), which keeps the same guards.
 * `K` is the send key (which email), `H` the claim handle.
 */
export interface SendLedger<K, H> {
  /**
   * Claims the key before the email is sent, with `fields` in the same write (for example the unsubscribe token hash).
   * Null when another run holds the claim, or the email already went.
   */
  claim(key: K, fields: Record<string, string>): Promise<H | null>;
  /** The email went: stores its id. Never throws. */
  sent(handle: H, emailId: string): Promise<void>;
  /** The email did not go: releases the claim, so a later run may try again, and stores the error. Never throws. */
  refused(handle: H, error: string): Promise<void>;
  /** The email may have gone: keeps the claim, so nothing sends it again, and stores the error. Never throws. */
  unknown(handle: H, error: string): Promise<void>;
}

/** What a send once did. "busy": another run holds the claim, or the email already went; nothing was sent. */
export type DeliveryOutcome = SendResult | { status: "busy" };

/**
 * Sends one email at most once per key: claims the key in the ledger, sends through the transport, then records the
 * outcome. Throws only when the claim itself fails (a store error); nothing was sent then.
 */
export async function sendEmailOnce<K, H>(
  ledger: SendLedger<K, H>,
  key: K,
  message: EmailMessage,
  { transport = resendTransport(), claimFields = {} }: { transport?: MailTransport; claimFields?: Record<string, string> } = {},
): Promise<DeliveryOutcome> {
  const handle = await ledger.claim(key, claimFields);
  if (handle === null) return { status: "busy" };
  const result = await sendThrough(transport, message);
  // The ledger's writes never throw by contract. If one does anyway, the email's outcome still reaches the caller; a
  // write that did not happen leaves the claim held, so the email is not sent again.
  try {
    if (result.status === "sent") await ledger.sent(handle, result.emailId);
    else if (result.status === "refused") await ledger.refused(handle, result.error);
    else await ledger.unknown(handle, result.error);
  } catch (e) {
    console.error("[email] ledger write failed; the claim stays held", result.status, e instanceof Error ? e.message : e);
  }
  return result;
}

/** Sends one email that has its own guard or needs none (the sign-in link, alerts to Savar). Never answers busy. */
export async function sendEmail(message: EmailMessage, { transport = resendTransport() }: { transport?: MailTransport } = {}): Promise<SendResult> {
  return sendThrough(transport, message);
}

/**
 * Why a parent email cannot go now (the Resend key or EMAIL_FROM is not set), or null. Lets a caller stop before it
 * claims anything. Read in the Resend adapter.
 */
export const emailConfigProblem = (): string | null => resendConfigProblem();

/** A transport that throws anyway may have reached the provider, so its outcome is unknown. */
async function sendThrough(transport: MailTransport, message: EmailMessage): Promise<SendResult> {
  try {
    return await transport.send(message);
  } catch (e) {
    return { status: "unknown", error: `Email delivery is unknown: ${e instanceof Error ? e.message : String(e)}. Check delivery before sending again.` };
  }
}
