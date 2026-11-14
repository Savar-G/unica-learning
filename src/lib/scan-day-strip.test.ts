import { expect, it } from "vitest";
import { buildStack, dayPages, type PageMarks, type StackPhoto } from "@/lib/scan-stack";
import { dayStrip, pageScore, retakeLine, scoreLine, todaysPages } from "@/lib/scan-day-strip";

const pages = dayPages([3, 4, 5, 6, 7].map((n) => ({ id: `p${n}`, workbookId: "book", book: 1, pageNumber: n, day: n < 6 ? "Day 1" : "Day 2", type: "practice" })));
const full: PageMarks = { right: 7, scored: 8, total: 8, toPractise: 1, waiting: 0, complete: true };
const photo = (pageId: string, fields: Partial<StackPhoto> = {}): StackPhoto => ({
  id: `ph-${pageId}`, pageId, workbookId: "book", book: 1, pageNumber: Number(pageId.slice(1)), state: "saved", check: "ready", reason: null, sentAt: null, createdAt: "2026-11-14T10:00:00Z", ...fields,
});
const strip = (photos: StackPhoto[], marking = true) => {
  const stack = buildStack({ photos, uploads: [], pages, checks: true });
  return dayStrip({ photos, pages, tiles: [...stack.refused, ...stack.days.flatMap((d) => d.tiles), ...stack.sent], marking });
};

it("shows the newest book's first day, every page to scan, before the first photo", () => {
  const s = strip([])!;
  expect(s.day).toBe("Day 1");
  expect(s.tiles.map((t) => t.label)).toEqual(["Page 3, still to scan", "Page 4, still to scan", "Page 5, still to scan"]);
  expect(s.countText).toBe("0 of 3 pages marked");
  expect(dayStrip({ photos: [], pages: [], tiles: [], marking: true })).toBeNull();
});

it("gives each page its own state, and counts only marked pages", () => {
  const s = strip([
    photo("p3", { sentAt: "2026-11-14T10:01:00Z", marks: full }),
    photo("p4", { sentAt: "2026-11-14T10:01:00Z", marks: { ...full, complete: false, scored: 0, right: 0 } }),
    photo("p5", { check: "refused", reason: "marks-missing" }),
  ])!;
  expect(s.tiles.map((t) => t.state)).toEqual(["marked", "marking", "retake"]);
  expect(s.countText).toBe("1 of 3 pages marked");
  expect(s.complete).toBe(false);
});

it("follows the latest page scanned in book order, in any order, and names the next day once a day is done", () => {
  const sent = { sentAt: "2026-11-14T10:01:00Z", marks: full };
  const s = strip([photo("p6", { createdAt: "2026-11-14T09:00:00Z" }), photo("p3", sent)])!;
  expect(s.day).toBe("Day 2");
  const done = strip([photo("p3", sent), photo("p4", sent), photo("p5", sent)])!;
  expect([done.day, done.complete, done.nextDay, done.allDone]).toEqual(["Day 1", true, "Day 2", false]);
  const last = strip([photo("p6", sent), photo("p7", sent)])!;
  expect([last.complete, last.allDone]).toEqual([true, true]);
});

it("counts scanned pages when marking is not open", () => {
  const s = strip([photo("p3"), photo("p4", { check: "refused", reason: "faint" })], false)!;
  expect(s.countText).toBe("1 of 3 pages scanned");
});

it("words a page's score and the day's score", () => {
  expect(pageScore(full)).toBe("7 of 8 · 1 to practise");
  expect(pageScore({ ...full, right: 8, toPractise: 0 })).toBe("8 of 8");
  expect(pageScore({ ...full, complete: false, scored: 5, right: 4, waiting: 3 })).toBe("4 of 5 so far · 3 being checked");
  expect(pageScore(null)).toBe("Marking…");
  const now = Date.parse("2026-11-14T12:00:00Z");
  const today = todaysPages([photo("p3", { sentAt: "2026-11-14T11:00:00Z", marks: full }), photo("p4", { sentAt: "2026-11-14T11:00:00Z", marks: { ...full, right: 10, scored: 11, total: 11, complete: true } }), photo("p5", { sentAt: "2026-11-01T11:00:00Z", marks: full })], now);
  expect(today.pages).toHaveLength(2);
  expect(scoreLine("Danyal", today)).toBe("Danyal got 17 of 19 right on today's pages");
  expect(scoreLine("Danyal", { right: 0, scored: 0, marking: 1 })).toBeNull();
  expect(retakeLine(3)).toBe("3 pages need another photo");
});
