import { describe, expect, it } from "vitest";
import { dayNumber, weekCircles, workbookDay } from "@/lib/parent-week";

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
  it("after the book's last day nothing is a book day", () => {
    expect(states("2026-11-17", "2026-11-02", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual(["Mon:open", "Tue:today", "Wed:open", "Thu:open", "Fri:open"]);
  });
  it("before the book is delivered nothing is done", () => {
    expect(states("2026-11-12", null, [1, 2, 3])).toEqual(["Mon:open", "Tue:open", "Wed:open", "Thu:today", "Fri:open"]);
  });
});
