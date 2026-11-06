import "server-only";
import { adminClient } from "@/lib/supabase-auth";
import { isUuid } from "@/lib/workbook-content";
import { recoverWorkbookScanClocks } from "@/lib/workbook-scan-clock";
import { workbookScanClockStore, workbookScanClockVersion } from "@/lib/workbook-scan-clock-store";

/**
 * Call only after an authorized delivery operation. Its SQL hook already saved a durable clock request.
 * This short turn rechecks that book and handles one current global request. It does not promise that this book's
 * calendar completed ahead of an older request. Scheduled recovery owns the rest, including lost responses.
 * It sends no email and queues no book. A clock failure must not turn a committed delivery into a refused response.
 */
export async function refreshWorkbookScanClock(workbookId: string): Promise<void> {
  if (!isUuid(workbookId)) return;
  try {
    const db = adminClient(AbortSignal.timeout(4_000));
    if (!db) return;
    const result = await recoverWorkbookScanClocks(workbookScanClockStore(db), {
      workbookIds: [workbookId], clockVersion: workbookScanClockVersion(), limit: 1,
    });
    if (result.outcomes.some(o=>["calendar-conflict", "invalid-request", "write-failed"].includes(o.status))) {
      console.warn("[scan progress] clock recovery needs another check");
    }
  } catch {
    // The durable request survives. Do not expose a database error or private family identity in this log.
    console.warn("[scan progress] clock recovery deferred");
  }
}
