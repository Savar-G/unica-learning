import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { normalizeTimeZone } from "@/lib/family-time";
import { isUuid } from "@/lib/workbook-content";
import { canonical } from "@/lib/workbook-digest";
import { isPrintedRevision } from "@/lib/workbook-print-contract";
import type { ScanInactivityCalendarStore, ScanInactivityIdentity } from "@/lib/workbook-scan-reminder-calendar";

const NIL = "00000000-0000-0000-0000-000000000000";
const kinds = ["unseeded", "due", "inactivity", "reminder-due"] as const;
export type ScanRecoveryKind = typeof kinds[number];
export interface ScanRecoveryBook {
  workbookId: string; parentId: string; childId: string; number: number; deliveryAuditId: number;
}
export type ScanReminderDue = { status: "ready"; episodeIds: string[]; childIds: string[] }
  | { status: "refresh-required"; workbookId: string }
  | { status: "unsubscribed" | "unavailable" };

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const textOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const at = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
const ids = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 100
  && v.every(isUuid) && new Set(v).size === v.length;
const fail = (): never => { throw new Error("scan_reminder_store_shape"); };
function answer(value: unknown): Record<string, unknown> { if (!object(value)) return fail(); return value; }

function identity(value: unknown, workbookId: string): ScanInactivityIdentity {
  const v = answer(value), c = answer(v.clock_context), oldest = c.oldestChild;
  let oldestChild: ScanInactivityIdentity["clockContext"]["oldestChild"] = null;
  if (oldest !== null) {
    if (!object(oldest) || !isUuid(oldest.id) || !at(oldest.createdAt) || !textOrNull(oldest.province)) return fail();
    oldestChild = { id: oldest.id, createdAt: oldest.createdAt, province: oldest.province };
  }
  if (v.workbook_id !== workbookId || !isUuid(v.workbook_id) || !isUuid(v.parent_id) || !isUuid(v.child_id)
    || !positive(v.number) || !isPrintedRevision(v.printed_revision) || !positive(v.delivery_audit_id)
    || !at(v.delivered_at) || !at(v.anchor_at) || Date.parse(v.anchor_at) < Date.parse(v.delivered_at)
    || typeof v.delivery_time_zone !== "string" || !normalizeTimeZone(v.delivery_time_zone)
    || typeof v.delivery_zone_override !== "boolean" || (v.activity_receipt_id !== null && !isUuid(v.activity_receipt_id))
    || v.activity_key !== (v.activity_receipt_id ?? NIL) || c.version !== 1
    || !textOrNull(c.timeZone) || !textOrNull(c.postal)
    || (v.zone_mode !== "family" && v.zone_mode !== "delivery")
    || v.zone_mode !== (Date.parse(v.anchor_at) > Date.parse(v.delivered_at) ? "family" : "delivery")
    || (v.activity_receipt_id === null && Date.parse(v.anchor_at) !== Date.parse(v.delivered_at))) return fail();
  return { workbookId, parentId: v.parent_id, childId: v.child_id, number: v.number,
    printedRevision: v.printed_revision, deliveryAuditId: v.delivery_audit_id, deliveredAt: v.delivered_at,
    deliveryTimeZone: v.delivery_time_zone, deliveryZoneOverride: v.delivery_zone_override,
    activityReceiptId: v.activity_receipt_id, activityKey: v.activity_key, anchorAt: v.anchor_at,
    zoneMode: v.zone_mode, clockContext: { version: 1, timeZone: c.timeZone, postal: c.postal,
      oldestChild } };
}

/** Service-only RPCs. Unknown or incomplete replies never become an empty recovery set. */
export async function listWorkbookScanRecoveryBooks(db: SupabaseClient<Database>, kind: ScanRecoveryKind,
  limit: number, after: string | null = null): Promise<ScanRecoveryBook[]> {
  if (!kinds.includes(kind) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
    || (after !== null && !isUuid(after))) return fail();
  const { data, error } = await db.rpc("list_workbook_scan_recovery_books", { p_kind: kind, p_limit: limit, p_after: after });
  if (error) throw new Error("scan_reminder_recovery_read");
  if (!Array.isArray(data) || data.length > limit) return fail();
  let previous = after;
  return data.map(value => {
    const v = answer(value);
    if (!isUuid(v.workbook_id) || !isUuid(v.parent_id) || !isUuid(v.child_id)
      || !positive(v.number) || !positive(v.delivery_audit_id) || (previous !== null && v.workbook_id <= previous)) return fail();
    previous = v.workbook_id;
    return { workbookId: v.workbook_id, parentId: v.parent_id, childId: v.child_id, number: v.number, deliveryAuditId: v.delivery_audit_id };
  });
}

export function workbookScanInactivityStore(db: SupabaseClient<Database>): ScanInactivityCalendarStore {
  return {
    async context(workbookId) {
      if (!isUuid(workbookId)) return fail();
      const { data, error } = await db.rpc("read_workbook_scan_inactivity_context", { p_book: workbookId });
      if (error) throw new Error("scan_reminder_context_read");
      const v = answer(data);
      if (v.status === "unavailable") return { status: "unavailable" };
      if (v.status !== "read" || !at(v.observed_at)) return fail();
      const saved = v.identity === null ? null : identity(v.identity, workbookId);
      if (saved && Date.parse(saved.anchorAt) > Date.parse(v.observed_at)) return fail();
      return { status: "read", observedAt: v.observed_at, identity: saved };
    },
    async propose(saved, dueAt, clockVersion) {
      // Revalidate public inputs before any mutation, including explicit null and the complete clock context.
      identity({ workbook_id: saved.workbookId, parent_id: saved.parentId, child_id: saved.childId,
        number: saved.number, printed_revision: saved.printedRevision, delivery_audit_id: saved.deliveryAuditId,
        delivered_at: saved.deliveredAt, delivery_time_zone: saved.deliveryTimeZone, delivery_zone_override: saved.deliveryZoneOverride,
        activity_receipt_id: saved.activityReceiptId, activity_key: saved.activityKey, anchor_at: saved.anchorAt,
        zone_mode: saved.zoneMode, clock_context: saved.clockContext }, saved.workbookId);
      if (!at(dueAt) || Date.parse(dueAt) <= Date.parse(saved.anchorAt) || !clockVersion.trim() || clockVersion.length > 200) return fail();
      const { data, error } = await db.rpc("propose_workbook_scan_inactivity", { p_book: saved.workbookId,
        p_delivery_audit: saved.deliveryAuditId, p_activity: saved.activityReceiptId, p_anchor: saved.anchorAt,
        p_due: dueAt, p_context: { ...saved.clockContext }, p_clock_version: clockVersion });
      if (error) throw new Error("scan_reminder_calendar_write");
      const v = answer(data);
      if (v.status === "recorded") {
        const e = answer(v.episode);
        if (e.workbook_id !== saved.workbookId || e.parent_id !== saved.parentId || e.child_id !== saved.childId
          || e.number !== saved.number || e.printed_revision !== saved.printedRevision
          || e.activity_key !== saved.activityKey || e.activity_receipt_id !== saved.activityReceiptId
          || e.delivery_audit_id !== saved.deliveryAuditId || !at(e.anchor_at) || Date.parse(e.anchor_at) !== Date.parse(saved.anchorAt)
          || e.clock_version !== clockVersion || JSON.stringify(canonical(e.clock_context)) !== JSON.stringify(canonical(saved.clockContext))
          || !at(e.due_at) || Date.parse(e.due_at) !== Date.parse(dueAt)) return fail();
        return "recorded";
      }
      if (v.status === "stale" || v.status === "unavailable" || v.status === "calendar-conflict") return v.status;
      return fail();
    },
  };
}

export async function readWorkbookScanReminderDue(db: SupabaseClient<Database>, parentId: string): Promise<ScanReminderDue> {
  if (!isUuid(parentId)) return fail();
  const { data, error } = await db.rpc("read_workbook_scan_reminder_due", { p_parent: parentId });
  if (error) throw new Error("scan_reminder_due_read");
  const v = answer(data);
  if (v.status === "unsubscribed" || v.status === "unavailable") return { status: v.status };
  if (v.status === "refresh-required" && isUuid(v.workbook_id)) return { status: "refresh-required", workbookId: v.workbook_id };
  if (v.status !== "ready" || !ids(v.episode_ids) || !ids(v.child_ids)
    || v.child_ids.length > v.episode_ids.length || (v.episode_ids.length === 0) !== (v.child_ids.length === 0)) return fail();
  return { status: "ready", episodeIds: v.episode_ids, childIds: v.child_ids };
}

