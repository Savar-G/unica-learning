import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const reads = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => ({ from: () => ({}) }) }));
vi.mock("@/lib/workbook-scan-progress-store", () => ({ workbookScanProgressStore: () => ({}) }));
vi.mock("@/lib/scan-history-reader", () => ({ scanHistoryStore: () => ({}) }));
vi.mock("@/lib/workbook-scan-progress-reader", () => ({
  readWorkbookScanProgress: async () => { reads.count++; return { status: "available" }; },
}));
vi.mock("@/lib/admin-scan-progress", () => ({ adminScanProgress: () => ({ held: true, number: 1 }) }));

import { HOLD_CHECK, HOLD_READ, loadAdminScanHolds } from "@/lib/admin-scan-progress-server";
import type { AdminSession } from "@/lib/admin-store";

type Hold = { workbook_id: string; child_id: string; parent_id: string };
const hold = (i: number, parent = `p${i}`): Hold => ({ workbook_id: `w${i}`, child_id: `c${i}`, parent_id: parent });

/** A fake admin client: holds newest first, the workbooks that have accepted scans, and the test families. */
function admin(holds: Hold[], scanned: string[], tests: string[] = []): AdminSession {
  const from = (table: string) => {
    if (table === "workbook_scan_backstop_holds") {
      const q = { select: () => q, order: () => q, limit: async (n: number) => ({ data: holds.slice(0, n), error: null }) };
      return q;
    }
    const rows = table === "workbook_scan_receipts" ? scanned.map(workbook_id => ({ workbook_id })) : tests.map(parent_id => ({ parent_id }));
    const key = table === "workbook_scan_receipts" ? "workbook_id" : "parent_id";
    const q = { select: () => q, in: async (_c: string, ids: string[]) => ({ data: rows.filter(r => ids.includes((r as Record<string, string>)[key])), error: null }) };
    return q;
  };
  return { db: { from }, userId: "admin", email: "a@example.com" } as unknown as AdminSession;
}

describe("loadAdminScanHolds", () => {
  beforeEach(() => { reads.count = 0; });

  it("reads a bounded number of holds and makes no progress read for books that now have scans", async () => {
    const holds = Array.from({ length: 501 }, (_, i) => hold(i));
    const result = await loadAdminScanHolds(admin(holds, holds.map(h => h.workbook_id)));
    expect(reads.count).toBe(0);
    expect(result).toEqual({ rows: [], unavailable: false, more: true });
  });

  it("rechecks at most HOLD_CHECK candidates and says more may be on hold", async () => {
    const holds = Array.from({ length: HOLD_READ }, (_, i) => hold(i));
    const result = await loadAdminScanHolds(admin(holds, []));
    expect(reads.count).toBe(HOLD_CHECK);
    expect(result.rows).toHaveLength(HOLD_CHECK);
    expect(result.more).toBe(true);
  });

  it("labels a test family's hold", async () => {
    const result = await loadAdminScanHolds(admin([hold(1, "real"), hold(2, "test")], [], ["test"]));
    expect(result.rows.map(r => [r.workbookId, r.testFamily])).toEqual([["w1", false], ["w2", true]]);
    expect(result.more).toBe(false);
  });
});
