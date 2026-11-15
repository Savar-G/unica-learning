// The verdict of one tutor-core practice run (D-345): the trace metrics, the case's code checks and the teaching judge,
// read from a saved trace and a saved judge file. Pure: practice.ts loads the files and calls `teachingVerdict`.
import type { MayaTrace, TraceError } from "@/lib/maya-trace";
import { readTeachingJudgement, summarizeTeaching, teachingPlan, teachingProblems, type TeachingDimensionSummary, type TeachingTurnScores } from "./teaching-judge";
import { metricProblems, teachingMetrics, type TeachingMetrics } from "./teaching-metrics";
import type { PracticeCase } from "./cases";

/** The teaching judge's file of one run. */
export interface TeachingLog {
  kind: "maya-practice-teaching";
  version: number;
  run: string;
  judge: { model: string; promptVersion: string };
  /** The judge's output as it came, or null when the call failed or was skipped. */
  raw: unknown;
  error: TraceError | null;
  /** Why the judge was not asked: the run was already invalid, or Maya had no teaching turn to judge. */
  skipped: string | null;
  /** 1 when the first call timed out and was asked once more. */
  timeoutRetries?: number;
}

/** The skip reason of a call with no teaching turn: nothing to judge, and nothing missing. */
export const NO_TEACHING_TURN = "Maya had no teaching turn";

export interface TeachingVerdict {
  status: "pass" | "fail" | "unjudgeable";
  metrics: TeachingMetrics;
  summary: TeachingDimensionSummary[];
  turns: TeachingTurnScores[];
  /** The case's code checks: what Maya must say, and whether she did. */
  checks: { what: string; ok: boolean }[];
  /** Every reason the call misses the design's targets, the judge's pass rule or a check. */
  problems: string[];
  /** Why the judgement cannot be read, when it cannot. */
  unjudgeable: string | null;
}

/** The words of Maya's first `within` teaching turns, joined. Code's own lines (the opening, a safety line) do not count. */
function teachingWords(trace: MayaTrace, within: number): string {
  return trace.turns
    .flatMap((t) => (t.kind === "maya" && t.output && t.output.say.length > 0 && t.attempts[0]?.source !== "controller" ? [t.output.say.join(" ")] : []))
    .slice(0, within)
    .join(" ");
}

/** The case's code checks on a saved trace. */
export function caseChecks(c: PracticeCase, trace: MayaTrace): { what: string; ok: boolean }[] {
  return (c.tutor?.checks ?? []).map((check) => {
    const words = teachingWords(trace, check.within);
    return { what: `${check.what} (within ${check.within} Maya turns)`, ok: check.all.every((p) => p.test(words)) };
  });
}

/** The verdict of one run: `log` is its saved teaching judge file (null: none). */
export function teachingVerdict(c: PracticeCase, trace: MayaTrace, log: TeachingLog | null, runId: string): TeachingVerdict {
  const metrics = teachingMetrics(trace, c.tutor?.misconception);
  const checks = caseChecks(c, trace);
  const plan = teachingPlan(trace);
  const base = { metrics, checks, turns: [] as TeachingTurnScores[], summary: summarizeTeaching([]) };
  const codeProblems = [...metricProblems(metrics), ...checks.filter((x) => !x.ok).map((x) => `Maya did not say it: ${x.what}`)];
  const unjudgeable = (why: string, turns: TeachingTurnScores[] = []): TeachingVerdict => ({ ...base, turns, summary: summarizeTeaching(turns), status: "unjudgeable", problems: codeProblems, unjudgeable: why });

  if (plan.length === 0) return { ...base, status: codeProblems.length > 0 ? "fail" : "pass", problems: codeProblems, unjudgeable: null };
  if (!log || log.kind !== "maya-practice-teaching" || log.run !== runId) return unjudgeable("no readable teaching judge file");
  if (log.error) return unjudgeable(`the teaching judge call failed (${log.error.code})`);
  if (log.skipped) return unjudgeable(`the teaching judge was skipped: ${log.skipped}`);
  const read = readTeachingJudgement(log.raw, plan);
  if (!read.ok) return unjudgeable(read.reason, read.turns);
  const summary = summarizeTeaching(read.turns);
  const problems = [...teachingProblems(summary), ...codeProblems];
  return { ...base, turns: read.turns, summary, status: problems.length > 0 ? "fail" : "pass", problems, unjudgeable: null };
}
