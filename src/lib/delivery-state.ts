// The send state of one email, read from its send ledger (docs/state-machines.md, item 5). Every ledger runs the same
// protocol (src/lib/email-delivery.ts: claim, then sent, refused or unknown), but each stores it in its own columns, so
// each reader below turns one ledger's row into the one list of states. Pure: no imports with side effects, no clock.
import type { LogStatus } from "@/lib/email-log-kinds";

/**
 * - unsent: no run has claimed it yet.
 * - claimed: a run holds the claim and has no answer yet (it may be sending now).
 * - sent: Resend took it.
 * - refused: Resend refused it; the claim was let go (or, for a reminder, it is tried again).
 * - unknown: no answer (a 5xx, 408, timeout or lost answer); the email may have gone, and it is never sent again.
 */
export const DELIVERY_STATES = ["unsent", "claimed", "sent", "refused", "unknown"] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

/** The admin's three counts: only a sent email counts as sent, only a refused one as failed. */
export const DELIVERY_STATUS: Record<DeliveryState, "sent" | "failed" | "pending"> = {
  unsent: "pending", claimed: "pending", sent: "sent", refused: "failed", unknown: "pending",
};

/** The admin's words for each state. */
export const DELIVERY_WORDS: Record<DeliveryState, string> = {
  unsent: "Waiting to send",
  claimed: "Sending: no answer from Resend yet",
  sent: "Sent",
  refused: "Not sent: Resend refused it",
  unknown: "Delivery unknown: Resend did not answer, so the email may have gone. It is not sent again",
};

/**
 * The report email (public.reports, src/lib/report-row-ledger.ts). emailed_at is the claim time, not the send time:
 * only the email id proves the email went (bug B13). Refused clears emailed_at; unknown keeps it and sets the error.
 * A claim does not clear an old error, so a run that claims a refused email again reads as unknown until its answer
 * comes (at most a few minutes): the row cannot tell that run from an unknown send.
 */
export function reportEmailState(r: { emailed_at: string | null; email_id: string | null; email_error: string | null }): DeliveryState {
  if (r.email_id) return "sent";
  if (r.emailed_at) return r.email_error ? "unknown" : "claimed";
  return r.email_error ? "refused" : "unsent";
}

/**
 * The report alert (public.reports). It has no id column: sent only clears alert_error, so a held claim and a sent
 * alert cannot be told apart, and both read as sent.
 */
export function reportAlertState(r: { alerted_at: string | null; alert_error: string | null }): DeliveryState {
  if (r.alerted_at) return r.alert_error ? "unknown" : "sent";
  return r.alert_error ? "refused" : "unsent";
}

/**
 * A row of public.email_log (the reminders, the weekly Maya email and the monthly summary): unknown is a claim that
 * kept its error, and failed is a refusal. A row with no status (an unsubscribe) is no email. A row a stopped run left
 * claimed with no error reads as claimed: the log keeps no claim time to tell it from a send in progress.
 */
export function logDeliveryState(status: LogStatus | null, error: string | null): DeliveryState {
  const state: Record<LogStatus, DeliveryState> = { claimed: error ? "unknown" : "claimed", sent: "sent", failed: "refused" };
  return status ? state[status] : "unsent";
}
