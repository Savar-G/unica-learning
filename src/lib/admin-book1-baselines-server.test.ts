import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { BOOK1_ITEMS_READ, loadAdminBook1Baselines } from "@/lib/admin-book1-baselines-server";
import { book1ItemSavable, book1ItemText, book1RecoverCommand } from "@/lib/admin-book1-baselines";
import type { AdminSession } from "@/lib/admin-store";
import { testFamilies } from "@/lib/admin-test-families";

// #870 The page's read: one admin-only database function does the filtering (newest approval, no baseline, hidden families,
// newest run, all before the limit; its SQL is proved by a no-trace probe, see the PR). Here: the arguments it gets, how
// its rows map, the limit, the test-family tag and the failure answer.
const P1 = "33333333-3333-4333-8333-333333333333", TEST = "11111111-1111-4111-8111-111111111111";
const D = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Row = { draft_id: string; revision: number; parent_id: string; child_id: string; child_name: string | null; run_id: string | null; kind: string; reason: string | null; tries: number | null };
const row = (n: number, o: Partial<Row> = {}): Row => ({ draft_id: D(n), revision: 7, parent_id: P1, child_id: D(100 + n), child_name: "Iris", run_id: D(200 + n), kind: "pending", reason: "planned-on-another-build", tries: null, ...o });
function admin(result: { data: Row[] | null; error: unknown }, calls: { fn: string; args: unknown }[] = []): AdminSession {
  return { db: { rpc: async (fn: string, args: unknown) => { calls.push({ fn, args }); return result; } }, userId: P1, email: "a@example.com" } as unknown as AdminSession;
}

describe("loadAdminBook1Baselines", () => {
  it("asks the database function for one more than it shows, with the hidden families, and maps each row", async () => {
    const calls: { fn: string; args: unknown }[] = [];
    const r = await loadAdminBook1Baselines(admin({ data: [row(1), row(3, { kind: "failing", reason: null, tries: 5, child_name: null })], error: null }, calls), testFamilies([TEST, "not-a-uuid"], false));
    expect(calls).toEqual([{ fn: "admin_book1_baseline_items", args: { p_limit: BOOK1_ITEMS_READ + 1, p_hide: [TEST] } }]);
    expect(r).toMatchObject({ unavailable: false, more: false });
    expect(r.rows.map(i => [i.draftId, i.revision, i.kind, i.runId, i.childName, i.reason, i.tries])).toEqual([
      [D(1), 7, "pending", D(201), "Iris", "planned-on-another-build", null],
      [D(3), 7, "failing", D(203), null, null, 5],
    ]);
  });
  it("says there are more, and shows only the limit", async () => {
    const data = Array.from({ length: BOOK1_ITEMS_READ + 1 }, (_, i) => row(i + 1));
    const r = await loadAdminBook1Baselines(admin({ data, error: null }), testFamilies([], false));
    expect(r.rows).toHaveLength(BOOK1_ITEMS_READ);
    expect(r.more).toBe(true);
  });
  it("tags a test family while the view shows it", async () => {
    const r = await loadAdminBook1Baselines(admin({ data: [row(1, { parent_id: TEST })], error: null }), testFamilies([TEST], true));
    expect(r.rows[0]).toMatchObject({ testFamily: true });
  });
  it("says it could not read, and shows nothing, when the function fails", async () => {
    expect(await loadAdminBook1Baselines(admin({ data: null, error: { message: "not_admin" } }), testFamilies([], false))).toEqual({ rows: [], unavailable: true, more: false });
  });
});

describe("the item's words", () => {
  it("gives the exact command, and no command for a book that has marks", () => {
    expect(book1RecoverCommand(D(9))).toBe(`npm run workbooks:book1-recover -- --run ${D(9)} --save`);
    expect(book1ItemSavable({ kind: "pending", reason: "activity-before-boundary" })).toBe(false);
    expect(book1ItemSavable({ kind: "failing", reason: null })).toBe(true);
    expect(book1ItemSavable({ kind: "pending", reason: "planned-on-another-build" })).toBe(true);
    // revision-changed always means an old version: the script targets the newest approval, so there is no command.
    expect(book1ItemSavable({ kind: "pending", reason: "revision-changed" })).toBe(false);
    expect(book1ItemText({ kind: "pending", reason: "revision-changed", tries: null })).toContain("Approve the newest version again");
  });
});
