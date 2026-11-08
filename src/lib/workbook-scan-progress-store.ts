import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { normalizeTimeZone } from "@/lib/family-time";
import { isUuid } from "@/lib/workbook-content";
import type { DeliveryReceipt, DeliveryStore } from "@/lib/workbook-delivery";
import { workbookDeliveryStore } from "@/lib/workbook-delivery-store";
import { isPrintedRevision, manifestProblem, SNAPSHOT_DAY } from "@/lib/workbook-print-contract";
import type { AcceptedScanReceipt, AdmittedScanProgressEvent, ScanProgressBook } from "@/lib/workbook-scan-progress";
import type { ScanDeliveryCalendar, ScanProgressScope, ScanProgressStore, ScanTriggerClaim } from "@/lib/workbook-scan-progress-reader";

const BATCH = 500;
const MAX_ROWS = 100_000;
function fail(): never { throw new Error("scan_progress_shape"); }
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const at = (v: unknown): v is string => text(v) && Number.isFinite(Date.parse(v));
const positive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const scoped = (r: { parent_id: string; child_id: string; workbook_id: string }, s: ScanProgressScope) =>
  r.parent_id === s.parentId && r.child_id === s.childId && r.workbook_id === s.workbookId;

/**
 * Read to a proven empty tail even when PostgREST caps a batch below BATCH. Each remaining exact count must
 * decrease by exactly the retained batch. A changed collection, absent count, empty partial answer or bad key fails.
 * The explicit resource bounds fail the read; they never return a truncated progress state.
 */
async function all<T extends { id: string }>(load: (after: string | null) => PromiseLike<{
  data: T[] | null; error: unknown; count: number | null;
}>): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null, remaining: number | null = null;
  for (let request = 0; request < 1000; request++) {
    const result = await load(after);
    if (result.error) throw new Error("scan_progress_read");
    const { data, count } = result;
    if (!Array.isArray(data) || !Number.isSafeInteger(count) || count === null || count < 0 || count > MAX_ROWS
      || (remaining !== null && count !== remaining) || data.length > BATCH || data.length > count
      || (count > 0 && data.length === 0)) fail();
    for (const row of data) {
      if (!row || !isUuid(row.id) || (after !== null && row.id <= after)) fail();
      after = row.id;
      rows.push(row);
    }
    if (rows.length > MAX_ROWS) fail();
    if (count === 0) return rows;
    remaining = count - data.length;
  }
  throw new Error("scan_progress_read_bound");
}

function checkedDelivery(r: DeliveryReceipt | null, scope: ScanProgressScope, number: number): DeliveryReceipt | null {
  if (!r) return null;
  if (r.parentId !== scope.parentId || r.childId !== scope.childId || r.workbookId !== scope.workbookId || r.number !== number
    || !at(r.deliveredAt) || !positive(r.auditId) || !at(r.recordedAt)
    || !normalizeTimeZone(typeof r.timeZone === "string" ? r.timeZone : r.timeZone?.zone)
    || (typeof r.timeZone !== "string" && r.timeZone.override !== false)) fail();
  if (r.correction && (!positive(r.correction.auditId) || r.correction.auditId <= r.auditId || !isUuid(r.correction.id)
    || !at(r.correction.deliveredAt) || r.correction.deliveredAt !== r.deliveredAt)) fail();
  return r;
}

/**
 * Service-only reader. The caller must authorize a live parent/admin session before selecting scope. RLS cannot
 * authorize that caller when this client uses the service role. Every read still applies and revalidates its scope.
 * Delivery uses the existing public store; its workbook-only reads are followed by exact scope checks here.
 * Immutable facts are read with stable keys and drift checks. This is not a transaction snapshot or a write lock.
 */
export function workbookScanProgressStore(db: SupabaseClient<Database>,
  deliveries: Pick<DeliveryStore, "receipt"> = workbookDeliveryStore(db)): ScanProgressStore {
  async function bookInScope(scope: ScanProgressScope) {
    const parent = await db.from("parents").select("id,deletion_requested_at").eq("id", scope.parentId).maybeSingle();
    if (parent.error) throw new Error("scan_progress_parent_read");
    if (!parent.data || parent.data.id !== scope.parentId || parent.data.deletion_requested_at !== null) return null;
    const child = await db.from("children").select("id,parent_id").eq("parent_id", scope.parentId).eq("id", scope.childId).maybeSingle();
    if (child.error) throw new Error("scan_progress_child_read");
    if (!child.data || child.data.id !== scope.childId || child.data.parent_id !== scope.parentId) return null;
    const deleted = await db.from("child_deletions").select("child_id,parent_id")
      .eq("parent_id", scope.parentId).eq("child_id", scope.childId).maybeSingle();
    if (deleted.error) throw new Error("scan_progress_child_fence_read");
    if (deleted.data) return null;
    const book = await db.from("workbooks").select("id,parent_id,child_id,number,status,printed_revision,print_manifest")
      .eq("parent_id", scope.parentId).eq("child_id", scope.childId).eq("id", scope.workbookId).eq("status", "shipped").maybeSingle();
    if (book.error) throw new Error("scan_progress_book_read");
    const b = book.data;
    if (!b || b.id !== scope.workbookId || b.parent_id !== scope.parentId || b.child_id !== scope.childId
      || b.status !== "shipped" || !positive(b.number) || !isPrintedRevision(b.printed_revision) || !b.print_manifest) return null;
    return b;
  }
  return {
    async recheck(scope, book) {
      const b = await bookInScope(scope);
      if (!b) return false;
      return b.printed_revision === book.printedRevision && b.number === book.number
        && JSON.stringify(b.print_manifest) === JSON.stringify(book.manifest)
        && JSON.stringify(checkedDelivery(await deliveries.receipt(scope.workbookId), scope, b.number)) === JSON.stringify(book.delivery);
    },
    async read(scope) {
      if (![scope.parentId, scope.childId, scope.workbookId].every(isUuid)) return null;
      const b = await bookInScope(scope);
      if (!b) return null;
      const revision = b.printed_revision!;
      const pageRows = await all(after => {
        const q = db.from("workbook_pages").select("id,parent_id,workbook_id,page_number,page_type,day_label", { count: "exact" })
          .eq("parent_id", scope.parentId).eq("workbook_id", scope.workbookId).order("id").limit(BATCH);
        return after ? q.gt("id", after) : q;
      });
      const questions = await all(after => {
        const q = db.from("workbook_questions").select("id,parent_id,workbook_id,page_id,question_number", { count: "exact" })
          .eq("parent_id", scope.parentId).eq("workbook_id", scope.workbookId).order("id").limit(BATCH);
        return after ? q.gt("id", after) : q;
      });
      const byPage = new Map<string, { number: number }[]>();
      for (const p of pageRows) {
        if (p.parent_id !== scope.parentId || p.workbook_id !== scope.workbookId || !positive(p.page_number)
          || !text(p.page_type) || (p.day_label !== null && typeof p.day_label !== "string")) fail();
        byPage.set(p.id, []);
      }
      for (const q of questions) {
        if (q.parent_id !== scope.parentId || q.workbook_id !== scope.workbookId || !byPage.has(q.page_id) || !positive(q.question_number)) fail();
        const held = byPage.get(q.page_id)!;
        if (held.some(x => x.number === q.question_number)) fail();
        held.push({ number: q.question_number });
      }
      const pages: ScanProgressBook["pages"] = pageRows.map(p => ({ id: p.id, number: p.page_number, type: p.page_type,
        dayLabel: p.day_label, questions: byPage.get(p.id)! }));
      const m = b.print_manifest;
      if (!object(m) || !object(m.curriculum) || !text(m.curriculum.key) || !text(m.curriculum.version)
        || typeof m.testWorkbook !== "boolean" || !Array.isArray(m.days) || m.snapshotDay !== SNAPSHOT_DAY
        || new Set(pages.map(p => p.number)).size !== pages.length || manifestProblem(m, pages)
        || new Set(m.days.map(d => d.day)).size !== m.days.length || !m.days.some(d => d.day === SNAPSHOT_DAY)) return null;
      const delivery = checkedDelivery(await deliveries.receipt(scope.workbookId), scope, b.number);
      const book: ScanProgressBook = { ...scope, number: b.number, printedRevision: revision, manifest: m, pages, delivery };
      const receiptRows = await all(after => {
        const q = db.from("workbook_scan_receipts").select("id,parent_id,child_id,workbook_id,number,printed_revision,page_id,photo_revision,accepted_at,status", { count: "exact" })
          .eq("parent_id", scope.parentId).eq("child_id", scope.childId).eq("workbook_id", scope.workbookId)
          .eq("printed_revision", revision).eq("number", b.number).order("id").limit(BATCH);
        return after ? q.gt("id", after) : q;
      });
      const receipts: AcceptedScanReceipt[] = receiptRows.map(r => {
        if (!scoped(r, scope) || r.printed_revision !== revision || r.number !== b.number || r.status !== "accepted"
          || !byPage.has(r.page_id) || !isUuid(r.photo_revision) || !at(r.accepted_at)) fail();
        return { id: r.id, ...scope, printedRevision: r.printed_revision, pageId: r.page_id,
          status: "accepted", photoRevision: r.photo_revision, acceptedAt: r.accepted_at };
      });
      const byReceipt = new Map(receipts.map(r => [r.id, r]));
      const eventRows = await all(after => {
        const q = db.from("workbook_scan_progress_events").select("id,parent_id,child_id,workbook_id,printed_revision,page_id,receipt_id,item_id,reason,admitted_at,from_version,to_version", { count: "exact" })
          .eq("parent_id", scope.parentId).eq("child_id", scope.childId).eq("workbook_id", scope.workbookId)
          .eq("printed_revision", revision).order("id").limit(BATCH);
        return after ? q.gt("id", after) : q;
      });
      const progressEvents: AdmittedScanProgressEvent[] = eventRows.map(e => {
        const r = byReceipt.get(e.receipt_id);
        if (!scoped(e, scope) || e.printed_revision !== revision || !r || r.pageId !== e.page_id
          || e.reason !== "pending-evidence-resolved" || !text(e.item_id) || !at(e.admitted_at)
          || Date.parse(e.admitted_at) < Date.parse(r.acceptedAt) || !positive(e.from_version) || e.to_version !== e.from_version + 1) fail();
        return { id: e.id, ...scope, printedRevision: e.printed_revision, pageId: e.page_id, receiptId: e.receipt_id,
          reason: "pending-evidence-resolved", admittedAt: e.admitted_at, resolvedItemIds: [e.item_id] };
      });
      const rawClaim = await db.from("workbook_scan_trigger_claims").select("*").eq("parent_id", scope.parentId)
        .eq("child_id", scope.childId).eq("workbook_id", scope.workbookId).eq("printed_revision", revision).maybeSingle();
      if (rawClaim.error) throw new Error("scan_progress_claim_read");
      const c = rawClaim.data;
      let claim: ScanTriggerClaim | null = null;
      if (c) {
        if (!scoped(c, scope) || c.printed_revision !== revision || c.number !== b.number || !isUuid(c.id)
          || !["day7_scanned", "delivery_backstop"].includes(c.reason) || !at(c.claimed_at) || !at(c.effective_at)
          || !positive(c.delivery_audit_id) || !at(c.delivered_at) || !normalizeTimeZone(c.time_zone) || typeof c.zone_override !== "boolean"
          || (c.delivery_correction_id !== null && !isUuid(c.delivery_correction_id))
          || (c.backstop_at !== null && !at(c.backstop_at)) || (c.reason === "delivery_backstop" && c.backstop_at === null)
          || !Array.isArray(c.receipt_ids) || c.receipt_ids.length === 0 || new Set(c.receipt_ids).size !== c.receipt_ids.length
          || c.receipt_ids.some(id => !byReceipt.has(id))) fail();
        claim = { id: c.id, reason: c.reason === "day7_scanned" ? "day7_scanned" : "delivery_backstop",
          claimedAt: c.claimed_at, effectiveAt: c.effective_at, deliveryAuditId: c.delivery_audit_id,
          deliveryCorrectionId: c.delivery_correction_id, deliveredAt: c.delivered_at, timeZone: c.time_zone,
          zoneOverride: c.zone_override, backstopAt: c.backstop_at, receiptIds: c.receipt_ids };
      }
      async function calendar(auditId: number): Promise<ScanDeliveryCalendar | null> {
        const result = await db.from("workbook_scan_delivery_calendars").select("*").eq("parent_id", scope.parentId)
          .eq("child_id", scope.childId).eq("delivery_audit_id", auditId).maybeSingle();
        if (result.error) throw new Error("scan_progress_calendar_read");
        const r = result.data;
        if (!r) return null;
        if (r.parent_id !== scope.parentId || r.child_id !== scope.childId || r.delivery_audit_id !== auditId
          || !at(r.backstop_at) || !at(r.recorded_at) || !text(r.clock_version)) fail();
        return { deliveryAuditId: r.delivery_audit_id, backstopAt: r.backstop_at, recordedAt: r.recorded_at, clockVersion: r.clock_version };
      }
      const audit = delivery ? delivery.correction?.auditId ?? delivery.auditId : null;
      const currentCalendar = audit === null ? null : await calendar(audit);
      const claimCalendar = !claim ? null : claim.deliveryAuditId === audit ? currentCalendar : await calendar(claim.deliveryAuditId);
      if (claim?.backstopAt && claimCalendar && claim.backstopAt !== claimCalendar.backstopAt) fail();
      let clockRequestPresent = false;
      let hold = null;
      if (audit !== null && delivery) {
        const request = await db.from("workbook_scan_clock_requests").select("*").eq("parent_id", scope.parentId)
          .eq("child_id", scope.childId).eq("workbook_id", scope.workbookId).eq("printed_revision", revision)
          .eq("delivery_audit_id", audit).maybeSingle();
        if (request.error) throw new Error("scan_progress_request_read");
        const r = request.data;
        if (r && (!scoped(r, scope) || r.printed_revision !== revision || r.number !== b.number || r.delivery_audit_id !== audit
          || Date.parse(r.delivered_at) !== Date.parse(delivery.deliveredAt) || !at(r.requested_at)
          || r.delivery_correction_id !== (delivery.correction?.id ?? null)
          || r.time_zone !== (typeof delivery.timeZone === "string" ? delivery.timeZone : delivery.timeZone.zone)
          || r.zone_override !== (typeof delivery.timeZone === "string"))) fail();
        clockRequestPresent = r !== null;
        if (currentCalendar && !r) fail();
        const held = await db.from("workbook_scan_backstop_holds").select("*").eq("parent_id", scope.parentId)
          .eq("child_id", scope.childId).eq("workbook_id", scope.workbookId).eq("printed_revision", revision)
          .eq("delivery_audit_id", audit).maybeSingle();
        if (held.error) throw new Error("scan_progress_hold_read");
        const h = held.data;
        if (h) {
          if (!scoped(h, scope) || h.printed_revision !== revision || h.delivery_audit_id !== audit
            || h.reason !== "no-accepted-scans-at-backstop" || !at(h.held_at) || !at(h.delivered_at) || !at(h.backstop_at)
            || Date.parse(h.delivered_at) !== Date.parse(delivery.deliveredAt) || h.backstop_at !== currentCalendar?.backstopAt) fail();
          hold = { deliveryAuditId: h.delivery_audit_id, heldAt: h.held_at, deliveredAt: h.delivered_at,
            backstopAt: h.backstop_at, reason: "no-accepted-scans-at-backstop" as const };
        }
      } else if (claim) fail();
      // No partially read result after a deletion fence, book change, or effective delivery correction.
      const end = await bookInScope(scope);
      if (!end) return null;
      if (JSON.stringify(end) !== JSON.stringify(b)
        || JSON.stringify(checkedDelivery(await deliveries.receipt(scope.workbookId), scope, b.number)) !== JSON.stringify(delivery)) {
        throw new Error("scan_progress_changed");
      }
      return { book, receipts, progressEvents, currentCalendar, clockRequestPresent, claim, claimCalendar, hold };
    },
  };
}
