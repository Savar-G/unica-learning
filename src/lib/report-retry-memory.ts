import type { LedgerEntry } from "@/lib/email-delivery-memory";
import type { MemoryReportTables } from "@/lib/report-loading-memory";
import type { ReportEmailKey } from "@/lib/report-row-ledger";
import { REPORT_RETRY, type DueRetry, type ReportRetryPolicy, type ReportRetryStore } from "@/lib/report-retry";

// The retries' store (src/lib/report-retry.ts) in memory, for tests (#771). It keeps the rules of migration
// report_retries over the report-loading module's in-memory tables and the in-memory report row ledger: what a test
// needs, its list order, the attempt bound and the delays, and one claim at a time (each claim checks and writes in one
// step, as under the row lock). Its clock is `now`, as the database's.

/** A row of public.report_retries. */
export interface MemoryRetryRow {
  assessmentId: string;
  attempts: number;
  nextAt: number;
  lastEmail: boolean | null;
  gaveUpAt: number | null;
  alertEmailId: string | null;
  alertError: string | null;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * `parentEmail`: the report row ledger's entry of a report's parent email (memoryReportLedger().entry). `testFamilies`
 * and `team`: parent ids in public.test_accounts and public.admin_users. `deleting`: parents whose deletion was requested.
 */
export function memoryReportRetryStore(
  tables: MemoryReportTables,
  {
    now,
    parentEmail,
    testFamilies = [],
    team = [],
    deleting = [],
    policy = REPORT_RETRY,
  }: {
    now: () => number;
    parentEmail: (key: ReportEmailKey) => LedgerEntry | undefined;
    testFamilies?: string[];
    team?: string[];
    deleting?: string[];
    policy?: ReportRetryPolicy;
  },
) {
  const rows = new Map<string, MemoryRetryRow>();

  /** report_retry_need: "send", "build" or null at `at`. */
  const need = (assessmentId: string, at: number): "send" | "build" | null => {
    const a = (tables.assessments ?? []).find((x) => x.id === assessmentId);
    if (!a || a.status !== "completed" || !a.completedAt || deleting.includes(a.parentId)) return null;
    const finished = Date.parse(a.completedAt);
    if (finished > at - policy.minAgeMs) return null;
    const report = (tables.reports ?? []).find((r) => r.assessmentId === assessmentId);
    const email = report && parentEmail({ report: report.id, email: "parent" });
    // A claim that is held, sent or unknown: never again. Released (refused) or never claimed: free.
    if (report && email && email.state !== "refused") return null;
    if (finished > at - policy.emailAgeMs && !testFamilies.includes(a.parentId) && !team.includes(a.parentId)) return "send";
    return report ? null : "build";
  };

  const giveUpDue = (row: MemoryRetryRow | undefined, at: number) =>
    !!row && row.attempts >= policy.maxAttempts && row.gaveUpAt === null && row.nextAt <= at && need(row.assessmentId, at) !== null;

  const store: ReportRetryStore<string> = {
    async due(limit) {
      await tick();
      const at = now();
      const list: (DueRetry & { place: number })[] = [];
      for (const a of tables.assessments ?? []) {
        const row = rows.get(a.id);
        if (row && (row.nextAt > at || row.gaveUpAt !== null)) continue;
        if (need(a.id, at) === null) continue;
        list.push({ assessmentId: a.id, attempts: row?.attempts ?? 0, place: row?.nextAt ?? Date.parse(a.completedAt!) });
      }
      list.sort((x, y) => x.place - y.place || (x.assessmentId < y.assessmentId ? -1 : 1));
      return list.slice(0, limit).map(({ assessmentId, attempts }) => ({ assessmentId, attempts }));
    },
    async mayEmail(assessmentId) {
      await tick();
      return need(assessmentId, now()) === "send";
    },
    async claimAttempt(assessmentId) {
      await tick();
      const at = now();
      const wanted = need(assessmentId, at);
      if (wanted === null) return null;
      const row = rows.get(assessmentId) ?? { assessmentId, attempts: 0, nextAt: at, lastEmail: null, gaveUpAt: null, alertEmailId: null, alertError: null };
      rows.set(assessmentId, row);
      if (row.attempts >= policy.maxAttempts || row.nextAt > at || row.gaveUpAt !== null) return null;
      row.attempts += 1;
      row.nextAt = at + policy.delaysMs[Math.min(row.attempts, policy.delaysMs.length) - 1];
      row.lastEmail = wanted === "send";
      return { attempt: row.attempts, email: wanted === "send" };
    },
    giveUp: {
      async claim(assessmentId) {
        await tick();
        const at = now();
        const row = rows.get(assessmentId);
        if (!giveUpDue(row, at)) return null;
        row!.gaveUpAt = at;
        return `${assessmentId}@${at}`;
      },
      async sent(handle, emailId) {
        await tick();
        const row = held(handle);
        if (row) Object.assign(row, { alertEmailId: emailId, alertError: null });
      },
      async refused(handle, error) {
        await tick();
        const row = held(handle);
        if (row) Object.assign(row, { gaveUpAt: null, alertError: error });
      },
      async unknown(handle, error) {
        await tick();
        const row = held(handle);
        if (row) row.alertError = error;
      },
      async release(handle) {
        await tick();
        const row = held(handle);
        if (!row) return false;
        row.gaveUpAt = null;
        return true;
      },
    },
  };

  /** The row while this claim still holds it. */
  function held(handle: string): MemoryRetryRow | null {
    const [id, at] = handle.split("@");
    const row = rows.get(id);
    return row && row.gaveUpAt === Number(at) ? row : null;
  }

  return { store, row: (assessmentId: string): MemoryRetryRow | undefined => { const r = rows.get(assessmentId); return r && { ...r }; } };
}
