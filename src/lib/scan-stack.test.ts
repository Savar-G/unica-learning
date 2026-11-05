import { describe, expect, it } from "vitest";
import { buildStack, dayPages, refusalCopy, sendLabel, stackSummary, waitingNote, type StackPhoto, type StackUpload } from "@/lib/scan-stack";

const BOOK = "book-1";
// Workbook 1: a cover, Day 4 with pages 10 to 13, Day 5 with pages 14 to 16.
const pages = dayPages([
  { id: "cover", workbookId: BOOK, book: 1, pageNumber: 1, day: null },
  ...[10, 11, 12, 13].map((n) => ({ id: `p${n}`, workbookId: BOOK, book: 1, pageNumber: n, day: "Day 4" })),
  ...[14, 15, 16].map((n) => ({ id: `p${n}`, workbookId: BOOK, book: 1, pageNumber: n, day: "Day 5" })),
]);

const photo = (id: string, pageNumber: number, o: Partial<StackPhoto> = {}): StackPhoto => ({
  id, pageId: `p${pageNumber}`, workbookId: BOOK, book: 1, pageNumber, state: "saved", check: "ready", reason: null, sentAt: null, createdAt: `2026-11-05T10:${String(pageNumber).padStart(2, "0")}:00Z`, ...o,
});

describe("dayPages", () => {
  it("numbers each page within its day, in book order, and leaves pages with no day out", () => {
    expect(pages.map((p) => [p.id, p.pageOfDay])).toEqual([["p10", 1], ["p11", 2], ["p12", 3], ["p13", 4], ["p14", 1], ["p15", 2], ["p16", 3]]);
    expect(pages[0]).toMatchObject({ day: "Day 4", pagesInDay: 4 });
  });
});

describe("buildStack", () => {
  it("groups pages by day in page order and names each page of the day with no photo yet", () => {
    const stack = buildStack({ photos: [photo("b", 12), photo("a", 10), photo("c", 15)], uploads: [], pages, checks: true });
    expect(stack.days.map((d) => d.label)).toEqual(["Day 4", "Day 5"]);
    expect(stack.days[0].tiles.map((t) => t.label)).toEqual(["Page 1", "Page 3"]);
    expect(stack.days[0].missing).toEqual([2, 4]);
    expect(stack.days[0].missingText).toBe("No photo yet: pages 2 and 4");
    expect(stack.days[1].missingText).toBe("No photo yet: pages 1 and 3");
  });

  it("puts refused pages first with their short reason, and a refused upload as an unknown page", () => {
    const uploads: StackUpload[] = [{ key: "u1", status: "refused", reason: "qr" }];
    const stack = buildStack({ photos: [photo("a", 10), photo("b", 12, { check: "refused", reason: "ambiguous-page" })], uploads, pages, checks: true });
    expect(stack.refused.map((t) => [t.label, t.reason])).toEqual([["Day 4 · Page 3", "Two pages"], ["Unknown page", "Not a workbook page"]]);
    expect(stack.days[0].tiles.map((t) => t.label)).toEqual(["Page 1"]);
    // A refused page still has a photo: it is not a gap.
    expect(stack.days[0].missing).toEqual([2, 4]);
  });

  it("counts only ready pages for Send, and leaves checking, refused and unchecked pages in the stack", () => {
    const stack = buildStack({
      photos: [
        photo("ready-1", 10), photo("ready-2", 11),
        photo("checking", 12, { check: "checking" }),
        photo("waiting-save", 13, { state: "pending", check: "ready" }),
        photo("refused", 14, { check: "refused", reason: "marks-missing" }),
        photo("old-book", 15, { check: "unavailable" }),
      ],
      uploads: [{ key: "u1", status: "uploading" }, { key: "u2", status: "waiting" }],
      pages, checks: true,
    });
    expect(stack.readyIds).toEqual(["ready-1", "ready-2"]);
    expect(stack.counts).toEqual({ photos: 8, ready: 2, refused: 1, checking: 4 });
    expect(stack.days[0].tiles.map((t) => t.status)).toEqual(["ready", "ready", "checking", "checking"]);
    expect(stack.days[1].tiles.map((t) => t.status)).toEqual(["unavailable"]);
    expect(stack.days[1].tiles[0].reason).toBe("Cannot be checked");
    expect(stack.adding).toBe(2);
    expect(sendLabel(stack.counts.ready)).toBe("Send 2 pages for marking");
    expect(waitingNote(stack)).toBe("4 pages are still being checked. They stay here.");
  });

  it("moves sent pages out of the days into their own group; they are neither ready nor gaps", () => {
    const stack = buildStack({ photos: [photo("a", 10), photo("s", 11, { sentAt: "2026-11-05T11:00:00Z" })], uploads: [], pages, checks: true });
    expect(stack.sent.map((t) => [t.label, t.status])).toEqual([["Day 4 · Page 2", "sent"]]);
    expect(stack.readyIds).toEqual(["a"]);
    expect(stack.days[0].missing).toEqual([3, 4]);
    expect(stack.counts.photos).toBe(2);
  });

  it("without checks, a saved page is only saved: nothing is ready and nothing is checking", () => {
    const stack = buildStack({ photos: [photo("a", 10, { check: "none" }), photo("b", 11, { check: "none", state: "pending" })], uploads: [], pages, checks: false });
    expect(stack.days[0].tiles.map((t) => t.status)).toEqual(["saved", "checking"]);
    expect(stack.readyIds).toEqual([]);
    expect(stackSummary(stack, false)).toBe("2 photos saved.");
  });

  it("names the workbook in each day only when the stack holds pages of two workbooks", () => {
    const two = dayPages([...pages.map((p) => ({ ...p })), { id: "q3", workbookId: "book-2", book: 2, pageNumber: 3, day: "Day 1" }]);
    const stack = buildStack({ photos: [photo("a", 10), { ...photo("b", 3), pageId: "q3", workbookId: "book-2", book: 2 }], uploads: [], pages: two, checks: true });
    expect(stack.days.map((d) => d.label)).toEqual(["Workbook 1 · Day 4", "Workbook 2 · Day 1"]);
  });

  it("orders the one-page stack and says so in the Send button", () => {
    const stack = buildStack({ photos: [photo("a", 10)], uploads: [], pages, checks: true });
    expect(stack.one?.photoId).toBe("a");
    expect(sendLabel(1)).toBe("Send this page for marking");
    expect(sendLabel(0)).toBe("Send pages for marking");
  });
});

describe("words", () => {
  it("sums up the stack in plain words", () => {
    const stack = buildStack({ photos: [photo("a", 10), photo("b", 11, { check: "checking" })], uploads: [], pages, checks: true });
    expect(stackSummary(stack, true)).toBe("2 photos. 1 page is ready to send.");
    const none = buildStack({ photos: [photo("b", 11, { check: "checking" })], uploads: [], pages, checks: true });
    expect(stackSummary(none, true)).toBe("1 photo. No pages are ready to send yet.");
    expect(waitingNote(buildStack({ photos: [photo("a", 10)], uploads: [], pages, checks: true }))).toBeNull();
  });

  it("gives every refusal a short reason, a title and what to do, and fold-the-book-back for two sheets", () => {
    for (const reason of ["marks-missing", "marks-inconsistent", "page-mismatch", "orientation-unclear", "ambiguous-page", "qr-mismatch", "printed-page-changed", "failed", "qr", "page", "duplicate", "image", "size", "frequency", "quota", "unavailable"] as const) {
      const copy = refusalCopy(reason);
      expect(copy.short.length).toBeGreaterThan(0);
      expect(copy.title).toMatch(/\.$/);
      expect(copy.action).toMatch(/\.$/);
      expect(`${copy.short} ${copy.title} ${copy.action}`).not.toMatch(/\b(she|her|AI|OpenRouter)\b/);
    }
    expect(refusalCopy("ambiguous-page").action).toContain("Fold the book back");
    expect(refusalCopy("marks-missing").short).toBe("Cut off");
    expect(refusalCopy("page-mismatch").short).toBe("Wrong page");
  });
});

it("names the sheet check's refusals in their own words (#456)", () => {
  // Disproved if a page refused for another page or for glare shows the "cannot line up" words of a failed check.
  expect(refusalCopy("another-page").title).toBe("Part of this photo looks like a different page.");
  expect(refusalCopy("faint").title).toBe("Part of the page is too bright or faint to read.");
  expect(refusalCopy("faint").action).toBe("Take another photo without glare.");
  expect(refusalCopy("check-timeout").action).toBe("Try again in a minute.");
});
