// Staging-only stop timing (#1137, docs/maya-voice-deploy.md). main.ts attaches it only on a named LiveKit
// deployment, never in production. For each start of the child's speech it records, on the worker's clock: when the
// worker heard it (LiveKit's user state "speaking"), when LiveKit asked Maya's output to pause or clear, when the
// room output's audio actually stopped (the end of the run it reports when it drops its queue), and any resume. A
// child-side stop on LiveKit Cloud then splits into the worker's reaction and the network plus playout.
import { voice } from "@livekit/agents";

export interface StopTiming {
  speakingAt: number;
  pauseAt: number | null;
  clearAt: number | null;
  /** The end of the room output's last audio run after the pause or clear. */
  outputStoppedAt: number | null;
  resumeAt: number | null;
  /** Heard to the first pause or clear. */
  reactionMs: number | null;
  /** The first pause or clear to the audio's actual end. */
  outputMs: number | null;
}

type Output = { pause(): void; clearBuffer(): void; resume(): void; on(event: string, listener: (ev: { startedAt: number; duration: number }) => void): unknown };
type Session = { on(event: string, listener: (ev: { newState: string; createdAt: number }) => void): unknown; output: { audio: Output | null } };

/** Watches the session's audio output and its user state. `flush` emits the open record (call it at the session's end). */
export function attachStopTiming(session: Session, emit: (record: StopTiming) => void, options: { now?: () => number; windowMs?: number } = {}) {
  const now = options.now ?? Date.now;
  const windowMs = options.windowMs ?? 3000;
  let open: Omit<StopTiming, "reactionMs" | "outputMs"> | null = null;
  const flush = () => {
    if (!open) return;
    const first = open.pauseAt ?? open.clearAt;
    emit({ ...open, reactionMs: first === null ? null : first - open.speakingAt,
      outputMs: first === null || open.outputStoppedAt === null ? null : open.outputStoppedAt - first });
    open = null;
  };
  /** The open record, while `at` is inside its window. */
  const current = (at: number) => (open && at >= open.speakingAt && at - open.speakingAt <= windowMs ? open : null);
  session.on(voice.AgentSessionEventTypes.UserStateChanged, ev => {
    if (ev.newState !== "speaking") return;
    flush();
    open = { speakingAt: ev.createdAt, pauseAt: null, clearAt: null, outputStoppedAt: null, resumeAt: null };
  });
  const audio = session.output.audio;
  if (!audio) return { flush };
  const mark = (field: "pauseAt" | "clearAt" | "resumeAt", method: "pause" | "clearBuffer" | "resume") => {
    const original = audio[method].bind(audio);
    audio[method] = () => {
      const record = current(now());
      if (record && record[field] === null) record[field] = now();
      return original();
    };
  };
  mark("pauseAt", "pause");
  mark("clearAt", "clearBuffer");
  mark("resumeAt", "resume");
  audio.on(voice.AudioOutput.EVENT_PLAYBACK_PROGRESSED, ev => {
    const record = current(now());
    if (record && (record.pauseAt !== null || record.clearAt !== null) && record.outputStoppedAt === null) record.outputStoppedAt = ev.startedAt + ev.duration;
  });
  return { flush };
}
