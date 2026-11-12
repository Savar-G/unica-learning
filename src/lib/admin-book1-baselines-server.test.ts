import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { loadAdminBook1Baselines } from "@/lib/admin-book1-baselines-server";
import { FAILING_TRIES, book1ItemSavable, book1ItemText, book1RecoverCommand } from "@/lib/admin-book1-baselines";
import type { AdminSession } from "@/lib/admin-store";
import { testFamilies } from "@/lib/admin-test-families";

// #870 The page's read, with a fake admin client: the database's not-in filter and limit, and the rows each table holds.
const P1 = "33333333-3333-4333-8333-333333333333", TEST = "11111111-1111-4111-8111-111111111111";
const D = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Tables = Record<string, Record<string, unknown>[]>;
function admin(t: Tables, o: { failOn?: string } = {}): AdminSession {
  const from = (table: string) => {
    let rows = t[table] ?? [];
    const q: Record<string, unknown> = {};
    const chain = (fn: (r: Record<string, unknown>[]) => Record<string, unknown>[]) => { rows = fn(rows); return q; };
    Object.assign(q, {
      select: () => q,
      not: (c: string, _op: string, list: string) => { const out = new Set(list.slice(1, -1).split(",")); return chain(r => r.filter(x => !out.has(String(x[c])))); },
      gte: (c: string, v: number) => chain(r => r.filter(x => Number(x[c]) >= v)),
      in: (c: string, v: string[]) => chain(r => r.filter(x => v.includes(String(x[c])))),
      eq: (c: string, v: unknown) => chain(r => r.filter(x => x[c] === v)),
      order: () => q,
      limit: (n: number) => chain(r => r.slice(0, n)),
      then: (ok: (v: unknown) => unknown) => ok(o.failOn === table ? { data: null, error: { message: "x" } } : { data: rows, error: null }),
    });
    return q;
  };
  return { db: { from }, userId: P1, email: "a@example.com" } as unknown as AdminSession;
}
const base = (): Tables => ({
  workbook_book1_baseline_pending: [
    { draft_id: D(1), revision: 7, parent_id: P1, child_id: D(101), run_id: D(201), reason: "planned-on-another-build" },
    { draft_id: D(2), revision: 3, parent_id: P1, child_id: D(102), run_id: D(202), reason: "planning-capture-missing" },
  ],
  workbook_book1_baseline_tries: [
    { draft_id: D(3), revision: 1, parent_id: P1, child_id: D(103), tries: FAILING_TRIES },
    { draft_id: D(4), revision: 1, parent_id: P1, child_id: D(104), tries: FAILING_TRIES - 1 },
    { draft_id: D(1), revision: 7, parent_id: P1, child_id: D(101), tries: 9 },
  ],
  workbook_book1_baselines: [{ draft_id: D(2), draft_revision: 3 }],
  workbook_runs: [{ id: D(203), draft_id: D(3), number: 1 }],
  children: [{ id: D(101), first_name: "Iris" }, { id: D(103), first_name: "Leo" }],
});

describe("loadAdminBook1Baselines", () => {
  it("lists pending rows and revisions that keep failing, once each, and drops a revision a baseline now binds", async () => {
    // Wrong if: a saved revision is still listed, a revision with 2 tries is listed, or a pending revision is listed twice.
    const r = await loadAdminBook1Baselines(admin(base()), testFamilies([], false));
    expect(r).toMatchObject({ unavailable: false, more: false });
    expect(r.rows.map(i => [i.draftId, i.revision, i.kind, i.runId, i.childName, i.reason, i.tries])).toEqual([
      [D(1), 7, "pending", D(201), "Iris", "planned-on-another-build", null],
      [D(3), 1, "failing", D(203), "Leo", null, FAILING_TRIES],
    ]);
  });
  it("leaves hidden test families out in the read and tags them when shown", async () => {
    const t = base();
    t.workbook_book1_baseline_pending.push({ draft_id: D(5), revision: 1, parent_id: TEST, child_id: D(105), run_id: D(205), reason: "planning-capture-missing" });
    expect((await loadAdminBook1Baselines(admin(t), testFamilies([TEST], false))).rows.map(i => i.draftId)).not.toContain(D(5));
    const shown = await loadAdminBook1Baselines(admin(t), testFamilies([TEST], true));
    expect(shown.rows.find(i => i.draftId === D(5))).toMatchObject({ testFamily: true });
  });
  it("says it could not read, and shows nothing, when a read fails", async () => {
    for (const failOn of ["workbook_book1_baseline_pending", "workbook_book1_baseline_tries", "workbook_book1_baselines", "workbook_runs", "children"]) {
      expect(await loadAdminBook1Baselines(admin(base(), { failOn }), testFamilies([], false))).toEqual({ rows: [], unavailable: true, more: false });
    }
  });
  it("says there is nothing, and makes no further read, when both lists are empty", async () => {
    expect(await loadAdminBook1Baselines(admin({}), testFamilies([], false))).toEqual({ rows: [], unavailable: false, more: false });
  });
});

describe("the item's words", () => {
  it("gives the exact command, and no command for a book that has marks", () => {
    expect(book1RecoverCommand(D(9))).toBe(`npm run workbooks:book1-recover -- --run ${D(9)} --save`);
    expect(book1ItemSavable({ kind: "pending", reason: "activity-before-boundary" })).toBe(false);
    expect(book1ItemSavable({ kind: "failing", reason: null })).toBe(true);
    expect(book1ItemText({ kind: "pending", reason: "revision-changed", tries: null })).toContain("newer version");
  });
});
