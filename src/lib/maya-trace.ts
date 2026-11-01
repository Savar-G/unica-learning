// Maya's trace format (#322, spec #297): one versioned record of one Maya session, written by every session (the text
// adapter now, the voice agent #326, the test bench #323 and the admin demo #324 later). It records the model and
// prompt version, the question package hash, every turn with each proposal, its refusal and repair and the final
// output, the board commands and the outcome. Counts in the test bench are taken from saved traces, so this shape is a
// contract: raise TRACE_VERSION when a field or its meaning changes, and keep `checkTrace` in step.
//
// Plain JSON. Pure TypeScript except `packageHash`, which uses node:crypto (server and scripts only).
import { createHash } from "node:crypto";
import { ACTS, ASSISTANCE, INTERRUPTS, MAIN_STATES, type Act, type Outcome, type RefusalCode, type SessionState } from "@/lib/maya";

/** Why a proposal was refused: the session's refusal, or "board_refused" when the board core refused a batch the session built. */
export interface TraceRefusal {
  code: RefusalCode | "board_refused";
  reason: string;
  allowed: Act[];
}

/**
 * The version of the trace shape. Version 2 (#323) adds the `hang_up` turn: the child hung up on purpose and the call
 * ended as child_stopped. Version 1 traces have no such turn; `checkTrace` reads both.
 */
export const TRACE_VERSION = 2;
/** The trace versions `checkTrace` reads. */
export const TRACE_VERSIONS = [1, 2] as const;
export const TRACE_KIND = "maya-trace";

/** Where a proposal came from: the model, the model asked again with the refusal (one repair), or code's fallback. */
export type AttemptSource = "model" | "repair" | "fallback";

/**
 * Why a call failed, as a code with wording code wrote. A trace never stores an error's own text: a provider's or a
 * model's message can hold a key in any form (encoded, split, escaped), so no pattern can make it safe (R382-3-1).
 * The raw text goes only to a local debug hook (the command line prints it to stderr).
 */
export const ERROR_MESSAGES = {
  http_401: "The model service refused the key.",
  http_403: "The model service refused access.",
  http_408: "The model service timed out the request.",
  http_429: "The model service is busy: too many requests.",
  http_4xx: "The model service refused the request.",
  http_5xx: "The model service failed.",
  timeout: "The model did not answer in time.",
  network: "The model service could not be reached.",
  bad_json: "The model's answer was not JSON.",
  schema_invalid: "The model service refused the answer format.",
  refused_by_provider: "The model refused to answer.",
  cut_off: "The model's answer was cut off.",
  no_output: "The model gave no answer.",
  local: "A local step failed (see the error output of the run).",
  unknown: "The model call failed.",
} as const;
export type ErrorCode = keyof typeof ERROR_MESSAGES;
export const ERROR_CODES = Object.keys(ERROR_MESSAGES) as ErrorCode[];

/** A failure in a trace: the code, its fixed message, and the HTTP status when there was one. Nothing else. */
export interface TraceError {
  code: ErrorCode;
  message: string;
  status?: number;
}

const traceError = (code: ErrorCode, status?: number): TraceError => ({ code, message: ERROR_MESSAGES[code], ...(status !== undefined ? { status } : {}) });

/**
 * The trace error for a thrown error. `where`: "model" for a model call (the AI client's error kinds), "local" for
 * anything else (a script, LiveKit, the session). Reads the error's text to classify it; stores none of it.
 */
export function classifyError(e: unknown, where: "model" | "local"): TraceError {
  if (where === "local") return traceError("local");
  const text = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const http = /OpenRouter answered ([45]\d\d)\b/.exec(text) ?? /OpenRouter error ([45]\d\d)\b/.exec(text);
  if (http) {
    const status = Number(http[1]);
    if (status === 401) return traceError("http_401", status);
    if (status === 403) return traceError("http_403", status);
    if (status === 408) return traceError("http_408", status);
    if (status === 429) return traceError("http_429", status);
    if (status === 400 && /schema|response_format|structured/i.test(text)) return traceError("schema_invalid", status);
    if (status >= 400 && status < 500) return traceError("http_4xx", status);
    if (status >= 500 && status < 600) return traceError("http_5xx", status);
    return traceError("unknown");
  }
  if (/time is up|did not answer in time|timed? ?out|aborted/i.test(text)) return traceError("timeout");
  if (/could not be reached|ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(text)) return traceError("network");
  if (/not valid JSON|is not JSON|not JSON/i.test(text)) return traceError("bad_json");
  if (/model refused/i.test(text)) return traceError("refused_by_provider");
  if (/model stopped/i.test(text)) return traceError("cut_off");
  if (/no output|no choices/i.test(text)) return traceError("no_output");
  return traceError("unknown");
}

/** The HTTP status a code may carry. */
const STATUS_OF: Partial<Record<ErrorCode, (n: number) => boolean>> = {
  http_401: (n) => n === 401, http_403: (n) => n === 403, http_408: (n) => n === 408, http_429: (n) => n === 429,
  http_4xx: (n) => n >= 400 && n < 500 && ![401, 403, 408, 429].includes(n), http_5xx: (n) => n >= 500 && n < 600, schema_invalid: (n) => n === 400,
};

/** One proposal for one Maya turn and what code did with it. */
export interface TraceAttempt {
  source: AttemptSource;
  /** The proposal as the model (or code) sent it; null when the model gave none (an error or a time-out). */
  proposal: unknown;
  /** Why the session (or the board core) refused it; null when it was accepted. */
  refusal: TraceRefusal | null;
  /** The model call failed: a fixed code and its fixed wording, never the error's own text (review R382-3-1). */
  error?: TraceError;
  /** How long the model took, by the passed-in clock. */
  ms?: number;
}

/** What reached the child in one Maya turn: only text and board batches the session accepted. */
export interface TraceOutput {
  act: Act;
  say: string[];
  /** The transaction ids of the board batches sent with this turn (their commands are in `board`). */
  board: string[];
}

export type TraceTurn =
  | { kind: "start"; at: number }
  | { kind: "child"; at: number; text: string; uncertain?: boolean }
  | { kind: "tick"; at: number }
  | { kind: "writing"; at: number; status: "started" | "done" }
  | {
      kind: "maya";
      at: number;
      /** The session state before and after the turn. */
      state: SessionState;
      stateAfter: SessionState;
      attempts: TraceAttempt[];
      /** Null when nothing was output: every attempt failed and the call ended as a technical issue. */
      output: TraceOutput | null;
    }
  /** `detail` is wording code wrote; `error` the failure's code when an error ended the call. */
  | { kind: "technical"; at: number; detail: string; error?: TraceError }
  /** Version 2: the child hung up on purpose; the call ended as child_stopped, unless safety, content or solved came first. */
  | { kind: "hang_up"; at: number };

export interface TraceBoardBatch {
  at: number;
  /** The index of the Maya turn in `turns` that sent it. */
  turn: number;
  transactionId: string;
  commands: readonly unknown[];
}

export interface MayaTrace {
  kind: typeof TRACE_KIND;
  /** The shape's version: this code writes TRACE_VERSION and reads every one of TRACE_VERSIONS. */
  version: (typeof TRACE_VERSIONS)[number];
  callId: string;
  /** What ran the session: the text adapter alone, the text adapter inside LiveKit Agents (no room), or a voice call. */
  runner: "text" | "livekit-text" | "voice";
  startedAt: string | null;
  endedAt: string | null;
  model: { id: string; promptVersion: string };
  /** The versions of the controller's contracts this session ran with. */
  versions: { proposal: number; lines: number; session: number };
  question: { id: string | null; ref: unknown; text: string | null; hash: string };
  /** D-196: whether the model's own warm words were read. The text adapter always runs with it off. */
  freeTalk: boolean;
  turns: TraceTurn[];
  board: TraceBoardBatch[];
  outcome: Outcome | null;
  /** Counts over `turns`, for a quick read; the bench recounts them from `turns`. */
  counts: TraceCounts;
}

export interface TraceCounts {
  mayaTurns: number;
  refusals: number;
  repairs: number;
  repairedOk: number;
  fallbacks: number;
  modelErrors: number;
  /** Maya turns where nothing was output. */
  silent: number;
}

/** The counts of a trace's turns. */
export function traceCounts(turns: readonly TraceTurn[]): TraceCounts {
  const maya = turns.flatMap((t) => (t.kind === "maya" ? [t] : []));
  const attempts = maya.flatMap((t) => t.attempts);
  return {
    mayaTurns: maya.length,
    refusals: attempts.filter((a) => a.refusal !== null).length,
    repairs: attempts.filter((a) => a.source === "repair").length,
    repairedOk: maya.filter((t) => t.output && t.attempts.at(-1)?.source === "repair").length,
    fallbacks: maya.filter((t) => t.output && t.attempts.at(-1)?.source === "fallback").length,
    modelErrors: attempts.filter((a) => a.error !== undefined).length,
    silent: maya.filter((t) => t.output === null).length,
  };
}

/** JSON with sorted keys, so the same package always gives the same hash. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The question package hash: "sha256:" and the hex digest of its canonical JSON. */
export function packageHash(pkg: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(pkg)).digest("hex")}`;
}

// ---------- Reading a saved trace ----------

const RUNNERS = ["text", "livekit-text", "voice"];
const SOURCES = ["model", "repair", "fallback"];
const STATES: readonly string[] = [...MAIN_STATES, ...INTERRUPTS];
const REASONS = ["solved", "child_stopped", "time_limit", "no_response", "technical_issue", "content_issue", "safety"];
const PAPER = ["child_confirmed", "declined", "unknown"];
const UNDERSTANDING = ["evidence_observed", "uncertain"];
const HASH = /^sha256:[0-9a-f]{64}$/;
const COUNT_KEYS: (keyof TraceCounts)[] = ["mayaTurns", "refusals", "repairs", "repairedOk", "fallbacks", "modelErrors", "silent"];

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isCount = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;
const isText = (x: unknown): x is string => typeof x === "string";
const isName = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const isTime = (x: unknown) => x === null || (typeof x === "string" && !Number.isNaN(Date.parse(x)) && new Date(x).toISOString() === x);
const oneOf = (list: readonly unknown[], x: unknown) => list.includes(x);
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every(isText);

/** Why one field of a record fails, with its path, or null. */
class Bad extends Error {}
function need(ok: boolean, path: string, what: string) {
  if (!ok) throw new Bad(`${path}: ${what}`);
}

/** A trace error is a known code, that code's fixed message, and a status the code allows: no other field, no other text. */
function checkError(e: unknown, path: string) {
  need(isObject(e), path, "a trace error");
  const x = e as Record<string, unknown>;
  need(Object.keys(x).every((k) => ["code", "message", "status"].includes(k)), path, "only code, message and status");
  need(oneOf(ERROR_CODES, x.code), `${path}.code`, "a known error code");
  need(x.message === ERROR_MESSAGES[x.code as ErrorCode], `${path}.message`, "the code's fixed message");
  if (x.status !== undefined) {
    const allows = STATUS_OF[x.code as ErrorCode];
    need(Number.isInteger(x.status) && allows !== undefined && allows(x.status as number), `${path}.status`, "an HTTP status the code allows");
  }
}

function checkRefusal(r: unknown, path: string) {
  if (r === null) return;
  need(isObject(r), path, "a refusal or null");
  const x = r as Record<string, unknown>;
  need(isName(x.code), `${path}.code`, "a refusal code");
  need(isText(x.reason), `${path}.reason`, "text");
  need(Array.isArray(x.allowed) && x.allowed.every((a) => oneOf(ACTS, a)), `${path}.allowed`, "a list of acts");
}

function checkAttempt(a: unknown, path: string) {
  need(isObject(a), path, "an attempt");
  const x = a as Record<string, unknown>;
  need(oneOf(SOURCES, x.source), `${path}.source`, "model, repair or fallback");
  need("proposal" in x, `${path}.proposal`, "present (null when the model gave none)");
  need("refusal" in x, `${path}.refusal`, "present");
  checkRefusal(x.refusal, `${path}.refusal`);
  if (x.error !== undefined) checkError(x.error, `${path}.error`);
  need(x.ms === undefined || (isNum(x.ms) && x.ms >= 0), `${path}.ms`, "a duration");
  need(!(x.error !== undefined && x.proposal !== null), `${path}`, "an attempt with an error has no proposal");
  need(!(x.error !== undefined && x.refusal !== null), `${path}`, "an attempt with an error has no refusal");
  need(!(x.source === "fallback" && x.refusal !== null), `${path}`, "a fallback attempt is recorded only when it was accepted");
}

const accepted = (a: Record<string, unknown>) => a.refusal === null && a.error === undefined;

/**
 * The repair limit (src/lib/maya-text.ts): the model's proposal; one repair only after the model's proposal was
 * refused (not after an error); a fallback only after every attempt before it failed. Only the last attempt may be
 * accepted: nothing is asked again after an accepted proposal.
 */
function checkOrder(attempts: Record<string, unknown>[], path: string) {
  const sources = attempts.map((a) => a.source).join(",");
  need(["model", "model,repair", "model,fallback", "model,repair,fallback"].includes(sources), path, `model, then at most one repair, then at most one fallback (got ${sources})`);
  attempts.slice(0, -1).forEach((a, i) => need(!accepted(a), `${path}[${i}]`, "refused or failed, because an attempt follows it"));
  if (attempts[1]?.source === "repair") need(attempts[0].refusal !== null, `${path}[1]`, "a repair only after a refusal, not after a model error");
}

function checkTurn(t: unknown, path: string): Record<string, unknown> {
  need(isObject(t), path, "a turn");
  const x = t as Record<string, unknown>;
  need(isNum(x.at), `${path}.at`, "a time");
  switch (x.kind) {
    case "start":
    case "tick":
      break;
    case "child":
      need(isText(x.text), `${path}.text`, "text");
      need(x.uncertain === undefined || typeof x.uncertain === "boolean", `${path}.uncertain`, "a boolean");
      break;
    case "writing":
      need(oneOf(["started", "done"], x.status), `${path}.status`, "started or done");
      break;
    case "technical":
      need(isText(x.detail), `${path}.detail`, "text");
      if (x.error !== undefined) checkError(x.error, `${path}.error`);
      break;
    case "hang_up":
      break;
    case "maya": {
      need(oneOf(STATES, x.state), `${path}.state`, "a session state");
      need(oneOf(STATES, x.stateAfter), `${path}.stateAfter`, "a session state");
      need(Array.isArray(x.attempts) && x.attempts.length > 0 && x.attempts.length <= 3, `${path}.attempts`, "1 to 3 attempts");
      const attempts = x.attempts as Record<string, unknown>[];
      attempts.forEach((a, i) => checkAttempt(a, `${path}.attempts[${i}]`));
      checkOrder(attempts, `${path}.attempts`);
      need("output" in x, `${path}.output`, "present (null when nothing was output)");
      if (x.output !== null) {
        need(isObject(x.output), `${path}.output`, "an output or null");
        const o = x.output as Record<string, unknown>;
        need(oneOf(ACTS, o.act), `${path}.output.act`, "an act");
        need(strings(o.say), `${path}.output.say`, "a list of sentences");
        need(strings(o.board), `${path}.output.board`, "a list of transaction ids");
        need(accepted(attempts.at(-1)!), `${path}.output`, "output only from an accepted last attempt");
      } else {
        need(!accepted(attempts.at(-1)!), `${path}.output`, "an output, because the last attempt was accepted");
      }
      break;
    }
    default:
      need(false, `${path}.kind`, "a turn kind");
  }
  return x;
}

function checkOutcome(o: unknown, path: string) {
  if (o === null) return;
  need(isObject(o), path, "an outcome or null");
  const x = o as Record<string, unknown>;
  need(oneOf(REASONS, x.reason), `${path}.reason`, "a reason");
  need(oneOf(ASSISTANCE, x.assistance), `${path}.assistance`, "an assistance level");
  need(oneOf(PAPER, x.paperStatus), `${path}.paperStatus`, "a paper status");
  need(oneOf(UNDERSTANDING, x.understanding), `${path}.understanding`, "an understanding");
  need(x.highestHint === null || oneOf([0, 1, 2, 3, 4], x.highestHint), `${path}.highestHint`, "0 to 4 or null");
  need(typeof x.safetyFlag === "boolean", `${path}.safetyFlag`, "a boolean");
  need(oneOf([null, "concern", "immediate"], x.safetySeverity), `${path}.safetySeverity`, "concern, immediate or null");
  const m = x.mishearing;
  need(isObject(m) && isCount(m.confirmations) && isCount(m.corrections), `${path}.mishearing`, "two counts");
  need(isNum(x.seconds) && x.seconds >= 0, `${path}.seconds`, "seconds");
}

function check(raw: unknown): MayaTrace {
  need(isObject(raw) && raw.kind === TRACE_KIND, "trace", "not a Maya trace");
  const r = raw as Record<string, unknown>;
  need((TRACE_VERSIONS as readonly unknown[]).includes(r.version), "version", `one of ${TRACE_VERSIONS.join(", ")}, not ${String(r.version)}`);
  need(isName(r.callId), "callId", "a call id");
  need(oneOf(RUNNERS, r.runner), "runner", "text, livekit-text or voice");
  need(isTime(r.startedAt), "startedAt", "an ISO time or null");
  need(isTime(r.endedAt), "endedAt", "an ISO time or null");
  const model = r.model;
  need(isObject(model) && isName(model.id) && isName(model.promptVersion), "model", "a model id and a prompt version");
  const v = r.versions;
  need(isObject(v) && isCount(v.proposal) && isCount(v.lines) && isCount(v.session), "versions", "the proposal, lines and session versions");
  const q = r.question;
  need(isObject(q), "question", "an object");
  const question = q as Record<string, unknown>;
  need(question.id === null || isName(question.id), "question.id", "an id or null");
  need("ref" in question, "question.ref", "present");
  need(question.text === null || isText(question.text), "question.text", "text or null");
  need(isText(question.hash) && HASH.test(question.hash), "question.hash", "sha256: and 64 hex digits");
  need(typeof r.freeTalk === "boolean", "freeTalk", "a boolean");

  need(Array.isArray(r.turns), "turns", "a list");
  const turns = (r.turns as unknown[]).map((t, i) => checkTurn(t, `turns[${i}]`));
  turns.forEach((t, i) => need(i === 0 || (t.at as number) >= (turns[i - 1].at as number), `turns[${i}].at`, "not before the turn before it"));

  need(Array.isArray(r.board), "board", "a list");
  const sent = new Set<string>();
  (r.board as unknown[]).forEach((b, i) => {
    const path = `board[${i}]`;
    need(isObject(b), path, "a board batch");
    const x = b as Record<string, unknown>;
    need(isNum(x.at), `${path}.at`, "a time");
    need(Number.isInteger(x.turn) && turns[x.turn as number]?.kind === "maya", `${path}.turn`, "the index of a Maya turn");
    need(isName(x.transactionId) && !sent.has(x.transactionId as string), `${path}.transactionId`, "a transaction id, once");
    need(Array.isArray(x.commands) && x.commands.length > 0, `${path}.commands`, "a list of commands");
    const out = turns[x.turn as number].output as { board: string[] } | null;
    need(out !== null && out.board.includes(x.transactionId as string), `${path}.transactionId`, "sent by that turn's output");
    sent.add(x.transactionId as string);
  });
  turns.forEach((t, i) => {
    const out = t.kind === "maya" ? (t.output as { board: string[] } | null) : null;
    out?.board.forEach((id) => need(sent.has(id), `turns[${i}].output.board`, `batch ${id} in the board list`));
  });

  checkOutcome(r.outcome, "outcome");
  need((r.outcome === null) === (r.endedAt === null), "endedAt", "set exactly when the call has an outcome");
  need(r.outcome === null || r.startedAt !== null, "startedAt", "set for a call that ended");
  // A hang-up (version 2 only) is what ends the call: the last turn, and the call ended, never as a technical issue.
  turns.forEach((t, i) => {
    if (t.kind !== "hang_up") return;
    need(r.version !== 1, `turns[${i}].kind`, "not hang_up in a version 1 trace");
    need(i === turns.length - 1, `turns[${i}]`, "a hang-up only as the last turn");
    const reason = (r.outcome as { reason?: unknown } | null)?.reason;
    need(reason !== undefined && reason !== "technical_issue", "outcome.reason", "the reason a hang-up ended the call (child_stopped, or safety, content or solved first)");
  });

  const c = r.counts;
  need(isObject(c) && COUNT_KEYS.every((k) => isCount(c[k])), "counts", "the trace counts");
  const want = traceCounts(turns as unknown as TraceTurn[]);
  for (const k of COUNT_KEYS) need((c as Record<string, unknown>)[k] === want[k], `counts.${k}`, `${want[k]}, counted from the turns`);
  return raw as unknown as MayaTrace;
}

/** Reads a saved trace: the trace, or the first field that is not this version's shape (with its path). */
export function checkTrace(raw: unknown): { ok: true; trace: MayaTrace } | { ok: false; reason: string } {
  try {
    return { ok: true, trace: check(raw) };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, reason: e.message };
    throw e;
  }
}

// ---------- Keeping the child's data out ----------

/**
 * Secrets that can turn up in an error message, in any shape: provider keys (sk-..., sk_..., rk_..., pk_..., whsec_...),
 * bearer tokens and Authorization headers, key and token parameters, JWTs, and any long run of base64 or hex.
 */
const SECRETS: [RegExp, string][] = [
  [/(authorization\s*[:=]\s*)(?:(?:bearer|basic|token)\s+)?[^\s,;"']+/gi, "$1[secret]"],
  [/\bbearer\s+[^\s,;"']+/gi, "Bearer [secret]"],
  [/\b((?:x-)?api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|token|key|secret)(\s*[=:]\s*)["']?[^\s&"',;]+/gi, "$1$2[secret]"],
  [/\b(?:sk|rk|pk)[-_][A-Za-z0-9_-]{6,}/g, "[secret]"],
  [/\bwhsec_[A-Za-z0-9+/=_-]{6,}/g, "[secret]"],
  [/\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[secret]"],
  [/[A-Za-z0-9+/_-]{32,}={0,2}/g, "[secret]"],
];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Environment variables whose values are secrets: redacted wherever they appear, whatever their shape. */
const SECRET_ENV = ["OPENROUTER_API_KEY", "SUPABASE_SECRET_KEY", "STRIPE_SECRET_KEY", "RESEND_API_KEY", "CRON_SECRET", "LIVEKIT_API_SECRET", "LIVEKIT_API_KEY"];

/** The configured secret values now (from the environment), longest first. */
export function configuredSecrets(env: Record<string, string | undefined> = process.env): string[] {
  return SECRET_ENV.map((k) => env[k]?.trim() ?? "").filter((v) => v.length >= 6).sort((a, b) => b.length - a.length);
}

/**
 * Text with the child's name as {name} and every secret as [secret]: the configured secret values first (whatever
 * their shape), then the secret patterns. Redact before cutting text short, so a cut never leaves part of a key.
 */
export function redactText(text: string, childName: string | null = null, secrets: readonly string[] = configuredSecrets()): string {
  let out = secrets.reduce((t, v) => t.split(v).join("[secret]"), text);
  out = SECRETS.reduce((t, [re, to]) => t.replace(re, to), out);
  const name = childName?.trim();
  if (name) out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, "giu"), "{name}");
  return out;
}

const redactDeep = (x: unknown, name: string | null): unknown =>
  typeof x === "string" ? redactText(x, name) : Array.isArray(x) ? x.map((v) => redactDeep(v, name)) : isObject(x) ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, redactDeep(v, name)])) : x;

/**
 * The trace with the child's profile name replaced by {name} and secrets removed, in every text a person or the model
 * wrote: child turns, Maya's sentences, proposals, errors and technical details. Codes, states and commands stay.
 */
export function redactTrace(trace: MayaTrace, childName: string | null): MayaTrace {
  const turns = trace.turns.map((t): TraceTurn => {
    switch (t.kind) {
      case "child":
        return { ...t, text: redactText(t.text, childName) };
      case "technical":
        return { ...t, detail: redactText(t.detail, childName) };
      case "maya":
        return {
          ...t,
          attempts: t.attempts.map((a) => ({
            ...a,
            proposal: redactDeep(a.proposal, childName),
            refusal: a.refusal ? { ...a.refusal, reason: redactText(a.refusal.reason, childName) } : null,
            // Errors are codes and fixed wording: nothing to redact.
          })),
          output: t.output ? { ...t.output, say: t.output.say.map((x) => redactText(x, childName)) } : null,
        };
      default:
        return t;
    }
  });
  return { ...trace, turns };
}
