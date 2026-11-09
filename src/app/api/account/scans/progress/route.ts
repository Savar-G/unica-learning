import { scanMaintenanceRelease, scanProgressAccess } from "@/lib/workbook-scan-access";
import { isUuid } from "@/lib/workbook-content";
import { scanJson, scanSession } from "@/lib/scan-photo-server";
import { markingAccess } from "@/lib/scan-marking-server";
import { readScanHistory } from "@/lib/scan-history";
import { scanHistoryStore } from "@/lib/scan-history-reader";
import { readWorkbookScanProgress, type ScanProgressHistoryReader } from "@/lib/workbook-scan-progress-reader";
import { workbookScanProgressStore } from "@/lib/workbook-scan-progress-store";

/** A read only projection. The live scan session selects the parent; browser fields cannot admit progress. */
export async function GET(request: Request) {
  const session = await scanSession();
  const query = new URL(request.url).searchParams;
  const childId = query.get("child"), workbookId = query.get("workbook");
  if (!isUuid(childId) || !isUuid(workbookId)) return scanJson({ error: "invalid" }, 400);
  if (!await session.childOpen(childId)) return scanJson({ error: "refused" }, 404);
  try {
    const release = scanMaintenanceRelease({
      WORKBOOK_SCAN_PROGRESS_ENABLED: process.env.WORKBOOK_SCAN_PROGRESS_ENABLED,
      WORKBOOK_SCAN_REMINDERS_ENABLED: process.env.WORKBOOK_SCAN_REMINDERS_ENABLED,
      WORKBOOK_SCAN_TEST_PARENT_IDS: process.env.WORKBOOK_SCAN_TEST_PARENT_IDS,
    });
    if (!release) return scanJson({ error: "refused" }, 404);
    const access = scanProgressAccess(session.admin, release);
    if (!await access.allowed(session.parent, childId)) return scanJson({ error: "refused" }, 404);
    const now = Date.now();
    // Accepted scans remain readable independently of automatic marking. Its separate release gate stays intact.
    let history: ScanProgressHistoryReader | undefined;
    if (await markingAccess(session.admin, session.parent, process.env, { child: childId })) {
      const store = scanHistoryStore(session.admin, { parent: session.parent });
      history = async (scope, after) => {
        const result = await readScanHistory(store, { child: scope.childId, workbook: scope.workbookId, status: "all", after }, now, 100);
        return result ? { parentId: session.parent, pages: result.pages, after: result.after } : null;
      };
    }
    const result = await readWorkbookScanProgress(workbookScanProgressStore(session.admin),
      { parentId: session.parent, childId, workbookId }, now, history);
    if (result.status !== "available" || !await session.active() || !await access.allowed(session.parent, childId)) return scanJson({ error: "refused" }, 404);
    const { progress, persisted } = result;
    const numbers = new Map(result.pageNumbers.map(p => [p.id, p.number]));
    const pageNumber = (id: string) => {
      const number = numbers.get(id);
      if (number === undefined) throw new Error("scan_progress_page_number");
      return number;
    };
    // Explicit fields only. No raw receipts, photo identities, claims, audit IDs, answer text or cost records.
    return scanJson({
      workbook: { id: result.workbookId, number: result.number, printedRevision: result.printedRevision },
      days: progress.days.map(d => ({ day: d.day, requiredPages: d.requiredPages.map(pageNumber),
        acceptedPages: d.acceptedPages.map(pageNumber), gaps: d.gaps.map(pageNumber), complete: d.complete })),
      pages: progress.pages.map(p => ({ number: pageNumber(p.pageId), scanned: p.scanned,
        markingStatus: p.markingStatus, reviewReady: p.reviewReady })).sort((a,b) => a.number - b.number),
      acceptedPageCount: progress.acceptedPageCount, unfinished: progress.unfinished, day7Ready: progress.day7Ready,
      delivery: { status: progress.delivery.status, deliveredAt: progress.delivery.status === "confirmed" ? progress.delivery.deliveredAt : null,
        clockStatus: persisted.clock.status, backstopAt: persisted.clock.calendar?.backstopAt ?? null },
      trigger: persisted.claim ? { status: "claimed", reason: persisted.claim.reason }
        : persisted.hold ? { status: "hold", reason: persisted.hold.reason } : { status: "waiting" },
    });
  } catch { return scanJson({ error: "unavailable" }, 503); }
}
