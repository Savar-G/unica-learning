import { describe, expect, it } from "vitest";
import { reportModel, type Placement, type Province, type WorkReview } from "@/lib/assessment";
import { allRight, knowsUpTo, takeTest } from "./scripted-child";

const grade4 = (isRight = allRight, province: Province = "BC") => takeTest({ grade: 4, province }, 1, isRight).placement;
const report = (placement: Placement, completedTestsInGrade = 0, workReviews: WorkReview[] = []) =>
  reportModel(placement, { completedTestsInGrade, workReviews });

describe("report model", () => {
  describe("comparison stage, by completed tests in the child's grade", () => {
    it("under 100 shows the grade-level scale only", () => {
      expect(report(grade4(), 99).comparison).toEqual({ stage: "scale" });
    });
    it("100 to 399 shows bands, with n", () => {
      expect(report(grade4(), 100).comparison).toEqual({ stage: "bands", n: 100 });
      expect(report(grade4(), 399).comparison).toEqual({ stage: "bands", n: 399 });
    });
    it("400 or more shows a percentile, with n", () => {
      expect(report(grade4(), 400).comparison).toEqual({ stage: "percentile", n: 400 });
    });
  });

  describe("FSA context line", () => {
    it("shows for grade 4 with its source, and says the FSA is a different test", () => {
      const fsa = report(grade4()).fsa;
      expect(fsa).toMatchObject({ grade: 4, percent: 66.5, schoolYear: "2025/26" });
      expect(fsa?.text).toMatch(/66\.5%/);
      expect(fsa?.text).toMatch(/different test/);
      expect(fsa?.source.url).toMatch(/^https:\/\//);
    });
    it("shows for grade 7", () => {
      expect(report({ ...grade4(), grade: 7 }).fsa).toMatchObject({ grade: 7, percent: 59.2 });
    });
    it("is absent for every other grade", () => {
      for (const grade of [1, 2, 3, 5, 6] as const) expect(report({ ...grade4(), grade }).fsa).toBeNull();
    });
  });

  describe("how we help", () => {
    it("behind when the working level is below the school grade", () => {
      expect(report(grade4(knowsUpTo(2))).howWeHelp).toBe("behind");
    });
    it("on grade when the working level is the school grade", () => {
      expect(report(grade4(knowsUpTo(4))).howWeHelp).toBe("on-grade");
    });
    it("ahead when the working level is above the school grade", () => {
      expect(report(grade4(allRight)).howWeHelp).toBe("ahead");
    });
  });

  describe("call to action", () => {
    it("BC adds a card", () => {
      expect(report(grade4()).callToAction).toBe("card");
    });
    it("every other province joins the waitlist", () => {
      for (const province of ["AB", "SK", "MB", "ON", "other"] as const) {
        expect(report(grade4(allRight, province)).callToAction, province).toBe("waitlist");
      }
    });
  });

  describe("work comments", () => {
    const review = (questionId: string, confidence: WorkReview["confidence"]): WorkReview => ({
      questionId,
      errorType: "regrouping",
      kind: "misunderstanding",
      comment: `Comment on ${questionId}`,
      confidence,
    });

    it("a high-confidence comment shows", () => {
      expect(report(grade4(), 0, [review("s1-3", "high")]).work).toEqual([{ questionId: "s1-3", comment: "Comment on s1-3" }]);
    });

    it("a low-confidence comment is hidden, but the work still shows", () => {
      expect(report(grade4(), 0, [review("s1-4", "low")]).work).toEqual([{ questionId: "s1-4", comment: null }]);
    });
  });

  it("leads with the working level against the school grade, and names each strand", () => {
    const model = report(grade4(knowsUpTo(4)));
    expect(model.level).toMatchObject({ working: 4, grade: 4, atCeiling: false, confidence: "normal" });
    expect(model.strands.map((s) => s.name)).toEqual([
      "Number and operations",
      "Fractions and decimals",
      "Patterns and algebra",
      "Shapes, measurement and data",
    ]);
  });
});
