import { isUuid } from "@/lib/workbook-content";
import { recoverWorkbookScanClocks, type ScanClockRecovery, type ScanClockStore } from "@/lib/workbook-scan-clock";

export interface ScanRecoveryBooks {
  /** Valid confirmed deliveries that have no request for their effective audit. */
  unseeded(limit: number): Promise<readonly string[]>;
  /** Recorded deadlines due by the database clock, without a claim or a current zero-scan HOLD. */
  due(limit: number): Promise<readonly string[]>;
}

export interface ScanRecoveryResult {
  selectedBooks: number;
  /** Books rechecked, including books the database found unavailable after selection. Not a claim count. */
  reconciledBooks: number;
  clocks: ScanClockRecovery | null;
  outOfTime: boolean;
}

function checkedBooks(ids: readonly string[], limit: number): readonly string[] {
  if (!Array.isArray(ids) || ids.length > limit || ids.some(id=>!isUuid(id)) || new Set(ids).size !== ids.length) {
    throw new Error("scan_recovery_book_shape");
  }
  return ids;
}

/**
 * One bounded recovery turn. Successful seeding, HOLD and claim writes remove those books from their selector.
 * A restart therefore advances through the remaining durable work without a browser or an in-memory cursor.
 * SQL owns decision time. This clock controls only the caller's execution budget; the service client must also abort
 * outstanding requests at its deadline. A lost reply cannot undo or duplicate the database's immutable decision.
 */
export async function runWorkbookScanRecovery(books: ScanRecoveryBooks, clocks: ScanClockStore, options: {
  clockVersion: string;
  limit?: number;
  time: { now(): number; endAt: number };
}): Promise<ScanRecoveryResult> {
  const limit = options.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !options.clockVersion.trim()
    || options.clockVersion.length > 200 || !Number.isFinite(options.time.endAt)) throw new Error("scan_recovery_options");
  const late = () => { const now = options.time.now(); return !Number.isFinite(now) || now >= options.time.endAt; };
  const result: ScanRecoveryResult = { selectedBooks: 0, reconciledBooks: 0, clocks: null, outOfTime: false };
  if (late()) return { ...result, outOfTime: true };
  const unseeded = checkedBooks(await books.unseeded(limit), limit);
  if (late()) return { ...result, selectedBooks: unseeded.length, outOfTime: true };
  const due = checkedBooks(await books.due(limit), limit);
  const selected = [...new Set([...unseeded, ...due])].sort();
  result.selectedBooks = selected.length;
  for (let offset = 0; offset < selected.length; offset += 100) {
    if (late()) return { ...result, outOfTime: true };
    const batch = selected.slice(offset, offset + 100);
    await clocks.reconcile(batch);
    result.reconciledBooks += batch.length;
  }
  if (late()) return { ...result, outOfTime: true };
  result.clocks = await recoverWorkbookScanClocks(clocks, { clockVersion: options.clockVersion, limit });
  result.outOfTime = late();
  return result;
}
