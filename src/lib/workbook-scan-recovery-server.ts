import "server-only";
import { adminClient } from "@/lib/supabase-auth";
import { isUuid } from "@/lib/workbook-content";
import { recoverWorkbookScanClocks } from "@/lib/workbook-scan-clock";
import { workbookScanClockRequestsForBooks, workbookScanClockStore, workbookScanClockVersion } from "@/lib/workbook-scan-clock-store";
import { scanMaintenanceRelease, scanProgressAccess } from "@/lib/workbook-scan-access";

/**
 * Call only after an authorized delivery operation. Its SQL hook already saved a durable clock request.
 * This short turn rechecks the delivered book's owner and processes only its own saved requests.
 * The gate is the same as scheduled recovery. Scheduled recovery owns larger or changed request sets.
 * It sends no email and queues no book. A clock failure must not turn a committed delivery into a refused response.
 */
export async function refreshWorkbookScanClock(workbookId: string): Promise<void> {
  if (!isUuid(workbookId)) return;
  const release = scanMaintenanceRelease({
    WORKBOOK_SCAN_PROGRESS_ENABLED: process.env.WORKBOOK_SCAN_PROGRESS_ENABLED,
    WORKBOOK_SCAN_REMINDERS_ENABLED: process.env.WORKBOOK_SCAN_REMINDERS_ENABLED,
    WORKBOOK_SCAN_TEST_PARENT_IDS: process.env.WORKBOOK_SCAN_TEST_PARENT_IDS,
  });
  if (!release) return;
  try {
    const db = adminClient(AbortSignal.timeout(4_000));
    if (!db) return;
    const { data: book, error } = await db.from("workbooks").select("id,parent_id,child_id,status").eq("id", workbookId).maybeSingle();
    if (error) throw new Error("scan_recovery_book_read");
    if (!book || book.id !== workbookId || book.status !== "shipped") return;
    const access = scanProgressAccess(db, release);
    async function allowed() { return access.allowed(book!.parent_id, book!.child_id); }
    if (!await allowed()) return;
    const clocks = workbookScanClockStore(db);
    const result = await recoverWorkbookScanClocks({
      reconcile: async ids => {
        if (ids.length !== 1 || ids[0] !== workbookId) throw new Error("scan_recovery_book_scope");
        if (await allowed()) await clocks.reconcile(ids);
      },
      requests: async limit => await allowed() ? workbookScanClockRequestsForBooks(db, [workbookId], limit) : [],
      record: async (request, calendar) => {
        if (request.workbookId !== workbookId || !await allowed()) return "unavailable";
        return clocks.record(request, calendar);
      },
    }, {
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
