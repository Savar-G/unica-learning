import "server-only";
import type { EmailMessage, MailTransport, SendResult } from "@/lib/email-delivery";

// The Resend adapter of the mail transport (#149). The one place that reads the Resend key, the sender address and the
// request time limit, and the one place that decides what an answer from Resend means:
// - 2xx: sent, with Resend's email id.
// - 4xx other than 408, or missing configuration: refused. The email did not go.
// - 408, 5xx, a timeout, or a request that ends without an answer: unknown. The email may have gone.

const ENDPOINT = "https://api.resend.com/emails";
/** A slow Resend never holds a request open longer than this. */
const TIME_LIMIT_MS = 15_000;
/** Resend's test sender. The free plan delivers its emails only to the account owner, so it serves alerts to Savar. */
const TEST_SENDER = "onboarding@resend.dev";

/** Why a parent email cannot go now (the key or EMAIL_FROM is not set), or null. */
export function resendConfigProblem(): string | null {
  if (!process.env.RESEND_API_KEY) return "RESEND_API_KEY is not set";
  if (!process.env.EMAIL_FROM) return "EMAIL_FROM is not set";
  return null;
}

/** The sender address of the message, or null when a parent email has no EMAIL_FROM. */
export function resendSender(message: EmailMessage): string | null {
  const from = process.env.EMAIL_FROM;
  if (from) return from;
  return message.sender.to === "savar" ? `${message.sender.testSenderName} <${TEST_SENDER}>` : null;
}

const refusal = (status: number) => status >= 400 && status < 500 && status !== 408;
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** `fetch`: the network; tests give a stub. */
export function resendTransport({ fetch: request = (input, init) => fetch(input, init) }: { fetch?: typeof fetch } = {}): MailTransport {
  return {
    async send(message): Promise<SendResult> {
      const key = process.env.RESEND_API_KEY;
      if (!key) return { status: "refused", error: "RESEND_API_KEY is not set" };
      const from = resendSender(message);
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
          }),
          signal: controller.signal,
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
