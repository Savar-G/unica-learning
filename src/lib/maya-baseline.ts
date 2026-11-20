// Offline #1139 measurements. Rows carry timings and counts only. Use elapsed time within each clock.
export const BASELINE_PREFIX = "[maya baseline] ";
export const BASELINE_PROFILE_PREFIX = "[maya baseline profile] ";

const EVIDENCE = ["simulated", "worker", "device"] as const;
const MODES = ["chat", "voice"] as const;
const TEACHING = ["existing", "checked-exchange", "checked-routine", "checked-exchange+checked-routine"] as const;
const TURN_TYPES = ["routine", "complex", "unknown"] as const;
const OUTCOMES = ["completed", "failed", "timeout", "interrupted", "no_output", "ambiguous"] as const;
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

/**
 * The baseline worker writes no hosted row and registers under its own name. This removes every Supabase setting (the
 * job processes inherit this environment) and the SDK's agent name override, which wins over the name the runner gives.
 * Returns the removed names.
 */
export function prepareBaselineEnv(env: Record<string, string | undefined>): string[] {
  const removed = Object.keys(env).filter(k => k.includes("SUPABASE") || k === "LIVEKIT_AGENT_NAME_OVERRIDE" || k === "LIVEKIT_AGENT_NAME");
  for (const k of removed) delete env[k];
  return removed;
}

/** The name the server options resolved, which must be the baseline's own, never maya-voice. */
export function baselineAgentName(options: { agentName: string }, expected: string): string {
  if (options.agentName !== expected) throw Error(`The baseline worker would register as "${options.agentName}", not "${expected}"`);
  return options.agentName;
}

export interface DeviceObservation {
  group: BaselineGroup;
  /** End of the child's last loud input frame. All times use one machine clock. */
  inputEnd: number;
  /** Received output energy, merged across short gaps. */
  bursts: readonly { start: number; end: number }[];
  /** The worker's answer playout start, or null when no answer played. */
  answerPlayback: number | null;
  /** Every other playout of the worker (filler, earlier speech) as start and end on the same clock. */
  otherPlayouts: readonly { start: number; end: number }[];
  /** The first board update received for this turn. */
  boardAt: number | null;
  /** Onset of an intentional interruption. */
  interruptionAt?: number;
}

/** The longest time a worker frame can take to reach the child, when no playout onset bounds it more tightly. */
const MAX_TRANSIT_MS = 250;

/**
 * Join device output energy with the worker's playouts. Filler can be the first sound; only the answer is useful.
 * A received sound is matched by its onset. Nothing that starts before the answer's playout start is the answer. A
 * sound that starts after it is the answer unless its onset falls where another playout's sound can still be arriving:
 * from that playout's start to its finish plus its own transit bound. A playout's transit bound is the delay from its
 * start to the first sound that starts during it, and MAX_TRANSIT_MS when no sound starts during it. Any such overlap
 * makes the turn `ambiguous`: no useful time, counted apart from completed and failed turns in the report.
 */
export function deviceTurn(o: DeviceObservation): BaselineTurn {
  const ms: BaselineTurn["ms"] = {};
  const first = o.bursts.find(b => b.start >= o.inputEnd);
  if (first) ms.deviceFirstSound = first.start - o.inputEnd;
  let outcome: BaselineTurn["outcome"] = "timeout";
  const p = o.answerPlayback;
  const heard = p === null ? undefined : o.bursts.find(b => b.end > p && b.end >= o.inputEnd);
  if (p !== null && heard) {
    const transit = (x: { start: number; end: number }) => {
      const onset = o.bursts.find(b => b.start >= x.start && b.start <= x.end);
      return onset ? Math.min(MAX_TRANSIT_MS, onset.start - x.start) : MAX_TRANSIT_MS;
    };
    const other = o.otherPlayouts.some(x => heard.start >= x.start && heard.start < x.end + transit(x));
    if (heard.start < p || other) outcome = "ambiguous";
    else {
      outcome = "completed";
      ms.deviceUseful = Math.max(heard.start, o.inputEnd) - o.inputEnd;
    }
  }
  if (o.boardAt !== null && o.boardAt >= o.inputEnd) ms.deviceBoard = o.boardAt - o.inputEnd;
  const cut = o.interruptionAt === undefined ? undefined : o.bursts.find(b => b.start <= o.interruptionAt! && b.end >= o.interruptionAt!);
  if (cut) ms.deviceInterruptionStop = cut.end - o.interruptionAt!;
  return { v: 1, ...o.group, outcome, ms, counts: {} };
}

/** What the synthetic child knows while it waits for Maya's reply: its received sound and the worker's live reports. */
export interface ReplyWatch {
  /** The end of the child's prompt (0 for the opening). */
  after: number;
  now: number;
  bursts: readonly { start: number; end: number }[];
  /** The worker's answer playout starts, reported as each answer starts to play. */
  answers: readonly number[];
  /** The worker's playouts so far; `end` is null while one is playing. */
  playouts: readonly { start: number; end: number | null }[];
  /** A child turn waits for an answer; the opening has none, only its playouts. */
  needsAnswer: boolean;
}

/** Quiet after the reply's last playout and last received sound before the child speaks again. */
const REPLY_QUIET_MS = 2000;
/** An answer report and its playout come from one output event, a few ms apart at most. */
const SAME_EVENT_MS = 20;

/**
 * The reply is over when the worker's answer for this turn (or, for the opening, any playout) has started and every
 * playout since then has finished, and nothing was heard or played for REPLY_QUIET_MS. Filler alone never ends a turn:
 * an answer can come many seconds after it. The caller keeps its own timeout for an answer that never comes.
 */
export function replyOver(o: ReplyWatch): boolean {
  const answer = o.answers.find(at => at >= o.after);
  if (o.needsAnswer && answer === undefined) return false;
  const from = (answer ?? o.after) - SAME_EVENT_MS;
  const reply = o.playouts.filter(p => p.start >= from);
  if (!reply.length || reply.some(p => p.end === null)) return false;
  const lastSound = Math.max(...reply.map(p => p.end!), o.bursts.at(-1)?.end ?? 0);
  return o.now - lastSound >= REPLY_QUIET_MS;
}

/**
 * One row for each planned child turn of a call, in order: the observed row where the call reached the turn, else a
 * failed attempt under the run's own group. A call that was refused, never connected or never reported still counts.
 */
export function plannedTurns(group: Omit<BaselineGroup, "turnType">, planned: readonly ("routine" | "complex")[], observed: readonly (BaselineTurn | undefined)[]): BaselineTurn[] {
  if (observed.length > planned.length) throw Error("more observed turns than planned");
  return planned.map((turnType, i) => observed[i] ?? { v: 1, ...group, turnType, outcome: "failed", ms: {}, counts: {} });
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

/** Rows from one harness: the same providers, device and network. */
export type BaselineCohort = Pick<BaselineGroup, "provider" | "device" | "network">;
const cohortOf = ({ provider, device, network }: BaselineTurn): BaselineCohort => ({ provider, device, network });
const sameCohort = (a: BaselineCohort, b: BaselineCohort) => a.provider === b.provider && a.device === b.device && a.network === b.network;

/**
 * The complex-explanation budget (#1137): useful device output of complex turns on the existing path, one call at a
 * time, rounded up to 100 ms. Percentiles use completed turns; every other attempted turn is a failure that a candidate
 * must not exceed; ambiguous turns are counted apart. The rows come from one cohort: the named one, or else the only
 * cohort that can measure useful output (it has an answer playout mark), so a hosted call's timeouts never enter a
 * loopback denominator.
 */
export function complexBudget(turns: readonly BaselineTurn[], cohort?: BaselineCohort) {
  // One call at a time, as the matched comparison runs. A completed row without a useful mark measured first sound only.
  const eligible = turns.filter(t => t.evidence === "device" && t.turnType === "complex" && (t.teaching ?? "existing") === "existing" &&
    t.concurrency === 1 && !(t.outcome === "completed" && t.ms.deviceUseful === undefined));
  const measuring: BaselineCohort[] = [];
  for (const t of eligible) if (t.ms.deviceUseful !== undefined && !measuring.some(c => sameCohort(c, cohortOf(t)))) measuring.push(cohortOf(t));
  // A named cohort is used as named, even when every one of its turns failed.
  const chosen = cohort ?? (measuring.length === 1 ? measuring[0] : undefined);
  if (!chosen) return { ok: false as const, reason: measuring.length > 1 ? "several cohorts measure useful output; name one" : "no cohort measures useful output" };
  const rows = eligible.filter(t => sameCohort(cohortOf(t), chosen));
  const useful = rows.flatMap(t => t.outcome === "completed" && t.ms.deviceUseful !== undefined ? [t.ms.deviceUseful] : []);
  // An ambiguous turn neither met nor missed the budget: it is counted, never as a failure or a percentile sample.
  const ambiguous = rows.filter(t => t.outcome === "ambiguous").length;
  const counts = { cohort: { provider: chosen.provider, device: chosen.device, network: chosen.network }, n: rows.length, completed: useful.length, failed: rows.length - useful.length - ambiguous, ambiguous };
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

type CostBase = Pick<BaselineCost, "v" | "mode" | "teaching" | "concurrency">;

/** A local AI usage receipt, with the request role and effort the baseline worker added beside it. */
export interface BaselineReceipt {
  feature: string;
  model: string;
  cost_usd: number | null;
  cost_basis: BaselineCost["basis"];
  calls: number;
  /** The request source of the call (model, repair, review, prepared_interim, prepared_expected, unlabelled). */
  role?: string;
  effort?: string;
}

const ROLE_WORK: Record<string, BaselineCost["work"]> = { model: "model", prepared_interim: "model", prepared_expected: "model", repair: "repair", review: "review" };

/** One provider receipt as a cost row. A receipt without a known role falls back on its feature; a missing effort stays unknown. */
export function receiptCost(r: BaselineReceipt, base: CostBase): BaselineCost {
  const work = (r.role && ROLE_WORK[r.role]) || (r.feature.includes("review") ? "review" : "model");
  const basis = r.cost_usd === null ? "unknown" : r.cost_basis === "unknown" ? "provider" : r.cost_basis;
  return { ...base, work, model: r.model, effort: r.effort && label(r.effort) ? r.effort : "unknown", basis, calls: r.calls, usd: r.cost_usd };
}

/** The reasoning effort an OpenRouter request body asks for: "none" when it asks for no reasoning. */
export function requestEffort(body: unknown): string {
  if (typeof body !== "string") return "unknown";
  try {
    const sent = JSON.parse(body) as { reasoning?: { effort?: unknown } };
    if (!isObject(sent)) return "unknown";
    const effort = sent.reasoning?.effort;
    return effort === undefined ? "none" : typeof effort === "string" && label(effort) ? effort : "unknown";
  } catch {
    return "unknown";
  }
}

/** A resolved speech provider, as voiceProviders returns it. */
export interface SpeechProvider { provider: string; model?: string }
const speechModel = (p: SpeechProvider) => (p.model ? `${p.provider}/${p.model}` : p.provider);

/** The ledger's speech estimates (configured rates) for the providers the run resolved, and transport with no local price. */
export function speechCosts(base: CostBase, providers: { stt: SpeechProvider; tts: SpeechProvider }, callMinutes: number, speech: { stt: number; tts: number } | null): BaselineCost[] {
  const minutes = Math.round(callMinutes * 1e4) / 1e4;
  const priced = (usd: number | undefined) => (speech ? { basis: "estimate" as const, usd: usd! } : { basis: "unknown" as const, usd: null });
  return [
    { ...base, work: "stt", model: speechModel(providers.stt), effort: "none", ...priced(speech?.stt), calls: 1, quantity: { unit: "minutes", value: minutes } },
    { ...base, work: "tts", model: speechModel(providers.tts), effort: "none", ...priced(speech?.tts), calls: 1 },
    { ...base, work: "transport", model: "livekit-server-dev", effort: "none", basis: "unknown", calls: 1, usd: null, quantity: { unit: "participantMinutes", value: Math.round(minutes * 2 * 1e4) / 1e4 } },
  ];
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
