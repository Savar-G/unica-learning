// The skill state of each BC standard (spec #544, "Skill states"): Mastered, Working on, Needs review or Not started,
// with the reason. Pure: no network, database or clock. Input: the child's test results, the current workbook's
// standards and the marked results. The child's profile rebuild stores each change (src/lib/child-profile.ts).
//
// When two rules fit, the first of these wins:
// 1. Needs review: the standard was Mastered, then a later answer on it was wrong: on a newer test, or on any marked
//    page item. Not above the school grade (D-108: a result there is never a weakness): see below.
// 2. Mastered (D-244 as decided in #578): on a test, every answer the child gave on the standard was right, with at least
//    TEST_MASTERY_MIN_ANSWERS answers; or at least PAGE_MASTERY_MIN_RESULTS page results with 80% or more right, then
//    right on a later review item. A review item in the current workbook does not take it away.
// 3. Working on: the current workbook (the latest shipped one) has the standard.
// 4. Needs review: Needs attention with Clear certainty on the test, at or below the school grade (D-108: a result above
//    the school grade is never a weakness).
// 5. Not started: everything else: one right answer alone, an Early sign, Developing, or Secure with a wrong answer.
//
// A test's tally counts the answers the report counts: a rushed wrong answer the placement left out of the score (#189)
// is not in it (the learner profile's standards, src/lib/assessment/profile.ts), so it neither earns nor takes away
// Mastered.
//
// Choices the spec leaves open:
// - The rule replays every test result and mark of the standard by date before it applies the order above, so a newer
//   test does not wipe out what happened before it. A test with every answer right (at least 2) turns Mastered on; a
//   test with a wrong answer on a Mastered standard turns it to Needs review; a test that skips the standard, or asks it
//   once and it is right, changes nothing.
// - For rules 4 and 5, the test result of a standard is that of the newest test with a Clear result on it. With no
//   Clear result, the newest result gives the reason.
// - After a wrong answer on a Mastered standard, it stays Needs review until Mastered is earned again: by a newer test
//   with every answer right (at least 2), or by the page rule with a later review item that is right.
// - Tied times: array position does not prove "later", so all the evidence at one time is one group, read by a fixed
//   rule, in any input order. A test with every answer right (and no test with a wrong answer at that time) earns
//   Mastered, also beside a wrong mark, because that mark is not later than the test. Else a wrong answer in the group
//   takes Mastered away. The page rule counts only the results before the group, and earns nothing when the group has a
//   wrong answer: all the marks of one scan can share a time.
// - Above the school grade (D-108, D-254): every answer right (at least 2) is Mastered, because that is no weakness. A
//   later wrong answer takes Mastered away, but the standard goes back to Working on or Not started
//   ("above_school_grade"), never to Needs review.
// - History (skillStateChanges): the same replay gives every state the standard passed through, so a state between two
//   rebuilds is still one row. Each row keeps the time of its evidence, and evidence that is not newer than the rows'
//   newest time is not replayed, so a rebuild never adds a change twice. Only the end state is compared on its own, so
//   evidence that was deleted, or a workbook, still changes the state.
// - The stored reasons predate #578, so they keep their names: "secure_on_test" is a Secure test result (Mastered when
//   every answer was right, else Not started), and "failed_review" is any wrong answer after Mastered, its evidence
//   "test" or "pages" by where the wrong answer was.
import { STRAND_SECURE_PERCENT, atLeast } from "./constants";
import { strandCertainty, strandStatus } from "./certainty";
import { BC_SKILL_MAP } from "./skill-map";
import type { Grade } from "./types";

export type SkillState = "mastered" | "working_on" | "needs_review" | "not_started";

/**
 * failed_review: was Mastered, then a wrong answer on a newer test or a marked item. secure_on_test: a Secure test
 * result; Mastered when every answer was right (at least TEST_MASTERY_MIN_ANSWERS), else Not started. held_on_review: the
 * page rule. The other names say the test result, the workbook or no evidence.
 */
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

/** One test's tally of one standard: the answers the report counts, without the rushed wrong answers it leaves out (#189). */
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

/** A history row already stored, as the changes compare against it. */
export interface RecordedSkillState {
  standard: string;
  state: SkillState;
  /** The time of the evidence the row came from; null when it came from a workbook or from no evidence. */
  evidenceAt: string | null;
}

/** A history row to add. */
export interface SkillStateChange {
  standard: string;
  state: SkillState;
  reason: SkillStateReason;
  evidence: SkillEvidence;
  evidenceAt: string | null;
}

/** "80% or more right on pages" needs at least this many original results for the standard. */
export const PAGE_MASTERY_MIN_RESULTS = 5;

/** "Every answer right on a test" needs at least this many answers on the standard: one right answer alone is no proof. */
export const TEST_MASTERY_MIN_ANSWERS = 2;

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

/** Newest first; at one time, the most answers, then the fewest right, so the order of the input does not matter. */
const newestFirst = (a: SkillTestResult, b: SkillTestResult) => Date.parse(b.at) - Date.parse(a.at) || b.total - a.total || a.correct - b.correct;

/** The result that speaks for the standard: the newest Clear one, else the newest. */
function testResultOf(results: readonly SkillTestResult[]): SkillTestResult | null {
  const newest = results.filter((r) => r.total > 0).sort(newestFirst);
  return newest.find((r) => strandCertainty(r.correct, r.total) === "clear") ?? newest[0] ?? null;
}

const allRight = (r: SkillTestResult): boolean => r.total >= TEST_MASTERY_MIN_ANSWERS && r.correct === r.total;

type Mastery =
  | { kind: "mastered"; reason: "secure_on_test" | "held_on_review" }
  | { kind: "failed"; evidence: "test" | "pages" }
  | null;

/** Each time with evidence, oldest first, as milliseconds. */
function evidenceTimes(tests: readonly SkillTestResult[], marks: readonly SkillMark[]): number[] {
  return [...new Set([...tests.filter((t) => t.total > 0), ...marks].map((e) => Date.parse(e.at)))].sort((a, b) => a - b);
}

/**
 * Replays every test result and mark of the standard by date: is it Mastered at the end, or was it wrong after Mastered?
 * A test with every answer right (at least 2) sets Mastered. A wrong answer on a Mastered standard, on a test or on a
 * marked item, sets Needs review, and that stays until Mastered is earned again, so a newer test that is not all right
 * does not clear it. A test that skips the standard, or asks it once and it is right, changes nothing. The evidence at one
 * time is one group; the header gives the fixed rule.
 */
function masteryOf(tests: readonly SkillTestResult[], marks: readonly SkillMark[]): Mastery {
  let result: Mastery = null;
  let right = 0;
  let total = 0;
  for (const time of evidenceTimes(tests, marks)) {
    const groupTests = tests.filter((t) => t.total > 0 && Date.parse(t.at) === time);
    const groupMarks = marks.filter((m) => Date.parse(m.at) === time);
    const wrongTest = groupTests.some((t) => t.correct < t.total);
    const wrongMark = groupMarks.some((m) => !m.right);
    const mastered = result?.kind === "mastered";
    // "Later": the results before this group must meet the page rule.
    const pagesReady = total >= PAGE_MASTERY_MIN_RESULTS && atLeast(right, total, STRAND_SECURE_PERCENT);
    if (!wrongTest && groupTests.some(allRight)) result = { kind: "mastered", reason: "secure_on_test" };
    else if (mastered && (wrongTest || wrongMark)) result = { kind: "failed", evidence: wrongTest ? "test" : "pages" };
    else if (!mastered && !wrongTest && !wrongMark && pagesReady && groupMarks.some((m) => m.review && m.right)) result = { kind: "mastered", reason: "held_on_review" };
    total += groupMarks.length;
    right += groupMarks.filter((m) => m.right).length;
  }
  return result;
}

type Verdict = { state: SkillState; reason: SkillStateReason; evidence: SkillEvidence };

function stateOf(grade: number, schoolGrade: Grade, tests: readonly SkillTestResult[], inWorkbook: boolean, marks: readonly SkillMark[]): Verdict {
  const withEvidence = (state: SkillState, reason: SkillStateReason): Verdict => ({ state, reason, evidence: EVIDENCE[reason] });
  const mastery = masteryOf(tests, marks);
  if (mastery?.kind === "failed") {
    if (grade <= schoolGrade) return { state: "needs_review", reason: "failed_review", evidence: mastery.evidence };
    // D-108: above the school grade a wrong answer is never a weakness.
    return inWorkbook ? withEvidence("working_on", "in_workbook") : { state: "not_started", reason: "above_school_grade", evidence: mastery.evidence };
  }
  if (mastery) return withEvidence("mastered", mastery.reason);
  if (inWorkbook) return withEvidence("working_on", "in_workbook");
  const test = testResultOf(tests);
  if (!test) return withEvidence("not_started", "no_evidence");
  if (strandCertainty(test.correct, test.total) === "early-sign") return withEvidence("not_started", "early_sign_on_test");
  const status = strandStatus(test.correct, test.total);
  if (status === "developing") return withEvidence("not_started", "developing_on_test");
  // Secure with Clear certainty and a wrong answer: Mastered needs every answer right.
  if (status === "secure") return withEvidence("not_started", "secure_on_test");
  // What is left is Needs attention with Clear certainty.
  return grade > schoolGrade ? withEvidence("not_started", "above_school_grade") : withEvidence("needs_review", "needs_attention_on_test");
}

/** The state and reason of every BC standard, in the skill map's order. A code that is not a BC standard is left out. */
export function skillStates({ schoolGrade, tests, workbookStandards, marks }: SkillStateInput): StandardSkillState[] {
  const inWorkbook = new Set(workbookStandards);
  return BC_SKILL_MAP.standards.map(({ code, grade }) => {
    return { standard: code, ...stateOf(grade, schoolGrade, tests.filter((t) => t.standard === code), inWorkbook.has(code), marks.filter((m) => m.standard === code)) };
  });
}

/**
 * The history rows to add, oldest first for each standard: each state the standard passed through since the rows'
 * newest evidence, then the end state when it still differs from the last one (no row: Not started). `recorded`: the
 * child's stored rows, oldest first.
 */
export function skillStateChanges({ schoolGrade, tests, workbookStandards, marks }: SkillStateInput, recorded: readonly RecordedSkillState[]): SkillStateChange[] {
  const inWorkbook = new Set(workbookStandards);
  return BC_SKILL_MAP.standards.flatMap(({ code, grade }) => {
    const myTests = tests.filter((t) => t.standard === code);
    const myMarks = marks.filter((m) => m.standard === code);
    const rows = recorded.filter((r) => r.standard === code);
    const seen = Math.max(-Infinity, ...rows.flatMap((r) => (r.evidenceAt ? [Date.parse(r.evidenceAt)] : [])));
    const times = evidenceTimes(myTests, myMarks);
    const changes: SkillStateChange[] = [];
    let current = rows.at(-1)?.state ?? "not_started";
    const add = (verdict: Verdict, time: number | undefined) => {
      if (verdict.state === current) return;
      current = verdict.state;
      // A workbook has no date here, and no evidence has no time.
      const dated = time !== undefined && (verdict.evidence === "test" || verdict.evidence === "pages");
      changes.push({ standard: code, ...verdict, evidenceAt: dated ? new Date(time).toISOString() : null });
    };
    for (const time of times.filter((t) => t > seen)) {
      const upTo = <T extends { at: string }>(list: readonly T[]) => list.filter((e) => Date.parse(e.at) <= time);
      add(stateOf(grade, schoolGrade, upTo(myTests), inWorkbook.has(code), upTo(myMarks)), time);
    }
    add(stateOf(grade, schoolGrade, myTests, inWorkbook.has(code), myMarks), times.at(-1));
    return changes;
  });
}
