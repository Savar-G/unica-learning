// Offline #1139 measurements. Rows carry timings and counts only. Use elapsed time within each clock.
export const BASELINE_PREFIX = "[maya baseline] ";
export const BASELINE_PROFILE_PREFIX = "[maya baseline profile] ";

const EVIDENCE = ["simulated", "worker", "device"] as const;
const MODES = ["chat", "voice"] as const;
const TURN_TYPES = ["routine", "complex", "unknown"] as const;
const OUTCOMES = ["completed", "failed", "timeout", "interrupted", "no_output"] as const;
const PHASES = [
  "chatDispatch", "chatFinished", "chatBoardDispatch", "speechEndToFinal", "finalToTurn", "admission",
  "modelFirstChunk", "firstCheckedSentence", "voiceCallFinished", "workerReply", "turnToWorkerReply", "workerFiller", "synthesisFirstFrame",
  "frameToWorkerPlayout", "boardPlanReady", "boardCueAcknowledgement", "requestModel", "requestRepair", "requestReview",
  "deviceUseful", "deviceBoard", "deviceInterruptionStop",
] as const;
const COUNTS = [
  "model", "repair", "talkReview", "mathReview", "reviewUnclassified", "requestFailed", "requestTimeout",
  "requestAborted", "requestUnfinished", "discardedPreparation", "ttsRequests", "boardCues",
] as const;

export interface BaselineGroup {
  evidence: typeof EVIDENCE[number];
  mode: typeof MODES[number];
  turnType: typeof TURN_TYPES[number];
  provider: string;
  device: string;
  network: string;
  concurrency: number | "unknown";
}

export interface BaselineTurn extends BaselineGroup {
  v: 1;
  outcome: typeof OUTCOMES[number];
  ms: Partial<Record<typeof PHASES[number], number>>;
  counts: Partial<Record<typeof COUNTS[number], number>>;
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const allowed = (value: unknown, items: readonly string[]) => typeof value === "string" && items.includes(value);
const elapsed = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const label = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9+.:/_-]{1,240}$/.test(v);
const record = (v: unknown, keys: readonly string[], check: (n: unknown) => boolean) =>
  isObject(v) && Object.entries(v).every(([key, value]) => keys.includes(key) && check(value));

export function readBaselineTurn(value: unknown): BaselineTurn {
  if (!isObject(value) || value.v !== 1 || !allowed(value.evidence, EVIDENCE) || !allowed(value.mode, MODES) ||
    !allowed(value.turnType, TURN_TYPES) || !allowed(value.outcome, OUTCOMES) || !label(value.provider) ||
    !label(value.device) || !label(value.network) ||
    !(value.concurrency === "unknown" || (elapsed(value.concurrency) && Number.isSafeInteger(value.concurrency) && value.concurrency > 0)) ||
    !record(value.ms, PHASES, elapsed) || !record(value.counts, COUNTS, n => elapsed(n) && Number.isSafeInteger(n))) {
    throw Error("Invalid Maya baseline turn");
  }
  return value as unknown as BaselineTurn;
}

export function logBaselineTurn(turn: BaselineTurn) {
  console.log(BASELINE_PREFIX + JSON.stringify(turn));
}

const distribution = (values: number[]) => {
  values.sort((a, b) => a - b);
  const at = (p: number) => values[Math.ceil(values.length * p) - 1] ?? null;
  return { n: values.length, p50: at(0.5), p95: at(0.95) };
};

export function baselineReport(turns: readonly BaselineTurn[]) {
  const groups = new Map<string, { group: BaselineGroup; rows: BaselineTurn[] }>();
  for (const row of turns) {
    const { evidence, mode, turnType, provider, device, network, concurrency } = row;
    const group = { evidence, mode, turnType, provider, device, network, concurrency };
    const key = JSON.stringify(group);
    const entry = groups.get(key) ?? { group, rows: [] };
    entry.rows.push(row);
    groups.set(key, entry);
  }
  return [...groups.values()].map(({ group, rows }) => ({
    group,
    turns: rows.length,
    outcomes: Object.fromEntries(OUTCOMES.map(outcome => [outcome, rows.filter(r => r.outcome === outcome).length])),
    ms: Object.fromEntries(PHASES.map(phase => [phase, distribution(rows.flatMap(r => r.ms[phase] ?? []))])),
    counts: Object.fromEntries(COUNTS.map(kind => {
      const values = rows.flatMap(r => r.counts[kind] ?? []);
      return [kind, { n: values.length, total: values.length ? values.reduce((a, b) => a + b, 0) : null }];
    })),
  }));
}
