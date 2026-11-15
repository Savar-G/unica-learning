import type { ScheduleView } from "@/lib/parent-schedule";
import type { HistoryPage } from "@/lib/scan-history";
import { WORKBOOK_DAYS, bookOver, bookToday, dayNumber, workbookDay } from "@/lib/parent-week";

// The Workbooks tab's 10 days (#1031): a book's printed plan (src/lib/parent-schedule.ts) turned into the day rows, the
// scan row and the cover's numbers. Pure: no database, network or clock; the caller passes today in family time. The
// plan's days, topics, pages and missing pages are the Schedule page's own (#679). Only the layout and wording are new.

export type ReadySchedule = Extract<ScheduleView, { kind: "ready" }>;

/** "Scanned"; "To scan"; "Next"; or nothing. */
export type DayStatus = "scanned" | "to_scan" | "next" | null;

export interface DayRow {
  day: number;
  topic: string;
  /** The day's printed page range, for "Pages 19–26". */
  pages: [number, number];
  /** The printed pages the day requires, in order. */
  requiredPages: number[];
  status: DayStatus;
  /** The ringed circle: the day the child is on by the calendar (Home's "Today" row). */
  today: boolean;
  /** Required pages with no accepted scan, for a day that has started: the known missing ones, else all its required pages. */
  missing: number[];
}

export interface BookDays {
  bookId: string;
  number: number;
  rows: DayRow[];
  /** Week 1 (Days 1 to 5) and Week 2 (Days 6 to 10). */
  weeks: [DayRow[], DayRow[]];
  /** The cover's "Day X of 10". */
  day: number;
  topic: string;
  /** Accepted pages of the book's required pages. */
  scanned: number;
  total: number;
  percent: number;
  allScanned: boolean;
  /** The one orange row: the earliest started day that still has pages to scan. Null when there is none. */
  gap: { day: number; pages: number[] } | null;
  /** The scan records could not be read: no day says Scanned or To scan, there is no orange row and no count. */
  scansUnknown: boolean;
  /** The printed plan's daily minutes. */
  minutes: { min: number; max: number };
}

/**
 * A day's topic as the book's printed plan names it: the one name the Workbooks tab (the day row, the cover) and Home's
 * Workbook card both say for that day, so a parent who taps Home's Today row lands on the same words. Null when the plan
 * could not be read or has no such day; the caller then falls back to a topic of its own.
 */
export const planDayTopic = (rows: readonly { day: number; topic: string }[] | null | undefined, day: number): string | null =>
  rows?.find(r => r.day === day)?.topic || null;

/** Where the calendar puts a book: the day it was delivered, today, and whether the plan ended. Null start: no calendar. */
export interface BookCalendar { start: string | null; today: string; ended: boolean }

/** "19–26", or "19, 21–22, 30": consecutive pages join into one range, with an en dash. */
export function pageList(numbers: readonly number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }
  return parts.join(", ");
}

/**
 * The book's day rows. A day has started when it has an accepted scan, or when the calendar has reached it (the current
 * book only: a book with a start day and a plan that has not ended). A started day with pages left is To scan; its missing
 * pages are the known missing ones, else all its required pages. A day whose every required page has a scan is Scanned.
 * The first day after the days the calendar has reached is Next, unless the plan ended. Without a calendar (an older book,
 * or a book not delivered yet) only days with a scan say anything, and nothing is Next. When the scan records could not
 * be read, no day says Scanned, To scan or Next: the page shows one line instead.
 */
export function bookDays(schedule: ReadySchedule, calendar: BookCalendar | null): BookDays {
  const start = calendar?.start ?? null;
  const ended = calendar?.ended ?? false;
  const scansUnknown = schedule.scansUnknown;
  const reached = start === null || ended ? null : workbookDay(start, calendar!.today);
  const ring = start === null || !calendar ? null : bookToday(start, calendar.today, { ended })?.day ?? null;
  const rows = schedule.rows.map((r): DayRow => {
    const known = !scansUnknown && r.scan.kind === "known" ? r.scan : null;
    const scanned = known !== null && known.missing.length === 0;
    const started = !scansUnknown && (known !== null || (reached !== null && r.day <= reached));
    const left = started && !scanned;
    const status: DayStatus = scanned ? "scanned" : left ? "to_scan" : null;
    return { day: r.day, topic: r.topic, pages: r.pages, requiredPages: r.requiredPages, status, today: ring === r.day, missing: left ? known?.missing ?? r.requiredPages : [] };
  });
  // Next: the first day with nothing yet, once the book has a calendar or a scan to count from. Never on an ended plan.
  if (!scansUnknown && !ended && calendar !== null && (start !== null || rows.some(r => r.status !== null))) {
    const next = rows.find(r => r.status === null);
    if (next) next.status = "next";
  }
  const total = schedule.rows.reduce((n, r) => n + r.requiredPages.length, 0);
  const scanned = scansUnknown ? 0 : schedule.rows.reduce((n, r) => n + (r.scan.kind === "known" ? r.scan.accepted : 0), 0);
  const gap = rows.find(r => r.missing.length > 0) ?? null;
  const allScanned = rows.length > 0 && rows.every(r => r.status === "scanned");
  const days = rows.length || WORKBOOK_DAYS;
  // Home's rule for "Day X": the calendar's day, Day 1 before the book's first weekday; Day 10 once it is over or all is scanned.
  const day = allScanned ? days : start === null ? 1 : ring ?? (bookOver(start, calendar!.today, days) ? days : workbookDay(start, calendar!.today, days) ?? 1);
  return {
    bookId: schedule.book.id, number: schedule.book.number, rows, weeks: [rows.slice(0, 5), rows.slice(5, 10)], day,
    topic: planDayTopic(rows, day) ?? "", scanned, total, percent: total > 0 ? Math.round((scanned / total) * 100) : 0, allScanned,
    gap: gap ? { day: gap.day, pages: gap.missing } : null, scansUnknown, minutes: schedule.minutes,
  };
}

/**
 * The cover's count the way Home counts it (src/lib/parent-view.ts `readBookDays`): saved, unexpired photos over the book's
 * day pages, percent floored. The Workbooks tab and Home then say the same number for the current book.
 */
export const withHomeCount = (days: BookDays, count: { scanned: number; total: number }): BookDays =>
  ({ ...days, scanned: count.scanned, total: count.total, percent: count.total > 0 ? Math.floor((count.scanned / count.total) * 100) : 0 });

/**
 * The saved results of pages that belong to a day but are not among its required pages (the print manifest leaves extra
 * practice out): by the page's own "Day N" label, else by the day's printed page range. A required page of any day is never
 * extra. The pages of one day come in printed order.
 */
export function extraPracticePages(rows: readonly DayRow[], pages: readonly HistoryPage[], book: string): Map<number, HistoryPage[]> {
  const required = new Set(rows.flatMap(r => r.requiredPages));
  const found = new Map<number, HistoryPage[]>();
  for (const page of pages) {
    if (page.workbookId !== book || required.has(page.pageNumber)) continue;
    const labelled = dayNumber(page.day);
    const day = labelled !== null ? rows.find(r => r.day === labelled)?.day : rows.find(r => page.pageNumber >= r.pages[0] && page.pageNumber <= r.pages[1])?.day;
    if (day !== undefined) found.set(day, [...(found.get(day) ?? []), page]);
  }
  for (const list of found.values()) list.sort((a, b) => a.pageNumber - b.pageNumber);
  return found;
}

/** "About 19 min a day", or "About 20–25 min a day". */
export const minutesLine = (m: { min: number; max: number }): string => `About ${m.min === m.max ? m.max : `${m.min}–${m.max}`} min a day`;

/** The book the tab opens on: the newest delivered one (a newer book still in the mail does not hide it), else the newest. */
export const mainBook = <B extends { deliveredOn: string | null }>(books: readonly B[]): B | null => books.find(b => b.deliveredOn !== null) ?? books[0] ?? null;
