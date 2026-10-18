import { describe, expect, it } from "vitest";
import {
  REPORT_TEXT_MAX,
  REVIEW_SURE_SCORE,
  checkReportText,
  parentTextProblem,
  reportFacts,
  reportModel,
  storedReportModel,
  type FactsResult,
  type Grade,
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
import { MAIN_REJECTED_UNTESTED } from "./untested-wordings";

const grade4 = (isRight = allRight, province: Province = "BC") => takeTest({ grade: 4, province }, 1, isRight).placement;
const report = (placement: Placement, completedTestsInGrade = 0, workReviews: WorkReview[] = []) =>
  reportModel(placement, { completedTestsInGrade, workReviews });

describe("report model", () => {
  describe("comparison stage, by completed tests in the child's grade", () => {
    it("under 100 shows the grade-level scale only", () => {
      expect(report(grade4(), 99).comparison).toEqual({ stage: "scale" });
    });
    it("does not infer a rank from a raw legacy count", () => {
      for (const n of [100, 399, 400]) expect(report(grade4(), n).comparison).toEqual({ stage: "scale" });
    });
    it("builds a measured comparison without retaining any cohort input", () => {
      const placement = grade4();
      const tests = Array.from({ length: 100 }, (_, i) => ({
        id: `assessment-${i}`, childId: `child-${i}`, status: "completed", completedAt: "2026-10-11T12:00:00Z",
        email: "private@family.ca", placement,
      }));
      const model = reportModel(placement, { workReviews: [], comparison: { assessmentId: "assessment-0", tests } });
      expect(model.comparison).toEqual({ stage: "bands", n: 100, band: "middle" });
      const stored = JSON.stringify(model);
      for (const secret of ["assessment-0", "child-0", "private@family.ca", "completedAt", "stage1"]) expect(stored).not.toContain(secret);
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

    describe("the level claim the page already shows (D-133)", () => {
      const ceiling = () => grade4(allRight);
      const REPEATS = [
        "{name} may work above this level.",
        "{name} is working at a grade 5 level and may work above that level.",
        "{name} might work beyond their level.",
        "{name} could work higher than this level.",
        "Because {name} got the top level right, {name} may be working higher than this level.",
      ];

      it("is a child routed up who cleared the top level, and the model says so once", () => {
        expect(withText(null, ceiling()).level.atCeiling).toBe(true);
      });

      it("does not tell the AI that the child may work higher: the verdict block says it", () => {
        const model = withText(null, ceiling());
        expect(reportFacts(model)).not.toHaveProperty("may_work_higher");
        expect(JSON.stringify(reportFacts(model))).not.toMatch(/higher|above this/i);
      });

      it("rejects text that repeats it, new and stored, so the page says it once", () => {
        for (const text of REPEATS) {
          expect(checkReportText(withText(null, ceiling()), text), text).toMatchObject({ ok: false, problem: "repeat" });
          expect(parentTextProblem(text, 4, "summary"), text).toMatchObject({ problem: "repeat" });
          expect(withText(text, ceiling()), text).not.toHaveProperty("summary");
          expect(storedReportModel({ ...withText(null, ceiling()), summary: text }), text).not.toHaveProperty("summary");
        }
      });

      it("catches the exact repeated claim: work(s) above, beyond or higher than the level, with or without a modal", () => {
        for (const text of [
          "{name} may work above this level.",
          "{name} might work above their level.",
          "{name} could work above this level.",
          "{name} can work beyond this level.",
          "{name} works above this level.",
          "{name} is working above this level.",
          "{name} may be working above {name}'s level.",
          "{name} may work higher than this level.",
          "{name} is working at a grade 5 level and may work above that level.",
          "{name} did not miss any of the many questions in Number, Algebra or Shapes, and {name} may work above this level.",
        ]) expect(parentTextProblem(text, 4, "summary"), text).toMatchObject({ problem: "repeat" });
      });

      it("keeps a negated claim, a sentence that only mentions a level, the school grade or the areas", () => {
        for (const text of [
          "{name} does not work above this level.",
          "{name} doesn't work above this level.",
          "{name} cannot work above this level.",
          "{name} could not work above this level.",
          "{name} may not be working above this level.",
          "{name} does not yet work above this level.",
          "{name} is not yet working above this level.",
          "{name} cannot yet work above this level.",
          "{name} should not be working above this level.",
          "{name} is not currently working above this level.",
          "{name} does not need to work above this level.",
          "{name} isn't working above this level yet.",
          "{name} never works above this level.",
          "{name} is working at a grade 5 level but is not working above that level.",
          // A period inside the sentence ("Gr.", initials) does not separate a negation from its claim.
          "The results do not suggest that this Gr. 3 child works above this level.",
          "{name} is not yet ready, at the current Gr. 3 placement, to work above this level.",
          "The results do not suggest that A. J. works above this level.",
          "{name} did not miss a question. {name} may work above this level.",
          "{name} finds questions at the higher level difficult.",
          "{name} found the higher-level questions hard.",
          "{name} is not ready for a higher level.",
          "{name} could not handle harder questions.",
          "{name} is not yet ready for the next level.",
          "{name} is working at a grade 5 level, above the school grade of grade 4.",
          "{name} works above grade level in Number and fractions.",
          "{name} is working at a grade 5 level. Practise Fractions and decimals.",
          "{name} handled the Number questions well and could practise fractions.",
          "Harder fractions questions are the area to practise.",
          // Allowed by decision (D-133): a rare reworded repeat costs less than a dropped summary.
          "{name} may be ready for more challenging work.",
          "{name} is ready to progress to a higher level.",
          "{name} could handle harder work.",
          "{name} is ready for the next level.",
        ]) {
          expect(parentTextProblem(text, 4, "summary"), text).toBeNull();
          if (!/Gr\. 3/.test(text)) expect(checkReportText(withText(null, ceiling()), text).ok, text).toBe(true);
        }
      });
    });

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

  describe("fact speed in the AI report text: hidden for grades 1-4 (#242, D-120)", () => {
    // 27 of 29 facts right, about 2 seconds a fact: quick and secure.
    const FACTS: FactsResult = { families: ["add20", "sub20"], seconds: 60, answered: 29, correct: 27, skipped: 0, medianMs: 2000, accuracy: "secure", speed: "quick" };
    const withFacts = (grade: Grade, reportText: string | null = null) =>
      reportModel({ ...takeTest({ grade, province: "BC" }, 1, knowsUpTo(grade)).placement, facts: FACTS }, { completedTestsInGrade: 0, workReviews: [], reportText });
    const SPEEDY = [
      // The round's 60 seconds is not among the facts below grade 5 either (a "number" problem): see the next tests.
      "{name} got 27 facts right, accurate and quick.",
      "{name} answered the facts quickly.",
      "{name} was fast on the facts.",
      "The facts speed was good.",
      "{name} was slow on the facts.",
    ];

    it("gives the AI no fact speed for grades 1-4, and the speed from grade 5", () => {
      for (const grade of [1, 2, 3, 4] as const) {
        const facts = reportFacts(withFacts(grade)).number_facts;
        expect(facts, `grade ${grade}`).toMatchObject({ right: 27, answered: 29, accuracy: "Secure" });
        expect(facts, `grade ${grade}`).not.toHaveProperty("speed");
        expect(facts, `grade ${grade}`).not.toHaveProperty("typical_seconds_per_fact");
      }
      for (const grade of [5, 6, 7] as const) {
        expect(reportFacts(withFacts(grade)).number_facts, `grade ${grade}`).toMatchObject({ speed: "Quick", typical_seconds_per_fact: 2 });
      }
    });

    it("rejects text that states fact speed for grades 1-4, so the report keeps its plain sentences", () => {
      for (const grade of [1, 2, 3, 4] as const) {
        for (const text of SPEEDY) {
          expect(checkReportText(withFacts(grade), text), `grade ${grade}: ${text}`).toMatchObject({ ok: false, problem: "speed" });
          expect(withFacts(grade, text), `grade ${grade}: ${text}`).not.toHaveProperty("summary");
        }
        expect(withFacts(grade, "{name} got 27 of the facts right.").summary, `grade ${grade}`).toBe("{name} got 27 of the facts right.");
      }
    });

    it("for grades 1-4, gives the AI no timing of the facts at all, and rejects any text that states it (#242 r2)", () => {
      const TIMING = [
        "{name} took 2 seconds to answer each fact.",
        "{name} recalled the facts instantly.",
        "{name} answered each fact in about 2 seconds.",
        "{name} kept a steady pace on the facts.",
        "{name} needed more time on the subtraction facts.",
        "{name} took longer on the subtraction facts than on the addition facts.",
        "{name} answered the facts right away, without hesitation.",
        "{name} recalls the facts fluently.",
        "{name} answered 29 facts in one minute.",
        "{name} beat the timer on the facts.",
        "{name} zipped through the facts in record time.",
      ];
      for (const grade of [1, 2, 3, 4] as const) {
        const model = withFacts(grade);
        expect(reportFacts(model).number_facts, `grade ${grade}`).not.toHaveProperty("round_seconds");
        for (const text of TIMING) {
          expect(parentTextProblem(text, grade), `grade ${grade}: ${text}`).toMatchObject({ problem: "speed" });
          expect(checkReportText(model, text).ok, `grade ${grade}: ${text}`).toBe(false);
          expect(withFacts(grade, text), `grade ${grade}: ${text}`).not.toHaveProperty("summary");
        }
      }
      // From grade 5 the report shows the speed, so the text may state it.
      expect(reportFacts(withFacts(5)).number_facts).toMatchObject({ round_seconds: 60 });
      expect(withFacts(5, "{name} took 2 seconds to answer each fact.").summary).toBe("{name} took 2 seconds to answer each fact.");
      // Accuracy and the time each week are not the timing of the facts.
      expect(withFacts(3, "{name} got 27 of the 29 facts right.").summary).toBe("{name} got 27 of the 29 facts right.");
    });

    it("rejects text that says something was not tested, at every grade (#242 r2)", () => {
      for (const grade of [3, 5] as const) {
        for (const text of ["The multiplication facts were not tested.", "{name} was not asked about division.", "Fractions were untested."]) {
          expect(checkReportText(withFacts(grade), text), `grade ${grade}: ${text}`).toMatchObject({ ok: false, problem: "untested" });
          expect(withFacts(grade, text), `grade ${grade}: ${text}`).not.toHaveProperty("summary");
        }
      }
    });

    it("keeps text that states fact speed from grade 5", () => {
      expect(withFacts(5, "{name} got 27 facts right in 60 seconds, accurate and quick.").summary).toBe("{name} got 27 facts right in 60 seconds, accurate and quick.");
    });

    // #245: review round 2 of #242 (task-state 242/REVIEW-r2.md, review-r2/probe1.txt) found ordinary text the filters
    // dropped, and wordings they missed.
    const ORDINARY = [
      "Draw a quick picture of the groups.",
      "Ask {name} to read the word problem a second time.",
      "Encourage {name} to slow down and check each step.",
      "Read the problem slowly with {name}.",
      "Spend some time each day on facts to 20.",
      "Practise for a minute or two with dot cards.",
      "Help {name} see small groups of dots at a glance.",
      "{name} may have rushed and misread the sign.",
      "{name} is building fluency with addition facts to 20.",
      "Play a quick game of doubles.",
      "Use a timer-free game.",
      "{name} added the tens right away and forgot the ones.",
      "Count the seconds hand on a clock together.",
      "{name} hesitated between the two fractions.",
      "{name} added automatically without regrouping.",
      // Not "{name} did not check the answer." and the like: main rejected them, so they stay rejected (D-124, #245 r3).
      // Real likely causes from the production end-to-end test (review-r2/probe3.txt).
      "{name} may have subtracted the smaller number from the larger when the start was unknown.",
      "On 4 × 9 = 3 × ?, {name} wrote 36 and did not balance both sides.",
      "{name} found a second rectangle that did not match the same perimeter.",
    ];

    it("keeps ordinary text at every grade: the filters drop only claims about the facts timing and about what was not tested (#245)", () => {
      for (const grade of [1, 3, 4, 5, 7] as const) {
        for (const text of ORDINARY) expect(parentTextProblem(text, grade), `grade ${grade}: ${text}`).toBeNull();
      }
    });

    it("still rejects the reworded claims review round 2 found, new and stored (#245)", () => {
      const timing = [
        "{name} answered the facts promptly and with time to spare.",
        "{name} beat the clock on the addition facts.",
        "{name} got 27 facts right and spent longer on the subtraction facts.",
        "{name} answered 27 facts before the time ran out.",
        "{name} answered the facts in the blink of an eye.",
      ];
      for (const text of timing) {
        expect(parentTextProblem(text, 3), text).toMatchObject({ problem: "speed" });
        expect(withFacts(3, text), text).not.toHaveProperty("summary");
        expect(storedReportModel({ ...withFacts(3), summary: text }), text).not.toHaveProperty("summary");
      }
      const untested = [
        "The multiplication facts were not part of this test.",
        "The multiplication facts were not on the test.",
        "The multiplication facts have yet to be tested.",
        "Division facts were left out of the test.",
        "The test skipped the multiplication facts.",
        "The multiplication facts weren't examined.",
        "There is no result yet for the multiplication facts.",
        "The test did not reach the multiplication facts.",
      ];
      for (const text of untested) {
        expect(parentTextProblem(text, 5), text).toMatchObject({ problem: "untested" });
        expect(withFacts(5, text), text).not.toHaveProperty("summary");
        expect(storedReportModel({ ...withFacts(5), summary: text }), text).not.toHaveProperty("summary");
      }
    });

    // #245 review round 1 (task-state 245/REVIEW-r1.md, review-r1/probe1.txt and probe2.txt): at grade 5, after a facts
    // round that asked multiplication, every way of saying the test left something out. Main rejected some; the first
    // narrowed filter passed them. With #242 review round 2's set (242/review-r2/probe1.txt, UNTESTED).
    const UNTESTED_PROBES = [
      // Main rejected these.
      "Division facts: not tested.",
      "Not tested: the division facts.",
      "The multiplication facts, not tested here, may need work.",
      "The test never checked the multiplication facts.",
      "The test never asked about division.",
      "The test never tested division.",
      "The test didn't measure division.",
      "The quick facts round did not include multiplication.",
      "The questions did not cover multiplication facts.",
      "The multiplication facts were not asked.",
      "The multiplication facts were never asked.",
      "{name} was never tested on multiplication facts.",
      "{name} was not asked any multiplication facts.",
      "{name} was not asked to do multiplication facts.",
      "The multiplication facts were not tested.",
      "{name} was not asked about division.",
      "Fractions were untested.",
      // Main passed these too.
      "The test did not look at division.",
      "The facts round skipped multiplication.",
      "Multiplication was not part of the facts round.",
      "Multiplication was not in the facts round.",
      "No multiplication questions were asked.",
      "There were no multiplication questions.",
      "We do not know yet how {name} does with multiplication facts.",
      "It is not known how {name} does with multiplication facts.",
      "The multiplication facts are unknown so far.",
      "There is no result for multiplication facts.",
      "Multiplication facts have no result.",
      "{name} did not get multiplication questions.",
      "{name} had no multiplication facts on the test.",
      "This test does not show multiplication facts.",
      "Multiplication facts remain to be checked.",
      "Workbook 1 will check the multiplication facts, which the test left out.",
      "The test left out the multiplication facts.",
      "The multiplication facts were outside this test.",
      "The test had no questions on the multiplication facts.",
      "Division facts were left out of the test.",
      "The test had no multiplication facts.",
      "The multiplication facts were not in the test.",
      "The multiplication facts were not on the test.",
      "The multiplication facts have yet to be tested.",
      "The multiplication facts were not looked at.",
      "The test skipped the multiplication facts.",
      "Multiplication facts were not part of this test.",
      "The multiplication facts were not evaluated.",
      "There is no result yet for the multiplication facts.",
      "Multiplication facts still need to be tested.",
      "The test did not reach the multiplication facts.",
      "No questions asked about multiplication facts.",
      "The multiplication facts were not tried.",
      "The test gave no information about multiplication facts.",
      "Check the multiplication facts next, since the test did not look at them.",
      "The multiplication facts weren't examined.",
      "The multiplication facts were not checked.",
      "Division was not covered.",
    ];

    it("rejects every wording of \"not tested\" the reviews found, the ones main rejected first, new and stored (#245 r2)", () => {
      for (const text of UNTESTED_PROBES) {
        expect(parentTextProblem(text, 5), text).toMatchObject({ problem: "untested" });
        expect(withFacts(5, text), text).not.toHaveProperty("summary");
        expect(storedReportModel({ ...withFacts(5), summary: text }), text).not.toHaveProperty("summary");
      }
    });

    it("rejects every wording main's \"not tested\" check rejected in the review probes, new and stored, at every grade (#245 r3)", () => {
      expect(MAIN_REJECTED_UNTESTED.length).toBeGreaterThan(50);
      for (const text of MAIN_REJECTED_UNTESTED) {
        // From grade 5 nothing else applies; below it a facts sentence may be caught as speed first.
        expect(parentTextProblem(text, 5), text).toMatchObject({ problem: "untested" });
        for (const grade of [1, 3, 4, 7] as const) expect(parentTextProblem(text, grade), `grade ${grade}: ${text}`).not.toBeNull();
        for (const grade of [3, 5] as const) {
          expect(withFacts(grade, text), `grade ${grade}: ${text}`).not.toHaveProperty("summary");
          expect(storedReportModel({ ...withFacts(grade), summary: text }), `grade ${grade}: ${text}`).not.toHaveProperty("summary");
        }
      }
    });

    it("for grades 1-4, rejects any timing word in the summary, whose facts have no timing; a likely cause keeps the main test's pace (#245 r3)", () => {
      const timing = ["{name} answered quickly and accurately.", "{name} may have rushed through Number and operations.", "{name} worked at a steady pace."];
      for (const text of timing) {
        for (const grade of [1, 3, 4] as const) {
          expect(parentTextProblem(text, grade, "summary"), `grade ${grade}: ${text}`).toMatchObject({ problem: "speed" });
          expect(parentTextProblem(text, grade, "likely-cause"), `grade ${grade}: ${text}`).toBeNull();
        }
        expect(withFacts(3, text), text).not.toHaveProperty("summary");
        expect(storedReportModel({ ...withFacts(3), summary: text }), text).not.toHaveProperty("summary");
        expect(withFacts(5, text).summary, text).toBe(text);
        expect(storedReportModel({ ...withFacts(5), summary: text }).summary, text).toBe(text);
      }
    });

    it("keeps a likely cause main kept about the child's own work, and ordinary words in a facts sentence (#245 r2)", () => {
      const ordinary = [
        // Main rejected "The remainder was not included in the answer." and "{name} did not check the answer.", so they
        // stay rejected (MAIN_REJECTED_UNTESTED, D-124). These main kept.
        "Measurement was not tried by {name} on the ruler question.",
        "{name} got no questions wrong in Number and operations.",
        "{name} did not get the multiplication facts right.",
        // A facts sentence with a word that is not about speed (main kept these).
        "{name} used an efficient strategy for the addition facts.",
        "{name} knows the facts and can read the clock.",
        "When prompted, {name} recalled the facts.",
      ];
      for (const grade of [1, 3, 4, 5, 7] as const) {
        for (const text of ordinary) expect(parentTextProblem(text, grade), `grade ${grade}: ${text}`).toBeNull();
      }
    });

    it("rejects the facts timing wordings the reviews found, for grades 1-4 (#245 r2)", () => {
      // #242 review round 2 (TIMING) and #245 review round 1 (NEW-TIMING), each in a sentence about the facts, the
      // sums, the number bonds or the round. A timing word with none of these near it is kept (D-124).
      const timing = [
        "{name} answered the facts promptly.",
        "{name} answered the facts briskly.",
        "{name} finished the facts round with time to spare.",
        "{name} answered 27 facts before the time ran out.",
        "{name} rattled off the facts.",
        "{name} answered the facts in a snap.",
        "{name} took no time at all on the facts.",
        "{name} took a moment on each subtraction fact.",
        "{name} answered 27 facts within the minute.",
        "{name} answered the facts in the blink of an eye.",
        "{name} answered the addition facts with no delay.",
        "{name} answered the facts at a good clip.",
        "{name} beat the clock on the facts.",
        "{name} answered the facts like lightning.",
        "{name} answered the facts efficiently.",
        "{name} worked through the facts at a steady rate.",
        "{name} answered the facts one after another without stopping.",
        "{name} spent longer on the subtraction facts.",
        "{name} lingered on the subtraction facts.",
        "{name} knew the facts at once.",
        "{name} recalls addition facts with speed and ease.",
        "{name} knows the number facts well, with quick recall.",
        "The facts went fast for {name}.",
        "{name} was quick with sums to 20.",
        "{name}'s number bonds to 20 came fast.",
        "{name} worked through the round at speed.",
        "{name} did the quick round well. It was fast work.",
      ];
      for (const grade of [1, 3, 4] as const) {
        for (const text of timing) expect(parentTextProblem(text, grade), `grade ${grade}: ${text}`).toMatchObject({ problem: "speed" });
      }
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

// #189 (spec #181): the report shows how sure each result is, and a reliability note when more than 30% of the answers
// were very fast.
describe("certainty and reliability on the report", () => {
  it("carries the certainty of each area and of the working level", () => {
    const placement = takeTest({ grade: 4, province: "BC" }, 1, (_, i) => i !== 0).placement;
    const model = report(placement);
    expect(model.level.certainty).toBe("clear");
    expect(model.strands.filter((s) => s.certainty === "early-sign")).toHaveLength(1);
    expect(model.strands.filter((s) => s.certainty === "clear")).toHaveLength(3);
  });

  it("has a reliability note with the count of very fast answers when more than 30% were very fast", () => {
    const fast = (_: unknown, i: number) => (i % 3 === 0 ? 1_000 : 20_000);
    const placement = takeTest({ grade: 4, province: "BC" }, 1, allRight, undefined, fast).placement;
    expect(report(placement).reliability).toEqual({ veryFast: 14, answers: 42 });
  });

  it("counts the rushed wrong answers left out of the score, so the report can say so", () => {
    const fast = (_: unknown, i: number) => (i < 3 ? 1_000 : 20_000);
    const placement = takeTest({ grade: 4, province: "BC" }, 1, (_, i) => i >= 3, undefined, fast).placement;
    expect(report(placement).leftOut).toBe(3);
    expect(report(grade4()).leftOut).toBeUndefined();
  });

  it("has no reliability note for a test at a steady pace, nor for a placement stored before #189", () => {
    expect(report(grade4()).reliability).toBeUndefined();
    // As stored before #189: the keys are absent.
    const without = <T extends object>(o: T, ...keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) as T;
    const older = without(grade4(), "pace", "levelCertainty");
    const model = report({ ...older, strands: older.strands.map((s) => without(s, "certainty")) });
    expect(model.reliability).toBeUndefined();
    expect(model.level.certainty).toBeUndefined();
    expect(model.strands.every((s) => s.certainty === undefined)).toBe(true);
  });
});
