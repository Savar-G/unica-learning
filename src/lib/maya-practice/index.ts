// The practice suite's public interface (#325): model-driven practice children, simulator validity checks, the AI
// judge, the spending cap and the report. See docs/maya-practice.md. `npm run maya:practice` runs it.
export { DIMENSION_IDS, DIMENSIONS, PASS_SCORE, PRACTICE_CASES, RUNS_PER_CASE, type Dimension, type PracticeCase, type Stage, type StageOpens, type ValidityRules } from "./cases";
export { aiChildSimulator, maxWords, scriptedSimulator, SIMULATOR_PROMPT_VERSION, SIMULATOR_SYSTEM, type ChildSimulator, type SimulatorInput, type SimulatorTurn } from "./simulator";
export { aiJudge, fakeJudge, judgeSchema, JUDGE_SYSTEM, readJudgement, JUDGE_PROMPT_VERSION, type AiJudge, type DimensionResult, type JudgeInput } from "./judge";
export {
  buildReport, BudgetReached, fileHash, INVALID, requiredRuns, validityFile, validityInput, judgeFile, PRACTICE_FAILURES, recordFile, judgeRun, MAX_CHILD_TURNS, MAX_SIMULATOR_TURNS, memoryPracticeStore, PLAN_FILE, planSuite, reportMarkdown, runPractice,
  runSuite, simFile, traceFile, PRACTICE_VERSION, freeTalkMarkdown, freeTalkReport, type FreeTalkPiece, type FreeTalkReport,
  type InvalidCode, type RunRecord, type ValidityLog, type PracticeDeps, type PracticePlan, type PracticeReport, type PracticeStore, type PracticeVersions, type RunStatus, type RunVerdict,
} from "./practice";
export { cappedClient, estimateCost, MAX_OUTPUT_TOKENS, meteredFetch, MARGIN, OUTPUT_TOKENS, ROLES, Spending, worstReviewUsd, type ByRole, type CostEstimate, type Price, type Role } from "./cost";
export { capProblem, checkCredits, DEFAULT_CONCURRENCY, inFlightNeed, OPENROUTER_CONCURRENCY, practiceConcurrency, type CreditCheck } from "./credits";
export { aiValidityJudge, fakeValidityJudge, readValidity, VALIDITY_PROMPT_VERSION, VALIDITY_SYSTEM, type ValidityInput, type ValidityJudge } from "./validity-judge";
export { timedTurns, turnTimeMarkdown, type CallTimes, type TurnTimeReport } from "./turn-time";

export { generatedPracticeSet, casesFromGeneratedBook, type GeneratedPracticeSet, type GeneratedPracticeBook } from "./generated";
export { practicePackage } from "./packages";
export { practiceExecution, suiteHash, type ExecutionOptions, type PracticeExecution } from "./practice";

// D-345: the tutor core's teaching judge (T01 to T10), the trace metrics and the tutor cases.
export { aiTeachingJudge, fakeTeachingJudge, judgeFamilyProblem, modelFamily, readTeachingJudgement, summarizeTeaching, teachingJudgeInput, teachingJudgeSchema, teachingPlan, teachingProblems, TEACHING_DIMENSIONS, TEACHING_IDS, TEACHING_JUDGE_PROMPT_VERSION, TEACHING_JUDGE_SYSTEM, type TeachingJudge, type TeachingJudgeInput, type TeachingJudgement } from "./teaching-judge";
export { isAttempt, metricProblems, misconceptionFixed, teachingMetrics, LONGEST_RUN_TARGET, OVERRIDE_TARGET, type Misconception, type TeachingMetrics } from "./teaching-metrics";
export { caseChecks, teachingVerdict, type TeachingLog, type TeachingVerdict } from "./tutor-run";
export { SAVAR_CALL_CHECKS, TUTOR_CASES } from "./tutor-cases";
export { fakeTutorModel } from "./tutor-fake";
export { teachingFile, type TutorReport } from "./practice";
