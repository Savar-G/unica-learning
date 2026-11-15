import { addDays, weekStartFor } from "@/lib/family-time";

// This week on the dashboard Home (#1003, Option A v9): the child's Monday-to-Friday circles and which day of the
// workbook the child is on. Pure: no database, network or clock; every day is a calendar date (YYYY-MM-DD) in family
// time, which the caller reads through src/lib/family-time.ts.
//
// The workbook is 10 practice days, five a week over two weeks (.design/workbooks/CONTEXT.md). The one rule here: Day 1 is
// the first Monday-to-Friday day on or after the day the book was delivered, and each later Monday-to-Friday day is the
// next one; weekends hold no day. A weekend shows the last weekday's day. A day is "done" when every page of it has a
// saved photo (the caller's `doneDays`), never by the calendar alone. The calendar fixes which day the child is on today;
// the scans say what is finished.

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

/** What the Home's day row is called: "Today" on a Monday-to-Friday day; on a weekend it shows Friday's day. */
export const workbookDayLabel = (today: string): string => (weekdayIndex(today) < 5 ? "Today" : "Friday");

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
 * on a Monday-to-Friday day from `start` through the book's last day; any other circle stays open.
 */
export function weekCircles(today: string, start: string | null, doneDays: ReadonlySet<number>, days = WORKBOOK_DAYS): WeekDay[] {
  const monday = weekStartFor(today);
  return WEEK_LABELS.map((label, i): WeekDay => {
    const date = addDays(monday, i);
    const count = start === null || date < start ? 0 : weekdaysThrough(start, date);
    const done = count >= 1 && count <= days && doneDays.has(count);
    const state: WeekDayState = date === today ? (done ? "today_done" : "today") : done ? "done" : "open";
    return { label, state };
  });
}
