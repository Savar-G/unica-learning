import { SCOPE_REASONS } from "@/lib/maya/scope";
// Maya's trace format (#322, spec #297): one versioned record of one Maya session, written by every session (the text
// adapter now, the voice agent #326, the test bench #323 and the admin demo #324 later). It records the model and
// prompt version, the question package hash, every turn with each proposal, its refusal and repair and the final
// output, the board commands and the outcome. Counts in the test bench are taken from saved traces, so this shape is a
// contract: raise TRACE_VERSION when a field or its meaning changes, and keep `checkTrace` in step.
//
// Plain JSON. Pure TypeScript except `packageHash`, which uses node:crypto (server and scripts only).
import { createHash } from "node:crypto";
import { ACTS, SAFETY_GUIDANCE, ASSISTANCE, heldSentences, INTERRUPTS, MAIN_STATES, NEVER_SAY_IDS, PHRASES, type Act, type Outcome, type RefusalCode, type SessionState, type TalkCheck } from "@/lib/maya";

/** Why a proposal was refused: the session's refusal, or "board_refused" when the board core refused a batch the session built. */
export interface TraceRefusal {
  code: RefusalCode | "board_refused";
  reason: string;
  allowed: Act[];
}

/**
 * The version of the trace shape. Version 2 (#323) adds the `hang_up` turn: the child hung up on purpose and the call
 * ended as child_stopped. Version 3 (D-197) adds free talk: `reviewer` (the review's model and prompt version, or null)
 * and, on an accepted attempt, `talk` (each piece of the model's own words, both checks and what was said). Older
 * traces have neither. Version 4 (#396) adds three input turns the voice agent sends: `partial` (a partial transcript
 * of the child talking over Maya: her output stops and nothing is judged), `maya_said` (what Maya actually said; other
 * words than her approved text start a repair) and `content_problem` (the package turned out wrong during the call).
 * Each records `cancelled`: whether Maya's output was stopped. Version 5 records input obligations and the
 * delivered turn that served each one, or the reason it was dropped. Version 6 adds controller safety output on
 * terminal events. Version 7 adds scope refusal reasons and times. Version 8 (#527) adds controller held output: on a
 * question Maya cannot teach, code's exact held lines at the start, with no model; in version 8 that is the text before
 * D-304 (`PRE_D304_HELD`). Version 9 (D-304) holds the held lines that say plainly Maya cannot teach the question yet
 * (hello, can't teach, another question); a version 9 trace with the old text is refused. `checkTrace` reads all nine
 * versions.
 */
export const TRACE_VERSION = 9;
/** The trace versions `checkTrace` reads. */
export const TRACE_VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
/**
 * The held turn as version 8 traces stored it, before D-304 (line sets 11 to 13). Frozen here: stored admin test
 * calls from preview deployments may hold it, and they stay readable.
 */
export const PRE_D304_HELD = "Hi, I'm Maya, an AI. Want to pick another question on this page?";
export const TRACE_KIND = "maya-trace";

export const OBLIGATION_KINDS = ["start_pending", "safety_due", "opening_due", "repair_due", "child_turn_pending", "content_problem"] as const;
/** Version 5: input work survives cancellation. Only delivered output can serve it. */
export interface TraceObligation {
  id: number;
  kind: (typeof OBLIGATION_KINDS)[number];
  at: number;
  text?: string;
  uncertain?: boolean;
  alternatives?: string[];
  severity?: "concern" | "immediate";
  status: "pending" | "served" | "dropped";
  servedBy?: number;
  reason?: string;
}

/** Where a proposal came from: the model, the model asked again with the refusal (one repair), or code's fallback. */
export type AttemptSource = "model" | "repair" | "fallback" | "controller";

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
  /**
   * Version 3, on the accepted attempt only: each piece of the model's own words (D-197), in order, with the code
   * guards' result, the review's, and what Maya said for it. Absent when the attempt had none.
   */
  talk?: TraceTalk[];
  /** Version 3: how long the free-talk reviews of this attempt took, by the passed-in clock. */
  reviewMs?: number;
  /**
   * The client read this proposal from inside one Markdown code fence (a request sent without `response_format`, first
   * ship practice at 6de7e777). Absent otherwise, and in traces from before. Counted by `fencedReplies`.
   */
  fenced?: true;
}

/** One piece of the model's own words in a trace (D-197): the session's TalkCheck. */
export type TraceTalk = TalkCheck;

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
  | { kind: "hang_up"; at: number }
  /** Version 4: a partial transcript of the child (talking over Maya). Maya's output stopped; nothing was judged. */
  | { kind: "partial"; at: number; text: string; cancelled: true }
  /** Version 4: what Maya actually said. `cancelled`: it was not her approved text, so her output stopped and a repair started. */
  | { kind: "maya_said"; at: number; text: string; cancelled: boolean }
  /**
   * Version 4: the package turned out wrong during the call (`detail` is wording code wrote). `cancelled`: the call
   * went to the content hold and Maya's output stopped; false when the safety state kept the call.
   */
  | { kind: "content_problem"; at: number; detail: string; cancelled: boolean };

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
  /** D-196, D-197: whether the model's own warm words were read (after the code guards and the review). */
  freeTalk: boolean;
  /** Version 3: the free-talk review's model and prompt version, or null when the call had no reviewer. */
  reviewer?: { id: string; promptVersion: string } | null;
  /** Version 7: reason codes only. No additional child text. */
  scopeRefusals?: import("@/lib/maya").ScopeRefusal[];
  turns: TraceTurn[];
  /** Version 5: all obligations, including pending work and the reason for each explicit drop. */
  obligations?: TraceObligation[];
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

/** The model calls of a trace, and how many of their proposals the client read from inside one code fence. */
export function fencedReplies(turns: readonly TraceTurn[]): { calls: number; fenced: number } {
  const attempts = turns.flatMap((t) => (t.kind === "maya" ? t.attempts : [])).filter((a) => a.source === "model" || a.source === "repair");
  return { calls: attempts.length, fenced: attempts.filter((a) => a.fenced === true).length };
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
const SOURCES = ["model", "repair", "fallback", "controller"];
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
  need(oneOf(SOURCES, x.source), `${path}.source`, "model, repair, fallback or controller");
  need("proposal" in x, `${path}.proposal`, "present (null when the model gave none)");
  need("refusal" in x, `${path}.refusal`, "present");
  checkRefusal(x.refusal, `${path}.refusal`);
  if (x.error !== undefined) checkError(x.error, `${path}.error`);
  need(x.ms === undefined || (isNum(x.ms) && x.ms >= 0), `${path}.ms`, "a duration");
  need(!(x.error !== undefined && x.proposal !== null), `${path}`, "an attempt with an error has no proposal");
  need(!(x.error !== undefined && x.refusal !== null), `${path}`, "an attempt with an error has no refusal");
  need(!(x.source === "fallback" && x.refusal !== null), `${path}`, "a fallback attempt is recorded only when it was accepted");
  need(x.reviewMs === undefined || (isNum(x.reviewMs) && x.reviewMs >= 0), `${path}.reviewMs`, "a duration");
  need(x.fenced === undefined || (x.fenced === true && (x.source === "model" || x.source === "repair") && x.proposal !== null && x.error === undefined), `${path}.fenced`, "true on a model or repair proposal, or absent");
  if (x.talk !== undefined) {
    need(Array.isArray(x.talk) && x.talk.length > 0, `${path}.talk`, "a list of free-talk checks");
    need(x.refusal === null && x.error === undefined, `${path}.talk`, "only on an accepted attempt");
    (x.talk as unknown[]).forEach((t, i) => checkTalk(t, `${path}.talk[${i}]`));
  }
}

const REVIEWS = ["pass", "fail", "error", "not_run"];
/** The bank phrases with no echo slot, with the name slot as a redacted trace writes it and without it. */
const BANK: ReadonlySet<string> = new Set(Object.values(PHRASES).flat().filter((p) => !p.includes("{echo}")).flatMap((p) => [p, p.replace(/,? ?\{name\}/g, "")]));

/** One free-talk check: the proposed words are shown only when both checks passed; else a bank phrase. */
function checkTalk(t: unknown, path: string) {
  need(isObject(t), path, "a free-talk check");
  const x = t as Record<string, unknown>;
  need(Object.keys(x).every((k) => ["proposed", "code", "review", "rules", "reason", "shown"].includes(k)), path, "only proposed, code, review, rules, reason and shown");
  need(isText(x.proposed), `${path}.proposed`, "text");
  need(x.code === null || isName(x.code), `${path}.code`, "null or why the code guards failed");
  need(oneOf(REVIEWS, x.review), `${path}.review`, "pass, fail, error or not_run");
  need(isName(x.shown), `${path}.shown`, "what Maya said");
  need(!(x.code !== null && x.review !== "not_run"), `${path}.review`, "not_run when the code guards failed");
  const both = x.code === null && x.review === "pass";
  if (both) need(x.shown === x.proposed, `${path}.shown`, "the proposed words, because both checks passed");
  else need(BANK.has(x.shown as string), `${path}.shown`, "a bank phrase, because a check did not pass");
  need(x.review === "fail" ? Array.isArray(x.rules) && x.rules.length > 0 && x.rules.every((r) => oneOf(NEVER_SAY_IDS, r)) : x.rules === undefined, `${path}.rules`, "the rules of a failed review, and only then");
  need(x.review === "fail" || x.review === "error" ? isName(x.reason) : x.reason === undefined, `${path}.reason`, "why a review failed, and only then");
}

const accepted = (a: Record<string, unknown>) => a.refusal === null && a.error === undefined;

/**
 * The repair limit (src/lib/maya-text.ts): the model's proposal; one repair only after the model's proposal was
 * refused (not after an error); a fallback only after every attempt before it failed. Only the last attempt may be
 * accepted: nothing is asked again after an accepted proposal.
 */
function checkOrder(attempts: Record<string, unknown>[], path: string) {
  const sources = attempts.map((a) => a.source).join(",");
  need(["controller", "fallback", "model", "model,repair", "model,fallback", "model,repair,fallback"].includes(sources), path, `model, then at most one repair, then at most one fallback (got ${sources})`);
  attempts.slice(0, -1).forEach((a, i) => need(!accepted(a), `${path}[${i}]`, "refused or failed, because an attempt follows it"));
  if (attempts[1]?.source === "repair") need(attempts[0].refusal !== null, `${path}[1]`, "a repair only after a refusal, not after a model error");
}

function checkTurn(t: unknown, path: string, version: number): Record<string, unknown> {
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
    case "partial":
      need(isText(x.text), `${path}.text`, "text");
      need(x.cancelled === true, `${path}.cancelled`, "true: a partial transcript always stops Maya's output");
      break;
    case "maya_said":
      need(isText(x.text), `${path}.text`, "text");
      need(typeof x.cancelled === "boolean", `${path}.cancelled`, "a boolean");
      break;
    case "content_problem":
      need(isText(x.detail), `${path}.detail`, "text");
      need(typeof x.cancelled === "boolean", `${path}.cancelled`, "a boolean");
      break;
    case "maya": {
      need(oneOf(STATES, x.state), `${path}.state`, "a session state");
      need(oneOf(STATES, x.stateAfter), `${path}.stateAfter`, "a session state");
      need(Array.isArray(x.attempts) && x.attempts.length > 0 && x.attempts.length <= 3, `${path}.attempts`, "1 to 3 attempts");
      const attempts = x.attempts as Record<string, unknown>[];
      if (attempts[0]?.source === "controller") {
        const o = x.output as { act?: unknown; say?: unknown; board?: unknown } | null;
        // Code's own words with no model: safety guidance, or the held lines on a question Maya cannot teach (#527):
        // the text before D-304 in version 8 and earlier, the D-304 text from version 9.
        const held = version <= 8 ? PRE_D304_HELD : heldSentences(true).join(" ");
        const exact = o?.act === "safety" ? Object.values(SAFETY_GUIDANCE) as string[] : o?.act === "close" ? [held] : [];
        need(attempts.length === 1 && attempts[0].proposal === null && attempts[0].refusal === null && attempts[0].error === undefined && Array.isArray(o?.say) && o.say.length === 1 && exact.includes(o.say[0] as string) && Array.isArray(o?.board) && o.board.length === 0, path, "controller output is exact safety guidance or the exact held lines only");
      }
      // A chat's close after the safety guidance is code's own: no model is asked for it (#589).
      if (attempts.length === 1 && attempts[0]?.source === "fallback") need(x.state === "SAFETY" && (x.output as { act?: unknown } | null)?.act === "close", `${path}.attempts`, "a fallback with no model attempt is only the close after safety guidance");
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
  if (r.version === 7 || r.scopeRefusals !== undefined) {
    need(Array.isArray(r.scopeRefusals), "scopeRefusals", "a list of reason codes and times");
    for (const refusal of r.scopeRefusals as unknown[]) need(isObject(refusal) && typeof refusal.at === "number" && Number.isFinite(refusal.at) &&
      (SCOPE_REASONS as readonly unknown[]).includes(refusal.reason) && Object.keys(refusal).every(k => k === "at" || k === "reason"), "scopeRefusals", "reason and time only");
  }
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
  if ((r.version as number) >= 3) {
    const rv = r.reviewer;
    need(rv === null || (isObject(rv) && isName(rv.id) && isName(rv.promptVersion) && Object.keys(rv).length === 2), "reviewer", "null, or the review's model id and prompt version");
  } else need(r.reviewer === undefined, "reviewer", "absent before version 3");

  need(Array.isArray(r.turns), "turns", "a list");
  const turns = (r.turns as unknown[]).map((t, i) => checkTurn(t, `turns[${i}]`, r.version as number));
  turns.forEach((t, i) => need(i === 0 || (t.at as number) >= (turns[i - 1].at as number), `turns[${i}].at`, "not before the turn before it"));
  turns.forEach((t, i) => {
    if (t.kind !== "maya" || (r.version as number) >= 3) return;
    (t.attempts as Record<string, unknown>[]).forEach((a, k) => need(a.talk === undefined && a.reviewMs === undefined, `turns[${i}].attempts[${k}].talk`, "absent before version 3"));
  });

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
  turns.forEach((t, i) => {
    if (t.kind === "maya") need(!(t.attempts as Record<string, unknown>[]).some((a) => a.source === "controller") || (r.version as number) >= 6, `turns[${i}].attempts`, "controller safety output starts in version 6");
    if (t.kind === "maya") need((t.output as { act?: unknown } | null)?.act !== "close" || !(t.attempts as Record<string, unknown>[]).some((a) => a.source === "controller") || (r.version as number) >= 8, `turns[${i}].attempts`, "controller held output starts in version 8");
  });
  // The voice agent's input turns come in version 4.
  turns.forEach((t, i) => need(!["partial", "maya_said", "content_problem"].includes(t.kind as string) || (r.version as number) >= 4, `turns[${i}].kind`, `not ${String(t.kind)} before version 4`));
  if ((r.version as number) >= 5 || r.obligations !== undefined) {
    need(Array.isArray(r.obligations), "obligations", "the obligation ledger");
    const ids = new Set<number>();
    let childCursor = -1;
    const childResponses = new Set<number>();
    (r.obligations as unknown[]).forEach((raw, i) => {
      const path = `obligations[${i}]`;
      need(isObject(raw), path, "an obligation");
      const o = raw as Record<string, unknown>;
      need(isCount(o.id) && !ids.has(o.id as number), `${path}.id`, "a unique non-negative integer");
      ids.add(o.id as number);
      need(OBLIGATION_KINDS.includes(o.kind as TraceObligation["kind"]), `${path}.kind`, "an obligation kind");
      need(typeof o.at === "number" && Number.isFinite(o.at), `${path}.at`, "a finite time");
      need(["pending", "served", "dropped"].includes(o.status as string), `${path}.status`, "pending, served or dropped");
      const fields = ["id", "kind", "at", "status", "text", "uncertain", "alternatives", "severity", "servedBy", "reason"];
      need(Object.keys(o).every((key) => fields.includes(key)), path, "only obligation fields");
      const hasText = ["child_turn_pending", "content_problem"].includes(o.kind as string);
      need(hasText ? isText(o.text) : o.kind === "repair_due" ? o.text === undefined || isText(o.text) : o.text === undefined, `${path}.text`, hasText ? "required text" : "text for a repair only");
      need(o.uncertain === undefined || (o.kind === "child_turn_pending" && typeof o.uncertain === "boolean"), `${path}.uncertain`, "a child uncertainty boolean when present");
      need(o.alternatives === undefined || (o.kind === "child_turn_pending" && strings(o.alternatives)), `${path}.alternatives`, "a child list of text alternatives when present");
      need(o.kind === "safety_due" ? o.severity === "concern" || o.severity === "immediate" : o.severity === undefined, `${path}.severity`, "a severity for safety only");
      need(o.status === "served" || o.servedBy === undefined, `${path}.servedBy`, "absent unless served");
      need(o.status === "dropped" ? isName(o.reason) : o.reason === undefined, `${path}.reason`, "a non-empty reason only when dropped");
      let childInput = -1;
      if (o.kind === "child_turn_pending") {
        childInput = turns.findIndex((t, index) => index > childCursor && t.kind === "child" && t.text === o.text && t.at === o.at);
        need(childInput >= 0, path, "a distinct matching child input");
        childCursor = childInput;
      }
      if (o.status === "served") {
        need(isCount(o.servedBy) && (o.servedBy as number) < turns.length, `${path}.servedBy`, "the trace turn that served the obligation");
        if (o.kind === "child_turn_pending") {
          need((o.servedBy as number) > childInput && !childResponses.has(o.servedBy as number), `${path}.servedBy`, "a distinct response after this child input");
          childResponses.add(o.servedBy as number);
        }
        const t = turns[o.servedBy as number];
        const act = (t.output as { act?: unknown } | null)?.act;
        const serves = o.kind === "start_pending" ? t.kind === "start" :
          t.kind === "maya" && (o.kind === "safety_due" ? act === "safety" : o.kind === "opening_due" ? act === "open" : o.kind === "repair_due" ? act === "repair" : o.kind === "content_problem" ? act === "close" : act !== undefined && !["open", "repair", "safety"].includes(act as string));
        need(serves, `${path}.servedBy`, "a delivered response for this obligation");
      }
      need(r.outcome === null || o.status !== "pending", `${path}.status`, "no pending work after the call ends");
    });
  }
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
const SECRET_ENV = ["OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "SUPABASE_SECRET_KEY", "STRIPE_SECRET_KEY", "RESEND_API_KEY", "CRON_SECRET", "LIVEKIT_API_SECRET", "LIVEKIT_API_KEY"];

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
      case "partial":
      case "maya_said":
        return { ...t, text: redactText(t.text, childName) };
      case "content_problem":
        return { ...t, detail: redactText(t.detail, childName) };
      case "technical":
        return { ...t, detail: redactText(t.detail, childName) };
      case "maya":
        return {
          ...t,
          attempts: t.attempts.map((a) => ({
            ...a,
            proposal: redactDeep(a.proposal, childName),
            refusal: a.refusal ? { ...a.refusal, reason: redactText(a.refusal.reason, childName) } : null,
            ...(a.talk ? { talk: a.talk.map((x) => redactDeep(x, childName) as TraceTalk) } : {}),
            // Errors are codes and fixed wording: nothing to redact.
          })),
          output: t.output ? { ...t.output, say: t.output.say.map((x) => redactText(x, childName)) } : null,
        };
      default:
        return t;
    }
  });
  return { ...trace, turns, ...(trace.obligations ? { obligations: trace.obligations.map((o) => ({ ...o, ...(o.text !== undefined ? { text: redactText(o.text, childName) } : {}), ...(o.alternatives ? { alternatives: o.alternatives.map((s) => redactText(s, childName)) } : {}) })) } : {}) };
}
