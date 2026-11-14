import { describe, expect, it, vi } from "vitest";
import { buildStack, type StackPhoto } from "@/lib/scan-stack";

vi.mock("server-only", () => ({}));
import { pageMarks, stackCheck } from "@/lib/scan-stack-server";

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
