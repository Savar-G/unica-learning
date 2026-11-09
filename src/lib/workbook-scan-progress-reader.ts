import "server-only";
import { HISTORY_LABELS, type HistoryPage, type readScanHistory } from "@/lib/scan-history";
import { isUuid } from "@/lib/workbook-content";
import { workbookScanProgress, type ScanProgressInput } from "@/lib/workbook-scan-progress";

export interface ScanProgressScope { parentId: string; childId: string; workbookId: string }
export interface ScanDeliveryCalendar { deliveryAuditId: number; backstopAt: string; recordedAt: string; clockVersion: string }
export interface ScanTriggerClaim {
  id: string; reason: "day7_scanned" | "delivery_backstop"; claimedAt: string; effectiveAt: string;
  deliveryAuditId: number; deliveryCorrectionId: string | null; deliveredAt: string;
  timeZone: string; zoneOverride: boolean; backstopAt: string | null; receiptIds: readonly string[];
}
export interface ScanBackstopHold {
  deliveryAuditId: number; heldAt: string; deliveredAt: string; backstopAt: string;
  reason: "no-accepted-scans-at-backstop";
}
export interface ScanProgressSnapshot extends Omit<ScanProgressInput, "now" | "reviews"> {
  clockRequestPresent: boolean;
  currentCalendar: ScanDeliveryCalendar | null;
  claim: ScanTriggerClaim | null;
  /** Joined by the claim's audit, never by a later corrected delivery. */
  claimCalendar: ScanDeliveryCalendar | null;
  /** Only the effective delivery audit's HOLD. Older HOLD facts remain in storage. */
  hold: ScanBackstopHold | null;
}
export interface ScanProgressStore {
  /** Checked server/session scope only. Null means unavailable, never an empty fabricated book. */
  read(scope: ScanProgressScope): Promise<ScanProgressSnapshot | null>;
  /** Repeat the family/child/book fence and effective delivery checks after canonical history pagination. */
  recheck(scope: ScanProgressScope, book: ScanProgressSnapshot["book"]): Promise<boolean>;
}
type CanonicalHistory = NonNullable<Awaited<ReturnType<typeof readScanHistory>>>;
/** Adapt readScanHistory with status all, limit 100, and the checked parent or admin session. */
export type ScanProgressHistoryReader = (scope: ScanProgressScope, after?: string) => Promise<{
  parentId: string; pages: CanonicalHistory["pages"]; after: string | null;
} | null>;

/**
 * Server only. The caller must first check its live parent/admin session and select this exact scope.
 * Service credentials do not authorize the caller. Do not pass browser admission facts or browser time.
 * This read makes no claims, writes, deadlines or marking policy. The adapter rechecks live scope at the end.
 */
export async function readWorkbookScanProgress(store: ScanProgressStore, scope: ScanProgressScope, now: number,
  history?: ScanProgressHistoryReader) {
  if (![scope.parentId, scope.childId, scope.workbookId].every(isUuid) || !Number.isFinite(now)) {
    return { status: "unavailable" as const };
  }
  const snapshot = await store.read(scope);
  if (!snapshot) return { status: "unavailable" as const };
  const { book } = snapshot;
  if (book.parentId !== scope.parentId || book.childId !== scope.childId || book.workbookId !== scope.workbookId) {
    return { status: "unavailable" as const };
  }
  let reviews: { parentId: string; page: HistoryPage }[] | undefined;
  if (history) {
    reviews = [];
    let after: string | undefined;
    for (let batches = 0; ; batches++) {
      if (batches >= 1000) throw new Error("scan_progress_history_bound");
      const batch = await history(scope, after);
      // No partial review state if a later page is unavailable.
      if (!batch) { reviews = undefined; break; }
      if (batch.parentId !== scope.parentId || !Array.isArray(batch.pages) || batch.pages.length > 100
        || (batch.after !== null && typeof batch.after !== "string")) throw new Error("scan_progress_history_shape");
      let cursor = after;
      for (const page of batch.pages) {
        if (!page || typeof page.id !== "string" || !page.id || (cursor !== undefined && page.id <= cursor)
          || !Object.hasOwn(HISTORY_LABELS, page.status)) throw new Error("scan_progress_history_cursor");
        cursor = page.id;
        const stored = book.pages.find(p => p.id === page.id);
        if (page.childId === scope.childId && page.workbookId === scope.workbookId && page.book === book.number
          && page.revision === book.printedRevision && stored && page.pageNumber === stored.number) {
          reviews.push({ parentId: scope.parentId, page });
        }
      }
      if (batch.after === null) break;
      if (!batch.pages.length || batch.after !== cursor) throw new Error("scan_progress_history_cursor");
      after = batch.after;
    }
  }
  const progress = workbookScanProgress({ book, receipts: snapshot.receipts, progressEvents: snapshot.progressEvents, reviews, now });
  if (progress.status !== "available") return { status: "unavailable" as const };
  if (!await store.recheck(scope, book)) return { status: "unavailable" as const };
  const auditId = book.delivery ? book.delivery.correction?.auditId ?? book.delivery.auditId : null;
  return {
    status: "available" as const, workbookId: book.workbookId, number: book.number, printedRevision: book.printedRevision,
    pageNumbers: book.pages.map(p => ({ id: p.id, number: p.number })),
    progress, deliveryTimeZone: book.delivery?.timeZone ?? null,
    persisted: {
      clock: { status: auditId === null ? "missing-delivery" as const : snapshot.currentCalendar ? "recorded" as const : "clock-required" as const,
        deliveryAuditId: auditId, requestPresent: snapshot.clockRequestPresent, calendar: snapshot.currentCalendar },
      claim: snapshot.claim, claimCalendar: snapshot.claimCalendar, hold: snapshot.hold,
    },
  };
}
