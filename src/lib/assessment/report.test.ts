import { describe, expect, it } from "vitest";
import { reportModel, type Placement, type Province, type ReportModel, type ShownWork, type WorkReview } from "@/lib/assessment";
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

  describe("FSA context line: BC families, grades 4 and 7 (D-087)", () => {
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
    it("is absent outside BC, D-087 (another province is scored against BC but is not a BC family)", () => {
      for (const province of ["AB", "SK", "MB", "ON", "other"] as const) {
        expect(report(grade4(allRight, province)).fsa, province).toBeNull();
        expect(report({ ...grade4(allRight, province), grade: 7 }).fsa, province).toBeNull();
      }
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

  describe("the child's work (#67, D-087)", () => {
    const review = (questionId: string, confidence: WorkReview["confidence"]): WorkReview => ({
      questionId,
      errorType: "regrouping",
      kind: "misunderstanding",
      comment: `Comment on ${questionId}`,
      confidence,
    });
    const piece = (questionId: string, required: boolean, extra: Partial<ShownWork> = {}): ShownWork => ({
      questionId,
      prompt: `Prompt ${questionId}`,
      correct: true,
      required,
      image: `parent/test/${questionId}.png`,
      text: null,
      ...extra,
    });
    const withWork = (shownWork: ShownWork[], workReviews: WorkReview[] = []) =>
      reportModel(grade4(), { completedTestsInGrade: 0, workReviews, shownWork }).work;
    const ids = (work: ReportModel["work"]) => work.map((w) => w.questionId);

    it("no shown work: nothing to show, even with reviews", () => {
      expect(withWork([], [review("s1-3", "high")])).toEqual([]);
      expect(report(grade4()).work).toEqual([]);
    });

    it("shows each piece with its question, right or not, its drawing and its typed working", () => {
      const work = withWork([piece("s1-3", true, { correct: false, text: "47 + 25 = 62" })]);
      expect(work).toEqual([{ questionId: "s1-3", prompt: "Prompt s1-3", correct: false, image: "parent/test/s1-3.png", text: "47 + 25 = 62", comment: null }]);
    });

    it("shows at most three, show-your-work questions first, in test order", () => {
      const all = [piece("s1-1", false), piece("s1-2", true), piece("s1-5", true), piece("s1-9", false), piece("up-2", true), piece("up-7", true)];
      expect(ids(withWork(all))).toEqual(["s1-2", "s1-5", "up-2"]);
    });

    it("fills up with optional work when fewer than three questions required it, in test order", () => {
      expect(ids(withWork([piece("s1-1", false), piece("s1-2", true), piece("s1-4", false), piece("s1-6", false)]))).toEqual(["s1-1", "s1-2", "s1-4"]);
    });

    it("a sure comment shows, and its piece is picked before the others", () => {
      const all = [piece("s1-2", true), piece("s1-5", true), piece("up-2", true), piece("up-7", true)];
      const work = withWork(all, [review("up-7", "high")]);
      expect(ids(work)).toEqual(["s1-2", "s1-5", "up-7"]);
      expect(work.find((w) => w.questionId === "up-7")?.comment).toBe("Comment on up-7");
    });

    it("a comment the review is not sure about is hidden, but the work still shows", () => {
      const work = withWork([piece("s1-4", true)], [review("s1-4", "low")]);
      expect(work).toEqual([expect.objectContaining({ questionId: "s1-4", comment: null })]);
    });
  });

  describe("help warning (#71)", () => {
    it("shows when help is likely", () => {
      expect(report({ ...grade4(), flags: [{ kind: "helped", answer: "a-little" }] }).helpWarning).toBe(true);
    });
    it("is absent for a clean run, and for a few fast answers alone", () => {
      expect(report(grade4()).helpWarning).toBe(false);
      expect(report({ ...grade4(), flags: [{ kind: "too-fast", questionIds: ["s1-1", "s1-2"], right: 2 }] }).helpWarning).toBe(false);
    });
    it("is absent for a placement stored before #71, which has no flags", () => {
      const { flags, ...old } = grade4();
      void flags;
      expect(report(old as Placement).helpWarning).toBe(false);
    });
    it("never carries the flags themselves: they are for Savar, not the parent", () => {
      const model = report({ ...grade4(), flags: [{ kind: "too-fast", questionIds: ["s1-1", "s1-2", "s1-3"], right: 3 }] });
      expect(model.helpWarning).toBe(true);
      expect(JSON.stringify(model)).not.toMatch(/too-fast|s1-1/);
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
