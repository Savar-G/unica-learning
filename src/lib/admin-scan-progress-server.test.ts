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
import { testFamilies } from "@/lib/admin-test-families";

type Hold = { workbook_id: string; child_id: string; parent_id: string };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hold = (i: number, parent = uuid(1000 + i)): Hold => ({ workbook_id: `w${i}`, child_id: `c${i}`, parent_id: parent });
const TEST = "11111111-1111-4111-8111-111111111111", TEAM = "22222222-2222-4222-8222-222222222222", REAL = "33333333-3333-4333-8333-333333333333";

/**
 * A fake admin client: holds newest first (with the database's not-in filter on parent_id, before the limit), and the
 * workbooks that have accepted scans. No other table may be read.
 */
function admin(holds: Hold[], scanned: string[]): AdminSession {
  const from = (table: string) => {
    if (table === "workbook_scan_backstop_holds") {
      let rows = holds;
      const q = {
        select: () => q, order: () => q,
        not: (column: string, op: string, list: string) => {
          expect([column, op]).toEqual(["parent_id", "in"]);
          const out = new Set(list.slice(1, -1).split(","));
          rows = rows.filter(h => !out.has(h.parent_id));
          return q;
        },
        limit: async (n: number) => ({ data: rows.slice(0, n), error: null }),
      };
      return q;
    }
    if (table !== "workbook_scan_receipts") throw new Error(`unexpected table ${table}`);
    const q = { select: () => q, in: async (_c: string, ids: string[]) => ({ data: scanned.filter(w => ids.includes(w)).map(workbook_id => ({ workbook_id })), error: null }) };
    return q;
  };
  return { db: { from }, userId: TEAM, email: "a@example.com" } as unknown as AdminSession;
}
const off = (ids: string[] = []) => testFamilies(ids, false), on = (ids: string[] = []) => testFamilies(ids, true);

describe("loadAdminScanHolds", () => {
  beforeEach(() => { reads.count = 0; });

  it("reads a bounded number of holds and makes no progress read for books that now have scans", async () => {
    const holds = Array.from({ length: 501 }, (_, i) => hold(i));
    const result = await loadAdminScanHolds(admin(holds, holds.map(h => h.workbook_id)), off());
    expect(reads.count).toBe(0);
    expect(result).toEqual({ rows: [], unavailable: false, more: true });
  });

  it("rechecks at most HOLD_CHECK candidates and says more may be on hold", async () => {
    const holds = Array.from({ length: HOLD_READ }, (_, i) => hold(i));
    const result = await loadAdminScanHolds(admin(holds, []), off());
    expect(reads.count).toBe(HOLD_CHECK);
    expect(result.rows).toHaveLength(HOLD_CHECK);
    expect(result.more).toBe(true);
  });

  it("switch on: lists and tags a test family's hold and a team family's hold (no test_accounts row)", async () => {
    const result = await loadAdminScanHolds(admin([hold(1, REAL), hold(2, TEST), hold(3, TEAM)], []), on([TEST, TEAM]));
    expect(result.rows.map(r => [r.workbookId, r.testFamily])).toEqual([["w1", false], ["w2", true], ["w3", true]]);
    expect(result.more).toBe(false);
  });

  it("switch off: leaves a team family's hold out, though it has no test_accounts row", async () => {
    const result = await loadAdminScanHolds(admin([hold(1, TEAM), hold(2, REAL)], []), off([TEST, TEAM]));
    expect(result.rows.map(r => r.workbookId)).toEqual(["w2"]);
  });

  it("switch off: 20 newer test holds do not use up the checks, so the older real hold is checked and listed", async () => {
    const holds = [...Array.from({ length: HOLD_CHECK }, (_, i) => hold(i, TEST)), hold(HOLD_CHECK, REAL)];
    const result = await loadAdminScanHolds(admin(holds, []), off([TEST, TEAM]));
    expect(result.rows).toEqual([{ workbookId: `w${HOLD_CHECK}`, childId: `c${HOLD_CHECK}`, parentId: REAL, number: 1, testFamily: false }]);
    expect(reads.count).toBe(1);
    expect(result.more).toBe(false);
  });
});
