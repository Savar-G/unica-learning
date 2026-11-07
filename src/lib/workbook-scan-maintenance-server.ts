import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { SUPPORT_EMAIL } from "@/lib/contact";
import type { MailTransport } from "@/lib/email-delivery";
import { newToken } from "@/lib/sign-in-link";
import { isUuid } from "@/lib/workbook-content";
import { workbookScanClockRequestsForBooks, workbookScanClockStore, workbookScanClockVersion } from "@/lib/workbook-scan-clock-store";
import { runWorkbookScanMaintenance } from "@/lib/workbook-scan-maintenance";
import { workbookScanProgressStore } from "@/lib/workbook-scan-progress-store";
import { workbookScanReminderEmail } from "@/lib/workbook-scan-reminder-email";
import { createWorkbookScanReminderSender } from "@/lib/workbook-scan-reminder-send";
import { readWorkbookScanReminderDue, workbookScanInactivityStore,
  workbookScanReminderSendStore } from "@/lib/workbook-scan-reminder-store";

export interface ScanMaintenanceEnvironment {
  WORKBOOK_SCAN_PROGRESS_ENABLED?: string;
  WORKBOOK_SCAN_REMINDERS_ENABLED?: string;
  WORKBOOK_SCAN_TEST_PARENT_IDS?: string;
}

/** There is deliberately no real-family mode in this release. Invalid configuration means off. */
export function scanMaintenanceRelease(env: ScanMaintenanceEnvironment): { parents: readonly string[]; delivery: boolean } | null {
  if (env.WORKBOOK_SCAN_PROGRESS_ENABLED !== "test-only") return null;
  const parents = (env.WORKBOOK_SCAN_TEST_PARENT_IDS ?? "").split(",").map(s => s.trim());
  if (!parents.length || parents.length > 20 || parents.some(id => !isUuid(id)) || new Set(parents).size !== parents.length
    || ![undefined, "off", "test-only"].includes(env.WORKBOOK_SCAN_REMINDERS_ENABLED)) return null;
  return { parents, delivery: env.WORKBOOK_SCAN_REMINDERS_ENABLED === "test-only" };
}

/** Create once per cron invocation and use transport for every existing email in that invocation too. */
export function createWorkbookScanMaintenanceServer(db: SupabaseClient<Database>, options: {
  env: ScanMaintenanceEnvironment; origin: string; provider: MailTransport; gapMs: number; signal?: AbortSignal;
}) {
  const release = scanMaintenanceRelease(options.env);
  if (!release) return null;
  let permissionReadFailed = false;
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
  async function allowed(parent: string): Promise<boolean> {
    if (permissionReadFailed) throw new Error("scan_maintenance_test_gate_read");
    if (!release!.parents.includes(parent)) return false;
    try {
      const { data, error } = await db.from("test_accounts").select("parent_id").eq("parent_id", parent).maybeSingle();
      if (error) throw error;
      return data?.parent_id === parent;
    } catch {
      permissionReadFailed = true;
      throw new Error("scan_maintenance_test_gate_read");
    }
  }
  const store = workbookScanReminderSendStore(db, { beforeAdmit: handle => allowed(handle.parentId) });
  const sender = createWorkbookScanReminderSender({ gapMs: options.gapMs, transport: options.provider,
    store });
  return {
    transport: sender.transport,
    async run(time: { now(): number; endAt: number }) {
      if (permissionReadFailed) throw new Error("scan_maintenance_test_gate_read");
      let selectedBooks: string[] = [];
      const result = await runWorkbookScanMaintenance({
        books: async (_kind, limit) => {
          const rows = await testDeliveries(limit);
          selectedBooks = rows.map(row => row.workbookId);
          return rows;
        }, allowed,
        clocks: { ...workbookScanClockStore(db), requests: limit => workbookScanClockRequestsForBooks(db, selectedBooks, limit) },
        progress: workbookScanProgressStore(db), calendars: workbookScanInactivityStore(db),
        due: parent => readWorkbookScanReminderDue(db, parent),
        ...(release.delivery ? { send: async (parent: string, episodeIds: readonly string[], signal?: AbortSignal) => {
          if (!await allowed(parent)) return { status: "not_sent" as const, reason: "release-off", released: false };
          const { data, error } = await db.from("parents").select("id,email").eq("id", parent).is("deletion_requested_at", null).maybeSingle();
          if (error) throw new Error("scan_maintenance_recipient_read");
          if (!data || data.id !== parent || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            return { status: "not_sent" as const, reason: "recipient-unavailable", released: false };
          }
          const { token, hash: unsubscribeHash } = newToken();
          const email = workbookScanReminderEmail({ origin: options.origin, token });
          return sender.send({ parentId: parent, episodeIds, unsubscribeHash, signal,
            message: { sender: { to: "parent" }, to: data.email, replyTo: SUPPORT_EMAIL, ...email } });
        } } : {}),
      }, { limit: 5, clockVersion: workbookScanClockVersion(), time, signal: options.signal });
      // The sender must retain an uncertain admission. It can therefore consume a thrown gate error itself.
      // Keep the invocation failed even when no further parent remains to call allowed again.
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
