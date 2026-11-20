// How the real-audio interruption check (#1147, scripts/maya-interrupt-proof.ts) turns received audio levels into a
// stop time. The input is Maya's audio as the child's participant receives it from the room, one level per 10 ms
// frame on the same clock as the child's speech onset. A device speaker, echo cancellation and the browser's own
// output buffer are outside this measure.

/** One received frame of Maya's audio: arrival time (ms) and RMS level (dBFS). */
export interface Level { at: number; db: number }

export interface StopOptions {
  /** A frame at or above this level is audible. */
  audibleDb: number;
  /** Maya counts as stopped after this long without an audible frame (longer than her pauses between sentences). */
  quietMs: number;
  /** Maya counts as speaking at the onset when she was audible within this long before it. */
  speakingMs: number;
  /** The longest stop the trial looks for. */
  windowMs: number;
}

export const STOP_DEFAULTS: StopOptions = { audibleDb: -45, quietMs: 700, speakingMs: 300, windowMs: 3000 };

/**
 * The time from the child's onset to the end of Maya's last audible frame before a quiet of `quietMs`.
 * `speaking` false: Maya was not audible just before the onset, so the trial measures nothing.
 * `stopMs` null: Maya was still audible at the end of the window.
 */
export function audibleStop(levels: readonly Level[], onsetAt: number, options: Partial<StopOptions> = {}) {
  const o = { ...STOP_DEFAULTS, ...options };
  const frame = levels.length > 1 ? levels[1].at - levels[0].at : 10;
  const audible = levels.filter(l => l.db >= o.audibleDb).map(l => l.at);
  const speaking = audible.some(at => at < onsetAt && at >= onsetAt - o.speakingMs);
  if (!speaking) return { speaking, stopMs: 0 };
  let last = audible.filter(at => at < onsetAt).at(-1)!;
  for (const at of audible) {
    if (at < onsetAt) continue;
    if (at - last > o.quietMs) break;
    last = at;
  }
  const end = last + frame;
  const covered = levels.length > 0 && levels.at(-1)!.at >= end + o.quietMs;
  if (end - onsetAt > o.windowMs || !covered) return { speaking, stopMs: null };
  return { speaking, stopMs: Math.max(0, end - onsetAt) };
}

/** Nearest-rank percentile; a missing stop sorts last, and a rank that lands on one gives null. */
function rank(values: readonly (number | null)[], p: number) {
  const sorted = [...values].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? null;
}

export function interruptReport(trials: readonly { stopMs: number | null }[], targetMs: number) {
  const stops = trials.map(t => t.stopMs);
  return {
    n: trials.length,
    stopped: stops.filter(s => s !== null).length,
    neverStopped: stops.filter(s => s === null).length,
    p50: rank(stops, 0.5),
    p95: rank(stops, 0.95),
    withinTarget: stops.filter(s => s !== null && s <= targetMs).length,
    targetMs,
  };
}

/**
 * Whether the child's sound stopped Maya. The worker can stop her audio by retiring the speech scope, and the speech
 * handle then reports no interruption, so the test is the agent going to listening after the child's speech started
 * (times from the sound's onset), or a cleared output. A speech that ended before the child was detected ended on its own.
 */
export function cutByChild(t: { vadMs: number | null; agentListeningMs: number | null; cleared: boolean }, withinMs = 1000) {
  if (t.cleared) return true;
  if (t.vadMs === null || t.agentListeningMs === null) return false;
  return t.agentListeningMs >= t.vadMs && t.agentListeningMs - t.vadMs <= withinMs;
}
