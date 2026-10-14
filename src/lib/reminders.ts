// Reminder emails (#73, D-085): who gets which reminder, and when. The rules are pure: no clock and no database. The
// cron route (src/app/api/reminders/route.ts) passes `now` and the stored state, as epoch milliseconds from its own
// clock. The job sends each reminder through the parent email delivery module (src/lib/email-delivery.ts, #152).
import { startState, type Attempt } from "@/lib/assessment";
import { sendEmailOnce, type EmailMessage, type MailTransport, type SendLedger } from "@/lib/email-delivery";

/** "Continue your test" goes this long after the last answer (or the start, before any answer). */
export const CONTINUE_AFTER_MS = 60 * 60_000;
/** "Start your test" goes this long after the child was added (at signup, or later in the account), with no test started. */
export const START_AFTER_MS = 24 * 60 * 60_000;
/**
 * A "come back" or "start" reminder more than this late is dropped, so a job that was off for days, or the first run
 * after launch, does not email families about old tests and signups.
 */
export const LATE_LIMIT_MS = 7 * 24 * 60 * 60_000;
/** Sends of one reminder before it is given up: Resend refused it this often. */
export const MAX_SEND_ATTEMPTS = 3;

/** The three reminders. The start screen's `?reminder=` and the job's counts use this list too. */
export const REMINDER_KINDS = ["continue", "come_back", "start"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];
export const isReminderKind = (v: unknown): v is ReminderKind => REMINDER_KINDS.includes(v as ReminderKind);
/** The email log (public.email_log) keeps every reminder, and every unsubscribe. */
export type LogKind = ReminderKind | "unsubscribe";
/**
 * A reminder's send state. "claimed": a run took it and is sending it, or the email may have gone (a 5xx or 408 answer,
 * a timeout, no answer, or a run that stopped). "failed": Resend refused it; a later run tries again.
 */
export type LogStatus = "claimed" | "sent" | "failed";

export interface LogEntry {
  id: string;
  kind: LogKind;
  parentId: string;
  childId: string | null;
  assessmentId: string | null;
  /** Null for an unsubscribe. */
  status: LogStatus | null;
  /** Send attempts so far. */
  attempts: number;
}

export interface ReminderParent {
  id: string;
  email: string;
}

export interface ReminderChild {
  id: string;
  parentId: string;
  createdAt: number;
}

/** One of a child's tests. A test in progress comes with `answeredAll`. */
export type ReminderTest = Attempt & { childId: string };

/** What the decision reads. The store may pass more than it needs; every rule is checked here. */
export interface ReminderState {
  parents: readonly ReminderParent[];
  children: readonly ReminderChild[];
  /** Every test of each child listed: the start screen's rules need all of them. */
  tests: readonly ReminderTest[];
  log: readonly LogEntry[];
}

export interface DueReminder {
  kind: ReminderKind;
  parentId: string;
  childId: string;
  /** The test it is about; null for "start". */
  assessmentId: string | null;
  /** When it became due. */
  dueAt: number;
  /** A send that failed before: the log row to take again. */
  retry: { logId: string; attempts: number } | null;
}

type RuleReminder = Omit<DueReminder, "retry">;

/** The reminder this child could get at `now` by the rules alone, before the log is checked. */
function ruleReminder(child: ReminderChild, tests: readonly ReminderTest[], now: number): RuleReminder | null {
  if (tests.length === 0) {
    const dueAt = child.createdAt + START_AFTER_MS;
    return now >= dueAt && now - dueAt <= LATE_LIMIT_MS ? { kind: "start", parentId: child.parentId, childId: child.id, assessmentId: null, dueAt } : null;
  }
  const screen = startState(tests, now);
  if (screen.kind === "resume") {
    const test = tests.find((t) => t.id === screen.attemptId)!;
    const dueAt = (test.lastAnswerAt ?? test.startedAt) + CONTINUE_AFTER_MS;
    if (now >= dueAt) return { kind: "continue", parentId: child.parentId, childId: child.id, assessmentId: test.id, dueAt };
  }
  // The start screen offers "Start again" for this test: its window ended, nothing newer was started, and a test with
  // every answer in never gets here (it never expires).
  if (screen.kind === "expired") {
    const test = tests.find((t) => t.id === screen.attemptId)!;
    const dueAt = test.resumeUntil;
    if (now - dueAt <= LATE_LIMIT_MS) return { kind: "come_back", parentId: child.parentId, childId: child.id, assessmentId: test.id, dueAt };
  }
  return null;
}

/**
 * The store the job runs against. The real one (src/lib/reminder-store.ts) keeps its claims in the email log, whose
 * unique indexes are the guard.
 */
export interface ReminderStore<S extends ReminderState> {
  /** The state the rules read at `now`: every child and test that could be due, and their log rows. */
  load(now: number): Promise<S>;
  /**
   * The send ledger, keyed by the reminder (kind K for test or child Y). A claim inserts its log row with the hash of
   * the unsubscribe token, or takes a failed row back for a retry; null when another run took it first.
   */
  ledger: SendLedger<DueReminder, string>;
}

export interface RunResult {
  due: number;
  sent: number;
  /** Refused (Resend said no, a 4xx other than 408): a later run tries again, up to MAX_SEND_ATTEMPTS. */
  failed: number;
  /** Another run took them first. */
  busy: number;
  /**
   * The email may have gone: a 5xx or 408 answer, a timeout, or no answer. They stay claimed and are never sent again:
   * one lost reminder, never two.
   */
  unknown: number;
}

/** Reminders one run sends at most; the next run sends the rest. Keeps a run well inside the function's time limit. */
export const RUN_LIMIT = 40;

/**
 * One run of the job at `now`: decides, then sends each reminder once through the delivery module, which claims it in
 * the store's ledger before it sends, so two runs at once never send the same email. The unsubscribe token goes in the
 * email; only its hash is stored, in the claim's own write.
 */
export async function runReminders<S extends ReminderState>(
  store: ReminderStore<S>,
  now: number,
  deps: {
    /** The email for a reminder, with this unsubscribe token in its links and headers. Null when the state lacks its data. */
    message(reminder: DueReminder, unsubscribeToken: string, state: S): EmailMessage | null;
    newToken(): { token: string; hash: string };
    /** Default: Resend. */
    transport?: MailTransport;
    limit?: number;
  },
): Promise<RunResult> {
  const state = await store.load(now);
  const due = dueReminders(state, now);
  const result: RunResult = { due: due.length, sent: 0, failed: 0, busy: 0, unknown: 0 };
  for (const reminder of due.slice(0, deps.limit ?? RUN_LIMIT)) {
    const { token, hash } = deps.newToken();
    const message = deps.message(reminder, token, state);
    if (!message) {
      console.error("[reminders] email not built: parent, child or test not loaded", reminder.kind, reminder.assessmentId ?? reminder.childId);
      result.failed++;
      continue;
    }
    const outcome = await sendEmailOnce(store.ledger, reminder, message, { transport: deps.transport, claimFields: { unsubscribe_hash: hash } });
    if (outcome.status === "sent") result.sent++;
    else if (outcome.status === "refused") result.failed++;
    else if (outcome.status === "busy") result.busy++;
    else {
      console.error("[reminders] delivery unknown; the row stays claimed", reminder.kind, reminder.assessmentId ?? reminder.childId, outcome.error);
      result.unknown++;
    }
  }
  return result;
}

/**
 * Domains that can never get email (RFC 2606 and RFC 6761): test accounts use them. Sending there only bounces, and
 * bounces hurt the sending domain.
 */
const TEST_DOMAINS = /@(?:(?:[^@]+\.)?example\.(?:com|net|org)|[^@]+\.(?:test|invalid|example|localhost)|localhost)$/i;
const canGetEmail = (email: string) => !TEST_DOMAINS.test(email.trim());

/**
 * The reminders to send at `now`, oldest first. Each goes once: one "continue" and one "come back" per test (so at
 * most 2 per test), and one "start" per child. None for a parent who unsubscribed.
 */
export function dueReminders(state: ReminderState, now: number): DueReminder[] {
  const unsubscribed = new Set(state.log.filter((e) => e.kind === "unsubscribe").map((e) => e.parentId));
  const reachable = new Set(state.parents.filter((p) => !unsubscribed.has(p.id) && canGetEmail(p.email)).map((p) => p.id));
  const due: DueReminder[] = [];
  for (const child of state.children) {
    if (!reachable.has(child.parentId)) continue;
    const next = ruleReminder(child, state.tests.filter((t) => t.childId === child.id), now);
    if (!next) continue;
    const logged = state.log.find((e) => e.kind === next.kind && (next.assessmentId ? e.assessmentId === next.assessmentId : e.childId === next.childId));
    // A send that failed is tried again, up to MAX_SEND_ATTEMPTS. One sent, or held by a run, is done.
    if (!logged) due.push({ ...next, retry: null });
    else if (logged.status === "failed" && logged.attempts < MAX_SEND_ATTEMPTS) due.push({ ...next, retry: { logId: logged.id, attempts: logged.attempts } });
  }
  return due.sort((a, b) => a.dueAt - b.dueAt);
}
