import { addDays, formatCalendarDate, weekStartFor } from "@/lib/family-time";

// This week on the dashboard Home (#1003, Option A v9): the child's Monday-to-Friday circles and which day of the
// workbook the child is on. Pure: no database, network or clock; every day is a calendar date (YYYY-MM-DD) in family
// time, which the caller reads through src/lib/family-time.ts.
//
// The workbook is 10 practice days, five a week over two weeks (.design/workbooks/CONTEXT.md). The one rule here: Day 1 is
// the first Monday-to-Friday day on or after the day the book was delivered, and each later Monday-to-Friday day is the
// next one; weekends hold no day. A weekend shows the last weekday's day. A day is "done" when every page of it has a
// saved photo (the caller's `doneDays`), never by the calendar alone. The calendar fixes which day the child is on today;
// the scans say what is finished. After the book's last day, or once the plan has ended, there is no "today": no Today
// row and no ringed circle (`bookToday`, `weekCircles`).

export const WORKBOOK_DAYS = 10;
export const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export type WeekDayState = "done" | "today" | "today_done" | "open";
export interface WeekDay {
  label: (typeof WEEK_LABELS)[number];
  state: WeekDayState;
}

/** 0 for Monday to 6 for Sunday. */
function weekdayIndex(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The date of the book's `n`th day: the `n`th Monday-to-Friday day from `start` (the first is on or after `start`). */
export function bookDayDate(start: string, n: number): string {
  let day = start, count = 0;
  for (;;) {
    if (weekdayIndex(day) < 5 && ++count === n) return day;
    day = addDays(day, 1);
  }
}

/** The book's last day has passed: `today` is after the date of its day `days`. */
export const bookOver = (start: string, today: string, days = WORKBOOK_DAYS): boolean => today > bookDayDate(start, days);

/** The Home's day row: its label and the day it is about. */
export interface BookToday {
  /** "Today" on a Monday-to-Friday day; "Friday" on a weekend after Day 1; "Day 1 · Monday" before the first weekday. */
  label: string;
  /** The workbook day, 1 to `days`. */
  day: number;
}

/**
 * The Home's day row for `today`, or null when there is none: the plan ended, or the book's last day has passed. A weekend
 * shows the last weekday's day, named by its weekday. Before the book's first weekday (delivered on a weekend) the row is
 * Day 1, named by the weekday it starts on, never by "Friday".
 */
export function bookToday(start: string, today: string, { days = WORKBOOK_DAYS, ended = false }: { days?: number; ended?: boolean } = {}): BookToday | null {
  if (ended || bookOver(start, today, days)) return null;
  const count = weekdaysThrough(start, today);
  if (count === 0) return { day: 1, label: `Day 1 · ${formatCalendarDate(bookDayDate(start, 1), { weekday: "long" })}` };
  return { day: Math.min(count, days), label: weekdayIndex(today) < 5 ? "Today" : "Friday" };
}

/** The workbook day number in a page's label ("Day 4" is 4); null for a cover or any other label. */
export function dayNumber(label: string | null): number | null {
  const m = label === null ? null : /^Day (\d{1,2})$/.exec(label);
  return m ? Number(m[1]) : null;
}

/** The Monday-to-Friday days from `start` through `day`, both included. */
function weekdaysThrough(start: string, day: string): number {
  let count = 0;
  for (let d = start; d <= day; d = addDays(d, 1)) if (weekdayIndex(d) < 5) count++;
  return count;
}

/**
 * The workbook day a calendar day falls on: the count of Monday-to-Friday days from `start` through `day`, at most
 * `days`. A weekend counts the days up to the Friday before it. Null while that count is 0: `day` is before `start`, or
 * `start` and `day` are the same weekend.
 */
export function workbookDay(start: string, day: string, days = WORKBOOK_DAYS): number | null {
  const count = weekdaysThrough(start, day);
  return count === 0 ? null : Math.min(count, days);
}

/**
 * The five circles of the week `today` is in. `start`: the book's first possible day; null before it is delivered, which
 * leaves every circle open. `doneDays`: the day numbers whose every page has a saved photo. A circle is a book day only
 * on a Monday-to-Friday day from `start` through the book's last day; any other circle stays open. Today's circle is ringed
 * only while the book is on: not after its last day and not once the plan `ended`.
 */
export function weekCircles(today: string, start: string | null, doneDays: ReadonlySet<number>, { days = WORKBOOK_DAYS, ended = false }: { days?: number; ended?: boolean } = {}): WeekDay[] {
  const monday = weekStartFor(today);
  const ringed = !ended && !(start !== null && bookOver(start, today, days));
  return WEEK_LABELS.map((label, i): WeekDay => {
    const date = addDays(monday, i);
    const count = start === null || date < start ? 0 : weekdaysThrough(start, date);
    const done = count >= 1 && count <= days && doneDays.has(count);
    const state: WeekDayState = ringed && date === today ? (done ? "today_done" : "today") : done ? "done" : "open";
    return { label, state };
  });
}

/**
 * How this week is going, from the same rule as the circles (#990). Only book days count: a Monday-to-Friday day of this
 * week from the book's first day through its last. `due` is how many of them are before `today` (today is not late until
 * it is over; a weekend has every weekday behind it). `done` counts every done book day of the week, today's and an early
 * one included. `missed` lists the due days not done, as day numbers, earliest first. `catchingUp`: some day is missed,
 * and the most recent due day or today is done, so the child is back at it.
 */
export interface WeekProgress {
  done: number;
  due: number;
  missed: number[];
  catchingUp: boolean;
}

/** Null before the book is delivered, once the plan `ended`, and when no day of the book falls in this week (before it starts or after it ends). */
export function weekProgress(today: string, start: string | null, doneDays: ReadonlySet<number>, { days = WORKBOOK_DAYS, ended = false }: { days?: number; ended?: boolean } = {}): WeekProgress | null {
  if (ended || start === null) return null;
  const monday = weekStartFor(today);
  let done = 0, due = 0, bookDays = 0, todayDone = false, latestDueDone = false;
  const missed: number[] = [];
  for (let i = 0; i < WEEK_LABELS.length; i++) {
    const date = addDays(monday, i);
    const count = date < start ? 0 : weekdaysThrough(start, date);
    if (count < 1 || count > days) continue;
    bookDays++;
    const isDone = doneDays.has(count);
    if (isDone) done++;
    if (date === today) todayDone = isDone;
    if (date < today) {
      due++;
      latestDueDone = isDone;
      if (!isDone) missed.push(count);
    }
  }
  if (bookDays === 0) return null;
  return { done, due, missed, catchingUp: missed.length > 0 && (todayDone || latestDueDone) };
}

/**
 * The days the child has done in a row, ending now: the run of done book days back from today's (when today's is not
 * done yet, back from the day before, so an evening before the day's pages are scanned does not break it). 0 before the
 * book, after the plan `ended`, once the book finished in an earlier week, and when the day it ends on is not done. A weekend counts back from Friday's day.
 */
export function doneStreak(today: string, start: string | null, doneDays: ReadonlySet<number>, { days = WORKBOOK_DAYS, ended = false }: { days?: number; ended?: boolean } = {}): number {
  if (ended || start === null) return 0;
  const through = workbookDay(start, today, days);
  if (through === null) return 0;
  // A finished book's streak is news only in the week it finished; later it is old.
  if (bookOver(start, today, days) && bookDayDate(start, days) < weekStartFor(today)) return 0;
  // Today's own day (a weekday) not done yet is not a break; Friday's day on a weekend, or a book's last day after it ended, is.
  const todayOpen = weekdayIndex(today) < 5 && !bookOver(start, today, days) && !doneDays.has(through);
  let n = todayOpen ? through - 1 : through, run = 0;
  while (n >= 1 && doneDays.has(n)) { run++; n--; }
  return run;
}
