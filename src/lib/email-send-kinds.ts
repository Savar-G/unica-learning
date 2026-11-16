// The kinds of the send log (public.email_sends, migration email_sends): every email the site sends that has no other
// durable row. Reminders and the other email log kinds live in src/lib/email-log-kinds.ts, the report emails on the
// report row, and the workbook emails in public.workbook_emails. This module has no imports and no side effects, so the
// delivery module, the admin pages and the tests take the one copy of each list from here.

/** The emails to a parent. */
export const PARENT_SEND_KINDS = [
  "signup_welcome", "phone_welcome", "sign_in_link", "family_delete_code", "child_delete_code", "waitlist_note",
  "scan_link", "plan_start", "referral_reward",
] as const;
/** The emails to the team (SIGNUP_NOTIFY_EMAIL). */
export const TEAM_SEND_KINDS = [
  "contact_message", "waitlist_alert", "card_link_alert", "report_failure_alert", "report_retry_alert",
  "plan_start_alert", "plan_cancel_alert", "plan_cancelled_alert", "family_delete_alert", "maya_safety_alert",
  "maya_spend_alert", "scan_team_daily", "team_digest",
] as const;
/** Every kind of row in the send log. It must equal the check constraint `email_sends_kind_check`. */
export const SEND_KINDS = [...PARENT_SEND_KINDS, ...TEAM_SEND_KINDS] as const;
export type SendKind = (typeof SEND_KINDS)[number];
export const isSendKind = (v: unknown): v is SendKind => SEND_KINDS.includes(v as SendKind);

/**
 * The kinds whose email holds a secret (a sign-in link, a delete code) or a message from the public (the contact form).
 * Their row keeps the kind, the time, the family, the outcome and Resend's id only: no subject, address, child or copy.
 */
export const SECRET_SEND_KINDS: readonly SendKind[] = ["sign_in_link", "phone_welcome", "family_delete_code", "child_delete_code", "contact_message"];
export const isSecretSendKind = (kind: SendKind) => SECRET_SEND_KINDS.includes(kind);
/**
 * The kinds whose row keeps no copy, subject or address: the secret kinds, and the team digest, whose body names many
 * families (ids, Maya safety flags) and so could not be deleted with each of them.
 */
export const NO_COPY_SEND_KINDS: readonly SendKind[] = [...SECRET_SEND_KINDS, "team_digest"];
export const keepsNoSendCopy = (kind: SendKind) => NO_COPY_SEND_KINDS.includes(kind);
export const isTeamSendKind = (kind: SendKind) => (TEAM_SEND_KINDS as readonly string[]).includes(kind);

/** What a send attempt did, as the delivery module saw it (the column `outcome`). */
export const SEND_OUTCOMES = ["sent", "refused", "unknown"] as const;
export type SendOutcome = (typeof SEND_OUTCOMES)[number];

/**
 * The tag a sender puts on a message so the delivery module writes its row in the send log. `parentId` and `childId`:
 * the family and child the email is about, when there is one (the row is deleted with them).
 */
export interface SendTag {
  kind: SendKind;
  parentId?: string | null;
  childId?: string | null;
}
