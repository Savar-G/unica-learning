import { describe, expect, it } from "vitest";
import { bookOne } from "@/lib/report-book-one";
import { sampleLearnerProfile, sampleReportView } from "@/lib/sample-children";

// Add clear evidence to the Grade 2 sample to exercise U7 and its plan details.
describe("bookOne (D-305)", () => {
  const view = sampleReportView();
  const profile = sampleLearnerProfile()!;
  const report = { profile, grade: 3 as const, assessmentId: "sample", completedAt: view.completedAt, minutes: view.minutes, howWeHelp: view.model.howWeHelp };
  const clearProfile = { ...profile, standards: profile.standards.map(standard => standard.code === "2.4"
    ? { ...standard, total: 3 } : standard) };
  const book = bookOne({ ...report, profile: clearProfile })!;

  it("counts what the book is made of from the plan's items, teaching first", () => {
    expect(book.mix[0]).toMatchObject({ kind: "main", code: "2.1" });
    expect(book.mix.map((p) => p.kind)).toEqual(expect.arrayContaining(["main", "review", "challenge"]));
    expect(book.mix.every((p) => p.items > 0)).toBe(true);
  });

  it("names the units the plan teaches as the main work", () => {
    expect(book.main.map((u) => [u.code, u.title, u.grade])).toEqual([["2.1", "Numbers to 100", 2], ["2.5", "Patterns", 2]]);
    expect(book.main[0].skills).toEqual(expect.arrayContaining(["Count tens and ones", "Even or odd"]));
    expect(book.covers["2.1"]).toBe("main");
  });

  it("lists earlier units from the review items, lowest grade first, never the main unit", () => {
    expect(book.review.map((u) => u.code)).toEqual(expect.arrayContaining(["1.1", "1.2"]));
    expect(book.review.some((u) => book.main.some(main => main.code === u.code))).toBe(false);
    expect(book.review.map((u) => u.grade)).toEqual([...book.review.map((u) => u.grade)].sort((a, b) => a - b));
    expect(book.covers["1.2"]).toBe("review");
  });

  it("says what comes after: the rest of the level, then the next level's first units", () => {
    expect(book.next).toEqual({ grade: 2, titles: ["Benchmarks to 100", "Picture graphs"] });
    expect(book.later).toEqual(["2.2", "2.10"]);
    expect(book.then).toEqual({ grade: 2, titles: ["Facts to 20", "Changing amounts", "Equal or not"] });
  });

  it("has the plan's days and challenge parts, and lists warm-ups only when planned", () => {
    expect(book.level).toBe(7);
    expect(book.days).toBe(10);
    expect(book.challenge.harder).toBe(true);
    expect(book.warmUp).toEqual([]);
    expect(bookOne(report)).toMatchObject({ level: 8, warmUp: ["Facts to 10"] });
  });

  it("gives null without a curriculum", () => {
    expect(bookOne({ profile: {} as never, grade: 3, assessmentId: "x", completedAt: view.completedAt, minutes: 30, howWeHelp: "behind" }, null)).toBeNull();
  });
});
