// The assessment core: the one tested seam (spec #54). Import from "@/lib/assessment" only.
export * from "./attempt";
export * from "./certainty";
export * from "./constants";
export * from "./deletion";
export { extraRoundOffer, extraRoundTaken, mainAnswered, startExtraRound, withoutRound } from "./extra-round";
export * from "./retention";
export * from "./facts";
export * from "./flags";
export * from "./rushing";
export { comparisonFor, type ComparisonInput, type ComparisonTest } from "./comparison";
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
  checkAiText,
  checkReportText,
  reportFacts,
  workReview,
  type ReportTextCheck,
  type ReportTextProblem,
  type ReviewResult,
  type ReviewedWork,
} from "./ai-checks";
export { SAMPLE_BANK } from "./sample-bank";
export { BANKS, GRADE_1_2_BANK, bankFor, wordingOf, type BankTemplate } from "./bank";
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
  testLength,
  testStep,
  toPublicQuestion,
  type SessionOptions,
  type Submission,
} from "./session";
export type * from "./types";
export { hasWork, workProblem, type BoardWork, type WorkProblem } from "./work";
export { isLineChoice, namesChoice, readAloudText, sayChoice, spokenChoices } from "./read-aloud";
export * from "./payments";
export * from "./retention-worker";
export { BC_SKILL_MAP, STRAND_NAMES, skillMapProblems, type BcSkill, type BcStandard, type SkillMap } from "./skill-map";
export { SKILL_TAGS, skillTagProblems, tagSkills, templateSkills, type SkillTag, type TemplateSkill } from "./skill-tags";
// The learner profile (#196): the facts code writes about one finished test.
export * from "./profile";
// The learner profile's AI parts (#197): what the AI reads and the checks on what it writes.
export { PROFILE_AI_SCHEMA, PROFILE_AI_TEXT_MAX, checkProfileAi, profileAiFacts, type ProfileAiCheck, type ProfileAiDrop } from "./profile-ai";
// What the parent's report shows from the learner profile (#198).
export * from "./findings";
// The copy without names (#201): each test of a family, copied before the family is deleted.
export * from "./anonymous-copy";
