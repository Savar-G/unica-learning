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

/** Holds are immutable facts, so old ones stay forever. Bound the read: the newest HOLD_READ holds, then one batched
 * query drops every hold whose book now has an accepted scan, and at most HOLD_CHECK candidates are rechecked in full. */
export const HOLD_READ = 100;
export const HOLD_CHECK = 20;
export async function loadAdminScanHolds(admin: AdminSession) {
  const read = await admin.db.from("workbook_scan_backstop_holds").select("workbook_id,child_id,parent_id")
    .order("held_at", { ascending: false }).order("workbook_id").limit(HOLD_READ + 1);
  if (read.error || !read.data) return { rows: [], unavailable: true, more: false };
  const holds = [...new Map(read.data.slice(0, HOLD_READ).map(h => [h.workbook_id, h])).values()];
  if (!holds.length) return { rows: [], unavailable: false, more: false };
  const ids = holds.map(h => h.workbook_id), parents = [...new Set(holds.map(h => h.parent_id))];
  const [scanned, tests] = await Promise.all([
    admin.db.from("workbook_scan_receipts").select("workbook_id").in("workbook_id", ids),
    admin.db.from("test_accounts").select("parent_id").in("parent_id", parents),
  ]);
  if (scanned.error || !scanned.data || tests.error || !tests.data) return { rows: [], unavailable: true, more: false };
  const withScans = new Set(scanned.data.map(r => r.workbook_id)), testParents = new Set(tests.data.map(r => r.parent_id));
  const candidates = holds.filter(h => !withScans.has(h.workbook_id));
  const rows: { workbookId: string; childId: string; number: number; testFamily: boolean }[] = [];
  let unavailable = false;
  for (const h of candidates.slice(0, HOLD_CHECK)) {
    const { view } = await loadAdminScanProgress(admin, { workbookId: h.workbook_id, childId: h.child_id, parentId: h.parent_id }, false);
    if (!view) unavailable = true;
    else if (view.held) rows.push({ workbookId: h.workbook_id, childId: h.child_id, number: view.number, testFamily: testParents.has(h.parent_id) });
  }
  return { rows, unavailable, more: read.data.length > HOLD_READ || candidates.length > HOLD_CHECK };
}
