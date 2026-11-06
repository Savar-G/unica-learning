import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { isUuid } from "@/lib/workbook-content";
import { normalizeTimeZone } from "@/lib/family-time";
import type { ScanClockRequest, ScanClockStore, ScanClockWriteStatus } from "@/lib/workbook-scan-clock";

const writeStatuses = new Set<string>(["waiting", "hold", "claimed", "missing-delivery", "unavailable", "stale-delivery", "calendar-conflict"]);
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const isWriteStatus = (v: unknown): v is ScanClockWriteStatus => typeof v === "string" && writeStatuses.has(v);

function request(v: unknown): ScanClockRequest {
  if (!isObject(v) || typeof v.workbook_id !== "string" || !isUuid(v.workbook_id)
    || typeof v.delivery_audit_id !== "number" || !Number.isSafeInteger(v.delivery_audit_id) || v.delivery_audit_id < 1
    || typeof v.delivered_at !== "string" || !Number.isFinite(Date.parse(v.delivered_at))
    || typeof v.time_zone !== "string" || !normalizeTimeZone(v.time_zone) || typeof v.zone_override !== "boolean") {
    throw new Error("scan_clock_request_shape");
  }
  return { workbookId: v.workbook_id, deliveryAuditId: v.delivery_audit_id, deliveredAt: v.delivered_at,
    timeZone: v.time_zone, zoneOverride: v.zone_override };
}

function reconciled(value: unknown, books: readonly string[]): boolean {
  if (!Array.isArray(value) || value.length !== books.length) return false;
  const remaining = new Set(books);
  for (const row of value) {
    if (!isObject(row) || typeof row.workbookId !== "string" || !remaining.delete(row.workbookId)
      || !isObject(row.result) || (!isWriteStatus(row.result.status) && row.result.status !== "clock-required")) return false;
  }
  return remaining.size === 0;
}

/** Service client only. Browser callers cannot supply a calendar through these RPCs. */
export function workbookScanClockStore(db: SupabaseClient<Database>): ScanClockStore {
  return {
    async reconcile(ids) {
      const books = [...new Set(ids)].sort();
      if (books.length > 100 || books.some(id=>!isUuid(id))) throw new Error("scan_clock_book_batch");
      if (!books.length) return;
      const result = await db.rpc("reconcile_workbook_scan_progress", { p_books: books });
      if (!result.error) {
        if (!reconciled(result.data, books)) throw new Error("scan_clock_reconcile_shape");
        return;
      }
      if (result.error.code !== "55000") throw new Error("scan_clock_reconcile");
      // A family can become unavailable after the scheduler reads a batch. The failed transaction saved nothing.
      // Isolate that book so its fence cannot prevent another family's durable request from being recovered.
      for (const id of books) {
        const single = await db.rpc("reconcile_workbook_scan_progress", { p_books: [id] });
        if (single.error?.code === "55000") continue;
        if (single.error) throw new Error("scan_clock_reconcile");
        if (!reconciled(single.data, [id])) throw new Error("scan_clock_reconcile_shape");
      }
    },
    async requests(limit) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("scan_clock_request_limit");
      const { data, error } = await db.rpc("list_workbook_scan_clock_requests", { p_limit: limit });
      if (error) throw new Error("scan_clock_request_read");
      if (!Array.isArray(data) || data.length > limit) throw new Error("scan_clock_request_shape");
      const rows = data.map(request);
      if (new Set(rows.map(r=>r.deliveryAuditId)).size !== rows.length) throw new Error("scan_clock_request_shape");
      return rows;
    },
    async record(saved, calendar) {
      const { data, error } = await db.rpc("record_workbook_scan_delivery_calendar", {
        p_book: saved.workbookId, p_delivery_audit: saved.deliveryAuditId, p_delivered: saved.deliveredAt,
        p_zone: saved.timeZone, p_override: saved.zoneOverride, p_backstop: calendar.backstopAt,
        p_clock_version: calendar.clockVersion,
      });
      if (error) throw new Error("scan_clock_calendar_write");
      if (!isObject(data) || !isWriteStatus(data.status)) throw new Error("scan_clock_calendar_shape");
      return data.status;
    },
  };
}

/** This identifies the shared policy and the actual server Intl data used for a first calendar write. */
export function workbookScanClockVersion(): string {
  return `family-time/20261106;node=${process.versions.node};icu=${process.versions.icu};tz=${process.versions.tz}`;
}
