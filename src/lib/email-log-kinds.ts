// The kinds and send states of the email log (public.email_log). This module has no imports and no side effects, so
// every reader (the reminder job, the admin pages, tests) takes the one copy of each list from here.

/** The four reminders. The start screen's `?reminder=` and the job's counts use this list too. */
export const REMINDER_KINDS = ["continue", "come_back", "start", "start_followup"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];
export const isReminderKind = (v: unknown): v is ReminderKind => REMINDER_KINDS.includes(v as ReminderKind);
/**
 * Every kind of row in the email log (public.email_log): each reminder, each unsubscribe, the weekly Maya email
 * (src/lib/maya-weekly-email.ts), the monthly summary and the scan reminder. This list is the one copy: it must equal the
 * check constraint `email_log_kind_check` (latest in supabase/migrations/20261107073840_workbook_scan_reminder_episodes.sql),
 * and every reader of the log (the admin dashboard too) takes its type from here.
 */
export const LOG_KINDS = [...REMINDER_KINDS, "unsubscribe", "maya_daily", "maya_weekly", "maya_unsubscribe", "monthly_summary", "monthly_summary_unsubscribe", "scan_inactivity"] as const;
export type LogKind = (typeof LOG_KINDS)[number];
/**
 * A reminder's send state. "claimed": a run took it and is sending it, or the email may have gone (a 5xx or 408 answer,
 * a timeout, no answer, or a run that stopped). "failed": Resend refused it; a later run tries again.
 */
export const LOG_STATUSES = ["claimed", "sent", "failed"] as const;
export type LogStatus = (typeof LOG_STATUSES)[number];
