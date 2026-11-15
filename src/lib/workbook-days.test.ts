import { expect, it } from "vitest";
import type { ScheduleRow } from "@/lib/parent-schedule";
import { bookDays, minutesLine, pageList, type ReadySchedule } from "@/lib/workbook-days";

const TOPICS = ["Hundreds, tens and ones", "Comparing numbers", "Adding with regrouping", "Subtracting across a zero", "Review", "Rounding", "Word problems", "Patterns", "Even and odd", "Review"];
type Scan = ScheduleRow["scan"];
/** A 10-day book of 8 required pages a day, from page 3. `scans`: day number to its scan state; others have none yet. */
function book(scans: Record<number, Scan> = {}): ReadySchedule {
  return { kind: "ready", child: { id: "c", parentId: "p", firstName: "Leah" }, book: { id: "book-1", number: 1 }, dailyTime: "about 19 minutes", minutes: { min: 19, max: 19 },
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
  expect(view.gaps).toEqual([{ day: 3, pages: [22, 23, 24, 25, 26] }]);
  expect(view.weeks.map(w => w.map(r => r.day))).toEqual([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]]);
});

it("uses the Schedule page's rule: only a day with a scan has missing pages, a day with none has an empty list", () => {
  const view = bookDays(book({ 1: done() }), { start: "2026-11-02", today: "2026-11-03", ended: false });
  expect(statuses(view).slice(0, 3)).toEqual(["scanned", "to_scan", "next"]);
  expect(view.gaps).toEqual([]);
  expect(view.rows[1].missing).toEqual([]);
});

it("a book not started has today's day to scan, no orange row, and the next day after it", () => {
  const view = bookDays(book(), { start: "2026-11-02", today: "2026-11-02", ended: false });
  expect(statuses(view).slice(0, 3)).toEqual(["to_scan", "next", null]);
  expect(view.gaps).toEqual([]);
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
  expect(view.gaps).toEqual([]);
  expect([view.scanned, view.total, view.percent, view.day]).toEqual([80, 80, 100, 10]);
});

it("after the book's last day every unscanned day is To scan and nothing is ringed", () => {
  const view = bookDays(book({ 1: done() }), { start: "2026-11-02", today: "2026-12-01", ended: false });
  expect(statuses(view)).toEqual(["scanned", ...Array(9).fill("to_scan")]);
  expect(view.rows.some(r => r.today)).toBe(false);
  expect(view.day).toBe(10);
});

it("a plan that ended counts no calendar days: only started days say To scan", () => {
  const view = bookDays(book({ 1: done(), 2: { kind: "known", accepted: 6, required: 8, missing: [14, 15] } }), { start: "2026-11-02", today: "2026-11-04", ended: true });
  expect(statuses(view).slice(0, 4)).toEqual(["scanned", "to_scan", "next", null]);
  expect(view.rows.some(r => r.today)).toBe(false);
});

it("an older book or one not delivered has no calendar: only started days speak and nothing is Next", () => {
  const view = bookDays(book({ 1: done(), 2: { kind: "known", accepted: 6, required: 8, missing: [14, 15] } }), null);
  expect(statuses(view)).toEqual(["scanned", "to_scan", ...Array(8).fill(null)]);
  expect(view.rows.some(r => r.today)).toBe(false);
  expect(view.gaps).toEqual([{ day: 2, pages: [14, 15] }]);
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
