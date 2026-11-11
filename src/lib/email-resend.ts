import "server-only";
import type { EmailMessage, MailTransport, SendResult } from "@/lib/email-delivery";
import { FOUNDERS_SENDER_NAME } from "@/lib/contact";

// The Resend adapter of the mail transport (#149). The one place that reads the Resend key, the sender address and the
// request time limit, and the one place that decides what an answer from Resend means:
// - 2xx: sent, with Resend's email id.
// - 4xx other than 408, or missing configuration: refused. The email did not go.
// - 408, 5xx, a timeout, or a request that ends without an answer: unknown. The email may have gone.

const ENDPOINT = "https://api.resend.com/emails";
/** A slow Resend never holds a request open longer than this. */
export const TIME_LIMIT_MS = 15_000;

/** Why a parent email cannot go now (the key or EMAIL_FROM is not set), or null. */
export function resendConfigProblem(): string | null {
  if (!process.env.RESEND_API_KEY) return "RESEND_API_KEY is not set";
  if (!process.env.EMAIL_FROM) return "EMAIL_FROM is not set";
  return null;
}

/** The sender address: EMAIL_FROM for every email, to a parent or to Savar (D-133), or null when it is not set. */
export function resendSender(): string | null {
  return process.env.EMAIL_FROM || null;
}

/**
 * The From header of `message`: EMAIL_FROM, or, for an email the founders sign, the founders' name on the same address
 * (D-225). Null when EMAIL_FROM is not set.
 */
export function resendFrom(message: Pick<EmailMessage, "sender">): string | null {
  const from = resendSender();
  if (!from || message.sender.to !== "parent" || message.sender.from !== "founders") return from;
  const address = from.match(/<([^>]+)>/)?.[1] ?? from.trim();
  // Plain `Name <address>`, the form in Resend's docs: the name has no comma or other character that needs quotes.
  return `${FOUNDERS_SENDER_NAME} <${address}>`;
}

const refusal = (status: number) => status >= 400 && status < 500 && status !== 408;
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** `fetch`: the network; tests give a stub. */
export function resendTransport({ fetch: request = (input, init) => fetch(input, init) }: { fetch?: typeof fetch } = {}): MailTransport {
  return {
    async send(message, options): Promise<SendResult> {
      if (options?.signal?.aborted || options?.mayStart?.() === false) return { status: "refused", error: "The send did not start: the time ran out" };
      const key = process.env.RESEND_API_KEY;
      if (!key) return { status: "refused", error: "RESEND_API_KEY is not set" };
      const from = resendFrom(message);
      if (!from) return { status: "refused", error: "EMAIL_FROM is not set" };

      // The time limit covers the answer's body too.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError")), TIME_LIMIT_MS);
      try {
        const res = await request(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
            reply_to: message.replyTo,
            headers: message.headers,
            ...(message.attachments?.length ? {
              attachments: message.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64"), content_type: a.contentType })),
            } : {}),
          }),
          signal: options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal,
        });
        if (res.ok) {
          // Resend took the email. An answer without an id still means sent; "sent" stands in for the id.
          const id = ((await res.json().catch(() => null)) as { id?: unknown } | null)?.id;
          return { status: "sent", emailId: typeof id === "string" && id ? id : "sent" };
        }
        const error = `Resend answered ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
        return refusal(res.status) ? { status: "refused", error } : { status: "unknown", error };
      } catch (e) {
        return { status: "unknown", error: `Resend delivery is unknown: ${reason(e)}. Check delivery before sending again.` };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
