import type { ScheduleView } from "@/lib/parent-schedule";
import { WORKBOOK_DAYS, bookOver, bookToday, workbookDay } from "@/lib/parent-week";

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
  /** Required pages with no accepted scan, for a day that has started. Empty for a day with no scan yet. */
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
  /** Days that have started and still have pages to scan: the orange rows. */
  gaps: { day: number; pages: number[] }[];
  /** The printed plan's daily minutes. */
  minutes: { min: number; max: number };
}

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
 * The book's day rows. A day is Scanned when every required page has an accepted scan. A day that has started and has
 * pages left is To scan, with its missing pages (the Schedule page's rule). With a calendar, every unscanned day up to the
 * day the child is on is To scan too, and the first day after them is Next. Without one (an older book, or a book not
 * delivered yet) only started days say anything: nothing marks a day Next.
 */
export function bookDays(schedule: ReadySchedule, calendar: BookCalendar | null): BookDays {
  const start = calendar?.start ?? null;
  const ended = calendar?.ended ?? false;
  const reached = start === null || ended ? null : workbookDay(start, calendar!.today);
  const ring = start === null || !calendar ? null : bookToday(start, calendar.today, { ended })?.day ?? null;
  const rows = schedule.rows.map((r): DayRow => {
    const known = r.scan.kind === "known" ? r.scan : null;
    const scanned = known !== null && known.missing.length === 0;
    const started = known !== null && known.missing.length > 0;
    const status: DayStatus = scanned ? "scanned" : started || (reached !== null && r.day <= reached) ? "to_scan" : null;
    return { day: r.day, topic: r.topic, pages: r.pages, requiredPages: r.requiredPages, status, today: ring === r.day, missing: started ? known.missing : [] };
  });
  // Next: the first day with nothing yet, once the book has a calendar or a scan to count from.
  if (calendar !== null && (start !== null || rows.some(r => r.status !== null))) {
    const next = rows.find(r => r.status === null);
    if (next) next.status = "next";
  }
  const total = schedule.rows.reduce((n, r) => n + r.requiredPages.length, 0);
  const scanned = schedule.rows.reduce((n, r) => n + (r.scan.kind === "known" ? r.scan.accepted : 0), 0);
  const allScanned = rows.length > 0 && rows.every(r => r.status === "scanned");
  const days = rows.length || WORKBOOK_DAYS;
  // Home's rule for "Day X": the calendar's day, Day 1 before the book's first weekday; Day 10 once it is over or all is scanned.
  const day = allScanned ? days : start === null ? 1 : ring ?? (bookOver(start, calendar!.today, days) ? days : workbookDay(start, calendar!.today, days) ?? 1);
  return {
    bookId: schedule.book.id, number: schedule.book.number, rows, weeks: [rows.slice(0, 5), rows.slice(5, 10)], day,
    topic: rows.find(r => r.day === day)?.topic ?? "", scanned, total, percent: total > 0 ? Math.round((scanned / total) * 100) : 0, allScanned,
    gaps: rows.filter(r => r.missing.length > 0).map(r => ({ day: r.day, pages: r.missing })), minutes: schedule.minutes,
  };
}

/** "About 19 min a day", or "About 20–25 min a day". */
export const minutesLine = (m: { min: number; max: number }): string => `About ${m.min === m.max ? m.max : `${m.min}–${m.max}`} min a day`;

/** The book the tab opens on: the newest delivered one (a newer book still in the mail does not hide it), else the newest. */
export const mainBook = <B extends { deliveredOn: string | null }>(books: readonly B[]): B | null => books.find(b => b.deliveredOn !== null) ?? books[0] ?? null;
