// How the real-audio interruption check (#1147, scripts/maya-interrupt-proof.ts) turns received audio levels into a
// stop time. The input is Maya's audio as the child's participant receives it from the room, one level per 10 ms
// frame on the same clock as the child's speech onset. A device speaker, echo cancellation and the browser's own
// output buffer are outside this measure.

/** One received frame of Maya's audio: arrival time (ms), RMS level (dBFS) and the frame's duration (ms, from its samples). */
export interface Level { at: number; db: number; ms: number }

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
  const loud = levels.filter(l => l.db >= o.audibleDb);
  const speaking = loud.some(l => l.at < onsetAt && l.at >= onsetAt - o.speakingMs);
  if (!speaking) return { speaking, stopMs: 0 };
  let last = loud.filter(l => l.at < onsetAt).at(-1)!;
  for (const l of loud) {
    if (l.at < onsetAt) continue;
    if (l.at - last.at > o.quietMs) break;
    last = l;
  }
  const end = last.at + last.ms;
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

/** 16-bit PCM samples of a WAV file. Refuses another sample format, channel count or rate, rather than misread it. */
export function readWav(file: Buffer, rate: number): Int16Array {
  if (file.toString("ascii", 0, 4) !== "RIFF" || file.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  let format: { code: number; channels: number; rate: number; bits: number } | null = null;
  for (let at = 12; at + 8 <= file.length;) {
    const id = file.toString("ascii", at, at + 4);
    const size = file.readUInt32LE(at + 4);
    if (id === "fmt ") format = { code: file.readUInt16LE(at + 8), channels: file.readUInt16LE(at + 10), rate: file.readUInt32LE(at + 12), bits: file.readUInt16LE(at + 22) };
    if (id === "data") {
      if (!format) throw new Error("WAV data before its fmt chunk");
      if (format.code !== 1 || format.bits !== 16) throw new Error(`WAV format ${format.code} with ${format.bits} bits: need 16-bit PCM (format 1)`);
      if (format.channels !== 1) throw new Error(`WAV with ${format.channels} channels: need mono`);
      if (format.rate !== rate) throw new Error(`WAV at ${format.rate} Hz: need ${rate} Hz`);
      return new Int16Array(file.buffer.slice(file.byteOffset + at + 8, file.byteOffset + at + 8 + size));
    }
    at += 8 + size + (size % 2);
  }
  throw new Error("no data chunk in the WAV file");
}

/**
 * How many microphone frames to send now, keeping `leadMs` ahead of real time. Frame i plays at `start + i * frameMs`.
 * After a stall of more than `maxLagMs` the schedule moves to now: the backlog is not sent in a burst, so a frame's
 * time stays its send time and a stall is never added to a measured stop.
 */
export function pace(p: { start: number; sent: number }, now: number, frameMs = 10, leadMs = 20, maxLagMs = 30) {
  if (now - (p.start + p.sent * frameMs) > maxLagMs) p.start = now - p.sent * frameMs;
  return Math.max(0, Math.floor((now - p.start + leadMs) / frameMs) - p.sent);
}

/** One trial: the sound played into the child's microphone and what followed it (times in ms from its onset). */
export interface TrialRow {
  kind: "intentional" | "incidental";
  clip: string;
  onsetAt: number;
  speaking: boolean;
  stopMs: number | null;
  vadMs: number | null;
  agentListeningMs: number | null;
  speechInterrupted: boolean | null;
  /** LiveKit's calls on Maya's output, as "pause@ms", "clear@ms" or "resume@ms". */
  output: string[];
  /** The final transcripts of this trial's window. */
  transcripts: string[];
  resumed: boolean;
}

/**
 * Scores the trials. Each trial owns only what happens before the next trial's onset. A stop counts only when the
 * child's sound cut Maya (`cutByChild`); lost speech counts every request, whether or not Maya stopped, and each request
 * must reach a child turn of its own window.
 */
export function scoreTrials(rows: readonly TrialRow[], childTurns: readonly { at: number; text: string }[], targetMs = 300, kinds: readonly string[] = []) {
  const scored = rows.map((r, i) => {
    const limit = (rows[i + 1]?.onsetAt ?? Infinity) - r.onsetAt;
    const own = (ms: number | null) => (ms !== null && ms < limit ? ms : null);
    const output = r.output.filter(o => Number(o.split("@")[1]) < limit);
    const cut = cutByChild({ vadMs: own(r.vadMs), agentListeningMs: own(r.agentListeningMs), cleared: output.some(o => !o.startsWith("resume")) });
    const turns = childTurns.filter(t => t.at >= r.onsetAt && t.at < r.onsetAt + limit);
    const reachedTurn = r.transcripts.length > 0 && turns.some(t => r.transcripts.some(h => t.text.includes(h.trim()) || h.includes(t.text.trim())));
    return { ...r, output, cut, reachedTurn };
  });
  const intent = scored.filter(r => r.kind === "intentional");
  const stops = intent.filter(r => r.speaking && r.cut);
  const incid = scored.filter(r => r.kind === "incidental" && r.speaking);
  const at = (r: { output: string[] }, kind: string) => r.output.map(o => o.split("@")).find(([k]) => k === kind)?.[1];
  return {
    rows: scored,
    stop: { ...interruptReport(stops, targetMs), endedOnTheirOwn: intent.filter(r => r.speaking && !r.cut).length, notSpeaking: intent.filter(r => !r.speaking).length,
      vadMs: interruptReport(stops.map(r => ({ stopMs: r.vadMs })), targetMs), cutMs: interruptReport(stops.map(r => ({ stopMs: r.agentListeningMs })), targetMs) },
    lostSpeech: { n: intent.length, lost: intent.filter(r => r.transcripts.length === 0).length, split: intent.filter(r => r.transcripts.length > 1).length,
      notATurn: intent.filter(r => !r.reachedTurn).length },
    // The silence a resumed false stop left: from LiveKit's first pause to its resume.
    resumeGapMs: interruptReport(incid.filter(r => r.cut && r.resumed).map(r => {
      const paused = at(r, "pause"), resumed = at(r, "resume");
      return { stopMs: paused !== undefined && resumed !== undefined ? Number(resumed) - Number(paused) : null };
    }), 2000),
    falseStops: { n: incid.length, stopped: incid.filter(r => r.cut).length, resumed: incid.filter(r => r.cut && r.resumed).length,
      permanent: incid.filter(r => r.cut && !r.resumed).length,
      byClip: kinds.map(clip => {
        const of = incid.filter(r => r.clip === clip);
        return { clip, n: of.length, stopped: of.filter(r => r.cut).length, resumed: of.filter(r => r.cut && r.resumed).length };
      }) },
  };
}
