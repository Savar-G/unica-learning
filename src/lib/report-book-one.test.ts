import { describe, expect, it } from "vitest";
import { bookOne } from "@/lib/report-book-one";
import { sampleLearnerProfile, sampleReportView } from "@/lib/sample-children";

// The sample child (Leah, Grade 3, working at grade 2, misses regrouping) through the real planner: U9, unit 2.4.
describe("bookOne (D-305)", () => {
  const view = sampleReportView();
  const book = bookOne({ profile: sampleLearnerProfile()!, grade: 3, assessmentId: "sample", completedAt: view.completedAt, minutes: view.minutes, howWeHelp: view.model.howWeHelp })!;

  it("names the units the plan teaches as the main work", () => {
    expect(book.main.map((u) => [u.code, u.title, u.grade])).toEqual([["2.4", "Adding and subtracting", 2]]);
    expect(book.main[0].skills).toEqual(expect.arrayContaining(["Add and subtract tens", "Make the next ten"]));
    expect(book.covers["2.4"]).toBe("main");
  });

  it("lists earlier units from the review items, lowest grade first, never the main unit", () => {
    expect(book.review.map((u) => u.code)).toEqual(expect.arrayContaining(["1.2", "2.3"]));
    expect(book.review.some((u) => u.code === "2.4")).toBe(false);
    expect(book.review.map((u) => u.grade)).toEqual([...book.review.map((u) => u.grade)].sort((a, b) => a - b));
    expect(book.covers["2.3"]).toBe("review");
  });

  it("says what comes after: the rest of the level, then the next level's first units", () => {
    expect(book.next).toEqual({ grade: 2, titles: ["Measuring length", "Coins and saving"] });
    expect(book.later).toEqual(["2.8", "2.12"]);
    expect(book.then).toEqual({ grade: 3, titles: ["Numbers to 1000", "Adding and subtracting", "Facts to 20"] });
  });

  it("has the plan's days, the challenge parts and the fact warm-up", () => {
    expect(book.days).toBe(10);
    expect(book.challenge.harder).toBe(true);
    expect(book.warmUp.length).toBeGreaterThan(0);
  });

  it("gives null without a curriculum", () => {
    expect(bookOne({ profile: {} as never, grade: 3, assessmentId: "x", completedAt: view.completedAt, minutes: 30, howWeHelp: "behind" }, null)).toBeNull();
  });
});
