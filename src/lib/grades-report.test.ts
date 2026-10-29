import { describe, expect, it } from "vitest";
import { reportModel, type Grade } from "@/lib/assessment";
import { allRight, allWrong, knowsUpTo, takeTest, type Script } from "@/lib/assessment/scripted-child";
import { GRADES, cleanChild, gradeHint } from "@/lib/account";
import { reportAlert, reportEmail } from "@/lib/report-email";
import { comparisonView, howWeHelp, levelNotes, levelSentence, verdictSentence, type ReportView } from "@/lib/report-view";

// D-156: what a parent reads for a Kindergarten, Grade 8 and Grade 9 child: the picker, the report and the emails.
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

  it("says plainly for Grade 9 that the test stops at Grade 8 and how Grade 9 work starts", () => {
    expect(gradeHint(9)).toBe("K is Kindergarten. The test checks math up to Grade 8. In the program, Grade 9 topics open as your child passes level tests on the Grade 8 skills they build on.");
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

describe("the report for a Grade 9 child", () => {
  it("compares the level with grade 8, the highest the test checks, and says how grade 9 work starts", () => {
    const v = view(9, allRight);
    expect(levelSentence(v)).toBe("Ava is working at a grade 8 level.");
    expect(verdictSentence(v)).toBe("Grade 8 is the highest level this test checks, so that is as high as it can show.");
    expect(levelNotes(v)).toContain("This test checks math skills up to grade 8, so it does not show grade 9 work. In the program, Ava starts grade 9 topics by passing level tests on the grade 8 skills each one builds on.");
    expect(v.model.howWeHelp).toBe("on-grade");
    expect(howWeHelp(v).text).toMatch(/grade 9 topics one level at a time, each after Ava passes the level test/);
    expect(emailText(v)).not.toMatch(/below Ava's school grade|matches Ava's school grade/);
  });

  it("says how far below grade 8 a child is, never \"below grade 9\" for what the test cannot show", () => {
    const v = view(9, knowsUpTo(7));
    expect(levelSentence(v)).toBe("Ava is working at a grade 7 level.");
    expect(verdictSentence(v)).toBe("That is one grade below grade 8, the highest level this test checks.");
    expect(howWeHelp(v).text).toMatch(/^Ava's first book starts at grade 7 work.*to grade 8 work, then to grade 9 topics one level at a time/);
    const alert = reportAlert({ view: v, parent: { name: "Sam Lee", email: "sam@example.com" }, url: URL, flags: [], parentEmail: { sent: true } });
    expect(alert.text).toContain("School grade: 9 (BC), tested up to grade 8");
  });
});
