// The assessment core: the one tested seam (spec #54). Import from "@/lib/assessment" only.
export * from "./constants";
export { MISCONCEPTIONS, type Misconception, type MisconceptionId } from "./misconceptions";
export { reportModel, type Comparison, type FsaLine, type ReportContext, type ReportModel, type WorkReview } from "./report";
export { SAMPLE_BANK } from "./sample-bank";
export {
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
