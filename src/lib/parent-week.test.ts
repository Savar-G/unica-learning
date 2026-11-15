import { describe, expect, it } from "vitest";
import { bookOver, bookToday, dayNumber, doneStreak, weekCircles, weekProgress, workbookDay } from "@/lib/parent-week";

// The Home week circles and the workbook day (#1003), through the module's public interface. 2026-11-02 is a Monday.

const states = (today: string, start: string | null, done: number[]) => weekCircles(today, start, new Set(done)).map((d) => `${d.label}:${d.state}`);

describe("the workbook day of a calendar day", () => {
  it("counts the Monday-to-Friday days from the start, with the start day as Day 1", () => {
    expect(workbookDay("2026-11-02", "2026-11-02")).toBe(1);
    expect(workbookDay("2026-11-02", "2026-11-04")).toBe(3);
    expect(workbookDay("2026-11-02", "2026-11-06")).toBe(5);
    expect(workbookDay("2026-11-02", "2026-11-09")).toBe(6);
    expect(workbookDay("2026-11-02", "2026-11-13")).toBe(10);
  });
  it("holds the Friday's day over a weekend", () => {
    expect(workbookDay("2026-11-02", "2026-11-07")).toBe(5);
    expect(workbookDay("2026-11-02", "2026-11-08")).toBe(5);
  });
  it("starts a book delivered mid-week on that day, and one delivered on a weekend on the Monday", () => {
    expect(workbookDay("2026-11-04", "2026-11-04")).toBe(1);
    expect(workbookDay("2026-11-04", "2026-11-09")).toBe(4);
    expect(workbookDay("2026-11-07", "2026-11-08")).toBeNull();
    expect(workbookDay("2026-11-07", "2026-11-09")).toBe(1);
  });
  it("has no day before the start, and stops at the book's last day", () => {
    expect(workbookDay("2026-11-04", "2026-11-03")).toBeNull();
    expect(workbookDay("2026-11-02", "2026-11-30")).toBe(10);
  });
});

describe("a page's day label", () => {
  it("is a number for 'Day N', and null for a cover or another label", () => {
    expect(dayNumber("Day 4")).toBe(4);
    expect(dayNumber("Day 10")).toBe(10);
    expect(dayNumber(null)).toBeNull();
    expect(dayNumber("Monday")).toBeNull();
    expect(dayNumber("Day 4 extra")).toBeNull();
  });
});

describe("this week's circles", () => {
  // Book delivered Monday 2026-11-02: the week of 2026-11-09 holds Days 6 to 10.
  it("mid-week: finished days are done, today is ringed, the rest are open", () => {
    expect(states("2026-11-12", "2026-11-02", [6, 7, 8])).toEqual(["Mon:done", "Tue:done", "Wed:done", "Thu:today", "Fri:open"]);
  });
  it("today with every page scanned is done and ringed", () => {
    expect(states("2026-11-12", "2026-11-02", [6, 7, 8, 9])).toEqual(["Mon:done", "Tue:done", "Wed:done", "Thu:today_done", "Fri:open"]);
  });
  it("a day behind stays open: a past day that was not finished is not done", () => {
    expect(states("2026-11-12", "2026-11-02", [6, 8])).toEqual(["Mon:done", "Tue:open", "Wed:done", "Thu:today", "Fri:open"]);
  });
  it("a day not started: no day done", () => {
    expect(states("2026-11-09", "2026-11-09", [])).toEqual(["Mon:today", "Tue:open", "Wed:open", "Thu:open", "Fri:open"]);
  });
  it("a book delivered mid-week leaves the days before it open", () => {
    expect(states("2026-11-12", "2026-11-11", [1])).toEqual(["Mon:open", "Tue:open", "Wed:done", "Thu:today", "Fri:open"]);
  });
  it("a weekend rings no circle", () => {
    expect(states("2026-11-14", "2026-11-02", [6, 7, 8, 9, 10])).toEqual(["Mon:done", "Tue:done", "Wed:done", "Thu:done", "Fri:done"]);
  });
  it("after the book's last day nothing is a book day, and no circle is ringed", () => {
    expect(states("2026-11-17", "2026-11-02", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual(["Mon:open", "Tue:open", "Wed:open", "Thu:open", "Fri:open"]);
  });
  it("on the book's last day it is still ringed; the day after it is not", () => {
    expect(states("2026-11-13", "2026-11-02", [6, 7, 8, 9])).toEqual(["Mon:done", "Tue:done", "Wed:done", "Thu:done", "Fri:today"]);
    expect(states("2026-11-13", "2026-11-02", [6, 7, 8, 9, 10])).toEqual(["Mon:done", "Tue:done", "Wed:done", "Thu:done", "Fri:today_done"]);
  });
  it("once the plan ended no circle is ringed, though the days done stay done", () => {
    const ended = weekCircles("2026-11-12", "2026-11-02", new Set([6, 7, 8]), { ended: true }).map((d) => `${d.label}:${d.state}`);
    expect(ended).toEqual(["Mon:done", "Tue:done", "Wed:done", "Thu:open", "Fri:open"]);
  });
  it("before the book is delivered nothing is done", () => {
    expect(states("2026-11-12", null, [1, 2, 3])).toEqual(["Mon:open", "Tue:open", "Wed:open", "Thu:today", "Fri:open"]);
  });
});

describe("the Home's day row", () => {
  // Book delivered Monday 2026-11-02: Day 10 is Friday 2026-11-13. 2026-11-07 is a Saturday.
  it("is Today on a Monday-to-Friday day, with that day's number", () => {
    expect(bookToday("2026-11-02", "2026-11-04")).toEqual({ day: 3, label: "Today" });
    expect(bookToday("2026-11-02", "2026-11-13")).toEqual({ day: 10, label: "Today" });
  });
  it("shows the Friday's day, named Friday, over a weekend inside the book", () => {
    expect(bookToday("2026-11-02", "2026-11-07")).toEqual({ day: 5, label: "Friday" });
    expect(bookToday("2026-11-02", "2026-11-08")).toEqual({ day: 5, label: "Friday" });
  });
  it("before the first weekday (delivered on a weekend) is Day 1 named by the next weekday, never Friday", () => {
    expect(bookToday("2026-11-07", "2026-11-07")).toEqual({ day: 1, label: "Day 1 · Monday" });
    expect(bookToday("2026-11-07", "2026-11-08")).toEqual({ day: 1, label: "Day 1 · Monday" });
    expect(bookToday("2026-11-07", "2026-11-09")).toEqual({ day: 1, label: "Today" });
  });
  it("is none once the last day has passed, a weekend after it included, and once the plan ended", () => {
    expect(bookOver("2026-11-02", "2026-11-13")).toBe(false);
    expect(bookToday("2026-11-02", "2026-11-14")).toBeNull();
    expect(bookToday("2026-11-02", "2026-11-17")).toBeNull();
    expect(bookToday("2026-11-02", "2026-11-04", { ended: true })).toBeNull();
  });
});

describe("how the week is going (#990)", () => {
  // The book was delivered on Monday 2026-11-02: Day 1 is that Monday, Day 6 is Monday the 9th.
  const week = (today: string, done: number[], start: string | null = "2026-11-02", opts: Parameters<typeof weekProgress>[3] = {}) => weekProgress(today, start, new Set(done), opts);

  it("on track: every day behind us is done", () => {
    expect(week("2026-11-04", [1, 2])).toEqual({ done: 2, due: 2, missed: [], catchingUp: false });
  });
  it("today's day is not late until it is over, and counts when done", () => {
    expect(week("2026-11-04", [1, 2, 3])).toEqual({ done: 3, due: 2, missed: [], catchingUp: false });
    expect(week("2026-11-02", [])).toEqual({ done: 0, due: 0, missed: [], catchingUp: false });
  });
  it("lists the due days that are not done, earliest first", () => {
    expect(week("2026-11-05", [1])).toEqual({ done: 1, due: 3, missed: [2, 3], catchingUp: false });
    expect(week("2026-11-05", [])).toMatchObject({ done: 0, due: 3, missed: [1, 2, 3] });
  });
  it("catching up: a day is open, and the latest day behind us or today's is done", () => {
    expect(week("2026-11-04", [2])).toMatchObject({ missed: [1], catchingUp: true });
    expect(week("2026-11-04", [1, 3])).toMatchObject({ missed: [2], catchingUp: true });
    expect(week("2026-11-05", [1, 2])).toMatchObject({ missed: [3], catchingUp: false });
  });
  it("a weekend has the whole week behind it", () => {
    expect(week("2026-11-07", [1, 2, 3])).toEqual({ done: 3, due: 5, missed: [4, 5], catchingUp: false });
  });
  it("counts only the book's days: a book delivered mid-week, and the book's second week", () => {
    expect(week("2026-11-06", [1, 2], "2026-11-04")).toEqual({ done: 2, due: 2, missed: [], catchingUp: false });
    expect(week("2026-11-11", [6], "2026-11-02")).toEqual({ done: 1, due: 2, missed: [7], catchingUp: false });
  });
  it("is null before the book is delivered, once the plan ended and when no book day falls in the week", () => {
    expect(week("2026-11-04", [], null)).toBeNull();
    expect(week("2026-11-04", [1, 2], "2026-11-02", { ended: true })).toBeNull();
    expect(week("2026-11-18", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBeNull();
    expect(week("2026-11-04", [], "2026-11-09")).toBeNull();
  });
});

describe("days done in a row (#990)", () => {
  const streak = (today: string, done: number[], start: string | null = "2026-11-02", opts: Parameters<typeof doneStreak>[3] = {}) => doneStreak(today, start, new Set(done), opts);

  it("counts the done days back from today's day", () => {
    expect(streak("2026-11-05", [1, 2, 3, 4])).toBe(4);
    expect(streak("2026-11-05", [1, 3, 4])).toBe(2);
  });
  it("today's day not done yet does not break it", () => {
    expect(streak("2026-11-05", [1, 2, 3])).toBe(3);
    expect(streak("2026-11-05", [])).toBe(0);
  });
  it("a day missed before today breaks it", () => {
    expect(streak("2026-11-05", [1, 2, 4])).toBe(1);
    expect(streak("2026-11-05", [1, 2])).toBe(0);
  });
  it("runs through the weekend and into the next week", () => {
    expect(streak("2026-11-07", [3, 4, 5])).toBe(3);
    expect(streak("2026-11-09", [3, 4, 5])).toBe(3);
    expect(streak("2026-11-10", [4, 5, 6, 7])).toBe(4);
  });
  it("a weekend does not skip Friday: Friday's day not done is a break", () => {
    expect(streak("2026-11-08", [1, 2, 3, 4])).toBe(0);
  });
  it("is 0 before the book, after the plan ended, and for a book that finished in an earlier week", () => {
    expect(streak("2026-11-05", [1, 2, 3], null)).toBe(0);
    expect(streak("2026-11-05", [1, 2, 3], "2026-11-02", { ended: true })).toBe(0);
    expect(streak("2026-11-13", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(10);
    expect(streak("2026-11-16", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(0);
  });
});
