import { formatInZone, type FamilyZone } from "@/lib/family-time";
import { HISTORY_LABELS } from "@/lib/scan-history";
import type { readWorkbookScanProgress } from "@/lib/workbook-scan-progress-reader";

type Available = Extract<Awaited<ReturnType<typeof readWorkbookScanProgress>>, { status: "available" }>;

/** Present only persisted claims. A later accepted scan clears the active hold from this view. */
export function adminScanProgress(result: Available) {
  const { progress, persisted } = result;
  const numbers = new Map(result.pageNumbers.map(p => [p.id, p.number]));
  const number = (id: string) => {
    const value = numbers.get(id);
    if (value === undefined) throw new Error("scan_progress_page_number");
    return value;
  };
  const zone = result.deliveryTimeZone;
  const time = (at: string, tz: FamilyZone | null) => tz
    ? formatInZone(at, tz, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })
    : null;
  const claim = persisted.claim;
  const claimZone: FamilyZone | null = claim ? (claim.zoneOverride ? claim.timeZone : { zone: claim.timeZone, override: false }) : null;
  return {
    number: result.number,
    delivery: progress.delivery.status,
    backstop: persisted.clock.calendar ? time(persisted.clock.calendar.backstopAt, zone) : null,
    claim: claim ? { reason: claim.reason, at: time(claim.claimedAt, claimZone) } : null,
    held: Boolean(persisted.hold && !claim && progress.acceptedPageCount === 0),
    days: progress.days.map(day => ({ day: day.day, required: day.requiredPages.map(number), accepted: day.acceptedPages.map(number),
      gaps: day.gaps.map(number), pages: day.requiredPages.map(id => {
        const page = progress.pages.find(p => p.pageId === id);
        return { number: number(id), marking: page?.markingStatus ? HISTORY_LABELS[page.markingStatus] : "Marking status unavailable",
          review: page?.reviewReady === null || page?.reviewReady === undefined ? "Review status unavailable" : page.reviewReady ? "Review complete" : "Review not complete" };
      }) })),
  };
}
