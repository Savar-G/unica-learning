// Maya's trace format (#322, spec #297): one versioned record of one Maya session, written by every session (the text
// adapter now, the voice agent #326, the test bench #323 and the admin demo #324 later). It records the model and
// prompt version, the question package hash, every turn with each proposal, its refusal and repair and the final
// output, the board commands and the outcome. Counts in the test bench are taken from saved traces, so this shape is a
// contract: raise TRACE_VERSION when a field or its meaning changes, and keep `checkTrace` in step.
//
// Plain JSON. Pure TypeScript except `packageHash`, which uses node:crypto (server and scripts only).
import { createHash } from "node:crypto";
import type { Act, Outcome, RefusalCode, SessionState } from "@/lib/maya";

/** Why a proposal was refused: the session's refusal, or "board_refused" when the board core refused a batch the session built. */
export interface TraceRefusal {
  code: RefusalCode | "board_refused";
  reason: string;
  allowed: Act[];
}

/** The version of the trace shape. */
export const TRACE_VERSION = 1;
export const TRACE_KIND = "maya-trace";

/** Where a proposal came from: the model, the model asked again with the refusal (one repair), or code's fallback. */
export type AttemptSource = "model" | "repair" | "fallback";

/** One proposal for one Maya turn and what code did with it. */
export interface TraceAttempt {
  source: AttemptSource;
  /** The proposal as the model (or code) sent it; null when the model gave none (an error or a time-out). */
  proposal: unknown;
  /** Why the session (or the board core) refused it; null when it was accepted. */
  refusal: TraceRefusal | null;
  /** The model call failed: its error message (never the output). */
  error?: string;
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
  | { kind: "technical"; at: number; detail: string };

export interface TraceBoardBatch {
  at: number;
  /** The index of the Maya turn in `turns` that sent it. */
  turn: number;
  transactionId: string;
  commands: readonly unknown[];
}

export interface MayaTrace {
  kind: typeof TRACE_KIND;
  version: typeof TRACE_VERSION;
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

const TURN_KINDS = ["start", "child", "tick", "writing", "maya", "technical"];
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Reads a saved trace: the trace, or why it is not one of this version. Checks the shape, not the session's rules. */
export function checkTrace(raw: unknown): { ok: true; trace: MayaTrace } | { ok: false; reason: string } {
  if (!isObject(raw) || raw.kind !== TRACE_KIND) return { ok: false, reason: "not a Maya trace" };
  if (raw.version !== TRACE_VERSION) return { ok: false, reason: `trace version ${String(raw.version)}, expected ${TRACE_VERSION}` };
  if (typeof raw.callId !== "string" || !raw.callId) return { ok: false, reason: "no call id" };
  const model = raw.model;
  if (!isObject(model) || typeof model.id !== "string" || typeof model.promptVersion !== "string") return { ok: false, reason: "no model or prompt version" };
  const question = raw.question;
  if (!isObject(question) || typeof question.hash !== "string" || !question.hash.startsWith("sha256:")) return { ok: false, reason: "no question package hash" };
  if (!Array.isArray(raw.turns) || !raw.turns.every((t) => isObject(t) && TURN_KINDS.includes(String(t.kind)) && typeof t.at === "number"))
    return { ok: false, reason: "turns are not trace turns" };
  for (const t of raw.turns as Record<string, unknown>[]) {
    if (t.kind === "maya" && (!Array.isArray(t.attempts) || t.attempts.length === 0)) return { ok: false, reason: "a Maya turn has no attempts" };
  }
  if (!Array.isArray(raw.board)) return { ok: false, reason: "no board list" };
  if (raw.outcome !== null && !isObject(raw.outcome)) return { ok: false, reason: "the outcome is not an object" };
  return { ok: true, trace: raw as unknown as MayaTrace };
}
