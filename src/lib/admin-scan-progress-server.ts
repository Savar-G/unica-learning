import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import { adminScanProgress } from "@/lib/admin-scan-progress";
import { adminClient } from "@/lib/supabase-auth";
import { readScanHistory } from "@/lib/scan-history";
import { scanHistoryStore } from "@/lib/scan-history-reader";
import { readWorkbookScanProgress, type ScanProgressScope } from "@/lib/workbook-scan-progress-reader";
import { workbookScanProgressStore } from "@/lib/workbook-scan-progress-store";

/** Caller has checked the admin session and selected the child and workbook. */
export async function loadAdminScanProgress(admin: AdminSession, scope: ScanProgressScope, withHistory = true) {
  const db = adminClient();
  if (!db) return { view: null, missingDelivery: null };
  try {
    const now = Date.now();
    const history = scanHistoryStore(db, { admin: admin.userId });
    const result = await readWorkbookScanProgress(workbookScanProgressStore(db), scope, now, withHistory ? async (checked, after) => {
      const batch = await readScanHistory(history, { child: checked.childId, workbook: checked.workbookId, status: "all", after }, now, 100);
      return batch ? { parentId: checked.parentId, pages: batch.pages, after: batch.after } : null;
    } : undefined);
    if (result.status === "available") return { view: adminScanProgress(result), missingDelivery: null };
    const receipt = await db.from("workbook_delivery_receipts").select("workbook_id,parent_id,child_id").eq("workbook_id", scope.workbookId).maybeSingle();
    if (receipt.error || (receipt.data && (receipt.data.parent_id !== scope.parentId || receipt.data.child_id !== scope.childId
      || receipt.data.workbook_id !== scope.workbookId))) throw new Error("scan_delivery_scope");
    return { view: null, missingDelivery: receipt.data === null };
  } catch {
    return { view: null, missingDelivery: null };
  }
}

/** Read every hold and recheck it against current delivery and scan facts. */
export async function loadAdminScanHolds(admin: AdminSession) {
  const holds: { workbook_id: string; child_id: string; parent_id: string }[] = [];
  let total: number | null = null;
  for (let offset = 0; ; offset += 500) {
    const { data, error, count } = await admin.db.from("workbook_scan_backstop_holds").select("workbook_id,child_id,parent_id", { count: "exact" })
      .order("workbook_id").order("delivery_audit_id").range(offset, offset + 499);
    if (error || !data || count === null || (total !== null && count !== total)
      || data.length !== Math.min(500, Math.max(0, count - offset))) return { rows: [], unavailable: true };
    total = count;
    holds.push(...data);
    if (holds.length === count) break;
  }
  const unique = [...new Map(holds.map(h => [h.workbook_id, h])).values()];
  const rows: { workbookId: string; childId: string; number: number }[] = [];
  let unavailable = false;
  for (const h of unique) {
    const { view } = await loadAdminScanProgress(admin, { workbookId: h.workbook_id, childId: h.child_id, parentId: h.parent_id }, false);
    if (!view) unavailable = true;
    else if (view.held) rows.push({ workbookId: h.workbook_id, childId: h.child_id, number: view.number });
  }
  return { rows, unavailable };
}
