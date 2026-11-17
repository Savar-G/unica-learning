import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScanProgressSnapshot } from "@/lib/workbook-scan-progress-reader";
import type { HistoryRecord } from "@/lib/scan-history";
const fake = vi.hoisted(() => ({ snapshot: null as ScanProgressSnapshot | null, batches: [] as HistoryRecord[][], filters: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => ({}) }));
vi.mock("@/lib/workbook-scan-progress-store", () => ({ workbookScanProgressStore: () => ({ read: async () => fake.snapshot, recheck: async () => true }) }));
vi.mock("@/lib/scan-history-reader", () => ({ scanHistoryStore: () => ({ read: async (filter: unknown) => { fake.filters.push(filter); const pages = fake.batches.shift(); return pages ? { pages, admin: true, budget: null } : null; } }) }));
import { loadCustomerBook } from "@/lib/customer-activity-server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { parentId: id(1), childId: id(2), workbookId: id(3) }, revision = "a".repeat(28);
const admin = { db: createClient<Database>("https://synthetic.supabase.co", "fake"), userId: id(4), email: "synthetic@example.invalid" };
beforeEach(() => {
  vi.clearAllMocks(); fake.filters = [];
  // UUID order is the reverse of printed page order. This detects the scoped history reader's reordering.
  const pages = [1, 2].map(n => ({ id: id(10+n), number: 3-n, type: "practice", dayLabel: "Day 7", questions: [{}] }));
  fake.snapshot = { book: { ...scope, number: 1, printedRevision: revision, pages, delivery: null,
    manifest: { version: 1, curriculum: { key: "bc", version: "frozen" }, snapshotDay: 7, testWorkbook: false, days: [{ day: 7, pages: [1, 2] }], levelTest: null } },
    receipts: [], clockRequestPresent: false, currentCalendar: null, claim: null, claimCalendar: null, hold: null };
  const records: HistoryRecord[] = pages.map(p => ({ id: p.id, childId: scope.childId, childName: "Child", workbookId: scope.workbookId, book: 1, revision, day: "Day 7", pageNumber: p.number, marks: [], photos: [], jobs: [], spend: [] }));
  fake.batches = [[records[0]], [records[1]], []];
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("uses canonical UUID paging through an empty tail, independently of printed order", async () => {
  const result = await loadCustomerBook(admin, scope.parentId, scope.childId, scope.workbookId);
  expect(result?.status).toBe("available"); expect(result?.canonicalPages?.map(p => p.id)).toEqual([id(11), id(12)]);
  expect(fake.filters).toEqual([{ child: scope.childId, workbook: scope.workbookId, status: "all", after: undefined }, { child: scope.childId, workbook: scope.workbookId, status: "all", after: id(11) }, { child: scope.childId, workbook: scope.workbookId, status: "all", after: id(12) }]);
});
it("does not invent marking zero when a later history page is unavailable", async () => {
  fake.batches.length = 1;
  const result = await loadCustomerBook(admin, scope.parentId, scope.childId, scope.workbookId);
  expect(result?.canonicalPages).toBeNull();
  expect(result?.progress.pages.every(p => p.markingStatus === null)).toBe(true);
});
it("rejects a book outside the checked family, child and workbook scope", async () => {
  fake.snapshot!.book.parentId = id(99);
  expect(await loadCustomerBook(admin, scope.parentId, scope.childId, scope.workbookId)).toBeNull();
});
