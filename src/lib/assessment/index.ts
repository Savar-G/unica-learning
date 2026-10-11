// The assessment core: the one tested seam (spec #54). Import from "@/lib/assessment" only.
export * from "./attempt";
export * from "./constants";
export * from "./deletion";
export * from "./facts";
export * from "./flags";
export { MISCONCEPTIONS, type Misconception, type MisconceptionId } from "./misconceptions";
export {
  reportModel,
  type Comparison,
  type FsaLine,
  type ReportContext,
  type ReportModel,
  type ReportWork,
  type ShownWork,
  type WorkReview,
} from "./report";
export {
  REPORT_TEXT_MAX,
  REPORT_TEXT_NAME,
  REVIEW_COMMENT_MAX,
  REVIEW_ERROR_TYPE_MAX,
  REVIEW_SURE_SCORE,
  checkReportText,
  reportFacts,
  workReview,
  type ReportTextCheck,
  type ReportTextProblem,
  type ReviewResult,
  type ReviewedWork,
} from "./ai-checks";
export { SAMPLE_BANK } from "./sample-bank";
export { BANKS, GRADE_1_2_BANK, bankFor } from "./bank";
export type { TaggedTemplate } from "./bank/kit";
export {
  breakDue,
  createSession,
  fillTemplate,
  finish,
  levelFor,
  nextQuestion,
  restoreSession,
  scoredAgainst,
  storedTest,
  submitAnswer,
  testStep,
  toPublicQuestion,
  type SessionOptions,
  type Submission,
} from "./session";
export type * from "./types";
export { hasWork, workProblem, type BoardWork, type WorkProblem } from "./work";
export { isLineChoice, namesChoice, readAloudText, sayChoice, spokenChoices } from "./read-aloud";
