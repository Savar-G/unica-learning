// What the admin sees while a workbook run works: is it working, and how much is left. Pure: no I/O, and the clock is
// passed in.
//
// What the data proves:
// - heartbeat_at moves every 30 s on a timer in the job (runWorkbookJob's renew), and on each AI call start and save. So
//   it proves the job is alive and holds the run. It does not prove that a page got done: a hung AI call still beats.
// - The saved rows (workbook_run_pages, workbook_run_calls, workbook_run_solves) prove work. Their created_at is the
//   time of the first save, and a retry or a resume keeps the row, so a kept page keeps its old time.
// - The plan, the render and the save write no rows. Only the heartbeat shows they are alive.
import { STALE_SECONDS, type WorkbookRun } from "@/lib/workbook-job";

/** The saved work of a run: the save time of each finished day page, and the newest saved page, AI call or solve check. */
export interface RunActivity {
  pageTimes: string[];
  lastWorkAt: string | null;
  /** The stored plan's first save starts writing, but is not a saved page or AI answer. */
  writingStartedAt?: string | null;
  /** The newest run-resumed audit time, even when the pause was short. */
  resumedAt?: string | null;
}

export interface RunProgressView {
  /** The step's plain name. */
  step: string;
  pages: { done: number; total: number } | null;
  /** "Try 2 of 2", from the second try on. */
  tries: string | null;
  /** Why an earlier try stopped, while the run tries again. */
  retry: string | null;
  /** Is it working: one line, a warning when the signal or the saved work is old. */
  signal: { warn: boolean; text: string };
  /** How much is left: an estimate that says "about", or a plain line when there is none. */
  timeLeft: string;
}

type ProgressRun = Pick<WorkbookRun, "step" | "attempts" | "maxAttempts" | "donePages" | "totalPages" | "heartbeatAt" | "createdAt" | "startedAt" | "resumes" | "errors">;

/** Warn when there is no signal or no saved work for this long. */
export const WARN_SECONDS = 120;
/** A pace needs this many pages from one stretch, over this long: pages are saved in bursts about 1 s apart. */
const PACE_PAGES = 8;
const PACE_SPAN_SECONDS = 60;
/** A longer gap between two saved pages is a stop or a resume, so the pace starts again after it. */
const PACE_BREAK_SECONDS = 300;
// Measured on 2026-11-05: the plan took 340 s and 376 s on the two newest Mac runs and 483 s on a fake run on a busy Mac.
// With the Mac at a load of 100 or more, one plan had not ended after 20 minutes, so the line says "or more".
const PLAN_MINUTES = 8;
// The last saved page to the finish took 32 to 84 s on the 10 older finished runs and 112 s on a whole approved-v1 book
// (the fake run above). That time holds the whole-book check, the render and the save, so the check shows no time of its own.
const AFTER_PAGES_SECONDS = 120;

const STEP: Record<NonNullable<WorkbookRun["step"]>, string> = {
  plan: "Planning the two weeks", write: "Writing and checking pages", render: "Making the PDF and page images", save: "Saving the draft",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "12 seconds" or "3 minutes", rounded down: never less than the time that passed is promised as more. */
const span = (seconds: number) => (seconds < 60 ? plural(Math.floor(seconds), "second") : plural(Math.floor(seconds / 60), "minute"));

const STOP_MINUTES = STALE_SECONDS / 60;

const newestTime = (...values: (string | null | undefined)[]) => {
  const times = values.map((value) => value ? Date.parse(value) : NaN).filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
};

/** Each kind of error a try can stop on, in plain words, most specific first. */
const REASONS: [RegExp, string][] = [
  [/browser process|WS endpoint|chrom(e|ium)|puppeteer/i, "the program that prints the pages did not start"],
  [/protocol error|target closed|session closed/i, "the program that prints the pages stopped"],
  [/timed? ?out|aborted/i, "a step took too long"],
  [/storage|upload|bucket/i, "a file did not save"],
  [/violates|relation "|database|workbook run [a-z ]+:/i, "a database write failed"],
];

/** Why a try or a run stopped, in plain words. An error with no rule here shows its first line. */
export function plainRunError(error: string): string {
  return REASONS.find(([rule]) => rule.test(error))?.[1] ?? error.split("\n")[0].trim().replace(/[.:]$/, "");
}

/** Seconds per page from this run's own saved pages, or null until the pace is known. */
function secondsPerPage(run: ProgressRun, activity: RunActivity): number | null {
  // A resume count without its stored boundary is not enough to distinguish kept pages from new pages.
  if (run.resumes > 0 && newestTime(activity.resumedAt) === null) return null;
  const retried = newestTime(...run.errors.map((e) => e.at), activity.resumedAt, activity.writingStartedAt) ?? 0;
  const times = activity.pageTimes.map(Date.parse).filter(Number.isFinite).sort((a, b) => a - b);
  // The newest stretch only: pages kept from before a retry or a resume did not take this stretch's time.
  let first = times.length - 1;
  while (first > 0 && times[first - 1] > retried && times[first] - times[first - 1] <= PACE_BREAK_SECONDS * 1000) first--;
  const pages = first < 0 ? [] : times.slice(first).filter((t) => t > retried);
  if (pages.length < PACE_PAGES) return null;
  const seconds = (pages[pages.length - 1] - pages[0]) / 1000;
  return seconds < PACE_SPAN_SECONDS ? null : seconds / (pages.length - 1);
}

/** What the admin sees for a run that is being made. `now`: the clock. */
export function runProgress(run: ProgressRun, activity: RunActivity | undefined, now: Date): RunProgressView {
  const saved = activity ?? { pageTimes: [], lastWorkAt: null };
  const age = (at: number) => Math.max(0, (now.getTime() - at) / 1000);
  const done = run.donePages ?? 0;
  const total = run.totalPages ?? 0;
  const lastError = [...run.errors].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1);
  const writing = run.step === "write" && total > 0 && done < total;
  const allWritten = run.step === "write" && total > 0 && done >= total;

  const heard = age(Date.parse(run.heartbeatAt ?? run.createdAt));
  // Retry, resume and plan times reset the wait. They never become evidence of a saved page or AI answer.
  const waitingFrom = newestTime(lastError?.at, saved.resumedAt, saved.writingStartedAt) ?? Date.parse(run.startedAt ?? run.createdAt);
  const actualWorkAt = newestTime(saved.lastWorkAt);
  const workAt = actualWorkAt !== null && actualWorkAt >= waitingFrom ? actualWorkAt : null;
  const waiting = age(workAt ?? waitingFrom);
  const silent = heard >= WARN_SECONDS;
  const stuck = !silent && writing && activity !== undefined && waiting >= WARN_SECONDS;

  const signal = silent
    ? { warn: true, text: `No signal from the job for ${span(heard)}. If nothing moves for ${STOP_MINUTES} minutes, pressing Prepare next workbook again takes the run up again.` }
    : stuck
      ? { warn: true, text: `The job is still running, but no new page or AI answer has been saved for ${span(waiting)}. It may be waiting on a slow AI call. If the job sends no signal for ${STOP_MINUTES} minutes, pressing Prepare next workbook again takes the run up again.` }
      : writing && workAt !== null
        ? { warn: false, text: `Working. Last saved work ${span(age(workAt))} ago.` }
        : writing && activity !== undefined
          ? { warn: false, text: `Working. No new page or AI answer has been saved yet. Last signal from the job ${span(heard)} ago.` }
        : { warn: false, text: `Working. Last signal from the job ${span(heard)} ago.` };

  let timeLeft: string;
  if (silent || stuck) timeLeft = "Time left is not known until the run moves again.";
  else if (writing) {
    const pace = secondsPerPage(run, saved);
    timeLeft = pace === null ? "Working out the time left." : `About ${plural(Math.max(1, Math.ceil(((total - done) * pace + AFTER_PAGES_SECONDS) / 60)), "minute")} left.`;
  } else if (allWritten) timeLeft = "No time estimate for this step.";
  else if (run.step === "render" || run.step === "save") timeLeft = `No page count for this step. It took under ${AFTER_PAGES_SECONDS / 60} minutes on past runs.`;
  else timeLeft = `Working out the time left. Planning can take ${PLAN_MINUTES} minutes or more on a busy Mac, and no pages show until it ends.`;

  return {
    step: allWritten ? "Checking the whole book and storing the draft" : run.step ? STEP[run.step] : "Starting",
    pages: total > 0 ? { done, total } : null,
    tries: run.attempts > 1 ? `Try ${run.attempts} of ${run.maxAttempts}` : null,
    retry: lastError && lastError.attempt < run.attempts ? `Try ${lastError.attempt} stopped: ${plainRunError(lastError.error)}. Trying again.` : null,
    signal,
    timeLeft,
  };
}
