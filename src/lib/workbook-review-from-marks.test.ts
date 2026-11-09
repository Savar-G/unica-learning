import { describe, expect, it } from "vitest";
import { SPACED_INTERVALS } from "./workbook-plan";
import { progressFixture } from "./workbook-progress-plan.fixture";
import { reviewInputsFromMarks, sourceReviewDay, type PrintedReviewEvidence, type PrintedReviewQuestion } from "./workbook-review-from-marks";

function cases() {
  const f = progressFixture(4, 5, 2);
  const skill = f.snapshot.selection.skill;
  const question = (index: number): PrintedReviewQuestion => {
    const sample = f.sample[index], first = f.originals[index].first;
    if (!sample.expected.teaching) throw Error("missing teaching");
    return { identity: sample.expected.identity, question: sample.question, teaching: sample.expected.teaching,
      mark: { firstVersion: first.observation.resultVersion, observation: structuredClone(first.observation), event: first.provenance.eventId } };
  };
  const group = (due: number, questions: PrintedReviewQuestion[]): PrintedReviewEvidence => ({ review: { skill, step: 2, interval: 0, due }, reviewDay: due, questions });
  return { question, group };
}

describe("review-only results from printed marks", () => {
  it("passes, misses, and holds distinct printed reviews without establishing mastery", () => {
    const { question, group } = cases();
    const right = question(0), wrong = question(4), missing = question(1), helped = question(2), blank = question(3);
    missing.mark = null;
    helped.mark!.observation.help = "math-help";
    blank.mark!.observation.result = "blank";
    blank.mark!.observation.readAnswerText = "";
    blank.mark!.observation.regions.forEach(region => { region.text = ""; region.value = ""; });
    const result = reviewInputsFromMarks([group(1, [right]), group(2, [wrong]), group(3, [missing]), group(4, []), group(5, [helped]), group(6, [blank])]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reviews).toEqual(expect.arrayContaining([
      expect.objectContaining({ interval: 1, due: 6 }), // passed: one-week interval
      expect.objectContaining({ interval: 0, due: 4 }), // missed: reset to two practice days
      expect.objectContaining({ interval: 0, due: 3 }), // unmarked: keep the stored review
      expect.objectContaining({ interval: 0, due: 4 }), // no printed question: keep the stored review
      expect.objectContaining({ interval: 0, due: 5 }), // assisted: keep the stored review
      expect.objectContaining({ interval: 0, due: 6 }), // blank: keep the stored review
    ]));
    expect(result.missedReviews).toEqual([expect.objectContaining({ due: 2 })]);
    expect(result.misses).toEqual([expect.objectContaining({ question: wrong.question, event: wrong.mark!.event, result: "wrong" })]);
    expect(result.held.map(h => h.reason)).toEqual(["not marked", "no printed question", "help", "not marked"]);
    expect(result.consumed).toHaveLength(2);
  });
  it("keeps a review when one item is missing, while retaining a known wrong question", () => {
    const { question, group } = cases();
    const missing = question(1); missing.mark = null;
    const result = reviewInputsFromMarks([group(2, [question(4), missing])]);
    expect(result).toMatchObject({ ok: true, reviews: [{ due: 2, interval: 0 }], missedReviews: [{ due: 2 }], misses: [{ question: question(4).question }], held: [{ reason: "not marked" }] });
  });
  it("counts the five printed days after Day 5 even when Days 8 to 10 have no scans", () => {
    const { question } = cases(), q = question(0), step = q.teaching.itemStep!;
    const reviewDay = sourceReviewDay(5);
    expect(0 - reviewDay).toBe(5);
    expect(reviewInputsFromMarks([{ review: null, skill: step.skill, step: step.step, reviewDay, questions: [q] }]))
      .toMatchObject({ ok: true, reviews: [{ interval: 0, due: reviewDay + SPACED_INTERVALS[0] }] });
    expect(() => sourceReviewDay(11)).toThrow();
  });
  it("starts the first planner interval when a passed printed review had no stored interval", () => {
    const { question } = cases(), q = question(0), step = q.teaching.itemStep!;
    const result = reviewInputsFromMarks([{ review: null, skill: step.skill, step: step.step, reviewDay: 3, questions: [q] }]);
    expect(SPACED_INTERVALS[0]).toBe(2);
    expect(result).toMatchObject({ ok: true, reviews: [{ skill: step.skill, step: step.step, interval: 0, due: 3 + SPACED_INTERVALS[0] }], held: [] });
    q.mark = null;
    expect(reviewInputsFromMarks([{ review: null, skill: step.skill, step: step.step, reviewDay: 3, questions: [q] }]))
      .toMatchObject({ ok: true, reviews: [], held: [{ reason: "not marked" }] });
  });
  it("keeps a scheduled review when its own slot was not printed, even if another matching item is right", () => {
    const { question, group } = cases();
    const result = reviewInputsFromMarks([{ ...group(1, [question(0)]), missingPrinted: true }]);
    expect(result).toMatchObject({ ok: true, reviews: [{ interval: 0, due: 1 }], held: [{ reason: "no printed question" }] });
  });
  it("holds a wrong answer that had help", () => {
    const { question, group } = cases();
    const wrong = question(4); wrong.mark!.observation.help = "math-help";
    expect(reviewInputsFromMarks([group(1, [wrong])])).toMatchObject({ ok: true, reviews: [{ due: 1, interval: 0 }],
      missedReviews: [], misses: [], consumed: [], held: [{ reason: "help" }] });
  });
  it("refuses duplicate questions and mismatched skill evidence", () => {
    const { question, group } = cases();
    const q = question(0);
    expect(reviewInputsFromMarks([group(1, [q, q])])).toEqual({ ok: false, reason: "invalid review evidence" });
    const wrongStep = group(1, [q]); if (!wrongStep.review) throw Error("missing review"); wrongStep.review.step++;
    expect(reviewInputsFromMarks([wrongStep])).toEqual({ ok: false, reason: "invalid review evidence" });
  });
});
