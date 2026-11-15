import type { TeamDigestRows } from "@/lib/team-digest";
import type { TeamDigestStore } from "@/lib/team-digest-send";

/** No rows at all: the start of every test's data. */
export const emptyDigestRows = (): TeamDigestRows => ({
  testFamilies: [], signups: [], finishedTests: [], feedback: [], emailProblems: [], safetyAlerts: [], planStates: [], planStarts: [],
  workbookRuns: [], book1Pending: [], adVisits: [], adSteps: [], aiUsage: [], scanWaiting: 0, capped: [],
});

/**
 * The store in memory, for tests: the reader filters by time as the database reader does (rows from `from` up to `to`; the plan
 * states, open plan starts and the scan count are current), and one row per digest day is claimed once, as the primary key does.
 */
export function memoryTeamDigestStore(rows: TeamDigestRows = emptyDigestRows()) {
  const days = new Map<string, { state: "claimed" | "sent"; weekly: boolean; emailId: string | null; error: string | null }>();
  const reads: { from: number; to: number }[] = [];
  const store: TeamDigestStore = {
    async read(from, to) {
      reads.push({ from, to });
      const within = <T extends { at: string }>(list: T[]) => list.filter((r) => Date.parse(r.at) >= from && Date.parse(r.at) < to);
      return {
        ...rows,
        signups: within(rows.signups), finishedTests: within(rows.finishedTests), feedback: within(rows.feedback),
        emailProblems: within(rows.emailProblems), safetyAlerts: within(rows.safetyAlerts), workbookRuns: within(rows.workbookRuns),
        book1Pending: within(rows.book1Pending), adVisits: within(rows.adVisits), adSteps: within(rows.adSteps), aiUsage: within(rows.aiUsage),
        planStarts: rows.planStarts.filter((s) => s.state === "open" || (s.finishedAt !== null && Date.parse(s.finishedAt) >= from && Date.parse(s.finishedAt) < to)),
      };
    },
    async dayTaken(day) { return days.has(day); },
    async claimDay(day, weekly) {
      if (days.has(day)) return false;
      days.set(day, { state: "claimed", weekly, emailId: null, error: null });
      return true;
    },
    async sent(day, emailId) { Object.assign(days.get(day)!, { state: "sent", emailId, error: null }); },
    async released(day) { if (days.get(day)?.state === "claimed") days.delete(day); return true; },
    async unknown(day, error) { days.get(day)!.error = error; },
  };
  return { store, days, reads };
}
