import { describe, expect, it } from "vitest";
import { reportModel, type Grade } from "@/lib/assessment";
import { allRight, allWrong, knowsUpTo, takeTest, type Script } from "@/lib/assessment/scripted-child";
import { GRADES, cleanChild, gradeHint } from "@/lib/account";
import { reportAlert, reportEmail } from "@/lib/report-email";
import { comparisonView, howWeHelp, levelNotes, levelSentence, rulerLevels, verdictSentence, type ReportView } from "@/lib/report-view";

// D-156, D-158: what a parent reads for a Kindergarten, Grade 8 and Grade 9 child: the picker, the report and the emails.
function view(grade: Grade, isRight: Script): ReportView {
  const { placement } = takeTest({ grade, province: "BC" }, 7, isRight);
  return { id: "r-1", childName: "Ava", province: "BC", completedAt: "2026-10-28T19:30:00Z", questions: 42, minutes: 40, model: reportModel(placement, { workReviews: [] }) };
}
const URL = "https://example.com/account/report/r-1";
const emailText = (v: ReportView) => reportEmail({ view: v, parentName: "Sam Lee", url: URL, unsubscribeUrl: "https://example.com/u" }).text;

describe("the grade picker (D-156)", () => {
  it("offers Kindergarten to Grade 9 and says what K is", () => {
    expect(GRADES).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const g of GRADES) expect(gradeHint(g)).toMatch(/^K is Kindergarten\./);
    expect(gradeHint(0)).toContain("reads each question aloud");
  });

  it("adds no note for Grade 9, now that its test checks grade 9 math (D-158)", () => {
    expect(gradeHint(9)).toBe("K is Kindergarten.");
    expect(gradeHint(8)).not.toMatch(/Grade 9/);
  });

  it("keeps stored grades 1-7 valid, takes 0, 8 and 9, and never reads a missing grade as Kindergarten", () => {
    const child = (grade: unknown) => cleanChild({ firstName: "Ava", grade, province: "BC" });
    for (const g of GRADES) expect(child(g)?.grade).toBe(g);
    expect(child("0")?.grade).toBe(0);
    expect(child("7")?.grade).toBe(7);
    for (const bad of [null, undefined, "", " ", 10, -1, 2.5, "K", "nine"]) expect(child(bad), String(bad)).toBeNull();
  });
});

describe("the report for a Kindergarten child", () => {
  it("names Kindergarten, never grade 0", () => {
    const v = view(0, knowsUpTo(0));
    expect(levelSentence(v)).toBe("Ava is working at a kindergarten level.");
    expect(verdictSentence(v)).toBe("That matches Ava's school grade.");
    const words = [emailText(v), howWeHelp(v).text, ...levelNotes(v)].join("\n");
    expect(words).not.toMatch(/grade 0/i);
    const comparison = comparisonView({ ...v, model: { ...v.model, comparison: { stage: "bands", n: 120, band: "middle" } } });
    expect(comparison?.text).toBe("Ava's result is in the middle half of 120 kindergarten children who took this test.");
    const alert = reportAlert({ view: v, parent: { name: "Sam Lee", email: "sam@example.com" }, url: URL, flags: [], parentEmail: { sent: true } });
    expect(alert.subject).toBe("Test finished: Ava, kindergarten, working at kindergarten");
    expect(alert.text).toContain("School grade: Kindergarten (BC)");
  });

  it("says a level K estimate is an estimate, with no level below K", () => {
    const v = view(0, allWrong);
    expect(levelSentence(v)).toBe("Ava is working at a kindergarten level.");
    expect(levelNotes(v)).toContain("Ava got under 70% right at every level in this test, so kindergarten is an estimate.");
  });
});

describe("the report for a Grade 8 child", () => {
  it("brings in grade 9 topics only through the level tests (D-153)", () => {
    const v = view(8, allRight);
    expect(verdictSentence(v)).toBe("That matches Ava's school grade.");
    expect(levelNotes(v)[0]).toMatch(/^The test went up to grade 8, and Ava got 70% or more/);
    expect(howWeHelp(v).text).toBe("Ava's books keep grade 8 work steady, and bring in grade 9 topics one level at a time, each after Ava passes the level test on the grade 8 skills it builds on.");
  });
});

describe("the report for a Grade 9 child (D-158)", () => {
  it("compares the level with grade 9 and shows the ruler to grade 9", () => {
    const v = view(9, allRight);
    expect(levelSentence(v)).toBe("Ava is working at a grade 9 level.");
    expect(verdictSentence(v)).toBe("That matches Ava's school grade.");
    expect(levelNotes(v).join(" ")).not.toMatch(/up to grade 8/);
    expect(rulerLevels(v)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(howWeHelp(v).text).toBe("Ava's books keep grade 9 work steady, and add harder grade 9 problems when Ava is ready.");
    expect(emailText(v)).not.toMatch(/highest level this test checks|grade 10/i);
  });

  it("says how far below grade 9 a child is, and moves the books up to grade 9 work", () => {
    const v = view(9, knowsUpTo(8));
    expect(levelSentence(v)).toBe("Ava is working at a grade 8 level.");
    expect(verdictSentence(v)).toBe("That is one grade below Ava's school grade (grade 9).");
    expect(howWeHelp(v).text).toMatch(/^Ava's first book starts at grade 8 work.*up to grade 9 work\.$/);
    const alert = reportAlert({ view: v, parent: { name: "Sam Lee", email: "sam@example.com" }, url: URL, flags: [], parentEmail: { sent: true } });
    expect(alert.text).toContain("School grade: 9 (BC)");
    expect(alert.text).not.toContain("tested up to grade 8");
  });

  it("keeps a Grade 9 report from before D-158 compared with grade 8, the highest level that test checked", () => {
    const fresh = view(9, allRight);
    const { testedTo, ...level } = fresh.model.level;
    expect(testedTo).toBe(9);
    const v: ReportView = { ...fresh, model: { ...fresh.model, level: { ...level, working: 8 } } };
    expect(verdictSentence(v)).toBe("Grade 8 is the highest level this test checks, so that is as high as it can show.");
    expect(levelNotes(v)).toContain("This test checks math skills up to grade 8, so it does not show grade 9 work. In the program, Ava starts grade 9 topics by passing level tests on the grade 8 skills each one builds on.");
    expect(rulerLevels(v)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(howWeHelp(v).text).toMatch(/grade 9 topics one level at a time, each after Ava passes the level test/);
    const alert = reportAlert({ view: v, parent: { name: "Sam Lee", email: "sam@example.com" }, url: URL, flags: [], parentEmail: { sent: true } });
    expect(alert.text).toContain("School grade: 9 (BC), tested up to grade 8");
  });
});
