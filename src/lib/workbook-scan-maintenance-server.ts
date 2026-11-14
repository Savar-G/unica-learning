import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { SUPPORT_EMAIL } from "@/lib/contact";
import type { MailTransport } from "@/lib/email-delivery";
import { newToken } from "@/lib/sign-in-link";
import { isUuid } from "@/lib/workbook-content";
import { scanMaintenanceRelease, type ScanMaintenanceEnvironment } from "@/lib/workbook-scan-release";
export { scanMaintenanceRelease } from "@/lib/workbook-scan-release";
import { workbookScanClockRequestsForBooks, workbookScanClockStore, workbookScanClockVersion } from "@/lib/workbook-scan-clock-store";
import { runWorkbookScanMaintenance } from "@/lib/workbook-scan-maintenance";
import { workbookScanProgressStore } from "@/lib/workbook-scan-progress-store";
import { workbookScanReminderEmail } from "@/lib/workbook-scan-reminder-email";
import { createWorkbookScanReminderSender } from "@/lib/workbook-scan-reminder-send";
import { readWorkbookScanReminderDue, workbookScanInactivityStore,
  workbookScanReminderSendStore, listWorkbookScanRecoveryBooks } from "@/lib/workbook-scan-reminder-store";

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
  async function testParent(parent: string): Promise<boolean> {
    if (permissionReadFailed) throw new Error("scan_maintenance_test_gate_read");
    if (!release!.parents.includes(parent.toLowerCase())) return false;
    const { data, error } = await db.from("test_accounts").select("parent_id").eq("parent_id", parent).maybeSingle();
    if (error) { permissionReadFailed = true; throw new Error("scan_maintenance_test_gate_read"); }
    return data?.parent_id === parent;
  }
  /**
   * Who may get a reminder email: a listed test parent with its marker; and, with reminders in `families` mode, a real
   * family (no test marker). The plan is not read here (no email reads the plan gate): every due read, claim and
   * admission in the database runs `_workbook_scan_reminder_program`, which refuses a family without a running plan.
   */
  async function reminderParent(parent: string): Promise<boolean> {
    if (permissionReadFailed) throw new Error("scan_maintenance_test_gate_read");
    if (release!.parents.includes(parent.toLowerCase())) return testParent(parent);
    if (release!.reminders !== "families") return false;
    const { data, error } = await db.from("test_accounts").select("parent_id").eq("parent_id", parent).maybeSingle();
    if (error) { permissionReadFailed = true; throw new Error("scan_maintenance_test_gate_read"); }
    return !data;
  }
  async function allowed(parent: string, child?: string): Promise<boolean> {
    if (permissionReadFailed) throw new Error("scan_maintenance_test_gate_read");
    return !!child && await testParent(parent);
  }
  const store = workbookScanReminderSendStore(db, { beforeAdmit: handle => reminderParent(handle.parentId) });
  const sender = createWorkbookScanReminderSender({ gapMs: options.gapMs, transport: options.provider,
    store });
  return {
    transport: sender.transport,
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
              if (kind === "reminder-due" ? await reminderParent(row.parentId) : await allowed(row.parentId, row.childId)) selected.push(row);
              if (selected.length === limit) return selected;
            }
            after = rows.length === limit ? rows[rows.length - 1].workbookId : null;
          } while (after);
          return selected;
        },
        // This server runs only the reminders phase: its gate is who may get a reminder.
        allowed: async (parent, child) => !!child && await reminderParent(parent),
        clocks: { ...clockStore, reconcile: async ids => {
          await clockStore.reconcile(ids);
          selectedBooks.push(...ids);
        }, requests: limit => workbookScanClockRequestsForBooks(db, selectedBooks, limit) },
        progress: workbookScanProgressStore(db), calendars: workbookScanInactivityStore(db),
        due: parent => readWorkbookScanReminderDue(db, parent),
        ...(release.delivery ? { send: async (parent: string, episodeIds: readonly string[], signal?: AbortSignal) => {
          if (!await reminderParent(parent)) return { status: "not_sent" as const, reason: "release-off", released: false };
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
      }, { phase: "reminders", limit: 5, clockVersion: workbookScanClockVersion(), time, signal: options.signal });
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
