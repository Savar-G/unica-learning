import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { saveEmailCopy } from "@/lib/email-copies";
import { normalizeTimeZone } from "@/lib/family-time";
import { isUuid } from "@/lib/workbook-content";
import { canonical } from "@/lib/workbook-digest";
import { isPrintedRevision } from "@/lib/workbook-print-contract";
import type { ScanInactivityCalendarStore, ScanInactivityIdentity } from "@/lib/workbook-scan-reminder-calendar";
import type { ScanReminderHandle, ScanReminderSendStore } from "@/lib/workbook-scan-reminder-send";

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
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(id => b.includes(id));
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

function validHandle(h: ScanReminderHandle): boolean {
  return isUuid(h.parentId) && isUuid(h.messageId) && isUuid(h.attemptToken) && isUuid(h.emailLogId)
    && Number.isInteger(h.attempt) && h.attempt >= 1 && h.attempt <= 3
    && ids(h.episodeIds) && h.episodeIds.length > 0 && ids(h.childIds) && h.childIds.length > 0
    && h.childIds.length <= h.episodeIds.length && /^[0-9a-f]{64}$/.test(h.unsubscribeHash);
}

/** One store per bounded scheduler run. SQL owns all state changes and admits the complete sibling set. */
export function workbookScanReminderSendStore(db: SupabaseClient<Database>): ScanReminderSendStore {
  async function current(h: ScanReminderHandle, state: "reserved" | "admitted"): Promise<boolean> {
    if (!validHandle(h) || (state !== "reserved" && state !== "admitted")) return false;
    try {
      const [message, attempt, log, links] = await Promise.all([
        db.from("workbook_scan_reminder_messages").select("id,parent_id,email_log_id,state,attempt_count,attempt_token")
          .eq("id", h.messageId).eq("parent_id", h.parentId).maybeSingle(),
        db.from("workbook_scan_reminder_attempts").select("token,message_id,parent_id,attempt,state")
          .eq("token", h.attemptToken).eq("parent_id", h.parentId).maybeSingle(),
        db.from("email_log").select("id,parent_id,kind,status,attempts,unsubscribe_hash,copy_child_ids,copy_redacted")
          .eq("id", h.emailLogId).eq("parent_id", h.parentId).maybeSingle(),
        db.from("workbook_scan_reminder_links").select("episode_id,message_id,parent_id,child_id,released", { count: "exact" })
          .eq("message_id", h.messageId).eq("parent_id", h.parentId).order("episode_id").limit(101),
      ]);
      const m = message.data, a = attempt.data, l = log.data, rows = links.data;
      return !message.error && !attempt.error && !log.error && !links.error && !!m && !!a && !!l
        && m.id === h.messageId && m.parent_id === h.parentId && m.email_log_id === h.emailLogId
        && m.state === state && m.attempt_count === h.attempt && m.attempt_token === h.attemptToken
        && a.token === h.attemptToken && a.message_id === h.messageId && a.parent_id === h.parentId
        && a.attempt === h.attempt && a.state === state && l.id === h.emailLogId && l.parent_id === h.parentId
        && l.kind === "scan_inactivity" && l.status === "claimed" && l.attempts === h.attempt
        && l.unsubscribe_hash === h.unsubscribeHash && l.copy_redacted === false
        && ids(l.copy_child_ids) && same(l.copy_child_ids, h.childIds)
        && Array.isArray(rows) && links.count === rows.length && rows.length === h.episodeIds.length
        && ids(rows.map(r => r.episode_id)) && same(rows.map(r => r.episode_id), h.episodeIds)
        && rows.every(r => r.parent_id === h.parentId && r.message_id === h.messageId && r.released === false && h.childIds.includes(r.child_id))
        && same([...new Set(rows.map(r => r.child_id))], h.childIds);
    } catch { return false; }
  }
  return {
    async claim(input) {
      if (!isUuid(input.parentId) || !ids(input.episodeIds) || !input.episodeIds.length || !/^[0-9a-f]{64}$/.test(input.unsubscribeHash)) return fail();
      const { data, error } = await db.rpc("claim_workbook_scan_reminder", { p_parent: input.parentId,
        p_episodes: [...input.episodeIds], p_unsubscribe_hash: input.unsubscribeHash });
      if (error) throw new Error("scan_reminder_claim");
      const v = answer(data);
      if (v.status !== "claimed") {
        if (["busy", "set-changed", "refresh-required", "unsubscribed", "unavailable"].includes(String(v.status))) return { status: v.status };
        return fail();
      }
      if (!isUuid(v.message_id) || !isUuid(v.attempt_token) || !isUuid(v.email_log_id) || !positive(v.attempt) || v.attempt > 3
        || !ids(v.episode_ids) || !same(v.episode_ids, input.episodeIds) || !ids(v.child_ids) || !v.child_ids.length
        || v.child_ids.length > v.episode_ids.length) return fail();
      return { status: "claimed", messageId: v.message_id, attemptToken: v.attempt_token, emailLogId: v.email_log_id,
        attempt: v.attempt, episodeIds: v.episode_ids, childIds: v.child_ids };
    },
    async admit(h) {
      if (!await current(h, "reserved")) return { status: "stale" };
      const { data, error } = await db.rpc("admit_workbook_scan_reminder", { p_message: h.messageId, p_attempt: h.attemptToken });
      if (error) throw new Error("scan_reminder_admit");
      const v = answer(data);
      if (v.status !== "admitted") {
        if (["busy", "stale", "unavailable", "not-due"].includes(String(v.status))) return { status: v.status };
        return fail();
      }
      if (v.message_id !== h.messageId || v.attempt_token !== h.attemptToken || v.email_log_id !== h.emailLogId
        || !ids(v.episode_ids) || !same(v.episode_ids, h.episodeIds)) return fail();
      return { status: "admitted", messageId: v.message_id, attemptToken: v.attempt_token,
        emailLogId: v.email_log_id, episodeIds: v.episode_ids };
    },
    current,
    async keepCopy(h, copy) {
      if (!await current(h, "admitted")) return;
      await saveEmailCopy(db, { emailLogId: h.emailLogId }, h.parentId, copy);
    },
    async finish(h, outcome) {
      if (!await current(h, "admitted")) return { status: "stale" };
      if (outcome.status === "sent" && (!outcome.emailId || outcome.emailId.length > 100)) return fail();
      if (!["sent", "refused", "unknown"].includes(outcome.status)) return fail();
      const { data, error } = await db.rpc("finish_workbook_scan_reminder", { p_message: h.messageId,
        p_attempt: h.attemptToken, p_outcome: outcome.status, p_email_id: outcome.status === "sent" ? outcome.emailId : null });
      if (error) throw new Error("scan_reminder_finish");
      const v = answer(data);
      if (v.status !== "recorded" && v.status !== "stale") return fail();
      return { status: v.status };
    },
    async release(h) {
      if (!await current(h, "reserved")) return { status: "stale" };
      const { data, error } = await db.rpc("release_workbook_scan_reminder", { p_message: h.messageId, p_attempt: h.attemptToken });
      if (error) throw new Error("scan_reminder_release");
      const v = answer(data);
      if (v.status !== "released" && v.status !== "stale") return fail();
      return { status: v.status };
    },
  };
}
