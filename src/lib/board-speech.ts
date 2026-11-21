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
/** A batch of a plan that did not go to the board: the core refused it (`code`), or it came after one it refused (null). */
export interface StageRefusal {
  batchId: string;
  code: string | null;
}
export interface StageResult {
  refused: StageRefusal[];
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
export function createBoardSpeech(options: { sender: BoardSender; now(): number; measure?(sample: CueMeasurement): void; observe?(snapshot: BoardSnapshot): Promise<void> }) {
  const { sender } = options;
  let generation = 0;
  let plannedScope: SpeechScope | null = null;
  let speechAbort: AbortController | null = null;
  let audioOnly: { scope: SpeechScope; controller: AbortController } | null = null;
  let deliveryScope: SpeechScope | null = null;
  let cancellation: ReturnType<BoardSender["interrupt"]> | null = null;
  let retired = false;
  let active: { scope: SpeechScope; id: string; cues: BoardCue[]; timings: { word: number; audioMs: number; source: CueSource; reachedAt?: number }[]; skipped: { fromMs: number; toMs: number }[]; position: number | null; playedAt: number; anchorAt?: number; generation: number } | null = null;
  let observation: Promise<unknown> = Promise.resolve();
  /** The save of the receiver's snapshot after the newest plan went out. It is outside the serial order (below). */
  let stagedObservation: Promise<unknown> = Promise.resolve();
  /** When the newest plan's batches reached the receiver (or it can no longer send them). */
  let sending: { scope: SpeechScope; done: Promise<void> } | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(op: () => Promise<T>) => { const run = queue.then(op); queue = run.catch(() => {}); return run; };
  const same = (a: SpeechScope | null | undefined, b: SpeechScope | null) => !!b && a?.utteranceId === b.utteranceId && a.generation === b.generation;
  const matches = (scope: SpeechScope | null) => same(plannedScope, scope);
  const owns = (scope: SpeechScope | null) => (matches(scope) && !retired) || same(audioOnly?.scope, scope);
  const retireAudio = (scope: SpeechScope) => {
    if (!audioOnly || !same(audioOnly.scope, scope)) return false;
    const { controller } = audioOnly;
    audioOnly = null;
    controller.abort();
    return true;
  };
  // The code says why, for the worker's log: a refusal, an unreachable board, or another sender (Savar's call, 2026-11-13).
  const check = (r: { ok: boolean; code?: string }) => { if (!r.ok) throw new Error(`The board did not accept the speech operation (${r.code ?? "unknown"}).`); };
  const release = async () => {
    const a = active;
    if (!a || !owns(a.scope)) return;
    while (a.cues.length && owns(a.scope)) {
      const cue = a.cues[0];
      const position = a.position ?? -1;
      const timing = a.skipped.length
        ? a.timings.find(t => t.word === cue.word && t.source === "word") ??
          a.timings.find(t => t.word >= cue.word && t.source === "sentence")
        : a.timings.find(t => t.word >= cue.word && t.audioMs <= position);
      if (!timing) break;
      // A later word can arrive before the cue's own timing. For sentence fallback, require the possible cue span
      // to be audible, from the last known earlier word or sentence end.
      const earliest = timing.source === "sentence" && a.skipped.length
        ? a.timings.reduce((ms, t) => t.word < cue.word && t.audioMs <= timing.audioMs ? Math.max(ms, t.audioMs) : ms, 0)
        : timing.audioMs;
      if (a.skipped.some(({ fromMs, toMs }) => timing.audioMs > fromMs && earliest <= toMs)) {
        const result = await sender.cancel(a.scope, cue.batch.transactionId);
        if (!owns(a.scope)) return;
        check(result);
        if (!result.ok) return;
        const gone = new Set([cue.batch.transactionId, ...result.cancelled]);
        a.cues = a.cues.filter(c => !gone.has(c.batch.transactionId));
        await options.observe?.(sender.snapshot());
        continue;
      }
      if (timing.audioMs > position) break;
      a.cues.shift();
      const reachedAt = timing.reachedAt ?? options.now();
      const result = await sender.release(cue.batch.transactionId, a.scope);
      if (!owns(a.scope) && !result.ok) return;
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
      deliveryScope = null;
      cancellation = null;
      await options.observe?.(sender.snapshot());
    });
  };
  return {
    capture(utteranceId: string): SpeechScope | null {
      return plannedScope?.utteranceId === utteranceId && !retired ? { ...plannedScope } : null;
    },
    owns,
    signal(scope: SpeechScope): AbortSignal {
      if (audioOnly && same(audioOnly.scope, scope)) return audioOnly.controller.signal;
      return owns(scope) && speechAbort ? speechAbort.signal : AbortSignal.abort();
    },
    openAudio(id: string): SpeechScope {
      if (audioOnly) retireAudio(audioOnly.scope);
      const scope = { utteranceId: id, generation: ++generation };
      audioOnly = { scope, controller: new AbortController() };
      return scope;
    },
    /**
     * Plans must be on the receiver before their speech is heard: the audio of a plan waits for `sent(scope)`. A new plan
     * invalidates callbacks from the previous speech. The returned promise also covers the save of the receiver's
     * snapshot that follows, which is not in the serial order: a release (and so the audio that waits for a word time)
     * never waits for that save.
     */
    stage(id: string, cues: readonly BoardCue[]) {
      speechAbort?.abort();
      speechAbort = new AbortController();
      const gen = ++generation;
      const scope: SpeechScope = { utteranceId: id, generation: gen };
      plannedScope = scope;
      retired = false;
      observation = Promise.resolve();
      active = null;
      const copy = structuredClone([...cues]);
      if (copy.some((c, i) => !Number.isSafeInteger(c.word) || c.word < 1 || (i > 0 && c.word < copy[i - 1].word))) throw new Error("Speech cues must be ordered word positions.");
      let markSent = () => {};
      let failSent: (e: unknown) => void = () => {};
      const done = new Promise<void>((resolve, reject) => { markSent = resolve; failSent = reject; });
      void done.catch(() => {});
      sending = { scope, done };
      let changed = false;
      const refused: StageRefusal[] = [];
      const sent = serial(async () => {
        try {
          if (!owns(scope)) return;
          const stopped = cancellation && await cancellation;
          if (!owns(scope)) return;
          if (stopped) check(stopped);
          if (deliveryScope) {
            changed = true;
            const cancelled = await sender.cancel(deliveryScope);
            if (!owns(scope)) return;
            check(cancelled);
          }
          const plan: NonNullable<typeof active> = { scope, id, cues: copy, timings: [], skipped: [], position: null, playedAt: options.now(), generation: gen };
          active = plan;
          for (const [index, cue] of copy.entries()) {
            if (!owns(scope)) return;
            deliveryScope = scope;
            changed = true;
            const result = await sender.send(cue.batch, { scope });
            if (!owns(scope)) return;
            // The board core refused the batch (#326, call 01f456de: it was placed below a note of a batch the child's
            // board never showed). The receiver decided it, so the connection is sound and the call can go on: the words
            // are said, and neither this batch nor the batches planned after it go to the board.
            if (!result.ok && result.code === "refused") {
              refused.push({ batchId: cue.batch.transactionId, code: result.refusal?.code ?? null });
              for (const rest of copy.slice(index + 1)) refused.push({ batchId: rest.batch.transactionId, code: null });
              plan.cues = copy.slice(0, index);
              return;
            }
            check(result);
          }
        } catch (e) {
          if (!owns(scope)) return;
          failSent(e);
          throw e;
        } finally {
          markSent();
        }
      });
      // Taken once the plan went out, so it holds the cancellation and the new batches (pending until released).
      const observed = sent.then(async (): Promise<StageResult> => {
        if (changed) await options.observe?.(sender.snapshot());
        return { refused };
      });
      stagedObservation = observed.catch(() => {});
      return observed;
    },
    /**
     * Shows at once every batch of this plan that is on the receiver and not shown yet, then ends the plan. For a speech
     * that produced no audio: its turn is saved, and Maya's saved board holds its batches, so the child's board must hold
     * them too. A cancel here would leave the next plan, built on these batches, to be refused (call 01f456de).
     */
    show(scope: SpeechScope) {
      if (!matches(scope) || !owns(scope)) return Promise.resolve();
      return serial(async () => {
        const a = active;
        if (!owns(scope) || !a || a.generation !== scope.generation) return;
        const on = a.cues.filter(c => sender.batchState(c.batch.transactionId) === "accepted");
        a.cues = [];
        retired = true;
        active = null;
        const last = on.at(-1);
        // The receiver shows every staged batch up to the one released, in order.
        if (!last) return;
        check(await sender.release(last.batch.transactionId, a.scope));
        await options.observe?.(sender.snapshot());
      });
    },
    /**
     * Sends `batches` under a plan that is already playing and shows them at once, without a new plan: the plan keeps its
     * audio (a new plan would take it). For the question's batch, known only once the call's start returns while the
     * worker's opening is already being said. False when the plan no longer owns the board (nothing was sent): the caller
     * must give the batches another way. A batch the board core refuses is not drawn, nor are the ones after it.
     */
    showWith(scope: SpeechScope, batches: readonly Batch[]): Promise<{ shown: boolean; refused: StageRefusal[] }> {
      if (!matches(scope) || !owns(scope)) return Promise.resolve({ shown: false, refused: [] });
      const copy = structuredClone([...batches]);
      return serial(async () => {
        const a = active;
        if (!owns(scope) || !a || a.generation !== scope.generation) return { shown: false, refused: [] };
        const refused: StageRefusal[] = [];
        let last: Batch | null = null;
        for (const [index, batch] of copy.entries()) {
          if (!owns(scope)) break;
          deliveryScope = scope;
          const result = await sender.send(batch, { scope });
          if (!result.ok && result.code === "refused") {
            refused.push({ batchId: batch.transactionId, code: result.refusal?.code ?? null });
            for (const rest of copy.slice(index + 1)) refused.push({ batchId: rest.transactionId, code: null });
            break;
          }
          check(result);
          last = batch;
        }
        // A plan cut while its batches went out leaves them staged: the cut's own stop retires them on the receiver.
        if (last && owns(scope)) check(await sender.release(last.transactionId, scope));
        await options.observe?.(sender.snapshot());
        return { shown: true, refused };
      });
    },
    /** Resolves when this scope's batches are on the receiver; rejects when sending them failed. Other scopes: at once. */
    sent(scope: SpeechScope): Promise<void> {
      return sending && sending.scope.utteranceId === scope.utteranceId && sending.scope.generation === scope.generation ? sending.done : Promise.resolve();
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
    /**
     * The audio from `fromMs` to `toMs` of this plan was sent and then dropped (LiveKit discards what its output held when
     * it pauses), so the child never heard it. Cancels the staged batches whose cue word ends in that span; the receiver
     * also drops a later batch built on them. Later cues release as usual.
     */
    skip(scope: SpeechScope, fromMs: number, toMs: number) {
      if (!active || !owns(scope) || active.generation !== scope.generation || !(toMs > fromMs)) return Promise.resolve();
      active.skipped.push({ fromMs, toMs });
      return serial(release);
    },
    /** Invalidate first, before any await. A late timing or playout callback cannot release old work. */
    /** A lost peer cannot receive a stop. Invalidate locally; reconnect will retire its staged work. */
    detach(scope: SpeechScope) {
      if (retireAudio(scope)) return;
      if (!owns(scope)) return;
      retired = true;
      active = null;
      speechAbort?.abort();
    },
    interrupt(scope: SpeechScope, recover = true) {
      if (retireAudio(scope)) return Promise.resolve();
      if (!owns(scope)) return Promise.resolve();
      retired = true;
      active = null;
      speechAbort?.abort();
      // Send the stop outside the serial queue. A stalled release must not delay the interruption.
      const epoch = sender.epoch();
      const previous = deliveryScope;
      deliveryScope = scope;
      const stop = () => sender.epoch() === epoch ? sender.interrupt(scope, { prior: previous ?? undefined, recover }) : Promise.resolve({ ok: true } as const);
      const sent = cancellation ? cancellation.then(result => { if (sender.epoch() === epoch) check(result); return stop(); }) : stop();
      const stopping = sent.then(async result => {
        if (result.ok && sender.epoch() !== epoch && cancellation === stopping) {
          deliveryScope = null;
          await options.observe?.(sender.snapshot());
        }
        return result;
      });
      cancellation = stopping;
      // Keep priority acknowledgement independent of any release still in flight.
      // The next serial observation waits for that release and then reads the receiver's decision.
      const observed = stopping.then(async result => {
        if (cancellation !== stopping) return;
        check(result);
        if (sender.epoch() !== epoch) return;
        await serial(async () => {
          if (cancellation !== stopping || sender.epoch() !== epoch) return;
          const synced = await sender.sync();
          if (cancellation !== stopping || sender.epoch() !== epoch) return;
          check({ ok: synced });
          await options.observe?.(sender.snapshot());
        });
      });
      observation = observed;
      void observed.catch(() => {});
      return stopping.then(check);
    },
    /** Initial connection cannot clear a staged or retired plan. */
    connect,
    reconnect(scope: SpeechScope) {
      if (!matches(scope)) return Promise.resolve();
      speechAbort?.abort();
      plannedScope = null;
      return connect();
    },
    settled: async ({ drainOnFailure = false } = {}) => {
      await (drainOnFailure ? observation.catch(async () => {
        if (await sender.sync()) await options.observe?.(sender.snapshot());
      }) : observation);
      await queue;
      await stagedObservation;
    },
  };
}
export type BoardSpeech = ReturnType<typeof createBoardSpeech>;
export const speechWords = (text: string) => text.match(/\S+/g) ?? [];
export const speechSentences = (text: string) => text.match(/\S[\s\S]*?(?:[.!?](?=\s|$)|$)/g) ?? [];
