import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { parentWorkbookAnswerSource } from "@/lib/parent-workbook-answers-server";
import { readParentWorkbookAnswers } from "@/lib/parent-workbook-answers";
import { sampleWorkbook } from "@/lib/workbook-sample";
vi.mock("server-only", () => ({}));
const PARENT = "11111111-1111-4111-8111-111111111111", CHILD = "22222222-2222-4222-8222-222222222222", BOOK = "33333333-3333-4333-8333-333333333333", FOREIGN = "44444444-4444-4444-8444-444444444444";
const NOW = Date.parse("2026-11-06T20:00:00Z");
type Row = Record<string, unknown>;
function family() {
  const sample = sampleWorkbook({ workbookId: BOOK, childId: CHILD, parentId: PARENT, qrTokens: ["sample-token-00000001", "sample-token-00000002", "sample-token-00000003"] });
  const rows: Record<string, Row[]> = {
    children: [{ id: CHILD, parent_id: PARENT, first_name: "Leah" }, { id: FOREIGN, parent_id: FOREIGN, first_name: "Another family" }],
    workbooks: [{ id: BOOK, parent_id: PARENT, child_id: CHILD, number: 1, status: "shipped", created_at: "2026-10-01", approved_at: null, printed_at: null, shipped_at: "2026-11-01", levels: [10], pdf_path: "PRIVATE PDF", profile_build: null, printed_revision: null, pdf_sha256: null, print_manifest: null }],
    workbook_pages: sample.pages.map(p => ({ id: `page-${p.number}`, workbook_id: BOOK, page_number: p.number, day_label: p.dayLabel, page_type: p.type, image_path: p.image?.path ?? null, image_width: p.image?.width ?? null, image_height: p.image?.height ?? null, qr_token: p.qrToken, print_contract: null })),
    workbook_questions: sample.pages.flatMap(p => p.questions.map(q => ({ page_id: `page-${p.number}`, workbook_id: BOOK, question_number: q.number, schema_version: 2, package: q.package, box_x: q.box.x, box_y: q.box.y, box_width: q.box.width, box_height: q.box.height, regions: null, teaching: null }))),
    workbook_delivery_receipts: [{ workbook_id: BOOK, parent_id: PARENT, child_id: CHILD, number: 1, delivered_at: "2026-11-03T20:00:00Z", recorded_at: "2026-11-03T21:00:00Z", local_time: "2026-11-03T13:00", time_zone: "America/Vancouver", zone_override: true, actor_id: PARENT, audit_id: 1 }],
    workbook_delivery_corrections: [],
  };
  const reads: string[] = [], writes = vi.fn(() => { throw new Error("No writes or signers"); });
  const db = {
    from(table: string) {
      reads.push(table);
      const filters: Array<[string, unknown]> = []; let order: { column: string; ascending: boolean } | null = null, limit = Infinity;
      const execute = () => {
        const values = (rows[table] ?? []).filter(row => filters.every(([key, value]) => row[key] === value));
        if (order) { const by = order; values.sort((a, b) => ((a[by.column] as number) > (b[by.column] as number) ? 1 : -1) * (by.ascending ? 1 : -1)); }
        return { data: values.slice(0, limit), error: null };
      };
      const query = { select: () => query, eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        order: (column: string, options?: { ascending?: boolean }) => { order = { column, ascending: options?.ascending ?? true }; return query; },
        limit: (n: number) => { limit = n; return query; }, maybeSingle: async () => ({ ...execute(), data: execute().data[0] ?? null }),
        then: (resolve: (result: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve),
      };
      return query;
    }, storage: new Proxy({}, { get: writes }), rpc: writes,
  };
  return { rows, reads, writes, source: parentWorkbookAnswerSource(db as unknown as SupabaseClient<Database>, PARENT) };
}
it("uses the session source to release all eight stored answers only after the effective receipt, with no file signing", async () => {
  const f = family();
  const request = { parentId: PARENT, childId: CHILD, workbookId: BOOK };
  expect((await readParentWorkbookAnswers(f.source, request, NOW))?.pages.flatMap(p => p.questions)).toHaveLength(8);
  expect(f.reads).not.toContain("scan_photos"); expect(f.writes).not.toHaveBeenCalled();
  f.rows.workbook_delivery_receipts = []; f.reads.length = 0;
  expect(await readParentWorkbookAnswers(f.source, request, NOW)).toBeNull();
  expect(f.reads).not.toContain("workbook_questions");
});
it("checks the parent's child and workbook without relying on RLS in the test database", async () => {
  const f = family();
  expect(await readParentWorkbookAnswers(f.source, { parentId: PARENT, childId: FOREIGN, workbookId: BOOK }, NOW)).toBeNull();
  f.rows.workbooks[0].parent_id = FOREIGN;
  expect(await readParentWorkbookAnswers(f.source, { parentId: PARENT, childId: CHILD, workbookId: BOOK }, NOW)).toBeNull();
  expect(f.reads).not.toContain("workbook_questions"); expect(f.writes).not.toHaveBeenCalled();
});
it("applies the latest correction and a retraction through the real delivery reader", async () => {
  const f = family(), request = { parentId: PARENT, childId: CHILD, workbookId: BOOK };
  const original = f.rows.workbook_delivery_receipts[0];
  f.rows.workbook_delivery_corrections = [
    { ...original, id: "older", delivered_at: "2026-11-04T20:00:00Z", audit_id: 2, previous_delivered_at: original.delivered_at },
    { ...original, id: "newer", delivered_at: "2026-11-07T20:00:00Z", audit_id: 3, previous_delivered_at: original.delivered_at },
  ];
  expect(await readParentWorkbookAnswers(f.source, request, NOW)).toBeNull(); expect(f.reads).not.toContain("workbook_questions");
  f.rows.workbook_delivery_corrections[1].delivered_at = "2026-11-05T20:00:00Z";
  expect((await readParentWorkbookAnswers(f.source, request, NOW))?.pages).toHaveLength(2);
  f.rows.workbook_delivery_receipts = [];
  expect(await readParentWorkbookAnswers(f.source, request, NOW)).toBeNull();
});
