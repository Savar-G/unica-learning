import type { StartState } from "@/lib/assessment";

// When a finished test's report counts as late for the parent (#771), on Parent home and on the dashboard's Overview
// (src/lib/parent-view.ts): one hour after the finish with no report. The report job runs at the finish, and the
// /api/reminders run retries it from 10 minutes after (src/lib/report-retry.ts), so most late reports arrive before this;
// a parent who still has none is asked to write to us.

/** A finished test with no report is late this long after it finished. */
export const RESULT_LATE_MS = 3_600_000;

/** Whether a test that finished at `completedAt` (ms) and has no report is late at `now`. */
export const resultLate = (completedAt: number, now: number): boolean => now - completedAt > RESULT_LATE_MS;

/**
 * Parent home, for a child waiting for the next test: true when the report of the test just done is not there and is
 * late. `report`: the path of that test's report, when there is one.
 */
export const reportLate = (state: StartState, report: string | undefined, now: number): boolean =>
  state.kind === "wait" && !report && resultLate(state.completedAt, now);

/** reportLate at the time of the request, for a page. */
export const reportLateNow = (state: StartState, report: string | undefined): boolean => reportLate(state, report, Date.now());
