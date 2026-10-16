// When the start reminders go (#73, D-085, D-102). Pure, with no imports: the reminder job (src/lib/reminders.ts)
// decides with it, and the admin page (src/lib/admin-dashboard.ts) shows the next one with the same rules.

const HOUR = 60 * 60_000;
/** "Start your test" goes this long after the child was added (at signup, or later in the account), with no test started. */
export const START_AFTER_MS = 24 * HOUR;
/** The second, last "start your test" (D-102) goes this long after the child was added, still with no test started. */
export const START_FOLLOWUP_AFTER_MS = 72 * HOUR;
/** ...and at least this long after the first one was logged, so a job that was off never sends the two close together. */
export const START_FOLLOWUP_GAP_MS = 48 * HOUR;
/**
 * A reminder more than this late is dropped, so a job that was off for days, or the first run after launch, does not
 * email families about old tests and signups.
 */
export const LATE_LIMIT_MS = 7 * 24 * HOUR;
/**
 * The oldest child, counted from when it was added, that can still get a start reminder: the first one logged at its
 * latest, then the gap, then the late limit of the second one.
 */
export const START_WINDOW_MS = START_AFTER_MS + LATE_LIMIT_MS + START_FOLLOWUP_GAP_MS + LATE_LIMIT_MS;

export type StartKind = "start" | "start_followup";

/** When the second start reminder is due. `firstStartAt`: when the first one was logged, if it was. */
export const followupDueAt = (createdAt: number, firstStartAt: number | null) =>
  Math.max(createdAt + START_FOLLOWUP_AFTER_MS, (firstStartAt ?? 0) + START_FOLLOWUP_GAP_MS);

/**
 * The start reminder whose turn it is for a child with no test, by the rules alone: due at `dueAt`, which can be ahead
 * of `now`. The second one takes over once it is due, so a first one that never went is not sent after it. Null when
 * the turn has passed the late limit.
 */
export function startTurn(createdAt: number, firstStartAt: number | null, now: number): { kind: StartKind; dueAt: number } | null {
  const followupAt = followupDueAt(createdAt, firstStartAt);
  const turn = now >= followupAt ? { kind: "start_followup" as const, dueAt: followupAt } : { kind: "start" as const, dueAt: createdAt + START_AFTER_MS };
  return now - turn.dueAt <= LATE_LIMIT_MS ? turn : null;
}

/**
 * The next start reminder a child with no test will get, for the admin page: the first one until it is logged, then
 * the second. Null once both are logged, or when the next one would be dropped as late.
 */
export function nextStartReminder(createdAt: number, logged: { firstStartAt: number | null; followup: boolean }, now: number): { kind: StartKind; dueAt: number } | null {
  if (logged.followup) return null;
  const followupAt = followupDueAt(createdAt, logged.firstStartAt);
  if (logged.firstStartAt === null && now < followupAt) return { kind: "start", dueAt: createdAt + START_AFTER_MS };
  return now - followupAt <= LATE_LIMIT_MS ? { kind: "start_followup", dueAt: followupAt } : null;
}

/**
 * Domains that can never get email (RFC 2606 and RFC 6761): test accounts use them. Sending there only bounces, and
 * bounces hurt the sending domain.
 */
const TEST_DOMAINS = /@(?:(?:[^@]+\.)?example\.(?:com|net|org)|[^@]+\.(?:test|invalid|example|localhost)|localhost)$/i;
export const canGetEmail = (email: string) => !TEST_DOMAINS.test(email.trim());
