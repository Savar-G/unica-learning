import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { bookLevelNote, bookOneDraft, frameAssessmentId, joinNames, resultsDeck, samplePageIndexes, wholePercents } from "@/lib/results-deck";
import { sampleReportView } from "@/lib/sample-children";
import { gapsView, nextView, type ReportView } from "@/lib/report-view";
import { sampleReportWithBook } from "@/lib/sample-book-one";
import type { BookOne } from "@/lib/report-book-one";

const book: BookOne = {
  level: 7, pagesADay: { min: 8, max: 8 }, days: 20, minutes: 30,
  main: [{ code: "U1", title: "Adding and subtracting", grade: 2, skills: ["Add to 100", "Subtract to 100", "Regroup", "Word problems"] }],
  review: [{ code: "U0", title: "Facts to 20", grade: 1, skills: ["Facts to 10"] }],
  warmUp: [], challenge: { harder: true, twoWays: false, showWhatYouKnow: true },
  next: { grade: 2, titles: ["Measuring"] }, then: { grade: 3, titles: ["Fractions"] }, covers: { U1: "main", U0: "review" }, later: ["U2"],
  mix: [{ kind: "main", code: "U1", items: 60 }, { kind: "review", code: null, items: 30 }, { kind: "challenge", code: null, items: 10 }],
};
const withBook = (bookOne: BookOne | null = book, name = "Leah"): ReportView => ({ ...sampleReportView(), childName: name, bookOne });
const deck = (...views: ReportView[]) => resultsDeck({ parentName: "Priya Shah", month: "November 2026", children: views.map((view) => ({ view })) });

describe("the results deck", () => {
  it("names one child, or all of a family's", () => {
    expect(deck(withBook()).names).toBe("Leah");
    expect(deck(withBook(), withBook(book, "Noah")).names).toBe("Leah and Noah");
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
  });

  it("shows one grade for the book, from the plan, with earlier skills as review", () => {
    const child = deck(withBook()).children[0];
    expect(child.book?.grade).toBe("Grade 2");
    expect(child.ladder).toEqual([{ label: "2", state: "book" }, { label: "3", state: "goal" }]);
    expect(child.book?.rows.map((r) => r.kind)).toEqual(["Main focus", "Review", "Challenge"]);
    expect(child.book?.rows[0].detail).toBe("Add to 100, Subtract to 100, Regroup, Word problems");
    expect(child.book?.rows[1].title).toBe("Earlier skills");
    expect(JSON.stringify(child.book?.rows)).not.toMatch(/grade/i);
  });

  it("breaks the book down by what it really holds, adding up to 100%, and starts the path after workbook 1", () => {
    const child = deck(withBook()).children[0];
    expect(child.book!.rows.map((r) => [r.title, r.questions, r.share])).toEqual([["Adding and subtracting", 60, 60], ["Earlier skills", 30, 30], ["Harder problems", 10, 10]]);
    expect(child.book!.questions).toBe(100);
    expect(wholePercents([1, 1, 1])).toEqual([34, 33, 33]);
    expect(wholePercents([1, 1, 4])).toEqual([17, 17, 66]);
    expect(wholePercents([1, 1, 1, 1, 1, 1])).toEqual([17, 17, 17, 17, 16, 16]);
    for (const v of [[1, 1, 4], [1, 1, 1, 1, 1, 1], [3, 3, 3, 3, 3, 3, 3], [5, 0, 2]]) expect(wholePercents(v).reduce((a, b) => a + b, 0)).toBe(100);
    expect(child.book!.path.some((s) => s.title === "Workbook 1")).toBe(false);
  });

  it("lists only what workbook 1 takes up under what we fill in first", () => {
    const v = sampleReportWithBook();
    const all = (gapsView(v) ?? []).concat(nextView(v) ?? []);
    expect(all.some((t) => t.cover === "In a later book")).toBe(true);
    const inBook = all.filter((t) => t.cover === "In workbook 1" || t.cover === "Review in workbook 1").slice(0, 3);
    expect(deck(v).children[0].fill).toEqual(inBook.map((t) => `${t.title} (${t.count})`));
  });

  it("has no workbook part when there is no plan", () => {
    const child = deck(withBook(null)).children[0];
    expect(child.book).toBeNull();
    expect(child.ladder.at(-1)?.state).toBe("goal");
  });

  it("never calls a child he or she", () => {
    const text = JSON.stringify(deck(withBook()).children[0].book) ;
    expect(text).not.toMatch(/\b(he|she|his|her|him)\b/i);
  });

  it("offers chat with Maya from grade 3 only", () => {
    const v = withBook();
    expect(deck({ ...v, model: { ...v.model, level: { ...v.model.level, grade: 3 } } }).children[0].chat).toBe(true);
    expect(deck({ ...v, model: { ...v.model, level: { ...v.model.level, grade: 2 } } }).children[0].chat).toBe(false);
  });

  it("picks sample pages spread through the book", () => {
    expect(samplePageIndexes(0)).toEqual([]);
    expect(samplePageIndexes(2)).toEqual([0, 1]);
    expect(samplePageIndexes(30)).toEqual([0, 10, 20]);
  });
});

describe("which draft's pages show on the Workbook 1 slide", () => {
  const frame = (assessmentId: string) => ({ planning: { placement: { profile: { assessment: { assessmentId } } } } });

  it("reads the test from a run frame's plan, and nothing from an older frame", () => {
    expect(frameAssessmentId(frame("t1"))).toBe("t1");
    expect(frameAssessmentId({ plan: {} })).toBeNull();
    expect(frameAssessmentId({ planning: { placement: { profile: null } } })).toBeNull();
    expect(frameAssessmentId(null)).toBeNull();
  });

  it("takes Workbook 1 for this report even when Workbook 2 is newer", () => {
    const runs = [
      { draftId: "book2", draftNumber: 2, assessmentId: "t1" },
      { draftId: "book1", draftNumber: 1, assessmentId: "t1" },
    ];
    expect(bookOneDraft(runs, "t1")).toBe("book1");
  });

  it("shows no pages when no Workbook 1 draft was planned from this report's test", () => {
    expect(bookOneDraft([{ draftId: "book1", draftNumber: 1, assessmentId: "older-test" }], "t1")).toBeNull();
    expect(bookOneDraft([{ draftId: "book1", draftNumber: 1, assessmentId: null }], "t1")).toBeNull();
    expect(bookOneDraft([{ draftId: "book2", draftNumber: 2, assessmentId: "t1" }], "t1")).toBeNull();
    expect(bookOneDraft([], "t1")).toBeNull();
  });
});

describe("the working level note", () => {
  it("names the planned grade when Workbook 1 starts below the working level", () => {
    const note = bookLevelNote("Leah", 4, 2);
    expect(note).toContain("Grade 4");
    expect(note).toContain("Workbook 1 starts at Grade 2");
    expect(note).not.toContain("made at this level");
  });

  it("says the book is at the same level only when it is", () => {
    expect(bookLevelNote("Leah", 2, 2)).toContain("Workbook 1 is planned at Grade 2, the same level");
  });
});
