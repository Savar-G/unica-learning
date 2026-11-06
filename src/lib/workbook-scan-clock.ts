import { normalizeTimeZone } from "@/lib/family-time";
import { deliveryDeadlines } from "@/lib/workbook-delivery";

/** A service-owned request for the exact effective delivery audit. No browser clock enters this interface. */
export interface ScanClockRequest {
  workbookId: string;
  deliveryAuditId: number;
  deliveredAt: string;
  timeZone: string;
  zoneOverride: boolean;
}

export type ScanClockWriteStatus = "waiting" | "hold" | "claimed" | "missing-delivery" | "unavailable"
  | "stale-delivery" | "calendar-conflict";

export interface ScanClockStore {
  /** Also creates durable requests for deliveries that predate the migration. */
  reconcile(workbookIds: readonly string[]): Promise<void>;
  /** Current requests without a calendar, in durable audit order. Maximum 100. */
  requests(limit: number): Promise<readonly ScanClockRequest[]>;
  /** The database rechecks the exact identity and decision time after its book lock. */
  record(request: ScanClockRequest, calendar: { backstopAt: string; clockVersion: string }): Promise<ScanClockWriteStatus>;
}

export interface ScanClockRecovery {
  reconciledBooks: number;
  outcomes: { workbookId: string; deliveryAuditId: number; status: ScanClockWriteStatus | "invalid-request" | "write-failed" }[];
  /** A full bounded read can leave more work. It is not a count of pending database rows. */
  moreMayRemain: boolean;
}

/**
 * One bounded service recovery pass. Lost replies leave durable requests for the next pass. A stale delivery causes
 * one fresh read, never a replay of the old identity. A stored conflicting clock is reported and never replaced.
 * This function computes a calendar only. SQL owns admission, the current clock, receipt sets, HOLD and claims.
 */
export async function recoverWorkbookScanClocks(store: ScanClockStore, options: {
  workbookIds?: readonly string[];
  clockVersion: string;
  limit?: number;
}): Promise<ScanClockRecovery> {
  const limit = options.limit ?? 100;
  const books = [...new Set(options.workbookIds ?? [])].sort();
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || books.length > 100
    || books.some((id) => !id) || !options.clockVersion.trim() || options.clockVersion.length > 200) {
    throw new Error("Invalid workbook scan clock recovery options");
  }
  if (books.length) await store.reconcile(books);
  const outcomes: ScanClockRecovery["outcomes"] = [];
  const seen = new Set<number>();
  let refresh = true, moreMayRemain = false;
  for (let pass = 0; pass < 2 && refresh; pass++) {
    refresh = false;
    const requests = await store.requests(limit);
    if (requests.length > limit) throw new Error("Workbook scan clock request limit exceeded");
    moreMayRemain ||= requests.length === limit;
    for (const request of requests) {
      if (seen.has(request.deliveryAuditId)) continue;
      seen.add(request.deliveryAuditId);
      const identity = { workbookId: request.workbookId, deliveryAuditId: request.deliveryAuditId };
      if (!request.workbookId || !Number.isSafeInteger(request.deliveryAuditId) || request.deliveryAuditId < 1
        || !Number.isFinite(Date.parse(request.deliveredAt)) || !normalizeTimeZone(request.timeZone)
        || typeof request.zoneOverride !== "boolean") {
        outcomes.push({ ...identity, status: "invalid-request" });
        moreMayRemain = true;
        continue;
      }
      try {
        const timeZone = request.zoneOverride ? request.timeZone : { zone: request.timeZone, override: false as const };
        const { backstopAt } = deliveryDeadlines({ deliveredAt: request.deliveredAt, timeZone });
        const status = await store.record(request, { backstopAt, clockVersion: options.clockVersion });
        outcomes.push({ ...identity, status });
        if (status === "stale-delivery") { refresh = true; moreMayRemain = true; }
      } catch {
        // Do not lose the rest of the batch after one transport failure. SQL retains the unsatisfied request.
        outcomes.push({ ...identity, status: "write-failed" });
        moreMayRemain = true;
      }
    }
  }
  return { reconciledBooks: books.length, outcomes, moreMayRemain };
}
