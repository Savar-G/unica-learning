import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { Level } from "@/lib/assessment";
import { GRADE_SKILLS, SKILL_AREAS, goalGrade, progressPreview, skillRows } from "@/lib/progress-preview";
import type { BookOne } from "@/lib/report-book-one";
import type { ReportView } from "@/lib/report-view";
import { sampleReportWithBook } from "@/lib/sample-book-one";
import { sampleReportView } from "@/lib/sample-children";
import { curriculumFor } from "@/lib/workbook-curriculum";

const BC = curriculumFor("bc")!;
// The first level of a grade: where Book 1 starts for a child working at that grade.
const firstLevel = (g: number) => BC.levels.find((l) => l.schoolGrade === g)!.number;
const book = (level: number): BookOne => ({
  level, pagesADay: { min: 8, max: 8 }, days: 10, minutes: 25, main: [], review: [], warmUp: [],
  challenge: { harder: true, twoWays: true, showWhatYouKnow: true }, next: { grade: 1, titles: [] }, then: null, covers: {}, later: [], mix: [],
});
// Leah, Grade 3, tested on 2026-11-11 in Vancouver.
const view = (working: Level, grade: Level, start = firstLevel(working), extra: Partial<ReportView> = {}): ReportView => {
  const base = sampleReportView();
  return {
    ...base, childName: "Leah", province: "BC", timeZone: "America/Vancouver", completedAt: "2026-11-11T20:00:00Z",
    model: { ...base.model, callToAction: "card", level: { ...base.model.level, working, grade } },
    bookOne: book(start), ...extra,
  };
};

describe("goalGrade", () => {
  it("aims below-grade children at the school grade, at-grade two up, ahead two above the working level, never above 9", () => {
    expect(goalGrade(1, 3)).toBe(3);
    expect(goalGrade(3, 3)).toBe(5);
    expect(goalGrade(4, 3)).toBe(6);
    expect(goalGrade(7, 7)).toBe(9);
    expect(goalGrade(8, 7)).toBe(9);
    expect(goalGrade(8, 9)).toBe(9);
  });
});

describe("progressPreview", () => {
  it("counts every planned book from the start level to the goal grade, a book every 2 weeks from 5 weeks after the test", () => {
    const p = progressPreview(view(1, 3))!;
    // Grades 1 and 2 hold 10 books each; Book 1 starts on 16 December 2026; 20 books later is 22 September 2027.
    expect(p.books).toHaveLength(20);
    expect(p.goal).toBe(3);
    expect(p.goalMonth).toBe("September 2027");
    expect(p.sentence).toEqual({ lead: "We predict Leah can reach a ", goal: "grade 3 level", by: "September 2027" });
    expect(p.stages).toEqual([
      { grade: 1, label: "Grade 1", books: 10, months: "Dec to May 2027" },
      { grade: 2, label: "Grade 2", books: 10, months: "May to Sep 2027" },
    ]);
    expect(p.basis).toContain("from workbook 1 in December 2026");
  });

  it("gives the at-grade and ahead cases their own goals and dates", () => {
    const at = progressPreview(view(3, 3))!;
    expect([at.goal, at.books.length, at.goalMonth]).toEqual([5, 24, "November 2027"]);
    const ahead = progressPreview(view(4, 3))!;
    expect([ahead.goal, ahead.books.length, ahead.goalMonth]).toEqual([6, 24, "November 2027"]);
    expect(ahead.todayLabel).toBe("Grade 4 level");
  });

  it("counts from the planner's start level, not the first level of the grade", () => {
    const later = progressPreview(view(1, 3, firstLevel(1) + 1))!;
    expect(later.books.length).toBeLessThan(20);
  });

  it("shows nothing without workbook 1, for a family on the waitlist, or when the start level is already at the goal", () => {
    expect(progressPreview(view(1, 3, firstLevel(1), { bookOne: null }))).toBeNull();
    const waitlist = view(1, 3);
    expect(progressPreview({ ...waitlist, model: { ...waitlist.model, callToAction: "waitlist" } })).toBeNull();
    expect(progressPreview(view(3, 3, firstLevel(5)))).toBeNull();
  });

  it("shows the path without dates when a level has no whole planned book count", () => {
    const odd = { ...BC, levels: BC.levels.map((l) => (l.number === firstLevel(1) ? { ...l, workbooks: 2.5 } : l)) };
    const p = progressPreview(view(1, 3), odd)!;
    expect(p.goalMonth).toBeNull();
    expect(p.sentence.by).toBeNull();
    expect(p.stages.every((s) => s.months === null)).toBe(true);
    expect(p.basis).not.toContain("December");
  });

  it("says the plan's pages a day and minutes", () => {
    const p = progressPreview(view(1, 3, firstLevel(1), { bookOne: { ...book(firstLevel(1)), pagesADay: { min: 4, max: 6 }, minutes: null } }))!;
    expect(p.steps[1].title).toBe("4 to 6 pages a day, 5 days a week");
    expect(p.steps[1].text).toMatch(/^About \d+( to \d+)? minutes a day/);
  });

  it("works on the sample report with the real planner", () => {
    const p = progressPreview(sampleReportWithBook());
    expect(p?.goal).toBe(3);
    expect(p?.goalMonth).toMatch(/^[A-Z][a-z]+ 20\d\d$/);
  });
});

describe("skill table", () => {
  it("lines today up with the goal row by row, with 'not started' areas as null", () => {
    expect(skillRows(1, 3)).toEqual([
      { area: "Numbers", today: "Numbers to 20", goal: "Numbers to 1,000" },
      { area: "Adding and subtracting", today: "Adds and subtracts 1-digit numbers", goal: "Adds and subtracts 3-digit numbers" },
      { area: "Multiplying and dividing", today: null, goal: "Multiplies and divides up to 5 × 5" },
      { area: "Fractions and decimals", today: null, goal: "Simple fractions, like ¼ of a group" },
    ]);
  });

  it("has every grade, and an area that starts never stops", () => {
    for (const a of SKILL_AREAS) {
      let started = false;
      for (let g = 0; g <= 9; g++) {
        const skill = GRADE_SKILLS[g as Level][a.key];
        if (started) expect(skill, `${a.name}, grade ${g}`).not.toBeNull();
        if (skill) started = true;
      }
    }
  });
});
