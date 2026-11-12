/**
 * The first-charge reminder rule, in one place (PR #803). Stripe emails the parent a reminder PLAN_REMINDER_DAYS days before the
 * first charge only when the plan starts with at least that long left (a sibling who joins late in the family's free window can
 * start with less). The plan start email promises the reminder by `planReminderDue`, and the admin pages state the same rule.
 */
export const PLAN_REMINDER_DAYS = 7;
const DAY_MS = 86_400_000;

/** Whether Stripe sends the reminder for a plan that starts at `startedAt` with its first charge at `firstChargeAt` (epoch ms). */
export function planReminderDue(startedAt: number, firstChargeAt: number): boolean {
  return firstChargeAt - startedAt >= PLAN_REMINDER_DAYS * DAY_MS;
}

/** The parent's promise in the plan start email, sent only when `planReminderDue`. Parent words: keep them unchanged. */
export const PLAN_REMINDER_PARENT = `We will email you a reminder ${PLAN_REMINDER_DAYS} days before the first charge.`;

/** The rule in the admin's words, for the admin pages. */
export const PLAN_REMINDER_ADMIN = `If at least ${PLAN_REMINDER_DAYS} days remain when the plan starts, Stripe emails the parent a reminder ${PLAN_REMINDER_DAYS} days before the first charge`;
