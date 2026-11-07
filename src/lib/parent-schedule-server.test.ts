import { beforeEach, expect, it, vi } from "vitest";
import { hasPrintedSchedule } from "@/lib/parent-schedule-server";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ available: true, fail: false, rows: [] as { id: string }[], reads: [] as unknown[][] }));
vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: vi.fn(() => { throw new Error("Shell must not read a full schedule"); }),
  adminClient: () => state.available ? {
    from: (table: string) => {
      state.reads.push(["from", table]);
      const query = {
        select: (columns: string) => { state.reads.push(["select", columns]); return query; },
        eq: (column: string, value: string) => { state.reads.push(["eq", column, value]); return query; },
        in: (column: string, values: string[]) => { state.reads.push(["in", column, values]); return query; },
        limit: async (n: number) => { state.reads.push(["limit", n]); return { data: state.rows, error: state.fail ? { message: "failed" } : null }; },
      };
      return query;
    },
  } : null,
}));
beforeEach(() => { state.available = true; state.fail = false; state.rows = []; state.reads = []; });

it("checks book existence with one bounded family and child read, without loading questions or drafts", async () => {
  state.rows = [{ id: "b1" }];
  expect(await hasPrintedSchedule("p1", "c1")).toBe(true);
  expect(state.reads).toEqual([["from", "workbooks"], ["select", "id"], ["eq", "parent_id", "p1"],
    ["eq", "child_id", "c1"], ["in", "status", ["printed", "shipped"]], ["limit", 1]]);
});
it("hides the tab on no book, a failed read or no service client", async () => {
  expect(await hasPrintedSchedule("p1", "c1")).toBe(false);
  state.rows = [{ id: "b1" }]; state.fail = true;
  expect(await hasPrintedSchedule("p1", "c1")).toBe(false);
  state.available = false;
  expect(await hasPrintedSchedule("p1", "c1")).toBe(false);
});
