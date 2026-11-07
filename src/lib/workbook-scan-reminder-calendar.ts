import { familyZone } from "@/lib/family-time";
import { isUuid } from "@/lib/workbook-content";
import { scanInactivityCandidate } from "@/lib/workbook-scan-progress";
import type { ScanProgressScope, ScanProgressStore } from "@/lib/workbook-scan-progress-reader";

export interface ScanInactivityIdentity extends ScanProgressScope {
  number: number;
  printedRevision: string;
  deliveryAuditId: number;
  deliveredAt: string;
  deliveryTimeZone: string;
  deliveryZoneOverride: boolean;
  activityReceiptId: string | null;
  activityKey: string;
  anchorAt: string;
  zoneMode: "family" | "delivery";
  clockContext: { version: 1; timeZone: string | null; postal: string | null;
    oldestChild: { id: string; createdAt: string; province: string | null } | null };
}
export type ScanInactivityContext = { status: "unavailable" }
  | { status: "read"; observedAt: string; identity: ScanInactivityIdentity | null };
export type ScanInactivityWrite = "recorded" | "stale" | "unavailable" | "calendar-conflict";
export interface ScanInactivityCalendarStore {
  context(workbookId: string): Promise<ScanInactivityContext>;
  propose(identity: ScanInactivityIdentity, dueAt: string, clockVersion: string): Promise<ScanInactivityWrite>;
}

/** Compute a calendar only from the checked saved book and the database's current episode identity. */
export async function proposeWorkbookScanInactivity(calendars: ScanInactivityCalendarStore,
  progress: ScanProgressStore, workbookId: string, clockVersion: string): Promise<ScanInactivityWrite | "none"> {
  if (!isUuid(workbookId) || !clockVersion.trim() || clockVersion.length > 200) return "unavailable";
  const context = await calendars.context(workbookId);
  if (context.status !== "read" || !Number.isFinite(Date.parse(context.observedAt))) return "unavailable";
  const identity = context.identity;
  if (!identity) return "none";
  if (identity.workbookId !== workbookId) return "unavailable";
  const scope = { parentId: identity.parentId, childId: identity.childId, workbookId };
  const snapshot = await progress.read(scope);
  if (!snapshot) return "unavailable";
  const { book } = snapshot, delivery = book.delivery;
  const deliveryZone = delivery && (typeof delivery.timeZone === "string" ? delivery.timeZone : delivery.timeZone.zone);
  const deliveryOverride = delivery && typeof delivery.timeZone === "string";
  if (book.parentId !== scope.parentId || book.childId !== scope.childId || book.workbookId !== workbookId
    || book.number !== identity.number || book.printedRevision !== identity.printedRevision
    || !delivery || (delivery.correction?.auditId ?? delivery.auditId) !== identity.deliveryAuditId
    || Date.parse(delivery.deliveredAt) !== Date.parse(identity.deliveredAt)
    || deliveryZone !== identity.deliveryTimeZone || deliveryOverride !== identity.deliveryZoneOverride) return "stale";
  if (identity.activityReceiptId && !snapshot.receipts.some((receipt) => receipt.id === identity.activityReceiptId)) return "stale";
  const anchorAt = Date.parse(identity.anchorAt), deliveredAt = Date.parse(identity.deliveredAt);
  if (!Number.isFinite(anchorAt) || identity.zoneMode !== (anchorAt > deliveredAt ? "family" : "delivery")) return "stale";
  const location = identity.clockContext;
  const timeZone = identity.zoneMode === "delivery"
    ? identity.deliveryZoneOverride ? identity.deliveryTimeZone : { zone: identity.deliveryTimeZone, override: false as const }
    : familyZone({ timeZone: location.timeZone, postal: location.postal, province: location.oldestChild?.province });
  const candidate = scanInactivityCandidate({ ...scope, books: [book], receipts: snapshot.receipts,
    progressEvents: snapshot.progressEvents, now: Date.parse(context.observedAt), timeZone });
  if (candidate.status !== "candidate" || candidate.workbookId !== workbookId
    || Date.parse(candidate.anchorAt) !== Date.parse(identity.anchorAt)) return "stale";
  if (!await progress.recheck(scope, book)) return "stale";
  // The write rechecks the current identity, complete required set, context, delivery and family fence under locks.
  return calendars.propose(identity, candidate.dueAt, clockVersion);
}
