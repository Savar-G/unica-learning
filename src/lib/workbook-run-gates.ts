// Question quality gates on a workbook run (spec #850, slice D). The generator asks them beside the solve check.
// A failed gate rewrites the question once. After that, or when the request errors, the question stays and is flagged.
// After 10 requests, more than 20% errors stop later requests for that run.
import { decisionClient } from "@/lib/decision-client";
import type { AiUsageTag } from "@/lib/ai-usage";
import { activeQuestionGates, GATE_THRESHOLDS, GATE_THRESHOLD_VERSION, gateFlags, questionGateProbabilities, type GateInput, type QuestionGate } from "@/lib/workbook-gates";

export const GATE_OUTCOMES = ["pass", "flag", "unknown"] as const;
export type GateOutcome = (typeof GATE_OUTCOMES)[number];

/** One stored gate result. The first row at a call key stays. */
export interface StoredQuestionGate {
  callKey: string;
  questionId: string;
  model: string;
  thresholdVersion: number;
  outcome: GateOutcome;
  flags: QuestionGate[];
  probabilities: Partial<Record<QuestionGate, number>>;
  reason: string | null;
}

/** What the admin run page shows on a question that did not pass. */
export interface QuestionGateMark {
  outcome: "flag" | "unknown";
  flags: string[];
  reason: string;
}

export interface QuestionGateChecker {
  readonly model: string;
  check(input: GateInput, signal: AbortSignal): Promise<Omit<StoredQuestionGate, "callKey">>;
}

export interface QuestionGateRun {
  readonly model: string;
  /** True once this run has stopped asking because too many requests errored. */
  readonly unavailable: boolean;
  /** The stored row, a new row, or null when this run has stopped asking. */
  ask(key: string, input: GateInput, signal: AbortSignal): Promise<StoredQuestionGate | null>;
}

const OUTAGE_MIN = 10;
const OUTAGE_RATE = 0.2;

const FLAG_REASON: Record<QuestionGate, string> = {
  one_right_answer: "it may have more than one right answer",
  reading_level: "its reading level is too hard for this grade",
  picture_matches: "the picture does not match the question",
  uses_interest: "it does not use the child's interest",
};

/** The redo's reason for a flagged question. */
export function gateReason(flags: readonly QuestionGate[]): string {
  const named = flags.map((flag) => FLAG_REASON[flag]);
  return `A quality gate flagged this question: ${named.join("; ")}. Write it again so it has exactly one right answer at this grade.`;
}

/** A flag on the page's first call is the one check redo. An error, or a flag after that call, keeps the question. */
export function gateNeedsRewrite(callName: string, row: StoredQuestionGate): boolean {
  return row.outcome === "flag" && callName === "workbook_page";
}

export function gateMark(row: StoredQuestionGate): QuestionGateMark | null {
  if (row.outcome === "pass") return null;
  return {
    outcome: row.outcome,
    flags: row.flags,
    reason: row.reason ?? (row.outcome === "unknown" ? "The quality gate did not answer, so this question is flagged for review." : gateReason(row.flags)),
  };
}

/**
 * The live checker: the decision client, asking only the gates the report marks on for its model. Null when decisions
 * are off or no gate is on. An errored request is `unknown`, not a throw, so the run can flag it and go on.
 */
export function decisionGateChecker(env: Record<string, string | undefined>, usage?: AiUsageTag): QuestionGateChecker | null {
  const client = decisionClient(env, undefined, { usage: usage ?? { feature: "workbook_gate" } });
  if (!client) return null;
  const only = activeQuestionGates(client.model);
  if (!only.length) return null;
  return {
    model: client.model,
    async check(input, signal) {
      try {
        const { probabilities } = await questionGateProbabilities(client, input, signal, only);
        const flags = gateFlags(client.model as keyof typeof GATE_THRESHOLDS, probabilities);
        return {
          questionId: input.question.id, model: client.model, thresholdVersion: GATE_THRESHOLD_VERSION,
          outcome: flags.length ? "flag" : "pass", flags, probabilities,
          reason: flags.length ? gateReason(flags) : null,
        };
      } catch (e) {
        const reason = e instanceof Error ? e.message.slice(0, 200) : "the quality gate failed";
        return {
          questionId: input.question.id, model: client.model, thresholdVersion: GATE_THRESHOLD_VERSION,
          outcome: "unknown", flags: [], probabilities: {}, reason,
        };
      }
    },
  };
}

/** A run's gate results. Stored keys are not asked again. The outage guard counts every request of the run. */
export function openQuestionGateRun(
  checker: QuestionGateChecker,
  stored: readonly StoredQuestionGate[],
  save: (row: StoredQuestionGate) => Promise<void>,
): QuestionGateRun {
  const byKey = new Map(stored.map((row) => [row.callKey, row]));
  let asked = stored.length;
  let errored = stored.filter((row) => row.outcome === "unknown").length;
  let unavailable = asked >= OUTAGE_MIN && errored / asked > OUTAGE_RATE;
  let chain = Promise.resolve();
  const lock = <T>(fn: () => Promise<T> | T): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(() => undefined, () => undefined);
    return run;
  };
  return {
    model: checker.model,
    get unavailable() { return unavailable; },
    async ask(key, input, signal) {
      const admit = await lock(() => {
        const kept = byKey.get(key);
        if (kept) return { kind: "kept" as const, row: kept };
        if (unavailable) return { kind: "stop" as const };
        asked += 1;
        return { kind: "go" as const };
      });
      if (admit.kind === "kept") return admit.row;
      if (admit.kind === "stop") return null;
      const made = await checker.check(input, signal).catch((e: unknown) => ({
        questionId: input.question.id, model: checker.model, thresholdVersion: GATE_THRESHOLD_VERSION,
        outcome: "unknown" as const, flags: [] as QuestionGate[], probabilities: {},
        reason: e instanceof Error ? e.message.slice(0, 200) : "the quality gate failed",
      }));
      const row: StoredQuestionGate = { ...made, callKey: key };
      await lock(() => {
        if (row.outcome === "unknown") errored += 1;
        if (asked >= OUTAGE_MIN && errored / asked > OUTAGE_RATE) unavailable = true;
        byKey.set(key, row);
      });
      await save(row);
      return row;
    },
  };
}
