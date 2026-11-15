import { expect, it } from "vitest";
import type { ScheduleRow } from "@/lib/parent-schedule";
import type { HistoryPage } from "@/lib/scan-history";
import { bookDays, extraPracticePages, minutesLine, pageList, withHomeCount, type DayRow, type ReadySchedule } from "@/lib/workbook-days";

const TOPICS = ["Hundreds, tens and ones", "Comparing numbers", "Adding with regrouping", "Subtracting across a zero", "Review", "Rounding", "Word problems", "Patterns", "Even and odd", "Review"];
type Scan = ScheduleRow["scan"];
/** A 10-day book of 8 required pages a day, from page 3. `scans`: day number to its scan state; others have none yet. */
function book(scans: Record<number, Scan> = {}, scansUnknown = false): ReadySchedule {
  return { kind: "ready", child: { id: "c", parentId: "p", firstName: "Leah" }, book: { id: "book-1", number: 1 }, dailyTime: "about 19 minutes", minutes: { min: 19, max: 19 }, scansUnknown,
    rows: TOPICS.map((topic, i): ScheduleRow => {
      const day = i + 1, first = 3 + i * 8;
      return { day, topic, second: "", pages: [first, first + 7], requiredMinutes: 19, extra: false, requiredPages: Array.from({ length: 8 }, (_, k) => first + k),
        scan: scans[day] ?? { kind: "unknown" }, marks: { kind: "none", marked: 0, total: 8 } };
    }) };
}
const done = (): Scan => ({ kind: "known", accepted: 8, required: 8, missing: [] });
const statuses = (view: ReturnType<typeof bookDays>) => view.rows.map(r => r.status);

it("puts a book midway into Scanned, To scan, Next and nothing, and rings today", () => {
  // Delivered Monday Nov 2; it is Wednesday, so the child is on Day 3. Day 3 has three pages scanned.
  const view = bookDays(book({ 1: done(), 2: done(), 3: { kind: "known", accepted: 3, required: 8, missing: [22, 23, 24, 25, 26] } }), { start: "2026-11-02", today: "2026-11-04", ended: false });
  expect(statuses(view)).toEqual(["scanned", "scanned", "to_scan", "next", null, null, null, null, null, null]);
  expect(view.rows.filter(r => r.today).map(r => r.day)).toEqual([3]);
  expect(view.day).toBe(3);
  expect(view.topic).toBe("Adding with regrouping");
  expect([view.scanned, view.total, view.percent]).toEqual([19, 80, 24]);
  expect(view.gap).toEqual({ day: 3, pages: [22, 23, 24, 25, 26] });
  expect(view.weeks.map(w => w.map(r => r.day))).toEqual([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]]);
});

it("a day the calendar has reached with no scan is To scan, with all its required pages missing, and is the orange row", () => {
  const view = bookDays(book({ 1: done() }), { start: "2026-11-02", today: "2026-11-03", ended: false });
  expect(statuses(view).slice(0, 3)).toEqual(["scanned", "to_scan", "next"]);
  expect(view.rows[1].missing).toEqual([11, 12, 13, 14, 15, 16, 17, 18]);
  expect(view.gap).toEqual({ day: 2, pages: [11, 12, 13, 14, 15, 16, 17, 18] });
});

it("shows one orange row only: the earliest started day with pages left, with later reached days still To scan", () => {
  // Friday of week 1 is Day 5. Day 1 is scanned; Day 2 has five of its eight pages; Days 3 to 5 have nothing.
  const view = bookDays(book({ 1: done(), 2: { kind: "known", accepted: 5, required: 8, missing: [16, 17, 18] } }), { start: "2026-11-02", today: "2026-11-06", ended: false });
  expect(statuses(view).slice(0, 6)).toEqual(["scanned", "to_scan", "to_scan", "to_scan", "to_scan", "next"]);
  expect(view.gap).toEqual({ day: 2, pages: [16, 17, 18] });
  expect(view.rows[2].missing).toEqual([19, 20, 21, 22, 23, 24, 25, 26]);
});

it("a book not started has today's day to scan, with its pages as the orange row, and the next day after it", () => {
  const view = bookDays(book(), { start: "2026-11-02", today: "2026-11-02", ended: false });
  expect(statuses(view).slice(0, 3)).toEqual(["to_scan", "next", null]);
  expect(view.gap).toEqual({ day: 1, pages: [3, 4, 5, 6, 7, 8, 9, 10] });
  expect([view.scanned, view.total, view.percent, view.day]).toEqual([0, 80, 0, 1]);
});

it("a book delivered on a weekend starts at Day 1 on the Monday: Day 1 is Next", () => {
  const view = bookDays(book(), { start: "2026-11-07", today: "2026-11-08", ended: false });
  expect(statuses(view).slice(0, 2)).toEqual(["next", null]);
  expect(view.day).toBe(1);
});

it("all days scanned: every day Scanned, no Next, no orange row, Day 10 of 10", () => {
  const view = bookDays(book(Object.fromEntries(TOPICS.map((_, i) => [i + 1, done()]))), { start: "2026-11-02", today: "2026-11-05", ended: false });
  expect(statuses(view)).toEqual(Array(10).fill("scanned"));
  expect(view.allScanned).toBe(true);
  expect(view.gap).toBeNull();
  expect([view.scanned, view.total, view.percent, view.day]).toEqual([80, 80, 100, 10]);
});

it("after the book's last day every unscanned day is To scan and nothing is ringed", () => {
  const view = bookDays(book({ 1: done() }), { start: "2026-11-02", today: "2026-12-01", ended: false });
  expect(statuses(view)).toEqual(["scanned", ...Array(9).fill("to_scan")]);
  expect(view.rows.some(r => r.today)).toBe(false);
  expect(view.day).toBe(10);
});

it("a plan that ended counts no calendar days and names no Next day: only days with a scan say To scan", () => {
  const view = bookDays(book({ 1: done(), 2: { kind: "known", accepted: 6, required: 8, missing: [14, 15] } }), { start: "2026-11-02", today: "2026-11-04", ended: true });
  expect(statuses(view)).toEqual(["scanned", "to_scan", ...Array(8).fill(null)]);
  expect(view.rows.some(r => r.today)).toBe(false);
});

it("an older book or one not delivered has no calendar: only started days speak and nothing is Next", () => {
  const view = bookDays(book({ 1: done(), 2: { kind: "known", accepted: 6, required: 8, missing: [14, 15] } }), null);
  expect(statuses(view)).toEqual(["scanned", "to_scan", ...Array(8).fill(null)]);
  expect(view.rows.some(r => r.today)).toBe(false);
  expect(view.gap).toEqual({ day: 2, pages: [14, 15] });
  expect(bookDays(book(), null).rows.every(r => r.status === null)).toBe(true);
});

it("a day whose scan state is unknown never reads as scanned", () => {
  expect(bookDays(book(), { start: "2026-11-02", today: "2026-11-02", ended: false }).rows.some(r => r.status === "scanned")).toBe(false);
});

it("writes page lists and the daily minutes", () => {
  expect(pageList([19, 20, 21, 22, 23, 24, 25, 26])).toBe("19–26");
  expect(pageList([22, 19, 21, 30])).toBe("19, 21–22, 30");
  expect(pageList([7])).toBe("7");
  expect(minutesLine({ min: 19, max: 19 })).toBe("About 19 min a day");
  expect(minutesLine({ min: 20, max: 25 })).toBe("About 20–25 min a day");
});

it("when the scan records could not be read, no day says Scanned, To scan or Next, there is no orange row and no count", () => {
  const view = bookDays(book({ 1: done(), 2: { kind: "known", accepted: 3, required: 8, missing: [16, 17] } }, true), { start: "2026-11-02", today: "2026-11-04", ended: false });
  expect(view.scansUnknown).toBe(true);
  expect(statuses(view)).toEqual(Array(10).fill(null));
  expect(view.gap).toBeNull();
  expect([view.scanned, view.percent, view.allScanned]).toEqual([0, 0, false]);
  // The calendar still says which day the child is on.
  expect(view.rows.filter(r => r.today).map(r => r.day)).toEqual([3]);
  expect(bookDays(book({}, false), { start: "2026-11-02", today: "2026-11-04", ended: false }).scansUnknown).toBe(false);
});

it("counts the cover the way Home does: its own saved-photo count, percent floored", () => {
  const view = bookDays(book({ 1: done() }), { start: "2026-11-02", today: "2026-11-03", ended: false });
  expect(withHomeCount(view, { scanned: 79, total: 80 })).toMatchObject({ scanned: 79, total: 80, percent: 98 });
  expect(withHomeCount(view, { scanned: 0, total: 0 })).toMatchObject({ scanned: 0, total: 0, percent: 0 });
  expect(withHomeCount(view, { scanned: 10, total: 80 }).rows).toBe(view.rows);
});

const historyPage = (pageNumber: number, day: string, extra: Partial<HistoryPage> = {}): HistoryPage => ({ id: `p${pageNumber}`, childId: "c", childName: "Leah", workbookId: "book-1", book: 1, revision: "r", day, pageNumber,
  status: "ready", label: "Results ready", photo: `photo-${pageNumber}`, photoAvailable: true, failedJob: false, counts: { scored: 3, unscored: 0, teamChecks: 0, pending: 0 }, right: 3, wrong: 0, blank: 0, ...extra });

it("finds the extra practice pages of each day: not required by any day, and labelled with the day or inside its printed range", () => {
  const rows = bookDays(book(), null).rows as DayRow[];
  const extra = extraPracticePages(rows, [
    historyPage(11, "Day 2"),                   // a required page of Day 2
    historyPage(99, "Day 3"),                   // labelled Day 3, outside its range
    historyPage(90, "Day 3"),                   // labelled Day 3: listed before 99, in printed order
    historyPage(300, "Cover"),                  // no day and no range: ignored
    historyPage(41, "Day 11"),                  // a day the book does not have: ignored
    historyPage(42, "Day 4", { workbookId: "other" }), // another book: ignored
  ], "book-1");
  expect([...extra.keys()]).toEqual([3]);
  expect(extra.get(3)?.map(p => p.pageNumber)).toEqual([90, 99]);
});

it("an extra practice page with no day label belongs to the day whose printed range holds it", () => {
  const rows: DayRow[] = [{ day: 1, topic: "t", pages: [3, 12], requiredPages: [3, 4, 5, 6], status: null, today: false, missing: [] }];
  const extra = extraPracticePages(rows, [historyPage(11, ""), historyPage(4, ""), historyPage(13, "")], "book-1");
  expect(extra.get(1)?.map(p => p.pageNumber)).toEqual([11]);
});
