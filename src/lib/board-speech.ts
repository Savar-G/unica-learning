// Speech controls delivery, while board-protocol owns order, retries and the visible snapshot.
import type { Batch } from "@/lib/board";
import type { BoardSender, BoardSnapshot } from "@/lib/board-protocol";

export interface BoardCue {
  batch: Batch;
  /** Number of whitespace-separated words reached in the approved utterance, starting at 1. */
  word: number;
}
/** Ownership of one staged plan. Reusing an utterance ID does not reuse its generation. */
export interface SpeechScope {
  readonly utteranceId: string;
  readonly generation: number;
}
export const SPEECH_SCOPE_DATA = "unica.maya.speechScope";
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
export function createBoardSpeech(options: { sender: BoardSender; now(): number; measure?(sample: CueMeasurement): void; observe?(snapshot: BoardSnapshot): Promise<void> }) {
  const { sender } = options;
  let generation = 0;
  let plannedScope: SpeechScope | null = null;
  let retired = false;
  let active: { scope: SpeechScope; id: string; cues: BoardCue[]; timings: { word: number; audioMs: number; source: CueSource; reachedAt?: number }[]; position: number | null; playedAt: number; anchorAt?: number; generation: number } | null = null;
  let observation: Promise<unknown> = Promise.resolve();
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(op: () => Promise<T>) => { const run = queue.then(op); queue = run.catch(() => {}); return run; };
  const matches = (scope: SpeechScope | null) => !!scope && plannedScope?.utteranceId === scope.utteranceId && plannedScope.generation === scope.generation;
  const owns = (scope: SpeechScope | null) => matches(scope) && !retired;
  const check = (r: { ok: boolean }) => { if (!r.ok) throw new Error("The board did not accept the speech operation."); };
  const release = async () => {
    const a = active;
    if (!a || !owns(a.scope) || a.position === null) return;
    while (a.cues.length && owns(a.scope)) {
      const cue = a.cues[0];
      const timing = a.timings.find(t => t.word >= cue.word && t.audioMs <= (a.position ?? -1));
      if (!timing) break;
      a.cues.shift();
      const reachedAt = timing.reachedAt ?? options.now();
      const result = await sender.release(cue.batch.transactionId, a.scope);
      check(result);
      const acknowledgedAt = options.now();
      await options.observe?.(sender.snapshot());
      if (result.ok) options.measure?.({ utteranceId: a.id, batchId: cue.batch.transactionId, source: timing.source,
        audioMs: timing.audioMs, reachedAt, acknowledgedAt, acknowledgementMs: acknowledgedAt - reachedAt, state: result.state });
    }
  };
  const connect = () => {
    if (plannedScope) return Promise.reject(new Error("Reconnect requires the previous speech scope."));
    generation++;
    observation = Promise.resolve();
    active = null;
    retired = false;
    return serial(async () => {
      // Plans queued after this connection must wait for its epoch, even if they already own a new scope.
      check(await sender.connect());
      await options.observe?.(sender.snapshot());
    });
  };
  return {
    capture(utteranceId: string): SpeechScope | null {
      return plannedScope?.utteranceId === utteranceId && !retired ? { ...plannedScope } : null;
    },
    owns,
    /** Plans must be staged before their speech starts. A new plan invalidates callbacks from the previous speech. */
    stage(id: string, cues: readonly BoardCue[]) {
      const gen = ++generation;
      const scope: SpeechScope = { utteranceId: id, generation: gen };
      plannedScope = scope;
      retired = false;
      observation = Promise.resolve();
      active = null;
      const copy = structuredClone([...cues]);
      if (copy.some((c, i) => !Number.isSafeInteger(c.word) || c.word < 1 || (i > 0 && c.word < copy[i - 1].word))) throw new Error("Speech cues must be ordered word positions.");
      return serial(async () => {
        if (!owns(scope)) return;
        check(await sender.cancel());
        await options.observe?.(sender.snapshot());
        if (!owns(scope)) return;
        active = { scope, id, cues: copy, timings: [], position: null, playedAt: options.now(), generation: gen };
        for (const cue of copy) {
          if (!owns(scope)) return;
          check(await sender.send(cue.batch, { scope }));
        }
      });
    },
    timing(scope: SpeechScope, word: number, audioMs: number, source: CueSource) {
      if (!owns(scope) || !active || active.generation !== scope.generation || !Number.isFinite(audioMs) || audioMs < 0) return Promise.resolve();
      if (active.timings.some(t => t.word === word && t.audioMs === audioMs && t.source === source)) return Promise.resolve();
      active.timings.push({ word, audioMs, source, ...(active.position !== null && audioMs <= active.position ? { reachedAt: active.anchorAt === undefined ? active.playedAt : active.anchorAt + audioMs } : {}) });
      return serial(release);
    },
    played(scope: SpeechScope, audioMs: number, anchorAt?: number) {
      if (!owns(scope) || !active || active.generation !== scope.generation || !Number.isFinite(audioMs) || audioMs < 0) return Promise.resolve();
      active.anchorAt = anchorAt;
      active.position = Math.max(active.position ?? 0, audioMs);
      active.playedAt = options.now();
      for (const t of active.timings) if (t.reachedAt === undefined && t.audioMs <= active.position) t.reachedAt = anchorAt === undefined ? active.playedAt : anchorAt + t.audioMs;
      return serial(release);
    },
    /** Invalidate first, before any await. A late timing or playout callback cannot release old work. */
    /** A lost peer cannot receive a stop. Invalidate locally; reconnect will retire its staged work. */
    detach(scope: SpeechScope) {
      if (!owns(scope)) return;
      retired = true;
      active = null;
    },
    interrupt(scope: SpeechScope) {
      if (!owns(scope)) return Promise.resolve();
      retired = true;
      active = null;
      // Send the stop outside the serial queue. A stalled release must not delay the interruption.
      const stopping = sender.interrupt(scope);
      // Keep priority acknowledgement independent of any release still in flight.
      // The next serial observation waits for that release and then reads the receiver's decision.
      const observed = stopping.then(async result => {
        check(result);
        await serial(async () => { check({ ok: await sender.sync() }); await options.observe?.(sender.snapshot()); });
      });
      observation = observed;
      void observed.catch(() => {});
      return stopping.then(check);
    },
    /** Initial connection cannot clear a staged or retired plan. */
    connect,
    reconnect(scope: SpeechScope) {
      if (!matches(scope)) return Promise.resolve();
      plannedScope = null;
      return connect();
    },
    settled: async () => { await observation; await queue; },
  };
}
export type BoardSpeech = ReturnType<typeof createBoardSpeech>;
export const speechWords = (text: string) => text.match(/\S+/g) ?? [];
export const speechSentences = (text: string) => text.match(/\S[\s\S]*?(?:[.!?](?=\s|$)|$)/g) ?? [];
