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
// A test the report calls unreliable (its stored reliability note, reportCallsUnreliable in report.ts; D-258) gives no
// evidence for any state: its tally is as if it did not exist, so it neither earns nor takes away Mastered and makes no
// weakness. A standard with no other evidence is Not started ("no_evidence"). The map and the rebuild's history both read
// this rule. A row already stored from such a test stays, and the next rebuild adds one row for the changed state. A test
// with no report yet has unknown reliability, so both readers leave it out until its report exists; the report job's
// rebuild then picks it up.
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
// - History (skillStateChanges): the history records the states the child's map showed as each rebuild saw them, not a
//   replay of every past moment. Each rebuild works out the state of each standard now, from the full replay above,
//   compares it with the standard's last row (no row: Not started), and adds one row only when they differ. So evidence
//   that changes no current state adds no row (a delayed test inside a past Mastered, Needs review, Mastered adds
//   nothing), and evidence that changes it adds a row, even when it is dated before the last row. A state that held only
//   between two rebuilds has no row.
// - A state's evidenceAt is the time of the test or mark it rests on (null for a workbook or no evidence), so a row can
//   carry an older date than the row before it. changed_at, which the database sets, is when the rebuild recorded the
//   row. Whatever counts or orders changes by time ("3 more this month", the progress line) reads changed_at, never
//   evidenceAt: the month a delayed test is dated in is not the month the child's map changed.
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
  /** The test's stored report has the reliability note: this tally is no evidence for any state. */
  unreliable: boolean;
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
  /** The time of the test or mark the state rests on; null for a workbook or no evidence. Not when the state changed: see the header. */
  evidenceAt: string | null;
}

/** A history row already stored, as the changes compare against it. */
export type RecordedSkillState = Pick<StandardSkillState, "standard" | "state">;

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

/** `at`: the time of the evidence that set it, in milliseconds. */
type Mastery =
  | { kind: "mastered"; reason: "secure_on_test" | "held_on_review"; at: number }
  | { kind: "failed"; evidence: "test" | "pages"; at: number }
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
    if (!wrongTest && groupTests.some(allRight)) result = { kind: "mastered", reason: "secure_on_test", at: time };
    else if (mastered && (wrongTest || wrongMark)) result = { kind: "failed", evidence: wrongTest ? "test" : "pages", at: time };
    else if (!mastered && !wrongTest && !wrongMark && pagesReady && groupMarks.some((m) => m.review && m.right)) result = { kind: "mastered", reason: "held_on_review", at: time };
    total += groupMarks.length;
    right += groupMarks.filter((m) => m.right).length;
  }
  return result;
}

type Verdict = Omit<StandardSkillState, "standard">;

function stateOf(grade: number, schoolGrade: Grade, tests: readonly SkillTestResult[], inWorkbook: boolean, marks: readonly SkillMark[]): Verdict {
  const verdict = (state: SkillState, reason: SkillStateReason, at: string | number | null = null): Verdict => ({
    state, reason, evidence: EVIDENCE[reason], evidenceAt: at === null ? null : new Date(at).toISOString(),
  });
  const mastery = masteryOf(tests, marks);
  if (mastery?.kind === "failed") {
    if (grade <= schoolGrade) return { ...verdict("needs_review", "failed_review", mastery.at), evidence: mastery.evidence };
    // D-108: above the school grade a wrong answer is never a weakness.
    return inWorkbook ? verdict("working_on", "in_workbook") : { ...verdict("not_started", "above_school_grade", mastery.at), evidence: mastery.evidence };
  }
  if (mastery) return verdict("mastered", mastery.reason, mastery.at);
  if (inWorkbook) return verdict("working_on", "in_workbook");
  const test = testResultOf(tests);
  if (!test) return verdict("not_started", "no_evidence");
  if (strandCertainty(test.correct, test.total) === "early-sign") return verdict("not_started", "early_sign_on_test", test.at);
  const status = strandStatus(test.correct, test.total);
  if (status === "developing") return verdict("not_started", "developing_on_test", test.at);
  // Secure with Clear certainty and a wrong answer: Mastered needs every answer right.
  if (status === "secure") return verdict("not_started", "secure_on_test", test.at);
  // What is left is Needs attention with Clear certainty.
  return grade > schoolGrade ? verdict("not_started", "above_school_grade", test.at) : verdict("needs_review", "needs_attention_on_test", test.at);
}

/** The state and reason of every BC standard, in the skill map's order. A code that is not a BC standard is left out. */
export function skillStates({ schoolGrade, tests, workbookStandards, marks }: SkillStateInput): StandardSkillState[] {
  const inWorkbook = new Set(workbookStandards);
  const counted = tests.filter((t) => !t.unreliable);
  return BC_SKILL_MAP.standards.map(({ code, grade }) => {
    return { standard: code, ...stateOf(grade, schoolGrade, counted.filter((t) => t.standard === code), inWorkbook.has(code), marks.filter((m) => m.standard === code)) };
  });
}

/**
 * The history rows to add: each standard whose state now differs from its last row (no row: Not started). `recorded`:
 * the child's stored rows, oldest first. The header gives the rule.
 */
export function skillStateChanges(input: SkillStateInput, recorded: readonly RecordedSkillState[]): StandardSkillState[] {
  const last = new Map(recorded.map((r) => [r.standard, r.state]));
  return skillStates(input).filter((s) => s.state !== (last.get(s.standard) ?? "not_started"));
}
