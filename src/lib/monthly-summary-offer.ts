import { addMonths, localMonth, type FamilyZone } from "@/lib/family-time";
import type { DeliveryCorrectionRecord, DeliveryRecord } from "@/lib/parent-view";

// Which month's summary is offered (#562, #563, D-248). One rule for the three places that need it: the Overview's card
// and the monthly email use `offeredSummaryMonth`; the PDF route also starts at `firstDeliveryMonth`. A child with a
// confirmed delivery is in stage `active` or `ended`, and both have an Overview (src/lib/child-stage.ts).
// Pure: no database, network or clock.

/** The family-time month of the child's first confirmed delivery (a correction wins over its first record); null with none. */
export function firstDeliveryMonth(
  deliveries: readonly DeliveryRecord[],
  corrections: readonly DeliveryCorrectionRecord[],
  childId: string,
  zone: FamilyZone,
): string | null {
  const times = deliveries.filter((d) => d.childId === childId).map((d) => {
    const corrected = corrections.filter((c) => c.workbookId === d.workbookId).reduce<DeliveryCorrectionRecord | null>((best, c) => (!best || c.auditId > best.auditId ? c : best), null);
    return Date.parse(corrected?.deliveredAt ?? d.deliveredAt);
  }).filter((t) => Number.isFinite(t));
  return times.length > 0 ? localMonth(Math.min(...times), zone) : null;
}

/** The month offered at `now`: the last finished month in family time, from the month of the first delivery. Null before then. */
export function offeredSummaryMonth(first: string | null, now: number, zone: FamilyZone): string | null {
  const lastFinished = addMonths(localMonth(now, zone), -1);
  return first !== null && first <= lastFinished ? lastFinished : null;
}
