// The practice suite's public interface (#325): model-driven practice children, simulator validity checks, the AI
// judge, the spending cap and the report. See docs/maya-practice.md. `npm run maya:practice` runs it.
export { DIMENSION_IDS, DIMENSIONS, PASS_SCORE, PRACTICE_CASES, RUNS_PER_CASE, type Dimension, type PracticeCase, type Stage, type StageOpens, type ValidityRules } from "./cases";
export { aiChildSimulator, maxWords, scriptedSimulator, SIMULATOR_PROMPT_VERSION, type ChildSimulator, type SimulatorInput, type SimulatorTurn } from "./simulator";
export { aiJudge, fakeJudge, judgeSchema, readJudgement, JUDGE_PROMPT_VERSION, type AiJudge, type DimensionResult, type JudgeInput } from "./judge";
export {
  buildReport, BudgetReached, fileHash, INVALID, judgeFile, PRACTICE_FAILURES, recordFile, judgeRun, MAX_CHILD_TURNS, memoryPracticeStore, PLAN_FILE, planSuite, reportMarkdown, runPractice,
  runSuite, simFile, traceFile, PRACTICE_VERSION,
  type InvalidCode, type RunRecord, type PracticeDeps, type PracticePlan, type PracticeReport, type PracticeStore, type PracticeVersions, type RunStatus, type RunVerdict,
} from "./practice";
export { cappedClient, estimateCost, meteredFetch, MARGIN, OUTPUT_TOKENS, Spending, type CostEstimate, type Price, type Role } from "./cost";
