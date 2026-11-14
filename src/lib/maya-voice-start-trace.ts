// Browser marks for the start of a Maya voice call: from the room joined before the tap to Maya's first sound. Each
// mark carries the call id, the connection attempt it belongs to, the browser's monotonic clock (performance.now) and
// its time origin, so the marks of one page line up with each other and, through the origin, with wall time. They are
// never on the worker's clock. Every field is a closed list or a number: no words, no tokens, no addresses.
//
// The marks stay in this tab (a ring of the last MAX_MARKS, read by `voiceStartMarks()` or, for a browser check, from
// `window.__unicaVoiceStartMarks`). Nothing is sent: a mark never waits on the network. Pure apart from the default
// sink, which the hook uses; tests pass their own clock and sink.

export const VOICE_START_MARK_VERSION = 1;

/** What happened. `*_begin` and `*_end` pair by attempt. */
export type VoiceStartEvent =
  | "prepare_requested" // The screen asked to join before the tap.
  | "ticket_begin" | "ticket_end" // The ticket request (`ok`).
  | "module_ready" // livekit-client is loaded.
  | "room_connect_begin" | "room_connect_end" // LiveKit's connect (`ok`).
  | "prepare_ready" // The room joined before the tap is ready for the tap.
  | "prepare_dropped" // The room joined before the tap was left (`drop`).
  | "agent_present" // Maya's worker is a participant of this attempt's room.
  | "agent_track_subscribed" // Maya's voice track is subscribed in this attempt's room.
  | "call_start_begin" | "call_start_end" // The desk's start request (the call and its ticket; `ok`).
  | "tap" // The named start control was pressed (`label`).
  | "prejoin_decision" // What the tap did with the room joined before it (`decision`, `reason`, `prejoin`).
  | "prejoin_wait_end" // The tap's wait for a join still under way ended (`ok`).
  | "mic_begin" | "mic_end" // The microphone publication (`ok`).
  | "start_audio_begin" | "start_audio_end" // Room.startAudio (`ok`).
  | "remote_playback" // An attached voice element of Maya started playing.
  | "maya_live"; // The screen shows the call as live (Maya is in the room after the tap).

/** The start control, by its label on screen. */
export type VoiceTapLabel = "connect" | "connect_again" | "start_the_call" | "try_again";
/** Reuse of the room joined before the tap. */
export type PrejoinDecision = "reuse_ready" | "reuse_pending" | "fresh";
/** Why the tap decided so. */
export type PrejoinReason =
  | "ready" // Joined and connected: reused.
  | "pending" // The join was under way: the tap waited for it.
  | "not_prepared" // No room was joined before the tap.
  | "other_call" // The joined room was for another call id.
  | "closed" // The joined room had dropped.
  | "prejoin_failed" // The join the tap waited for failed.
  | "prejoin_timeout"; // The join the tap waited for took longer than the bound.
/** Where the join before the tap was at the tap. */
export type PrejoinStage = "none" | "ticket" | "module" | "connect" | "ready";
/** Why the room joined before the tap was left. */
export type PrejoinDropReason = "left" | "expired" | "disconnected" | "failed" | "other_call" | "abandoned";
/** The desk's call made for the microphone check, at the tap. */
export type PremadeState = "ready" | "starting" | "none";

export interface VoiceStartDetail {
  ok?: boolean;
  label?: VoiceTapLabel;
  decision?: PrejoinDecision;
  reason?: PrejoinReason;
  prejoin?: PrejoinStage;
  drop?: PrejoinDropReason;
  premade?: PremadeState;
}

export interface VoiceStartMark extends VoiceStartDetail {
  v: typeof VOICE_START_MARK_VERSION;
  clock: "browser";
  callId: string;
  /** The connection attempt: one per join (before the tap, or in the tap). Null for marks of no join (the tap, the desk's start). */
  attempt: string | null;
  /** Order in this tab. */
  seq: number;
  event: VoiceStartEvent;
  /** performance.now() in ms, 0.1 ms. */
  at: number;
  /** performance.timeOrigin in ms: `origin + at` is the wall time of the mark. */
  origin: number;
}

export const MAX_MARKS = 400;

export interface VoiceStartTrace {
  mark(callId: string, attempt: string | null, event: VoiceStartEvent, detail?: VoiceStartDetail): VoiceStartMark;
  marks(): VoiceStartMark[];
  clear(): void;
}

const DETAIL_KEYS = ["ok", "label", "decision", "reason", "prejoin", "drop", "premade"] as const;

export function createVoiceStartTrace(deps: { now(): number; origin(): number; max?: number }): VoiceStartTrace {
  const ring: VoiceStartMark[] = [];
  const max = deps.max ?? MAX_MARKS;
  let seq = 0;
  return {
    mark(callId, attempt, event, detail = {}) {
      const m: VoiceStartMark = { v: VOICE_START_MARK_VERSION, clock: "browser", callId, attempt, seq: ++seq, event, at: Math.round(deps.now() * 10) / 10, origin: deps.origin() };
      // Only the closed fields: a caller cannot add free text.
      for (const k of DETAIL_KEYS) if (detail[k] !== undefined) (m as unknown as Record<string, unknown>)[k] = detail[k];
      ring.push(m);
      if (ring.length > max) ring.splice(0, ring.length - max);
      return m;
    },
    marks: () => ring.slice(),
    clear: () => { ring.length = 0; },
  };
}

let shared: VoiceStartTrace | null = null;

/** This tab's trace: performance.now and performance.timeOrigin, exposed for a browser check as `window.__unicaVoiceStartMarks`. */
export function voiceStartTrace(): VoiceStartTrace {
  if (shared) return shared;
  const perf = typeof performance !== "undefined" ? performance : null;
  shared = createVoiceStartTrace({ now: () => perf?.now() ?? 0, origin: () => perf?.timeOrigin ?? 0 });
  if (typeof window !== "undefined") {
    const trace = shared;
    try { Object.defineProperty(window, "__unicaVoiceStartMarks", { configurable: true, get: () => trace.marks() }); } catch {}
  }
  return shared;
}

/** The marks of this tab, oldest first. */
export const voiceStartMarks = (): VoiceStartMark[] => voiceStartTrace().marks();

/** A new connection attempt id: random, no meaning. */
export function newAttemptId(): string {
  try { return crypto.randomUUID(); } catch { return `a-${Math.random().toString(36).slice(2, 12)}`; }
}
