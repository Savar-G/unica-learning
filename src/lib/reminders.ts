// Reminder emails (#73, D-085): who gets which reminder, and when. Pure: no clock and no database. The cron route
// (src/app/api/reminders/route.ts) passes `now` and the stored state, as epoch milliseconds from its own clock.
import { startState, type Attempt } from "@/lib/assessment";

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
/** A reminder's send state. "claimed": a run took it and is sending it, or stopped before it knew the outcome. */
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

/** The store the job runs against. The real one (src/lib/reminder-store.ts) keeps the guards with a unique index. */
export interface ReminderStore<S extends ReminderState> {
  /** The state the rules read at `now`: every child and test that could be due, and their log rows. */
  load(now: number): Promise<S>;
  /**
   * Takes the reminder for this run before it is sent, with the hash of its unsubscribe token: inserts its log row, or
   * takes a failed row back for a retry. Null when another run took it first.
   */
  claim(reminder: DueReminder, unsubscribeHash: string): Promise<string | null>;
  /** The email went (Resend's id). Never throws: a failed write leaves the row claimed, so it is never sent again. */
  sent(logId: string, emailId: string): Promise<void>;
  /** Resend refused the email: a later run tries again. Never throws. */
  failed(logId: string, error: string): Promise<void>;
}

/** A send with a known outcome. A send that throws has none (a timeout): the email may have gone. */
export type SendOutcome = { sent: true; id: string } | { sent: false; error: string };

export interface RunResult {
  due: number;
  sent: number;
  /** Resend refused them; a later run tries again. */
  failed: number;
  /** Another run took them first. */
  busy: number;
  /** The send ended without an answer. They stay claimed and are never sent again: one lost reminder, never two. */
  unknown: number;
}

/** Reminders one run sends at most; the next run sends the rest. Keeps a run well inside the function's time limit. */
export const RUN_LIMIT = 40;

/**
 * One run of the job at `now`: decides, then claims each reminder before it sends it, so two runs at once never send
 * the same email. The unsubscribe token goes in the email; only its hash is stored.
 */
export async function runReminders<S extends ReminderState>(
  store: ReminderStore<S>,
  now: number,
  deps: { send(reminder: DueReminder, unsubscribeToken: string, state: S): Promise<SendOutcome>; newToken(): { token: string; hash: string }; limit?: number },
): Promise<RunResult> {
  const state = await store.load(now);
  const due = dueReminders(state, now);
  const result: RunResult = { due: due.length, sent: 0, failed: 0, busy: 0, unknown: 0 };
  for (const reminder of due.slice(0, deps.limit ?? RUN_LIMIT)) {
    const { token, hash } = deps.newToken();
    const logId = await store.claim(reminder, hash);
    if (!logId) {
      result.busy++;
      continue;
    }
    let outcome: SendOutcome;
    try {
      outcome = await deps.send(reminder, token, state);
    } catch (e) {
      console.error("[reminders] send ended without an answer", logId, e instanceof Error ? e.message : e);
      result.unknown++;
      continue;
    }
    if (outcome.sent) {
      result.sent++;
      await store.sent(logId, outcome.id);
    } else {
      result.failed++;
      await store.failed(logId, outcome.error);
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
