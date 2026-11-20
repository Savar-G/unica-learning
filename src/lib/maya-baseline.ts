// Offline #1139 measurements. Rows carry timings and counts only. Use elapsed time within each clock.
export const BASELINE_PREFIX = "[maya baseline] ";
export const BASELINE_PROFILE_PREFIX = "[maya baseline profile] ";

const EVIDENCE = ["simulated", "worker", "device"] as const;
const MODES = ["chat", "voice"] as const;
const TEACHING = ["existing", "checked-exchange", "checked-routine", "checked-exchange+checked-routine"] as const;
const TURN_TYPES = ["routine", "complex", "unknown"] as const;
const OUTCOMES = ["completed", "failed", "timeout", "interrupted", "no_output"] as const;
const PHASES = [
  "chatDispatch", "chatFinished", "chatBoardDispatch", "speechEndToFinal", "finalToTurn", "admission",
  "modelFirstChunk", "firstCheckedSentence", "voiceCallFinished", "workerReply", "turnToWorkerReply", "workerFiller", "synthesisFirstFrame",
  "frameToWorkerPlayout", "boardPlanReady", "boardCueAcknowledgement", "requestModel", "requestRepair", "requestReview",
  "workerQueue", "deviceFirstSound", "deviceUseful", "deviceBoard", "deviceInterruptionStop",
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
  teaching?: typeof TEACHING[number];
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
    !label(value.device) || !label(value.network) || (value.teaching !== undefined && !allowed(value.teaching, TEACHING)) ||
    !(value.concurrency === "unknown" || (elapsed(value.concurrency) && Number.isSafeInteger(value.concurrency) && value.concurrency > 0)) ||
    !record(value.ms, PHASES, elapsed) || !record(value.counts, COUNTS, n => elapsed(n) && Number.isSafeInteger(n))) {
    throw Error("Invalid Maya baseline turn");
  }
  return value as unknown as BaselineTurn;
}

export function baselineTeaching(checkedExchange: boolean, checkedRoutine: boolean): NonNullable<BaselineGroup["teaching"]> {
  if (checkedExchange) return checkedRoutine ? "checked-exchange+checked-routine" : "checked-exchange";
  return checkedRoutine ? "checked-routine" : "existing";
}

export interface DeviceObservation {
  group: BaselineGroup;
  /** End of the child's last loud input frame. All times use one machine clock. */
  inputEnd: number;
  /** Received output energy, merged across short gaps. */
  bursts: readonly { start: number; end: number }[];
  /** The worker's answer playout start, or null when no answer played. */
  answerPlayback: number | null;
  /** The first board update received for this turn. */
  boardAt: number | null;
  /** Onset of an intentional interruption. */
  interruptionAt?: number;
}

/** Join device output energy with worker playout marks. Filler can be the first sound; only the answer is useful. */
export function deviceTurn(o: DeviceObservation): BaselineTurn {
  const ms: BaselineTurn["ms"] = {};
  const first = o.bursts.find(b => b.start >= o.inputEnd);
  if (first) ms.deviceFirstSound = first.start - o.inputEnd;
  const answer = o.answerPlayback === null ? undefined : o.bursts.find(b => b.start >= o.answerPlayback! - 50 && b.start >= o.inputEnd);
  if (answer) ms.deviceUseful = answer.start - o.inputEnd;
  if (o.boardAt !== null && o.boardAt >= o.inputEnd) ms.deviceBoard = o.boardAt - o.inputEnd;
  const cut = o.interruptionAt === undefined ? undefined : o.bursts.find(b => b.start <= o.interruptionAt! && b.end >= o.interruptionAt!);
  if (cut) ms.deviceInterruptionStop = cut.end - o.interruptionAt!;
  return { v: 1, ...o.group, outcome: answer ? "completed" : "timeout", ms, counts: {} };
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
    const { evidence, mode, turnType, provider, teaching, device, network, concurrency } = row;
    const group = { evidence, mode, turnType, provider, ...(teaching ? { teaching } : {}), device, network, concurrency };
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

const MIN_BUDGET_SAMPLES = 5;
const roundUp = (ms: number) => Math.ceil(ms / 100) * 100;

/**
 * The complex-explanation budget (#1137): useful device output of complex turns on the existing path, one call at a
 * time, rounded up to 100 ms. Percentiles use completed turns; every other attempted turn is a failure that a candidate must not exceed.
 */
export function complexBudget(turns: readonly BaselineTurn[]) {
  // One call at a time, as the matched comparison runs. A completed row without a useful mark measured first sound only.
  const rows = turns.filter(t => t.evidence === "device" && t.turnType === "complex" && (t.teaching ?? "existing") === "existing" &&
    t.concurrency === 1 && !(t.outcome === "completed" && t.ms.deviceUseful === undefined));
  const useful = rows.flatMap(t => t.outcome === "completed" && t.ms.deviceUseful !== undefined ? [t.ms.deviceUseful] : []);
  const counts = { n: rows.length, completed: useful.length, failed: rows.length - useful.length };
  if (useful.length < MIN_BUDGET_SAMPLES) return { ok: false as const, ...counts, reason: `needs at least ${MIN_BUDGET_SAMPLES} completed complex device turns` };
  const { p50, p95 } = distribution(useful);
  return { ok: true as const, ...counts, p50Ms: roundUp(p50!), p95Ms: roundUp(p95!) };
}

export const BASELINE_COST_PREFIX = "[maya baseline cost] ";
const WORK = ["model", "repair", "review", "discardedPreparation", "stt", "tts", "transport"] as const;
const BASES = ["provider", "estimate", "unknown"] as const;
const UNITS = ["minutes", "characters", "requests", "participantMinutes"] as const;

export interface BaselineCost {
  v: 1;
  mode: typeof MODES[number];
  teaching?: typeof TEACHING[number];
  concurrency: number | "unknown";
  work: typeof WORK[number];
  model: string;
  effort: string;
  /** provider: the provider reported the cost. estimate: a configured rate. unknown: no price. */
  basis: typeof BASES[number];
  calls: number;
  usd: number | null;
  quantity?: { unit: typeof UNITS[number]; value: number };
}

export function readBaselineCost(value: unknown): BaselineCost {
  const q = isObject(value) ? value.quantity : undefined;
  if (!isObject(value) || value.v !== 1 || !allowed(value.mode, MODES) || !allowed(value.work, WORK) || !allowed(value.basis, BASES) ||
    (value.teaching !== undefined && !allowed(value.teaching, TEACHING)) || !label(value.model) || !label(value.effort) ||
    !(value.concurrency === "unknown" || (Number.isSafeInteger(value.concurrency) && (value.concurrency as number) > 0)) ||
    !(Number.isSafeInteger(value.calls) && (value.calls as number) >= 0) || !(value.usd === null || elapsed(value.usd)) ||
    (value.basis === "unknown") !== (value.usd === null) ||
    !(q === undefined || (isObject(q) && allowed(q.unit, UNITS) && elapsed(q.value)))) {
    throw Error("Invalid Maya baseline cost");
  }
  return value as unknown as BaselineCost;
}

export function logBaselineCost(row: BaselineCost) {
  console.log(BASELINE_COST_PREFIX + JSON.stringify(row));
}

/** Sum by run conditions, work, model, effort and basis. A missing price stays null; it is never a zero. */
export function baselineCostReport(rows: readonly BaselineCost[]) {
  const sums = new Map<string, Omit<BaselineCost, "v">>();
  for (const row of rows) {
    const { calls, usd, quantity, ...rest } = row;
    const key: Omit<BaselineCost, "v" | "calls" | "usd" | "quantity"> = { mode: rest.mode, ...(rest.teaching ? { teaching: rest.teaching } : {}), concurrency: rest.concurrency, work: rest.work, model: rest.model, effort: rest.effort, basis: rest.basis };
    const id = JSON.stringify([key, quantity?.unit ?? null]);
    const sum = sums.get(id);
    if (!sum) { sums.set(id, { ...key, calls, usd, ...(quantity ? { quantity: { ...quantity } } : {}) }); continue; }
    sum.calls += calls;
    sum.usd = sum.usd === null || usd === null ? null : Math.round((sum.usd + usd) * 1e9) / 1e9;
    if (sum.quantity && quantity) sum.quantity.value = Math.round((sum.quantity.value + quantity.value) * 1e6) / 1e6;
  }
  return [...sums.values()];
}
