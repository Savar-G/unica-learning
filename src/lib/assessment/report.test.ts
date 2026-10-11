import { describe, expect, it } from "vitest";
import {
  REPORT_TEXT_MAX,
  REVIEW_SURE_SCORE,
  checkReportText,
  reportModel,
  workReview,
  type Placement,
  type Province,
  type ReportModel,
  type ReviewResult,
  type ReviewedWork,
  type ShownWork,
  type WorkReview,
} from "@/lib/assessment";
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

  describe("an AI review of shown work (#68): sure or not", () => {
    const result = (extra: Partial<ReviewResult> = {}): ReviewResult => ({
      errorType: "regrouping",
      kind: "misunderstanding",
      comment: "Added each column but did not carry the 1.",
      score: 0.9,
      ...extra,
    });
    const wrong: ReviewedWork = { questionId: "s1-3", correct: false, prompt: "47 + 38 = ?", answer: "715", rightAnswer: "85", text: null };
    const right: ReviewedWork = { questionId: "s1-3", correct: true, prompt: "What is 3/4 of 12?", answer: "9", rightAnswer: "9", text: null };

    it("a clear review of a wrong answer is sure, and keeps its comment", () => {
      expect(workReview(wrong, result())).toEqual({
        questionId: "s1-3",
        errorType: "regrouping",
        kind: "misunderstanding",
        comment: "Added each column but did not carry the 1.",
        confidence: "high",
      });
    });

    it("is not sure below REVIEW_SURE_SCORE: the report shows the work without the comment", () => {
      const low = workReview(wrong, result({ score: REVIEW_SURE_SCORE - 0.01 }));
      expect(low.confidence).toBe("low");
      expect(workReview(wrong, result({ score: REVIEW_SURE_SCORE })).confidence).toBe("high");
      const shownWork: ShownWork[] = [{ questionId: "s1-3", prompt: "47 + 38 = ?", correct: false, required: true, image: "p/a/s1-3.png", text: null }];
      expect(reportModel(grade4(), { completedTestsInGrade: 0, workReviews: [low], shownWork }).work).toEqual([
        { questionId: "s1-3", prompt: "47 + 38 = ?", correct: false, image: "p/a/s1-3.png", text: null, comment: null },
      ]);
    });

    it("a score that is not a number from 0 to 1 is not sure", () => {
      for (const score of [Number.NaN, -0.5, 1.5]) expect(workReview(wrong, result({ score })).confidence, String(score)).toBe("low");
    });

    it("never contradicts the mark: a wrong answer reviewed as no error is not sure", () => {
      expect(workReview(wrong, result({ kind: "none", errorType: "none", comment: "A clear method." })).confidence).toBe("low");
      expect(workReview(right, result({ kind: "none", errorType: "none", comment: "Split 12 into 4 equal groups, then took 3 of them." })).confidence).toBe("high");
    });

    it("a comment that breaks the text rules is not sure: he or she, the AI's voice, markup, empty or too long", () => {
      for (const comment of ["She did not carry the 1.", "I think the 1 was not carried.", "**Did not carry.**", " ", "Did not carry. ".repeat(20)]) {
        expect(workReview(wrong, result({ comment })).confidence, comment).toBe("low");
      }
    });

    it("a comment with a number that is not in the question, the answers or the typed working is not sure", () => {
      expect(workReview(wrong, result({ comment: "Wrote 97 in the tens column." })).confidence).toBe("low");
      expect(workReview(wrong, result({ comment: "About 60% of the work is right." })).confidence).toBe("low");
      // A digit of the answers, such as the 1 that was not carried in 715, counts.
      expect(workReview(wrong, result({ comment: "Added 47 and 38 column by column, but did not carry the 1." })).confidence).toBe("high");
      expect(workReview({ ...wrong, text: "40 + 30 = 70" }, result({ comment: "Added the tens first: 40 and 30 make 70." })).confidence).toBe("high");
    });

    it("tidies the comment and the error type: no em-dash, single spaces", () => {
      const r = workReview(wrong, result({ comment: " Added each column \u2014 but did not\n carry. ", errorType: " carrying  in addition " }));
      expect(r).toMatchObject({ comment: "Added each column - but did not carry.", errorType: "carrying in addition", confidence: "high" });
    });
  });

  describe("the AI report text (#68)", () => {
    const withText = (reportText: string | null, placement = grade4(knowsUpTo(4))) =>
      reportModel(placement, { completedTestsInGrade: 0, workReviews: [], reportText });

    it("no text: the report has no summary, only its plain sentences", () => {
      expect(withText(null)).not.toHaveProperty("summary");
      expect(report(grade4())).not.toHaveProperty("summary");
    });

    it("keeps text that uses only numbers in the model, with the name left as a placeholder", () => {
      expect(withText("{name} is working at a grade 4 level, the same as the school grade.").summary).toBe(
        "{name} is working at a grade 4 level, the same as the school grade.",
      );
    });

    it("rejects text with a number that is not in the model, so only the plain sentences show", () => {
      const model = withText("{name} got 97% of the grade 4 questions right.");
      expect(model).not.toHaveProperty("summary");
      expect(model).toEqual(withText(null));
    });

    it("checks number words too", () => {
      expect(withText("{name} is working at a grade four level.").summary).toBe("{name} is working at a grade four level.");
      expect(withText("{name} got ninety of the questions right.")).not.toHaveProperty("summary");
    });

    it("allows the numbers of the work shown in the report", () => {
      const shownWork: ShownWork[] = [{ questionId: "s1-3", prompt: "47 + 38 = ?", correct: false, required: true, image: "p/a/s1-3.png", text: null }];
      const text = "On 47 + 38, {name} added each column but did not carry.";
      expect(reportModel(grade4(knowsUpTo(4)), { completedTestsInGrade: 0, workReviews: [], shownWork, reportText: text }).summary).toBe(text);
      expect(withText(text)).not.toHaveProperty("summary");
    });

    it("counts only the facts the report shows: numbers in ids, file paths and typed working do not count", () => {
      const shownWork: ShownWork[] = [{
        questionId: "s1-3",
        prompt: "47 + 38 = ?",
        correct: false,
        required: true,
        image: "4f1c2e9a-0b3d-4c71-97aa-1234567890ab/9e8d7c6b-5a49-4382-a1b0-c9d8e7f60514/s1-3-71ab97.png",
        text: "97 then 71",
      }];
      const model = (reportText: string) => reportModel(grade4(knowsUpTo(4)), { completedTestsInGrade: 0, workReviews: [], shownWork, reportText });
      expect(model("{name} got 97 questions right and is 71 days ahead.")).not.toHaveProperty("summary");
      expect(model("On 47 + 38, {name} did not carry.").summary).toBe("On 47 + 38, {name} did not carry.");
    });

    it("reads a number written as two words as one number", () => {
      const shownWork: ShownWork[] = [{ questionId: "s1-3", prompt: "20 + 5 = ?", correct: true, required: true, image: "p/a/s1-3.png", text: null }];
      const model = (reportText: string) => reportModel(grade4(knowsUpTo(4)), { completedTestsInGrade: 0, workReviews: [], shownWork, reportText });
      expect(model("On 20 + 5, {name} wrote twenty-five.")).not.toHaveProperty("summary");
      expect(model("On 20 + 5, {name} wrote twenty five.")).not.toHaveProperty("summary");
    });

    it("says why text was rejected, for Savar's alert", () => {
      expect(checkReportText(withText(null), "{name} got 97 of 100 right.")).toEqual({ ok: false, problem: "number", detail: "97, 100" });
    });

    it("rejects he or she: the report does not know the child's gender", () => {
      for (const text of ["She is working at a grade 4 level.", "{name} is at grade 4, and his work is neat."]) {
        expect(checkReportText(withText(null), text), text).toMatchObject({ ok: false, problem: "pronoun" });
      }
    });

    it("rejects text that speaks as the AI or names it (D-085: AI is named only in the privacy page and terms)", () => {
      for (const text of ["I think {name} is at grade 4.", "Our AI found that {name} is at grade 4.", "Claude says {name} is at grade 4."]) {
        expect(checkReportText(withText(null), text), text).toMatchObject({ ok: false, problem: "voice" });
      }
    });

    it("rejects markup, links and placeholders other than the name", () => {
      for (const text of ["**{name}** is at grade 4.", "See https://example.com for grade 4.", "{child} is at grade 4.", "<b>{name}</b> is at grade 4."]) {
        expect(checkReportText(withText(null), text), text).toMatchObject({ ok: false, problem: "format" });
      }
    });

    it("rejects empty text and text longer than REPORT_TEXT_MAX", () => {
      expect(checkReportText(withText(null), "  \n ")).toMatchObject({ ok: false, problem: "length" });
      expect(checkReportText(withText(null), `{name} is at grade 4. ${"Well done. ".repeat(REPORT_TEXT_MAX / 10)}`)).toMatchObject({ ok: false, problem: "length" });
    });

    it("tidies the kept text: no em-dash (site copy rule), single spaces, trimmed", () => {
      expect(withText("  {name} is working at a grade 4 level \u2014 the same as\n the school grade. ").summary).toBe(
        "{name} is working at a grade 4 level - the same as the school grade.",
      );
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
