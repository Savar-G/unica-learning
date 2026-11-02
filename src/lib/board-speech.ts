// Speech controls delivery, while board-protocol owns order, retries and the visible snapshot.
import type { Batch } from "@/lib/board";
import type { BoardSender } from "@/lib/board-protocol";

export interface BoardCue {
  batch: Batch;
  /** Number of whitespace-separated words reached in the approved utterance, starting at 1. */
  word: number;
}
export type CueSource = "word" | "sentence";
export interface CueMeasurement {
  utteranceId: string;
  batchId: string;
  source: CueSource;
  /** Position at the end of the cue word, relative to the audio segment. */
  audioMs: number;
  /** Worker clock when playback reached the cue and when the browser answered. No cross-clock subtraction. */
  reachedAt: number;
  acknowledgedAt: number;
  acknowledgementMs: number;
  state: string;
}

export function cueReport(samples: readonly CueMeasurement[]) {
  return (["word", "sentence"] as const).map(source => {
    const rows = samples.filter(s => s.source === source);
    const delays = rows.map(s => s.acknowledgementMs).sort((a, b) => a - b);
    return { source, count: rows.length, shown: rows.filter(s => s.state === "shown" || s.state === "presented").length,
      p50AcknowledgementMs: delays.length ? delays[Math.ceil(delays.length * 0.5) - 1] : null,
      p95AcknowledgementMs: delays.length ? delays[Math.ceil(delays.length * 0.95) - 1] : null };
  });
}

/** The caller supplies TTS word ends and confirmed playback positions. Generated audio alone releases nothing. */
export function createBoardSpeech(options: { sender: BoardSender; now(): number; measure?(sample: CueMeasurement): void }) {
  const { sender } = options;
  let generation = 0;
  let plannedId: string | null = null;
  let active: { id: string; cues: BoardCue[]; timings: { word: number; audioMs: number; source: CueSource; reachedAt?: number }[]; position: number; playedAt: number; generation: number } | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(op: () => Promise<T>) => { const run = queue.then(op); queue = run.catch(() => {}); return run; };
  const check = (r: { ok: boolean }) => { if (!r.ok) throw new Error("The board did not accept the speech operation."); };
  const release = async () => {
    const a = active;
    if (!a || a.generation !== generation) return;
    while (a.cues.length && a.generation === generation) {
      const cue = a.cues[0];
      const timing = a.timings.find(t => t.word >= cue.word && t.audioMs <= a.position);
      if (!timing) break;
      a.cues.shift();
      const reachedAt = timing.reachedAt ?? options.now();
      const result = await sender.release(cue.batch.transactionId);
      check(result);
      const acknowledgedAt = options.now();
      if (result.ok) options.measure?.({ utteranceId: a.id, batchId: cue.batch.transactionId, source: timing.source,
        audioMs: timing.audioMs, reachedAt, acknowledgedAt, acknowledgementMs: acknowledgedAt - reachedAt, state: result.state });
    }
  };
  return {
    /** Plans must be staged before their speech starts. A new plan invalidates callbacks from the previous speech. */
    stage(id: string, cues: readonly BoardCue[]) {
      plannedId = id;
      const gen = ++generation;
      active = null;
      const copy = structuredClone([...cues]);
      if (copy.some((c, i) => !Number.isSafeInteger(c.word) || c.word < 1 || (i > 0 && c.word < copy[i - 1].word))) throw new Error("Speech cues must be ordered word positions.");
      return serial(async () => {
        check(await sender.cancel());
        if (gen !== generation) return;
        active = { id, cues: copy, timings: [], position: 0, playedAt: options.now(), generation: gen };
        for (const cue of copy) {
          if (gen !== generation) return;
          check(await sender.send(cue.batch, { utteranceId: id }));
        }
      });
    },
    timing(id: string, word: number, audioMs: number, source: CueSource) {
      if (active?.id !== id || active.generation !== generation || !Number.isFinite(audioMs) || audioMs < 0) return Promise.resolve();
      active.timings.push({ word, audioMs, source, ...(audioMs <= active.position ? { reachedAt: active.playedAt } : {}) });
      return serial(release);
    },
    played(id: string, audioMs: number) {
      if (active?.id !== id || active.generation !== generation || !Number.isFinite(audioMs) || audioMs < 0) return Promise.resolve();
      active.position = Math.max(active.position, audioMs);
      active.playedAt = options.now();
      for (const t of active.timings) if (t.reachedAt === undefined && t.audioMs <= active.position) t.reachedAt = active.playedAt;
      return serial(release);
    },
    /** Invalidate first, before any await. A late timing or playout callback cannot release old work. */
    interrupt() {
      generation++;
      active = null;
      // Send the stop outside the serial queue. A stalled release must not delay the interruption.
      const stopping = plannedId ? sender.interrupt(plannedId) : Promise.resolve({ ok: true });
      return stopping.then(check);
    },
    reconnect() {
      plannedId = null;
      generation++;
      active = null;
      return serial(async () => { check(await sender.connect()); });
    },
    settled: () => queue,
  };
}
export type BoardSpeech = ReturnType<typeof createBoardSpeech>;
export const speechWords = (text: string) => text.match(/\S+/g) ?? [];
export const speechSentences = (text: string) => text.match(/\S[\s\S]*?(?:[.!?](?=\s|$)|$)/g) ?? [];
