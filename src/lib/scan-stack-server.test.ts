import { describe, expect, it, vi } from "vitest";
import { buildStack, type StackPhoto } from "@/lib/scan-stack";

vi.mock("server-only", () => ({}));
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { pageMarks, readScanStack, stackCheck } from "@/lib/scan-stack-server";

const REVISION = "a".repeat(28);
const photo: Omit<StackPhoto, "check"> = {
  id: "photo", pageId: "page", workbookId: "book", book: 1, pageNumber: 5,
  state: "saved", reason: null, sentAt: null, createdAt: "2026-11-05T12:00:00Z",
};

describe("the stack's sheet-check version", () => {
  it.each([undefined, null, 0, "1", 1])("counts a ready result with version %s only if it passed the current check", (sheetCheck) => {
    // Disproved if an old or malformed ready result appears in Send's ready ids.
    const check = stackCheck({ state: "ready", printed_revision: REVISION, sheetCheck }, REVISION, true);
    const stack = buildStack({ photos: [{ ...photo, check }], pages: [], uploads: [], checks: true });
    expect(check).toBe(sheetCheck === 1 ? "ready" : "checking");
    expect(stack.readyIds).toEqual(sheetCheck === 1 ? [photo.id] : []);
    expect(stack.counts.ready).toBe(sheetCheck === 1 ? 1 : 0);
  });

  it("keeps revision, running, refusal and disabled-check states", () => {
    expect(stackCheck({ state: "ready", printed_revision: "other", sheetCheck: 1 }, REVISION, true)).toBe("unavailable");
    expect(stackCheck({ state: "refused", printed_revision: REVISION }, REVISION, true)).toBe("refused");
    expect(stackCheck({ state: "running", printed_revision: REVISION }, REVISION, true)).toBe("checking");
    expect(stackCheck(null, REVISION, true)).toBe("checking");
    expect(stackCheck(null, REVISION, false)).toBe("none");
  });
});

describe("a sent page's marks on the stack (#915)", () => {
  const view = (results: (string | null)[], status = "complete", teamChecks = 0, pending = 0) => ({
    completion: { status, total: results.length }, counts: { scored: results.filter((r) => r !== null).length, teamChecks, pending },
    items: results.map((result) => ({ result })),
  });
  it("counts right answers, answers to practise and answers still waiting", () => {
    expect(pageMarks(view(["right", "right", "wrong", "blank"]))).toEqual({ right: 2, scored: 4, total: 4, toPractise: 2, waiting: 0, complete: true });
    expect(pageMarks(view(["right", null, null], "incomplete", 1, 1))).toEqual({ right: 1, scored: 1, total: 3, toPractise: 0, waiting: 2, complete: false });
  });
});

describe("the stack before the first photo (#915 day strip)", () => {
  const fake = (books: { id: string; number: number }[]) => ({ from(table: string) {
    const rows: Record<string, unknown[]> = {
      scan_photos: [], workbooks: books,
      workbook_pages: books.length ? [{ id: "p1", workbook_id: "book", page_number: 3, day_label: "Day 1", page_type: "warm-up" }, { id: "p2", workbook_id: "book", page_number: 4, day_label: "Day 1", page_type: "practice" }] : [],
    };
    const b = { select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve) };
    return b;
  } }) as unknown as SupabaseClient<Database>;
  it("gives the pages of the child's newest shipped book, and nothing without one", async () => {
    const read = await readScanStack(fake([{ id: "book", number: 1 }]), "parent", "child", true);
    expect(read.photos).toEqual([]);
    expect(read.pages.map((p) => [p.pageNumber, p.day, p.pageOfDay, p.pagesInDay])).toEqual([[3, "Day 1", 1, 2], [4, "Day 1", 2, 2]]);
    expect(await readScanStack(fake([]), "parent", "child", true)).toEqual({ photos: [], pages: [] });
  });
});
