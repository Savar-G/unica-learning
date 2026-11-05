import { describe, expect, it } from "vitest";
import { BC_SKILL_MAP, skillStates, type SkillMark, type SkillStateInput, type SkillTestResult } from "@/lib/assessment";

// The skill state rule (spec #544, "Skill states"): each BC standard's state and reason, through its one function.

const CODE = "3.3";
const OTHER = "3.4";
const ABOVE = "5.8";

const test = (correct: number, total: number, day = 1, standard = CODE): SkillTestResult => ({ standard, correct, total, at: at(day) });
const at = (day: number) => `2026-10-${String(day).padStart(2, "0")}T18:00:00.000Z`;
const page = (right: boolean, day: number, standard = CODE): SkillMark => ({ standard, right, review: false, at: at(day) });
const review = (right: boolean, day: number, standard = CODE): SkillMark => ({ standard, right, review: true, at: at(day) });
/** Five right pages on days 1 to 5: enough for the page rule, once a later review holds. */
const FIVE_RIGHT = [1, 2, 3, 4, 5].map((d) => page(true, d));

function stateOf(input: Partial<SkillStateInput>, code = CODE) {
  const found = skillStates({ schoolGrade: 3, tests: [], workbookStandards: [], marks: [], ...input }).find((s) => s.standard === code);
  if (!found) throw new Error(`no state for ${code}`);
  return found;
}

describe("the skill state of a BC standard", () => {
  it("gives every BC standard one state, and nothing else", () => {
    const all = skillStates({ schoolGrade: 3, tests: [test(5, 5, 1, "not-a-code")], workbookStandards: ["not-a-code"], marks: [page(true, 1, "not-a-code")] });
    expect(all.map((s) => s.standard)).toEqual(BC_SKILL_MAP.standards.map((s) => s.code));
    expect(new Set(all.map((s) => `${s.state}/${s.reason}/${s.evidence}`))).toEqual(new Set(["not_started/no_evidence/none"]));
  });

  describe("from the test", () => {
    it("is Mastered when the test says Secure with Clear certainty", () => {
      expect(stateOf({ tests: [test(5, 5)] })).toEqual({ standard: CODE, state: "mastered", reason: "secure_on_test", evidence: "test" });
    });

    it("stays Not started on a Secure, Early sign result", () => {
      expect(stateOf({ tests: [test(1, 1)] })).toMatchObject({ state: "not_started", reason: "early_sign_on_test", evidence: "test" });
      expect(stateOf({ tests: [test(4, 5)] })).toMatchObject({ state: "not_started", reason: "early_sign_on_test" });
    });

    it("is Needs review when the test says Needs attention with Clear certainty", () => {
      expect(stateOf({ tests: [test(0, 2)] })).toEqual({ standard: CODE, state: "needs_review", reason: "needs_attention_on_test", evidence: "test" });
    });

    it("stays Not started on a Needs attention, Early sign result", () => {
      expect(stateOf({ tests: [test(0, 1)] })).toMatchObject({ state: "not_started", reason: "early_sign_on_test" });
    });

    it("stays Not started on a Developing, Clear result", () => {
      expect(stateOf({ tests: [test(3, 5)] })).toMatchObject({ state: "not_started", reason: "developing_on_test", evidence: "test" });
    });

    it("never calls a result above the school grade a weakness (D-108)", () => {
      expect(stateOf({ schoolGrade: 3, tests: [test(0, 2, 1, ABOVE)] }, ABOVE)).toMatchObject({ state: "not_started", reason: "above_school_grade", evidence: "test" });
      expect(stateOf({ schoolGrade: 5, tests: [test(0, 2, 1, ABOVE)] }, ABOVE)).toMatchObject({ state: "needs_review" });
      // Above the school grade, a strong result still counts.
      expect(stateOf({ schoolGrade: 3, tests: [test(5, 5, 1, ABOVE)] }, ABOVE)).toMatchObject({ state: "mastered" });
    });

    it("reads the newest Clear result, and an Early sign never replaces a Clear result", () => {
      expect(stateOf({ tests: [test(5, 5, 20), test(0, 2, 1)] })).toMatchObject({ state: "mastered" });
      expect(stateOf({ tests: [test(5, 5, 1), test(0, 2, 20)] })).toMatchObject({ state: "needs_review" });
      expect(stateOf({ tests: [test(5, 5, 1), test(0, 1, 20)] })).toMatchObject({ state: "mastered" });
      expect(stateOf({ tests: [test(0, 2, 1), test(1, 1, 20)] })).toMatchObject({ state: "needs_review" });
      expect(stateOf({ tests: [test(5, 5, 1), test(3, 5, 20)] })).toMatchObject({ state: "not_started", reason: "developing_on_test" });
    });

    it("keeps one standard's result off another standard", () => {
      const tests = [test(5, 5, 1, CODE), test(0, 2, 1, OTHER)];
      expect(stateOf({ tests }, CODE)).toMatchObject({ state: "mastered" });
      expect(stateOf({ tests }, OTHER)).toMatchObject({ state: "needs_review" });
    });
  });

  it("is Working on when the current workbook has the standard", () => {
    expect(stateOf({ workbookStandards: [CODE] })).toEqual({ standard: CODE, state: "working_on", reason: "in_workbook", evidence: "workbook" });
    expect(stateOf({ workbookStandards: [OTHER] })).toMatchObject({ state: "not_started" });
  });

  describe("from marked pages", () => {
    it("is Mastered with 80% or more right on at least 5 results, held on a later review", () => {
      expect(stateOf({ marks: [...FIVE_RIGHT, review(true, 6)] })).toEqual({ standard: CODE, state: "mastered", reason: "held_on_review", evidence: "pages" });
      expect(stateOf({ marks: [page(false, 1), ...FIVE_RIGHT.slice(1), review(true, 6)] })).toMatchObject({ state: "mastered" });
    });

    it("is not Mastered with no later review", () => {
      expect(stateOf({ marks: FIVE_RIGHT })).toMatchObject({ state: "not_started" });
      // A review before the pages reached the rule is not a later one.
      expect(stateOf({ marks: [review(true, 1), ...FIVE_RIGHT.map((m) => ({ ...m, at: at(5) }))] })).toMatchObject({ state: "not_started" });
    });

    it("is not Mastered under 5 results, or under 80% right", () => {
      expect(stateOf({ marks: [...FIVE_RIGHT.slice(1), review(true, 6)] })).toMatchObject({ state: "not_started" });
      expect(stateOf({ marks: [page(false, 1), page(false, 2), ...FIVE_RIGHT.slice(2), review(true, 6)] })).toMatchObject({ state: "not_started" });
    });

    it("counts a review item as a page result, and reads the marks by date", () => {
      // Four pages and a first review make 5 results; the second review is the later one that holds.
      expect(stateOf({ marks: [review(true, 6), ...FIVE_RIGHT.slice(1), review(true, 5)] })).toMatchObject({ state: "mastered", reason: "held_on_review" });
    });

    it("does not take Mastered away for a wrong item that is not a review", () => {
      expect(stateOf({ tests: [test(5, 5)], marks: [page(false, 2), page(false, 3)] })).toMatchObject({ state: "mastered" });
    });

    it("keeps one standard's marks off another standard", () => {
      expect(stateOf({ marks: [...FIVE_RIGHT, review(true, 6)] }, OTHER)).toMatchObject({ state: "not_started" });
    });
  });

  describe("after a failed review", () => {
    it("is Needs review when a Mastered standard is wrong on a later review", () => {
      expect(stateOf({ tests: [test(5, 5, 1)], marks: [review(false, 2)] })).toEqual({ standard: CODE, state: "needs_review", reason: "failed_review", evidence: "pages" });
      expect(stateOf({ marks: [...FIVE_RIGHT, review(true, 6), review(false, 7)] })).toMatchObject({ state: "needs_review", reason: "failed_review" });
    });

    it("needs the standard to be Mastered first", () => {
      expect(stateOf({ marks: [review(false, 1)] })).toMatchObject({ state: "not_started" });
      expect(stateOf({ tests: [test(5, 5, 9)], marks: [review(false, 2)] })).toMatchObject({ state: "mastered" });
    });

    it("stays Needs review until Mastered is earned again", () => {
      const failed = [test(5, 5, 1)];
      expect(stateOf({ tests: failed, marks: [review(false, 2), review(true, 3)] })).toMatchObject({ state: "needs_review" });
      expect(stateOf({ tests: failed, marks: [review(false, 2), ...[3, 4, 5, 6, 7, 8].map((d) => page(true, d)), review(true, 9)] }))
        .toMatchObject({ state: "mastered", reason: "held_on_review" });
      expect(stateOf({ tests: [...failed, test(5, 5, 9)], marks: [review(false, 2)] })).toMatchObject({ state: "mastered", reason: "secure_on_test" });
    });

    it("keeps the failed review when a newer Clear test is not Secure, also with the standard in the workbook", () => {
      // Mastered on day 10, wrong on review on day 11, Developing with Clear certainty on day 12.
      const tests = [test(5, 5, 10), test(3, 5, 12)];
      const marks = [review(false, 11)];
      expect(stateOf({ tests, marks, workbookStandards: [CODE] })).toEqual({ standard: CODE, state: "needs_review", reason: "failed_review", evidence: "pages" });
      expect(stateOf({ tests, marks })).toMatchObject({ state: "needs_review", reason: "failed_review" });
      expect(stateOf({ tests: [test(5, 5, 10), test(0, 2, 12)], marks })).toMatchObject({ state: "needs_review", reason: "failed_review" });
    });

    it("reads a review against the test results before it, not only the newest", () => {
      // Mastered on day 10, then a newer Developing, Clear test on day 11: a wrong review on day 12 is not a failed one.
      expect(stateOf({ tests: [test(5, 5, 10), test(3, 5, 11)], marks: [review(false, 12)] })).toMatchObject({ state: "not_started", reason: "developing_on_test" });
      // Mastered on day 10, wrong on review on day 11, Mastered again on day 12.
      expect(stateOf({ tests: [test(5, 5, 10), test(5, 5, 12)], marks: [review(false, 11)] })).toMatchObject({ state: "mastered", reason: "secure_on_test" });
    });
  });

  describe("when two rules fit", () => {
    it("puts a failed review first, over Mastered, Working on and the test", () => {
      expect(stateOf({ tests: [test(5, 5, 1)], workbookStandards: [CODE], marks: [review(false, 2)] })).toMatchObject({ state: "needs_review", reason: "failed_review" });
    });

    it("puts Mastered over Working on: a review item in the current workbook does not take it away", () => {
      expect(stateOf({ tests: [test(5, 5)], workbookStandards: [CODE] })).toMatchObject({ state: "mastered", reason: "secure_on_test" });
      expect(stateOf({ marks: [...FIVE_RIGHT, review(true, 6)], workbookStandards: [CODE] })).toMatchObject({ state: "mastered", reason: "held_on_review" });
    });

    it("puts Mastered from pages over Needs review from the test", () => {
      expect(stateOf({ tests: [test(0, 2, 20)], marks: [...FIVE_RIGHT, review(true, 6)] })).toMatchObject({ state: "mastered", reason: "held_on_review" });
    });

    it("puts Working on over Needs review from the test", () => {
      expect(stateOf({ tests: [test(0, 2)], workbookStandards: [CODE] })).toMatchObject({ state: "working_on", reason: "in_workbook" });
    });

    it("puts Working on over a Secure, Early sign result", () => {
      expect(stateOf({ tests: [test(1, 1)], workbookStandards: [CODE] })).toMatchObject({ state: "working_on" });
    });
  });
});
