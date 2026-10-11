// Stop, resume and retake (#72, D-083): pure rules over a child's test attempts.
// No clock: the server passes `now` and every stored time, as epoch milliseconds from its own clock.

/** A stopped test can continue until this long after the child last worked on it. */
export const RESUME_HOURS = 24;
/** A child can take a new test this long after their last completed one. */
export const RETAKE_DAYS = 30;

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

export type AttemptStatus = "in_progress" | "completed" | "expired";

/** One try at the test, as the server stores it (a row of public.assessments). */
export interface Attempt {
  id: string;
  /** The stored status. An "in_progress" attempt past its resume window has expired even before the server marks it. */
  status: AttemptStatus;
  startedAt: number;
  /** When the server stored the last answer; null before the first answer. */
  lastAnswerAt: number | null;
  /** The last moment the test can continue. */
  resumeUntil: number;
  completedAt: number | null;
  /**
   * True when every question has an answer and the test waits only to be scored. Such a test never expires, so a
   * finished test whose scoring call failed is not lost. Leave it out when unknown (the answers were not loaded).
   */
  answeredAll?: boolean;
}

/** A new attempt that starts at `now`. */
export function startAttempt(id: string, now: number): Attempt {
  return { id, status: "in_progress", startedAt: now, lastAnswerAt: null, resumeUntil: now + RESUME_HOURS * HOUR_MS, completedAt: null };
}

/** "open": the test takes answers. "expired": it ran out of time. "completed": it was scored. */
export type AttemptState = "open" | "expired" | "completed";

export function attemptState(attempt: Attempt, now: number): AttemptState {
  if (attempt.status !== "in_progress") return attempt.status;
  return attempt.answeredAll || now <= attempt.resumeUntil ? "open" : "expired";
}

/**
 * The attempt after the child works on it at `now` (answers, or opens it again): the resume window starts again.
 * Throws when the attempt is not open; check attemptState first.
 */
export function recordActivity(attempt: Attempt, now: number, { answered }: { answered: boolean }): Attempt {
  const state = attemptState(attempt, now);
  if (state !== "open") throw new Error(`The test is ${state}`);
  return {
    ...attempt,
    lastAnswerAt: answered ? now : attempt.lastAnswerAt,
    resumeUntil: now + RESUME_HOURS * HOUR_MS,
  };
}

/** What a child's start screen offers. Times are epoch milliseconds. */
export type StartState =
  /** "Start test": no test yet, or the last completed one is 30 days old (`retake`). */
  | { kind: "start"; retake: boolean }
  /** "Continue test": the open test, until `resumeUntil`. */
  | { kind: "resume"; attemptId: string; resumeUntil: number }
  /** "Start again": the last test ran out of time; a new one has new questions. */
  | { kind: "expired"; attemptId: string }
  /** No new test yet: it opens 30 days after the last completed one. */
  | { kind: "wait"; completedAt: number; opensAt: number };

/**
 * The start screen for a child with these attempts, in any order. An open test comes first: the child finishes it.
 * Then the 30-day wait after a completed test. Then a last test that ran out of time.
 */
export function startState(attempts: readonly Attempt[], now: number): StartState {
  const open = attempts.find((a) => a.status === "in_progress" && attemptState(a, now) === "open");
  if (open) return { kind: "resume", attemptId: open.id, resumeUntil: open.resumeUntil };

  const done = attempts.filter((a) => a.status === "completed" && a.completedAt !== null).map((a) => a.completedAt!);
  const lastDone = done.length > 0 ? Math.max(...done) : null;
  if (lastDone !== null) {
    const opensAt = lastDone + RETAKE_DAYS * DAY_MS;
    if (now < opensAt) return { kind: "wait", completedAt: lastDone, opensAt };
  }

  const latest = attempts.reduce<Attempt | null>((last, a) => (!last || a.startedAt > last.startedAt ? a : last), null);
  if (latest && attemptState(latest, now) === "expired") return { kind: "expired", attemptId: latest.id };
  return { kind: "start", retake: lastDone !== null };
}

/** What the server does with a request to start (or continue) a child's test. */
export type StartDecision =
  /** Hand back the open test. The caller restarts its resume window (recordActivity). */
  | { action: "resume"; attemptId: string }
  /** Draw a new test with a new seed. First mark `expire` expired: it is open in storage but ran out of time. */
  | { action: "create"; expire: string | null }
  /** "expired": the test ran out of time and the family did not ask to start again. */
  | { action: "refuse"; error: "expired" }
  | { action: "refuse"; error: "retake_closed"; opensAt: number };

/**
 * `restart` is the family's "Start again" after they saw the test expired. Without it, a test that ran out of time is
 * refused rather than replaced, so a family who pressed "Continue" is never moved to new questions without being told.
 */
export function decideStart(attempts: readonly Attempt[], now: number, { restart }: { restart: boolean }): StartDecision {
  const state = startState(attempts, now);
  // Not "resume", so a test still in progress in storage has run out of time. It holds the child's one open slot.
  const stale = attempts.find((a) => a.status === "in_progress")?.id ?? null;
  switch (state.kind) {
    case "resume":
      return { action: "resume", attemptId: state.attemptId };
    case "wait":
      return { action: "refuse", error: "retake_closed", opensAt: state.opensAt };
    case "expired":
      return restart ? { action: "create", expire: stale } : { action: "refuse", error: "expired" };
    case "start":
      return { action: "create", expire: stale };
  }
}
