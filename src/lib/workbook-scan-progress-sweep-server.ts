import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { isUuid } from "@/lib/workbook-content";
import { scanProgressAccess } from "@/lib/workbook-scan-access";
import { scanMaintenanceRelease, type ScanMaintenanceEnvironment } from "@/lib/workbook-scan-release";
import { workbookScanClockRequestsForBooks, workbookScanClockStore, workbookScanClockVersion } from "@/lib/workbook-scan-clock-store";
import { runWorkbookScanMaintenance } from "@/lib/workbook-scan-maintenance";
import { workbookScanProgressStore } from "@/lib/workbook-scan-progress-store";
import { readWorkbookScanReminderDue, workbookScanInactivityStore,
  listWorkbookScanRecoveryBooks } from "@/lib/workbook-scan-progress-sweep-store";

/** Create one progress sweep per cron invocation. */
export function createWorkbookScanProgressSweep(db: SupabaseClient<Database>, options: {
  env: ScanMaintenanceEnvironment; signal?: AbortSignal;
}) {
  const release = scanMaintenanceRelease(options.env);
  if (!release) return null;
  let permissionReadFailed = false;
  const access = scanProgressAccess(db, release);
  async function testDeliveries(limit: number) {
    // This test-only sweep selects its allowed parents before the bound. Reusing a global due selector could
    // repeatedly return excluded real families and never reach a test book. SQL still decides all eligibility.
    const { data, error, count } = await db.from("workbook_delivery_receipts")
      .select("workbook_id,parent_id,child_id,number,audit_id", { count: "exact" })
      .in("parent_id", [...release!.parents]).order("workbook_id").limit(limit + 1);
    if (error) throw new Error("scan_maintenance_delivery_read");
    if (!Array.isArray(data) || count !== data.length || data.length > limit
      || new Set(data.map(r => r.workbook_id)).size !== data.length
      || data.some(r => !isUuid(r.workbook_id) || !isUuid(r.child_id) || !release!.parents.includes(r.parent_id)
        || !Number.isSafeInteger(r.number) || r.number < 1 || !Number.isSafeInteger(r.audit_id) || r.audit_id < 1)) {
      throw new Error("scan_maintenance_delivery_bound");
    }
    return data.map(r => ({ workbookId: r.workbook_id, parentId: r.parent_id, childId: r.child_id,
      number: r.number, deliveryAuditId: r.audit_id }));
  }
  async function testParent(parent: string): Promise<boolean> {
    if (permissionReadFailed) throw new Error("scan_maintenance_test_gate_read");
    try { return await access.testParent(parent); } catch (error) { permissionReadFailed = true; throw error; }
  }
  async function allowed(parent: string, child?: string): Promise<boolean> {
    if (permissionReadFailed) throw new Error("scan_maintenance_test_gate_read");
    try { return !!child && await access.allowed(parent, child); } catch (error) { permissionReadFailed = true; throw error; }
  }
  return {
    async run(time: { now(): number; endAt: number }) {
      if (permissionReadFailed) throw new Error("scan_maintenance_test_gate_read");
      const selectedBooks: string[] = [];
      const clockStore = workbookScanClockStore(db);
      const result = await runWorkbookScanMaintenance({
        books: async (kind, limit) => {
          if (release.mode === "test-only") return testDeliveries(limit);
          const selected = [];
          let after: string | null = null;
          do {
            if (options.signal?.aborted || time.now() >= time.endAt) throw new Error("scan_maintenance_selection_timeout");
            const rows = await listWorkbookScanRecoveryBooks(db, kind, limit, after);
            for (const row of rows) {
              if (kind === "reminder-due" ? await testParent(row.parentId) : await allowed(row.parentId, row.childId)) selected.push(row);
              if (selected.length === limit) return selected;
            }
            after = rows.length === limit ? rows[rows.length - 1].workbookId : null;
          } while (after);
          return selected;
        }, allowed,
        clocks: { ...clockStore, reconcile: async ids => {
          await clockStore.reconcile(ids);
          selectedBooks.push(...ids);
        }, requests: limit => workbookScanClockRequestsForBooks(db, selectedBooks, limit) },
        progress: workbookScanProgressStore(db), calendars: workbookScanInactivityStore(db),
        due: parent => readWorkbookScanReminderDue(db, parent),

      }, { phase: "progress", limit: 5, clockVersion: workbookScanClockVersion(), time, signal: options.signal });
      if (permissionReadFailed) throw new Error("scan_maintenance_test_gate_read");
      // The cron response and ordinary logs contain counts only, never workbook or family identities.
      const counts = (rows: readonly { status: string }[]) => rows.reduce<Record<string, number>>((out, row) => {
        out[row.status] = (out[row.status] ?? 0) + 1; return out;
      }, {});
      return { selectedBooks: result.selectedBooks, clocks: counts(result.clocks?.outcomes ?? []),
        calendars: counts(result.calendars), reminders: counts(result.reminders), outOfTime: result.outOfTime,
        moreMayRemain: result.moreMayRemain };
    },
  };
}
