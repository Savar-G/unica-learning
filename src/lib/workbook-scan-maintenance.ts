import { isUuid } from "@/lib/workbook-content";
import { recoverWorkbookScanClocks, type ScanClockRecovery, type ScanClockStore } from "@/lib/workbook-scan-clock";
import { proposeWorkbookScanInactivity, type ScanInactivityCalendarStore } from "@/lib/workbook-scan-reminder-calendar";
import type { ScanProgressStore } from "@/lib/workbook-scan-progress-reader";
import type { ScanRecoveryBook, ScanRecoveryKind, ScanReminderDue } from "@/lib/workbook-scan-progress-sweep-store";

export interface ScanMaintenanceDependencies {
  books(kind: ScanRecoveryKind, limit: number): Promise<readonly ScanRecoveryBook[]>;
  /** The server release gate. Recheck it before each phase; no browser Boolean enters this seam. */
  allowed(parentId: string, childId?: string): Promise<boolean>;
  clocks: ScanClockStore;
  progress: ScanProgressStore;
  calendars: ScanInactivityCalendarStore;
  due(parentId: string): Promise<ScanReminderDue>;
  /** Omit this function for recovery without delivery. One sender/transport must serve the whole run. */
  send?(parentId: string, episodeIds: readonly string[], signal?: AbortSignal): Promise<{ status: string }>;
}
export interface ScanMaintenanceResult {
  selectedBooks: number;
  clocks: ScanClockRecovery | null;
  calendars: { workbookId: string; status: string }[];
  reminders: { parentId: string; status: string }[];
  outOfTime: boolean;
  /** A full bounded selection is not a count of remaining database work. */
  moreMayRemain: boolean;
}

/** One bounded turn. SQL determines due time and admission; this clock controls execution only. */
export async function runWorkbookScanMaintenance(deps: ScanMaintenanceDependencies, options: {
  limit: number; clockVersion: string; phase?: "progress" | "reminders"; time: { now(): number; endAt: number }; signal?: AbortSignal;
}): Promise<ScanMaintenanceResult> {
  const { limit, clockVersion, time, signal } = options;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !clockVersion.trim()
    || clockVersion.length > 200 || !Number.isFinite(time.endAt)) throw new Error("scan_maintenance_options");
  const result: ScanMaintenanceResult = { selectedBooks: 0, clocks: null, calendars: [], reminders: [],
    outOfTime: false, moreMayRemain: false };
  const expired = () => {
    const now = time.now();
    return !!signal?.aborted || !Number.isFinite(now) || now >= time.endAt;
  };
  const selected = new Set<string>();
  async function read(kind: ScanRecoveryKind): Promise<readonly ScanRecoveryBook[]> {
    const rows = await deps.books(kind, limit);
    if (!Array.isArray(rows) || rows.length > limit || new Set(rows.map(r => r.workbookId)).size !== rows.length
      || rows.some(r => !isUuid(r.workbookId) || !isUuid(r.parentId) || !isUuid(r.childId)
        || !Number.isSafeInteger(r.number) || r.number < 1 || !Number.isSafeInteger(r.deliveryAuditId) || r.deliveryAuditId < 1)) {
      throw new Error("scan_maintenance_book_shape");
    }
    result.moreMayRemain ||= rows.length === limit;
    return rows;
  }
  async function permitted(rows: readonly ScanRecoveryBook[]): Promise<ScanRecoveryBook[]> {
    const accepted: ScanRecoveryBook[] = [];
    for (const row of rows) {
      if (expired()) break;
      if (await deps.allowed(row.parentId, row.childId) && !expired()) {
        accepted.push(row); selected.add(row.workbookId);
      }
    }
    result.selectedBooks = selected.size;
    return accepted;
  }
  const stop = () => ({ ...result, outOfTime: true });
  if (expired()) return stop();
  if (options.phase !== "reminders") {
  const unseeded = await permitted(await read("unseeded"));
  if (expired()) return stop();
  const due = (await permitted(await read("due"))).filter(row => !unseeded.some(book => book.workbookId === row.workbookId))
    .slice(0, Math.max(0, limit - unseeded.length));
  if (expired()) return stop();
  const clockBooks = [...new Set([...unseeded, ...due].map(r => r.workbookId))].sort();
  if (clockBooks.length) {
    // In a test-only rollout, the global request reader can include real families. Never record their calendars.
    const allowedBooks = new Set(clockBooks);
    let fatalClockError = false;
    let clockError: unknown;
    const scoped: ScanClockStore = {
      reconcile: async ids => {
        if (fatalClockError) throw clockError;
        if (ids.some(id => !allowedBooks.has(id))) throw new Error("scan_maintenance_clock_scope");
        for (const id of ids) {
          const row = [...unseeded, ...due].find(book => book.workbookId === id);
          if (row && !expired() && await deps.allowed(row.parentId, row.childId) && !expired()) await deps.clocks.reconcile([id]);
        }
      },
      requests: async bound => {
        if (fatalClockError) throw clockError;
        if (expired()) return [];
        const rows = await deps.clocks.requests(bound);
        if (rows.length > bound) throw new Error("scan_maintenance_clock_bound");
        result.moreMayRemain ||= rows.length === bound;
        return rows.filter(r => allowedBooks.has(r.workbookId));
      },
      record: async (request, calendar) => {
        if (fatalClockError) throw clockError;
        try {
          const row = [...unseeded, ...due].find(r => r.workbookId === request.workbookId);
          if (!row || expired() || !await deps.allowed(row.parentId, row.childId) || expired()) return "unavailable";
          return await deps.clocks.record(request, calendar);
        } catch (error) {
          // The reusable clock core records uncertain writes without throwing. This scheduler must also stop
          // the invocation after a failed read/write, before any next family or maintenance phase.
          fatalClockError = true;
          clockError = error;
          throw error;
        }
      },
    };
    for (let offset = 0; offset < clockBooks.length; offset += 100) {
      if (expired()) return stop();
      await scoped.reconcile(clockBooks.slice(offset, offset + 100));
    }
    if (expired()) return stop();
    result.clocks = await recoverWorkbookScanClocks(scoped, { clockVersion, limit });
    if (fatalClockError) throw clockError;
    result.clocks.reconciledBooks = clockBooks.length;
  }
  if (expired()) return stop();
  const inactivity = await permitted(await read("inactivity"));
  for (const row of inactivity) {
    if (expired()) return stop();
    if (!await deps.allowed(row.parentId, row.childId)) continue;
    if (expired()) return stop();
    const status = await proposeWorkbookScanInactivity({ ...deps.calendars, propose: async (identity, dueAt, version) => {
      if (identity.parentId !== row.parentId || identity.childId !== row.childId || expired()
        || !await deps.allowed(row.parentId, row.childId) || expired()) return "unavailable";
      return deps.calendars.propose(identity, dueAt, version);
    } }, deps.progress, row.workbookId, clockVersion);
    result.calendars.push({ workbookId: row.workbookId, status });
  }
  if (expired()) return stop();
  }
  if (options.phase === "progress") return result;
  const reminders = await permitted(await read("reminder-due"));
  for (const parentId of [...new Set(reminders.map(r => r.parentId))]) {
    if (expired()) return stop();
    const row = reminders.find(book => book.parentId === parentId)!;
    if (!await deps.allowed(parentId, row.childId)) continue;
    const current = await deps.due(parentId);
    if (expired()) return stop();
    if (current.status !== "ready" || current.episodeIds.length === 0) {
      result.reminders.push({ parentId, status: current.status === "ready" ? "none" : current.status });
      continue;
    }
    // Send the complete current set, including siblings outside this turn's reminder-book selection.
    if (!deps.send) { result.reminders.push({ parentId, status: "delivery-off" }); continue; }
    if (!await deps.allowed(parentId, row.childId)) continue;
    if (expired()) return stop();
    const outcome = await deps.send(parentId, current.episodeIds, signal);
    result.reminders.push({ parentId, status: outcome.status });
  }
  result.outOfTime = expired();
  return result;
}
