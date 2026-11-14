import type { ScanTeamEmailStore } from "@/lib/scan-team-email";

/** The store in memory, for tests (#718): one row per team day, claimed once, as the table's primary key does. */
export function memoryScanTeamEmailStore(initialWaiting = 0) {
  const days = new Map<string, { state: "claimed" | "sent"; waiting: number; emailId: string | null; error: string | null }>();
  const state = { waiting: initialWaiting };
  const store: ScanTeamEmailStore = {
    async waitingCount() { return state.waiting; },
    async claimDay(day, waiting) {
      if (days.has(day)) return false;
      days.set(day, { state: "claimed", waiting, emailId: null, error: null });
      return true;
    },
    async sent(day, emailId) { Object.assign(days.get(day)!, { state: "sent", emailId, error: null }); },
    async released(day) { if (days.get(day)?.state === "claimed") days.delete(day); return true; },
    async unknown(day, error) { days.get(day)!.error = error; },
  };
  return { store, days, setWaiting: (n: number) => { state.waiting = n; } };
}
