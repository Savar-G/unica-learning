import "server-only";
import { admitted, NOT_ADMITTED } from "@/lib/email-admit";
import { resendConfigProblem, resendFrom, resendTransport } from "@/lib/email-resend";

// The parent email delivery module (#149, spec #143): every email the site sends goes through here. A caller gives a
// finished message and, when the email must go at most once, a send key. The module owns the "send once" protocol:
// claim the key, send, record the email id; release the claim when the email was refused; keep it when the outcome is
// unknown. One lost email is acceptable; two copies of one email are not.
//
// Two seams: the mail transport (Resend in production, src/lib/email-resend.ts) and the send ledger (where the claims
// live). Tests use the in-memory adapters in src/lib/email-delivery-memory.ts.

/**
 * Who the email goes to. The sender address is EMAIL_FROM for both; when it is not set, the email is refused (D-133).
 * `from: "founders"` shows the founders' name on that address (D-225).
 */
export type Sender = { to: "parent"; from?: "founders" } | { to: "savar" };

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
  /** Files sent with the email (the first pages' PDF, docs/first-pages.md). The stored copy keeps only their description. */
  attachments?: EmailAttachment[];
}

/** A file sent with an email. */
export interface EmailAttachment {
  filename: string;
  contentType: "application/pdf";
  content: Uint8Array;
}

/** What one send through the transport did. */
export type SendResult =
  /** The email went. `emailId` is the provider's id. */
  | { status: "sent"; emailId: string }
  /** The provider or the configuration said no. The email did not go; a later run may try again. */
  | { status: "refused"; error: string }
  /** The email may have gone (a 5xx or 408 answer, a timeout, no answer). Nothing sends it again automatically. */
  | { status: "unknown"; error: string };

/** How one send may be stopped. */
export interface SendOptions {
  /**
   * Stops the send. Stopped before the request starts, it is "refused", as nothing went. Stopped during the request, it is "unknown".
   */
  signal?: AbortSignal;
  /**
   * Asked last, right before the request starts, after any wait of the transport. False: nothing goes, and the answer is "refused".
   * A transport with no wait of its own may leave it unasked, as its caller has just checked.
   */
  mayStart?(): boolean;
  /**
   * Asked and awaited last, after any wait of the transport and `mayStart`, right before the request starts: whether the
   * email may still go (the first pages' sample email reads the parent's state again here). False or a throw: nothing
   * goes, and the answer is "refused". Every transport asks it.
   */
  admit?(): Promise<boolean>;
}

/** The mail transport seam: Resend in production (src/lib/email-resend.ts), in memory in tests. */
export interface MailTransport {
  /** Sends one message. Never throws: a request that ends without an answer is "unknown". */
  send(message: EmailMessage, options?: SendOptions): Promise<SendResult>;
}

const OUT_OF_TIME: SendResult = { status: "refused", error: "The send did not start: the time ran out" };

/** Answers true when `ms` passed, and false at the signal. */
function waited(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const stop = () => { clearTimeout(timer); resolve(false); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", stop); resolve(true); }, ms);
    signal?.addEventListener("abort", stop, { once: true });
  });
}

/**
 * One transport for everything one run sends, whoever sends it and however the sends overlap. Sends run one after another: a request
 * starts when the one before it has its answer and at least `gapMs` after that request really started. The gap is measured when the
 * turn comes, not reserved beforehand, so a process pause cannot make two requests start together. A send stopped in the queue answers
 * at once, sends nothing and holds up nothing.
 */
export function pacedTransport(transport: MailTransport, gapMs: number): MailTransport {
  let lastStart = -Infinity;
  let queue: Promise<void> = Promise.resolve();
  return {
    send(message, options) {
      const signal = options?.signal;
      if (signal?.aborted) return Promise.resolve(OUT_OF_TIME);
      return new Promise<SendResult>((resolve, reject) => {
        const stop = () => resolve(OUT_OF_TIME);
        signal?.addEventListener("abort", stop, { once: true });
        queue = queue.then(async () => {
          // A timer can fire early and a pause late, so each pass reads the clock again.
          for (let left = lastStart + gapMs - performance.now(); left > 0; left = lastStart + gapMs - performance.now()) {
            if (!await waited(left, signal)) return;
          }
          if (signal?.aborted) return;
          signal?.removeEventListener("abort", stop);
          if (options?.mayStart && !options.mayStart()) return resolve(OUT_OF_TIME);
          // Asked after the wait, so a change during it still stops the send; asked here only, before the timestamp the
          // next gap is measured from, so no wait sits between that timestamp and the request.
          if (!(await admitted(options))) return resolve(NOT_ADMITTED);
          lastStart = performance.now();
          const inner = options ? { ...options, admit: undefined } : options;
          // A throw goes to this send's own caller, and the queue goes on.
          try { resolve(await transport.send(message, inner)); } catch (e) { reject(e); }
        });
      });
    },
  };
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
  /**
   * Keeps a copy of the email of this claim, after each attempt, over the copy of an attempt before (D-103), so the
   * admin can read it the way it was sent. Optional: a ledger without it keeps no copy.
   */
  keepCopy?(handle: H, key: K, copy: EmailCopy): Promise<void>;
}

/** A send ledger that can give a claim back when the send never started. */
export interface ReleasableLedger<K, H> extends SendLedger<K, H> {
  /**
   * Nothing was sent: gives the claim back as if it was never taken, so the attempt does not count. Answers false when it
   * could not, and the claim stays held. Never throws.
   */
  release(handle: H, key: K): Promise<boolean>;
}

/** The email as it was handed to the transport, for the ledger's copy (D-103). */
export interface EmailCopy {
  /** The sender address the transport used; null when it had none (the email was refused). */
  from: string | null;
  message: EmailMessage;
  outcome: SendResult["status"];
  /** Resend's id of the email when it went, so its delivery events find it (D-104); null otherwise. */
  emailId: string | null;
}

/** What a send once did. "busy": another run holds the claim, or the email already went; nothing was sent. */
export type DeliveryOutcome = SendResult | { status: "busy" };

/** What a send once with a time check did. "not_sent": the time ran out after the claim; `released` says if the claim went back. */
export type TimedDeliveryOutcome = DeliveryOutcome | { status: "not_sent"; released: boolean };

/**
 * Sends one email at most once per key: claims the key in the ledger, sends through the transport, then records the
 * outcome. Throws only when the claim itself fails (a store error); nothing was sent then.
 */
export async function sendEmailOnce<K, H>(
  ledger: SendLedger<K, H>,
  key: K,
  message: EmailMessage,
  { transport = resendTransport(), claimFields = {}, admit }: { transport?: MailTransport; claimFields?: Record<string, string>; admit?: () => Promise<boolean> } = {},
): Promise<DeliveryOutcome> {
  const handle = await ledger.claim(key, claimFields);
  if (handle === null) return { status: "busy" };
  // `admit`: asked by the transport right before the request; a no releases the claim (refused), so a later run may try.
  return recordOutcome(ledger, handle, key, message, await sendThrough(transport, message, admit ? { admit } : undefined));
}

/**
 * sendEmailOnce with one more check: after the claim, and again right before the request, after the transport's wait, `inTime` decides
 * if the send may start. When it may not, nothing goes and the claim is given back. Throws only when the claim itself fails.
 */
export async function sendEmailOnceInTime<K, H>(
  ledger: ReleasableLedger<K, H>,
  key: K,
  message: EmailMessage,
  { transport = resendTransport(), claimFields = {}, inTime }: { transport?: MailTransport; claimFields?: Record<string, string>; inTime(): boolean },
): Promise<TimedDeliveryOutcome> {
  const handle = await ledger.claim(key, claimFields);
  if (handle === null) return { status: "busy" };
  let late = !inTime();
  if (!late) {
    const mayStart = () => { late = !inTime(); return !late; };
    const result = await sendThrough(transport, message, { mayStart });
    if (!late) return recordOutcome(ledger, handle, key, message, result);
  }
  try {
    return { status: "not_sent", released: await ledger.release(handle, key) };
  } catch (e) {
    console.error("[email] release failed; the claim stays held", e instanceof Error ? e.message : e);
    return { status: "not_sent", released: false };
  }
}

/** Records a claimed email's outcome and its copy. */
async function recordOutcome<K, H>(ledger: SendLedger<K, H>, handle: H, key: K, message: EmailMessage, result: SendResult): Promise<SendResult> {
  // The ledger's writes never throw by contract. If one does anyway, the email's outcome still reaches the caller; a
  // write that did not happen leaves the claim held, so the email is not sent again.
  try {
    if (result.status === "sent") await ledger.sent(handle, result.emailId);
    else if (result.status === "refused") await ledger.refused(handle, result.error);
    else await ledger.unknown(handle, result.error);
  } catch (e) {
    console.error("[email] ledger write failed; the claim stays held", result.status, e instanceof Error ? e.message : e);
  }
  if (ledger.keepCopy) {
    // A copy that is not kept never changes the email's outcome.
    try {
      await ledger.keepCopy(handle, key, { from: resendFrom(message), message, outcome: result.status, emailId: result.status === "sent" ? result.emailId : null });
    } catch (e) {
      console.error("[email] copy not kept", result.status, e instanceof Error ? e.message : e);
    }
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
async function sendThrough(transport: MailTransport, message: EmailMessage, options?: SendOptions): Promise<SendResult> {
  try {
    return await (options ? transport.send(message, options) : transport.send(message));
  } catch (e) {
    return { status: "unknown", error: `Email delivery is unknown: ${e instanceof Error ? e.message : String(e)}. Check delivery before sending again.` };
  }
}
