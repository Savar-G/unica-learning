import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { readWorkbookScanProgress } from "@/lib/workbook-scan-progress-reader";
import { workbookScanProgressStore } from "@/lib/workbook-scan-progress-store";
vi.mock("server-only", () => ({}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { parentId: id(1), childId: id(2), workbookId: id(3) };
const revision = "a".repeat(28), delivered = "2026-10-01T12:00:00.000Z";
const now = Date.parse("2026-11-06T18:00:00Z");
const identity = { parent_id: scope.parentId, child_id: scope.childId, workbook_id: scope.workbookId, printed_revision: revision };
const receipt = (n = 0, page = id(101), accepted = "2026-10-03T12:00:00.000Z") => ({ ...identity,
  id: id(3000 + n), number: 2, page_id: page, photo_revision: id(5000 + n), accepted_at: accepted, status: "accepted" });
const event = (n = 0, receiptId = id(3001), page = id(101)) => ({ ...identity,
  id: id(7000 + n), receipt_id: receiptId, page_id: page, item_id: `item-${n}`, reason: "pending-evidence-resolved",
  admitted_at: "2026-11-01T12:00:00.000Z", from_version: 1, to_version: 2 });
const calendar = (audit = 11, deadline = "2026-10-22T12:00:00.000Z") => ({ parent_id: scope.parentId, child_id: scope.childId,
  delivery_audit_id: audit, backstop_at: deadline, recorded_at: "2026-10-02T12:00:00.000Z", clock_version: "stored-clock" });
const request = (audit = 11, deliveredAt = delivered, correction: string | null = null) => ({ ...identity, number: 2,
  delivery_audit_id: audit, delivered_at: deliveredAt, delivery_correction_id: correction,
  time_zone: "UTC", zone_override: true, requested_at: "2026-10-02T12:00:00.000Z" });
type Row = Record<string, unknown>;
type Call = { table: string; params: URLSearchParams; method: string; prefer: string | null };
type Reply = { data: unknown; count?: number | null; status?: number };
function setup(options: { cap?: number; hook?: (call: Call, data: Row[], count: number, calls: Call[]) => Reply | undefined } = {}) {
  const tables: Record<string, Row[]> = {
    parents: [{ id: scope.parentId, deletion_requested_at: null }], children: [{ id: scope.childId, parent_id: scope.parentId }], child_deletions: [],
    workbooks: [{ id: scope.workbookId, parent_id: scope.parentId, child_id: scope.childId, number: 2, status: "shipped", printed_revision: revision,
      print_manifest: { version: 1, curriculum: { key: "synthetic", version: "fixed" }, testWorkbook: false, snapshotDay: 7,
        days: [{ day: 1, pages: [1] }, { day: 7, pages: [2, 3] }], levelTest: null } }],
    workbook_pages: ["Day 1", "Day 7", "Day 7", "Extra practice", null].map((day_label, i) => ({ id: id(100 + i),
      parent_id: scope.parentId, workbook_id: scope.workbookId, page_number: i + 1, page_type: i === 4 ? "cover" : "practice", day_label })),
    workbook_questions: Array.from({ length: 4 }, (_, i) => ({ id: id(200 + i), parent_id: scope.parentId,
      workbook_id: scope.workbookId, page_id: id(100 + i), question_number: 1 })),
    workbook_delivery_receipts: [{ workbook_id: scope.workbookId, parent_id: scope.parentId, child_id: scope.childId, number: 2,
      delivered_at: delivered, local_time: "2026-10-01T12:00", time_zone: "UTC", zone_override: true,
      recorded_at: "2026-10-02T12:00:00.000Z", actor_id: id(9), audit_id: 11 }],
    workbook_delivery_corrections: [], workbook_scan_receipts: [], workbook_scan_progress_events: [],
    workbook_scan_delivery_calendars: [calendar()], workbook_scan_clock_requests: [request()],
    workbook_scan_trigger_claims: [], workbook_scan_backstop_holds: [],
  };
  const calls: Call[] = [];
  const db = createClient<Database>("https://progress.example.invalid", "synthetic-test-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const call = { table: url.pathname.split("/").at(-1)!, params: url.searchParams,
        method: init?.method ?? "GET", prefer: new Headers(init?.headers).get("prefer") };
      calls.push(call);
      let rows = [...(tables[call.table] ?? [])];
      for (const [key, value] of call.params) {
        if (value.startsWith("eq.")) rows = rows.filter(r => String(r[key]) === value.slice(3));
        if (value.startsWith("gt.")) rows = rows.filter(r => String(r[key]) > value.slice(3));
      }
      const order = call.params.get("order")?.split(".");
      if (order) rows.sort((a, b) => (a[order[0]]! < b[order[0]]! ? -1 : a[order[0]]! > b[order[0]]! ? 1 : 0) * (order[1] === "desc" ? -1 : 1));
      const count = rows.length;
      rows = rows.slice(0, Math.min(Number(call.params.get("limit") ?? Infinity), options.cap ?? Infinity));
      const reply = options.hook?.(call, rows, count, calls) ?? { data: rows, count };
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (reply.count !== null && call.prefer?.includes("count=exact")) headers["Content-Range"] = `*/${reply.count ?? count}`;
      return new Response(JSON.stringify(reply.data), { status: reply.status ?? 200, headers });
    } },
  });
  return { tables, calls, db, store: workbookScanProgressStore(db) };
}

describe("typed scan progress store through the real Supabase client", () => {
  it("loads stored page shape, retained acceptance and genuine event identities without reading photos or answers", async () => {
    const s = setup();
    s.tables.workbook_scan_receipts = [receipt(), receipt(1, id(101), "2026-10-15T12:00:00.000Z"), receipt(2, id(103))];
    s.tables.workbook_scan_progress_events = [event()];
    const snapshot = await s.store.read(scope);
    expect(snapshot?.book.pages.map(p => [p.id, p.number, p.questions.length])).toEqual([
      [id(100), 1, 1], [id(101), 2, 1], [id(102), 3, 1], [id(103), 4, 1], [id(104), 5, 0],
    ]);
    expect(snapshot?.progressEvents).toEqual([{ ...scope, id: id(7000), printedRevision: revision, pageId: id(101),
      receiptId: id(3001), reason: "pending-evidence-resolved", admittedAt: "2026-11-01T12:00:00.000Z", resolvedItemIds: ["item-0"] }]);
    const result = await readWorkbookScanProgress(s.store, scope, now);
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.progress.acceptedPageCount).toBe(2);
    expect(result.progress.lastQualifyingScanAt).toBe("2026-10-15T12:00:00.000Z");
    expect(result.progress.days.find(d => d.day === 7)).toMatchObject({ complete: false, gaps: [id(102)] });
    expect(result.progress.pages.find(p => p.pageId === id(101))).toMatchObject({ scanned: true, reviewReady: null, markingStatus: null });
    expect(s.calls.every(c => c.method === "GET")).toBe(true);
    expect(s.calls.every(c => !/photo|marking|profile|draft|run|storage/.test(c.table))).toBe(true);
    expect(s.calls.find(c => c.table === "workbook_questions")?.params.get("select")).not.toMatch(/package|teaching|answer|cost/);
  });

  it("retains more than 1000 pages, questions, receipts, events and retakes with a server cap below the requested batch", async () => {
    const s = setup({ cap: 137 });
    const count = 1205;
    s.tables.workbook_pages = Array.from({ length: count }, (_, n) => ({ id: id(10000 + n), parent_id: scope.parentId,
      workbook_id: scope.workbookId, page_number: n + 1, page_type: "practice", day_label: n === count - 1 ? "Day 7" : "Extra practice" }));
    s.tables.workbook_questions = s.tables.workbook_pages.map((p, n) => ({ id: id(20000 + n), parent_id: scope.parentId,
      workbook_id: scope.workbookId, page_id: p.id, question_number: 1 }));
    s.tables.workbooks[0].print_manifest = { version: 1, curriculum: { key: "synthetic", version: "fixed" }, testWorkbook: false,
      snapshotDay: 7, days: [{ day: 7, pages: [count] }], levelTest: null };
    const page = id(10000 + count - 1);
    s.tables.workbook_scan_receipts = [receipt(0, page), ...Array.from({ length: count }, (_, n) => receipt(n + 1, page, "2026-10-15T12:00:00.000Z"))];
    s.tables.workbook_scan_progress_events = Array.from({ length: count }, (_, n) => event(n, id(3001 + n), page));
    const snapshot = await s.store.read(scope);
    expect(snapshot?.book.pages).toHaveLength(count);
    expect(snapshot?.book.pages.reduce((n, p) => n + p.questions.length, 0)).toBe(count);
    expect(snapshot?.receipts.map(r => r.id)).toEqual(s.tables.workbook_scan_receipts.map(r => r.id));
    expect(snapshot?.progressEvents?.map(e => e.id)).toEqual(s.tables.workbook_scan_progress_events.map(e => e.id));
    const result = await readWorkbookScanProgress(s.store, scope, now);
    if (result.status !== "available") throw new Error("expected progress");
    expect(result.progress.acceptedPageCount).toBe(1);
    expect(result.progress.day7Ready).toBe(true);
    expect(result.progress.pages.find(p => p.pageId === page)?.receiptIds).toHaveLength(count + 1);
    for (const table of ["workbook_pages", "workbook_questions", "workbook_scan_receipts", "workbook_scan_progress_events"]) {
      const calls = s.calls.filter(c => c.table === table);
      expect(calls.length).toBeGreaterThan(10);
      expect(calls.every(c => c.params.get("order") === "id.asc" && c.params.get("limit") === "500" && c.prefer?.includes("count=exact"))).toBe(true);
      expect(calls[1].params.get("id")).toMatch(/^gt\./);
    }
  });

  it("applies every available scope filter even with service credentials", async () => {
    const s = setup();
    await s.store.read(scope);
    for (const c of s.calls) {
      if (c.table === "parents") expect(c.params.get("id")).toBe(`eq.${scope.parentId}`);
      else if (!c.table.startsWith("workbook_delivery_")) expect(c.params.get("parent_id")).toBe(`eq.${scope.parentId}`);
      if (["children", "child_deletions"].includes(c.table)) expect(c.params.get(c.table === "children" ? "id" : "child_id")).toBe(`eq.${scope.childId}`);
      if (c.table === "workbooks") expect(c.params.get("child_id")).toBe(`eq.${scope.childId}`);
      if (c.table.startsWith("workbook_scan_") && c.table !== "workbook_scan_delivery_calendars") {
        expect(c.params.get("child_id")).toBe(`eq.${scope.childId}`);
        expect(c.params.get("workbook_id")).toBe(`eq.${scope.workbookId}`);
        expect(c.params.get("printed_revision")).toBe(`eq.${revision}`);
      }
    }
  });

  it.each(["parent", "child", "workbook", "unshipped", "legacy", "frozen", "deleted-child"])("refuses %s before loading progress", async kind => {
    const s = setup();
    if (kind === "parent") s.tables.parents = [];
    if (kind === "child") s.tables.children[0].parent_id = id(88);
    if (kind === "workbook") s.tables.workbooks[0].child_id = id(88);
    if (kind === "unshipped") s.tables.workbooks[0].status = "approved";
    if (kind === "legacy") s.tables.workbooks[0].printed_revision = null;
    if (kind === "frozen") s.tables.parents[0].deletion_requested_at = delivered;
    if (kind === "deleted-child") s.tables.child_deletions = [{ child_id: scope.childId, parent_id: scope.parentId }];
    expect(await readWorkbookScanProgress(s.store, scope, now)).toEqual({ status: "unavailable" });
    expect(s.calls.some(c => c.table === "workbook_scan_receipts")).toBe(false);
  });

  it.each([null, {}, { version: 88 }, { days: [null] }, { days: [{ day: 7, pages: [999] }] }])("refuses an unsupported stored manifest", async change => {
    const s = setup();
    s.tables.workbooks[0].print_manifest = change && Object.keys(change).length
      ? { ...(s.tables.workbooks[0].print_manifest as Row), ...change } : change;
    expect(await s.store.read(scope)).toBeNull();
  });

  it.each(["missing-count", "empty-partial", "repeated-key", "count-drift", "nonarray", "http-error"])("fails on incomplete pagination: %s", async kind => {
    const s = setup({ cap: 1, hook: (call, rows, count, calls) => {
      if (call.table !== "workbook_pages") return;
      const index = calls.filter(c => c.table === call.table).length;
      if (kind === "missing-count") return { data: rows, count: null };
      if (kind === "empty-partial") return { data: [], count };
      if (kind === "repeated-key" && index === 2) return { data: [{ ...rows[0], id: id(100) }], count };
      if (kind === "count-drift" && index === 2) return { data: rows, count: count + 1 };
      if (kind === "nonarray") return { data: {} };
      if (kind === "http-error") return { data: { message: "private diagnostic", code: "XX000" }, status: 500 };
    } });
    await expect(s.store.read(scope)).rejects.toThrow(/scan_progress_/);
  });

  it.each(["foreign-page", "foreign-receipt", "wrong-revision", "bad-status", "bad-time", "missing-receipt", "wrong-event-page", "bad-event-version"])("rejects malformed or substituted rows: %s", async kind => {
    const s = setup({ hook: (call, rows, count) => {
      if (!rows.length) return;
      if (kind === "foreign-page" && call.table === "workbook_pages") return { data: [{ ...rows[0], parent_id: id(88) }, ...rows.slice(1)], count };
      if (call.table === "workbook_scan_receipts") {
        const change = kind === "foreign-receipt" ? { child_id: id(88) } : kind === "wrong-revision" ? { printed_revision: "b".repeat(28) }
          : kind === "bad-status" ? { status: "saved" } : kind === "bad-time" ? { accepted_at: "invalid" } : {};
        return { data: [{ ...rows[0], ...change }, ...rows.slice(1)], count };
      }
    } });
    s.tables.workbook_scan_receipts = [receipt(), receipt(1)];
    s.tables.workbook_scan_progress_events = [event()];
    if (kind === "missing-receipt") s.tables.workbook_scan_progress_events[0].receipt_id = id(99);
    if (kind === "wrong-event-page") s.tables.workbook_scan_progress_events[0].page_id = id(102);
    if (kind === "bad-event-version") s.tables.workbook_scan_progress_events[0].to_version = 4;
    await expect(s.store.read(scope)).rejects.toThrow("scan_progress_shape");
  });

  it("retains scans with missing delivery and never borrows another numbered book's receipt", async () => {
    const s = setup();
    s.tables.workbook_scan_receipts = [receipt()];
    s.tables.workbook_delivery_receipts[0].workbook_id = id(90);
    s.tables.workbook_delivery_receipts[0].number = 1;
    const result = await readWorkbookScanProgress(s.store, scope, now);
    if (result.status !== "available") throw new Error("expected progress");
    expect(result.progress.acceptedPageCount).toBe(1);
    expect(result.progress.delivery).toEqual({ status: "missing" });
    expect(result.progress.candidate).toBeNull();
    expect(result.persisted.clock.status).toBe("missing-delivery");
  });

  it("does not move inactivity for an unchanged accepted retake without a durable resolution event", async () => {
    const s = setup();
    s.tables.workbook_scan_receipts = [receipt(), receipt(1, id(101), "2026-11-05T12:00:00.000Z")];
    const result = await readWorkbookScanProgress(s.store, scope, now);
    if (result.status !== "available") throw new Error("expected progress");
    expect(result.progress.acceptedPageCount).toBe(1);
    expect(result.progress.pages.find(p => p.pageId === id(101))?.receiptIds).toHaveLength(2);
    expect(result.progress.lastQualifyingScanAt).toBe(receipt().accepted_at);
  });

  it("revalidates delivery scope through the existing public delivery store", async () => {
    const s = setup();
    s.tables.workbook_delivery_receipts[0].child_id = id(88);
    await expect(s.store.read(scope)).rejects.toThrow("scan_progress_shape");
  });

  it("keeps clock-required visible even when runtime projection suggests backstop readiness", async () => {
    const s = setup();
    s.tables.workbook_scan_receipts = [receipt()];
    s.tables.workbook_scan_delivery_calendars = [];
    s.tables.workbook_scan_clock_requests = [];
    const result = await readWorkbookScanProgress(s.store, scope, now);
    if (result.status !== "available") throw new Error("expected progress");
    expect(result.progress.candidate).toBe("delivery_backstop");
    expect(result.persisted.clock).toMatchObject({ status: "clock-required", requestPresent: false, calendar: null });
    expect(result.persisted.claim).toBeNull();
  });

  it("exposes stored HOLD for zero scans with no next-book claim", async () => {
    const s = setup();
    s.tables.workbook_scan_backstop_holds = [{ ...identity, delivery_audit_id: 11, delivered_at: delivered,
      backstop_at: calendar().backstop_at, held_at: "2026-10-22T12:00:01.000Z", reason: "no-accepted-scans-at-backstop" }];
    const result = await readWorkbookScanProgress(s.store, scope, now);
    if (result.status !== "available") throw new Error("expected progress");
    expect(result.progress.holdReason).toBe("no-accepted-scans-at-backstop");
    expect(result.progress.candidate).toBeNull();
    expect(result.persisted.hold?.deliveryAuditId).toBe(11);
    expect(result.persisted.claim).toBeNull();
  });

  it.each([false, true])("preserves a historical null Day 7 claim across correction; later matching calendar: %s", async laterCalendar => {
    const s = setup();
    s.tables.workbook_scan_receipts = [receipt(), receipt(1, id(102))];
    s.tables.workbook_scan_trigger_claims = [{ ...identity, id: id(8000), number: 2, reason: "day7_scanned",
      claimed_at: "2026-10-03T12:00:01.000Z", effective_at: "2026-10-03T12:00:01.000Z", delivery_audit_id: 11,
      delivery_correction_id: null, delivered_at: delivered, time_zone: "UTC", zone_override: true, backstop_at: null,
      receipt_ids: [id(3000), id(3001)] }];
    const corrected = "2026-10-05T12:00:00.000Z";
    s.tables.workbook_delivery_corrections = [{ ...identity, id: id(9000), audit_id: 22, delivered_at: corrected,
      local_time: "2026-10-05T12:00", reason: "synthetic correction", previous_delivered_at: delivered,
      recorded_at: "2026-10-06T12:00:00.000Z", actor_id: id(9) }];
    s.tables.workbook_scan_clock_requests = [request(22, corrected, id(9000))];
    // Deliberately differs from today's computed deadline. The persisted value must remain visible.
    s.tables.workbook_scan_delivery_calendars = [calendar(22, "2026-10-26T12:01:00.000Z"), ...(laterCalendar ? [calendar()] : [])];
    const result = await readWorkbookScanProgress(s.store, scope, now);
    if (result.status !== "available") throw new Error("expected progress");
    expect(result.persisted.claim).toMatchObject({ deliveryAuditId: 11, backstopAt: null, deliveredAt: delivered });
    expect(result.persisted.claimCalendar?.deliveryAuditId ?? null).toBe(laterCalendar ? 11 : null);
    expect(result.persisted.clock.calendar).toMatchObject({ deliveryAuditId: 22, backstopAt: "2026-10-26T12:01:00.000Z" });
    expect(result.progress.delivery).toMatchObject({ deliveredAt: corrected, backstopAt: "2026-10-26T12:00:00.000Z" });
  });

  it.each(["unknown-reason", "missing-captured-receipt", "backstop-without-deadline", "bad-calendar-time", "foreign-calendar", "wrong-request-audit", "wrong-request-zone", "calendar-without-request", "wrong-hold-deadline"])("refuses malformed durable state: %s", async kind => {
    const s = setup({ hook: (call, rows, count) => {
      if (!rows.length) return;
      if (kind === "foreign-calendar" && call.table === "workbook_scan_delivery_calendars") return { data: [{ ...rows[0], child_id: id(99) }], count };
      if (kind === "wrong-request-audit" && call.table === "workbook_scan_clock_requests") return { data: [{ ...rows[0], delivery_audit_id: 33 }], count };
    } });
    s.tables.workbook_scan_receipts = [receipt()];
    s.tables.workbook_scan_trigger_claims = [{ ...identity, id: id(8000), number: 2, reason: "day7_scanned",
      claimed_at: "2026-10-03T12:00:01.000Z", effective_at: "2026-10-03T12:00:01.000Z", delivery_audit_id: 11,
      delivery_correction_id: null, delivered_at: delivered, time_zone: "UTC", zone_override: true, backstop_at: null, receipt_ids: [id(3000)] }];
    if (kind === "unknown-reason") s.tables.workbook_scan_trigger_claims[0].reason = "queued";
    if (kind === "missing-captured-receipt") s.tables.workbook_scan_trigger_claims[0].receipt_ids = [id(99)];
    if (kind === "backstop-without-deadline") s.tables.workbook_scan_trigger_claims[0].reason = "delivery_backstop";
    if (kind === "bad-calendar-time") s.tables.workbook_scan_delivery_calendars[0].backstop_at = "invalid";
    if (kind === "wrong-request-zone") s.tables.workbook_scan_clock_requests[0].zone_override = false;
    if (kind === "calendar-without-request") s.tables.workbook_scan_clock_requests = [];
    if (kind === "wrong-hold-deadline") s.tables.workbook_scan_backstop_holds = [{ ...identity, delivery_audit_id: 11,
      delivered_at: delivered, backstop_at: "2026-10-23T12:00:00.000Z", held_at: "2026-10-24T12:00:00.000Z", reason: "no-accepted-scans-at-backstop" }];
    await expect(s.store.read(scope)).rejects.toThrow("scan_progress_shape");
  });

  it("refuses an oversized retained collection instead of returning a partial book", async () => {
    const s = setup({ hook: (call, data) => call.table === "workbook_pages" ? { data, count: 100001 } : undefined });
    await expect(s.store.read(scope)).rejects.toThrow("scan_progress_shape");
  });

  it("reloading a numbered book preserves its exact delivery and does not move its scan anchor", async () => {
    const s = setup();
    s.tables.workbook_scan_receipts = [receipt()];
    const first = await readWorkbookScanProgress(s.store, scope, now);
    const second = await readWorkbookScanProgress(s.store, scope, now);
    expect(second).toEqual(first);
    expect(first.status).toBe("available");
    if (first.status !== "available") return;
    expect(first.number).toBe(2);
    expect(first.persisted.clock.deliveryAuditId).toBe(11);
    expect(first.progress.lastQualifyingScanAt).toBe(receipt().accepted_at);
  });

  it.each(["family-freeze", "child-delete", "delivery-correction"])("fails closed when %s arrives during the read", async kind => {
    const s = setup({ hook: call => {
      if (call.table === "workbook_scan_progress_events") {
        if (kind === "family-freeze") s.tables.parents[0].deletion_requested_at = delivered;
        if (kind === "child-delete") s.tables.child_deletions = [{ child_id: scope.childId, parent_id: scope.parentId }];
        if (kind === "delivery-correction") s.tables.workbook_delivery_receipts[0].delivered_at = "2026-10-02T12:00:00.000Z";
      }
      return undefined;
    } });
    if (kind === "delivery-correction") await expect(s.store.read(scope)).rejects.toThrow("scan_progress_changed");
    else expect(await s.store.read(scope)).toBeNull();
  });
});
