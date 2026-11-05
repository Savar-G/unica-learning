// The skill state of each BC standard (spec #544, "Skill states"): Mastered, Working on, Needs review or Not started,
// with the reason. Pure: no network, database or clock. Input: the child's test results, the current workbook's
// standards and the marked results. The child's profile rebuild stores each change (src/lib/child-profile.ts).
//
// When two rules fit, the first of these wins:
// 1. Needs review: the standard was Mastered, then wrong on a review item.
// 2. Mastered: Secure with Clear certainty on the test, or at least PAGE_MASTERY_MIN_RESULTS page results with 80% or
//    more right, then right on a later review item. A review item in the current workbook does not take it away.
// 3. Working on: the current workbook (the latest shipped one) has the standard.
// 4. Needs review: Needs attention with Clear certainty on the test, at or below the school grade (D-108: a result above
//    the school grade is never a weakness).
// 5. Not started: everything else, also an Early sign result.
//
// Choices the spec leaves open:
// - The rule replays every test result and mark of the standard by date before it applies the order above, so a newer
//   test does not wipe out what happened before it. A Clear test result turns Mastered from the test on (Secure) or off
//   (not Secure). An Early sign never replaces a Clear result, because one more answer could change it.
// - For rules 4 and 5, the test result of a standard is that of the newest test with a Clear result on it. With no
//   Clear result, the newest result gives the reason.
// - After a failed review, the standard stays Needs review until Mastered is earned again: by a newer Secure and Clear
//   test, or by the page rule with a later review item that is right.
import { STRAND_SECURE_PERCENT, atLeast } from "./constants";
import { strandCertainty, strandStatus } from "./certainty";
import { BC_SKILL_MAP } from "./skill-map";
import type { Grade } from "./types";

export type SkillState = "mastered" | "working_on" | "needs_review" | "not_started";

export type SkillStateReason =
  | "failed_review"
  | "secure_on_test"
  | "held_on_review"
  | "in_workbook"
  | "needs_attention_on_test"
  | "above_school_grade"
  | "early_sign_on_test"
  | "developing_on_test"
  | "no_evidence";

/** Where the reason comes from. */
export type SkillEvidence = "test" | "pages" | "workbook" | "none";

/** One test's tally of one standard. */
export interface SkillTestResult {
  standard: string;
  correct: number;
  total: number;
  /** When the test finished. */
  at: string;
}

/** One marked item's original result. `review`: a Friday 5, Mixed or Show what you know item. */
export interface SkillMark {
  standard: string;
  right: boolean;
  review: boolean;
  at: string;
}

export interface SkillStateInput {
  schoolGrade: Grade;
  /** Every finished test's tally of each standard it asked, in any order. */
  tests: readonly SkillTestResult[];
  /** The standards of the latest shipped workbook; empty with none. */
  workbookStandards: readonly string[];
  /** Every marked item's original result, in any order. */
  marks: readonly SkillMark[];
}

export interface StandardSkillState {
  standard: string;
  state: SkillState;
  reason: SkillStateReason;
  evidence: SkillEvidence;
}

/** "80% or more right on pages" needs at least this many original results for the standard. */
export const PAGE_MASTERY_MIN_RESULTS = 5;

const EVIDENCE: Record<SkillStateReason, SkillEvidence> = {
  failed_review: "pages",
  secure_on_test: "test",
  held_on_review: "pages",
  in_workbook: "workbook",
  needs_attention_on_test: "test",
  above_school_grade: "test",
  early_sign_on_test: "test",
  developing_on_test: "test",
  no_evidence: "none",
};

const newestFirst = (a: { at: string }, b: { at: string }) => Date.parse(b.at) - Date.parse(a.at);

/** The result that speaks for the standard: the newest Clear one, else the newest. */
function testResultOf(results: readonly SkillTestResult[]): SkillTestResult | null {
  const newest = results.filter((r) => r.total > 0).sort(newestFirst);
  return newest.find((r) => strandCertainty(r.correct, r.total) === "clear") ?? newest[0] ?? null;
}

const isSecureAndClear = (r: SkillTestResult): boolean =>
  strandStatus(r.correct, r.total) === "secure" && strandCertainty(r.correct, r.total) === "clear";

/**
 * Replays every test result and mark of the standard by date: is it Mastered at the end, or did it fail a review?
 * A Clear test result sets Mastered from the test: on when Secure, off when not. An Early sign changes nothing. A
 * failed review stays until Mastered is earned again, so a newer test that is not Secure does not clear it.
 */
function masteryOf(tests: readonly SkillTestResult[], marks: readonly SkillMark[]): "failed_review" | "secure_on_test" | "held_on_review" | null {
  // Tests first, so a test counts before a mark at the same time.
  const steps = [
    ...tests.filter((t) => t.total > 0).map((test) => ({ at: test.at, test, mark: null })),
    ...marks.map((mark) => ({ at: mark.at, test: null, mark })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let result: ReturnType<typeof masteryOf> = null;
  let right = 0;
  let total = 0;
  for (const { test, mark } of steps) {
    if (test) {
      if (strandCertainty(test.correct, test.total) !== "clear") continue;
      if (isSecureAndClear(test)) result = "secure_on_test";
      else if (result === "secure_on_test") result = null;
      continue;
    }
    if (!mark) continue;
    const mastered = result === "secure_on_test" || result === "held_on_review";
    // "Later": the results before this review item must meet the page rule.
    const pagesReady = total >= PAGE_MASTERY_MIN_RESULTS && atLeast(right, total, STRAND_SECURE_PERCENT);
    if (mark.review && !mark.right && mastered) result = "failed_review";
    else if (mark.review && mark.right && !mastered && pagesReady) result = "held_on_review";
    total += 1;
    if (mark.right) right += 1;
  }
  return result;
}

function reasonOf(grade: number, schoolGrade: Grade, tests: readonly SkillTestResult[], inWorkbook: boolean, marks: readonly SkillMark[]): { state: SkillState; reason: SkillStateReason } {
  const mastery = masteryOf(tests, marks);
  if (mastery === "failed_review") return { state: "needs_review", reason: mastery };
  if (mastery) return { state: "mastered", reason: mastery };
  if (inWorkbook) return { state: "working_on", reason: "in_workbook" };
  const test = testResultOf(tests);
  if (!test) return { state: "not_started", reason: "no_evidence" };
  if (strandCertainty(test.correct, test.total) === "early-sign") return { state: "not_started", reason: "early_sign_on_test" };
  if (strandStatus(test.correct, test.total) === "developing") return { state: "not_started", reason: "developing_on_test" };
  // What is left is Needs attention with Clear certainty: a Secure and Clear result always has a mastery above.
  return grade > schoolGrade ? { state: "not_started", reason: "above_school_grade" } : { state: "needs_review", reason: "needs_attention_on_test" };
}

/** The state and reason of every BC standard, in the skill map's order. A code that is not a BC standard is left out. */
export function skillStates({ schoolGrade, tests, workbookStandards, marks }: SkillStateInput): StandardSkillState[] {
  const inWorkbook = new Set(workbookStandards);
  return BC_SKILL_MAP.standards.map(({ code, grade }) => {
    const { state, reason } = reasonOf(grade, schoolGrade, tests.filter((t) => t.standard === code), inWorkbook.has(code), marks.filter((m) => m.standard === code));
    return { standard: code, state, reason, evidence: EVIDENCE[reason] };
  });
}
