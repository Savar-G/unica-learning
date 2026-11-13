// How long a child waits in a voice call (#532): one sample per child turn, from the child's end of speech to Maya's
// first sound and to the first sound of her answer. The parts of the answer time add up to it, each measured on its own
// marks, so a lost part shows as a wrong sum rather than a quiet gap. Logs hold times and phrase ids, never words.

/** What the answer's wait is made of, in order. */
export interface TurnParts {
  /** End of speech to the turn reaching the worker: speech-to-text and turn detection. */
  heardMs: number;
  /** Maya's model, the repair after a refusal, and the free-talk reviews. From the call's own record of them. */
  modelMs: number;
  repairMs: number;
  reviewMs: number;
  /** The rest of the controller's turn: code and the save. */
  codeMs: number;
  /** The ready answer waiting for the acknowledgement to finish. */
  ackHoldMs: number;
  /** The saves behind the turn and the start of its board plan, to the words given to the voice. */
  boardMs: number;
  /** Words given to the voice, to the first sound. The first sound also waits for the board plan (`stageMs`). */
  voiceMs: number;
}
export const TURN_PARTS = ["heardMs", "modelMs", "repairMs", "reviewMs", "codeMs", "ackHoldMs", "boardMs", "voiceMs"] as const satisfies readonly (keyof TurnParts)[];

export type TurnOutcome = "answered" | "no_words" | "interrupted";
/** `streamed`: Maya's first sentence came before the phrase could start (D-341). */
export type AckSkip = "child_talking" | "child_away" | "closing" | "bank_used" | "board" | "save" | "streamed";
/**
 * Where the child's own end of speech came from, in this order: the speech-to-text's end time of the last word in the
 * final transcript (`stt_words`); the worker's own detector stream (`detector`, ./heard-signals.ts), whose end of speech
 * is put back by the silence it waited for; or LiveKit's end of speech (`vad`), which comes after its own silence window
 * (250 ms in LiveKit's default).
 */
export type SpeechEndSource = "stt_words" | "detector" | "vad";

/** What the worker saw before the turn: the child's own end of speech and the speech-to-text's final transcript. */
export interface HeardMarks {
  /** The child's end of speech, on the turn's clock. Null when no source gave one. */
  speechEndAt: number | null;
  source: SpeechEndSource | null;
  /** The last final transcript of the turn reached the worker, on the turn's clock. */
  finalAt: number | null;
  /** The worker's own detector's end of speech, on the turn's clock, whatever `source` is. Null: no detector, or none. */
  detectorEndAt?: number | null;
}

/**
 * When one final transcript reached the worker, and when the child's speech in it ended, all on the system clock:
 * `wordEndAt` by the speech-to-text's own time of the last word (null when it gave no word times), `detectorEndAt` by the
 * worker's own detector (null when there is none, or it heard no end of speech since the previous final).
 */
export interface FinalMark {
  finalAt: number;
  wordEndAt: number | null;
  detectorEndAt: number | null;
}

/** The end time (seconds, on the speech-to-text's audio clock) of the last word of a final transcript. */
interface TimedWords {
  words?: readonly { endTime?: number }[];
}

/**
 * The marks of one final transcript. The child's last word ends at the time the first audio frame went in
 * (`inputStartedAt`) plus the last word's end time. It is never the transcript's own end time: through LiveKit Inference
 * that is `start + duration` of the turn (inference/stt.js), which can run on to the end of the turn, so a turn the
 * speech-to-text held put the child's "end of speech" near the final itself (real calls of 2026-11-13: `waitMs` 3186
 * where the browser measured 7028). A mark after the final is a clock that does not fit, and is left out.
 */
export function finalMark(best: TimedWords | undefined, inputStartedAt: number | null, finalAt: number, detectorEndAt: number | null): FinalMark {
  const end = best?.words?.at(-1)?.endTime;
  const wordEndAt = inputStartedAt !== null && typeof end === "number" && Number.isFinite(end) && end > 0 ? inputStartedAt + end * 1000 : null;
  return {
    finalAt,
    wordEndAt: wordEndAt !== null && wordEndAt <= finalAt ? wordEndAt : null,
    detectorEndAt: detectorEndAt !== null && detectorEndAt <= finalAt ? detectorEndAt : null,
  };
}

/**
 * The marks of a turn on the turn's clock (`onTurnClock` maps a system-clock time to it). The child's end of speech: the
 * last word's end, else the worker's detector, else LiveKit's first end of speech (`vadEndAt`, system clock) when it came
 * before the final transcript (one at or after it is the speech-to-text's own end of turn, not the child's).
 */
export function heardMarks(mark: FinalMark | null, vadEndAt: number | null, onTurnClock: (systemAt: number) => number): HeardMarks {
  if (!mark) return { speechEndAt: null, source: null, finalAt: null, detectorEndAt: null };
  const finalAt = onTurnClock(mark.finalAt);
  const detectorEndAt = mark.detectorEndAt === null ? null : onTurnClock(mark.detectorEndAt);
  const end: [number, SpeechEndSource] | null = mark.wordEndAt !== null ? [onTurnClock(mark.wordEndAt), "stt_words"]
    : detectorEndAt !== null ? [detectorEndAt, "detector"]
    : vadEndAt !== null && vadEndAt < mark.finalAt ? [onTurnClock(vadEndAt), "vad"]
    : null;
  return { speechEndAt: end?.[0] ?? null, source: end?.[1] ?? null, finalAt, detectorEndAt };
}

export interface VoiceTurnSample {
  outcome: TurnOutcome;
  /** End of speech to the first sound of this reply: the acknowledgement or the answer. Null when nothing was heard. */
  firstSoundMs: number | null;
  /** End of speech to the first sound of the answer. */
  answerMs: number | null;
  /** Only for an answered turn. They add up to `answerMs`. */
  parts: TurnParts | null;
  /**
   * Before `answerMs` starts: the child's own end of speech (`speechEnd`) to the speech-to-text's final transcript. It
   * holds AssemblyAI's end-of-turn silence. Null when the worker saw no end of speech.
   */
  sttWaitMs: number | null;
  speechEnd: SpeechEndSource | null;
  /**
   * The speech-to-text's hold by the worker's own detector alone: its end of speech to the final transcript. It uses no
   * provider time, so it checks `sttWaitMs`: when the two differ by much more than the detector's window (about 30 ms
   * steps), the provider's word times do not fit the worker's clock. Null: no detector (the fakes), or no end of speech
   * from it before the final.
   */
  sttHoldMs: number | null;
  /** The whole wait of an answered turn: the child's own end of speech to the answer's first sound. */
  waitMs: number | null;
  /**
   * The ready answer to its board plan on the child's screen. It runs beside `voiceMs` (the voice starts on the words
   * while the plan goes out), so it is not one of the parts. The first sound waits for it when it is longer.
   */
  stageMs: number | null;
  /**
   * D-341: end of speech to the first of Maya's sentences streamed before her turn was done (the model's first sentence).
   * Null when nothing streamed. With it, the answer is that sentence's sound, and `parts` reads: `modelMs` the model to
   * its first sentence, `ackHoldMs` that sentence waiting for a phrase, and no repair, review or code time.
   */
  firstPartMs: number | null;
  streamed: boolean;
  /** The phrase id given to the voice, and whether it made a sound. */
  ack: string | null;
  ackHeard: boolean;
  ackSkipped: AckSkip | null;
}

/** The model, repair and review time of the turns behind one reply. */
export interface ControllerTime {
  modelMs: number;
  repairMs: number;
  reviewMs: number;
}

/** The marks of one child turn. It takes its clock, so a test moves it by hand. */
export class TurnClock {
  private controller: ControllerTime = { modelMs: 0, repairMs: 0, reviewMs: 0 };
  private readyAt: number | null = null;
  private heldAt: number | null = null;
  private stagedAt: number | null = null;
  private answerQueued = false;
  private ackSoundAt: number | null = null;
  private answerSoundAt: number | null = null;
  private ackId: string | null = null;
  private ackOver = false;
  private ackSkip: AckSkip | null = null;
  private sentAt: number | null = null;
  private partAt: number | null = null;
  constructor(
    private readonly now: () => number,
    private readonly speechEndedAt: number,
    private readonly heardAt: number,
    private readonly heard: HeardMarks = { speechEndAt: null, source: null, finalAt: null },
  ) {}

  ready(time: ControllerTime) { this.controller = time; this.readyAt = this.now(); }
  /** The first sentence of the reply came while the turn still ran (D-341). */
  firstPart() { this.partAt ??= this.now(); }
  held() { this.heldAt = this.now(); }
  /** The words went to the voice. */
  staged() { this.stagedAt = this.now(); this.answerQueued = true; }
  /** The answer's board plan reached the child's screen. */
  planSent() { this.sentAt ??= this.now(); }
  ackQueued(id: string) { this.ackId = id; }
  ackEnded() { this.ackOver = true; }
  /** A phrase already given to the voice was not skipped. */
  ackSkipped(reason: AckSkip) { if (this.ackId === null) this.ackSkip = reason; }
  get ackHeard() { return this.ackSoundAt !== null; }

  /** A playback began. Segments play in order, so the acknowledgement's sound always comes before the answer's. */
  sound(): "ack" | "answer" | null {
    if (this.ackId !== null && this.ackSoundAt === null && !this.ackOver) {
      this.ackSoundAt = this.now();
      return "ack";
    }
    if (this.answerQueued && this.answerSoundAt === null) {
      this.answerSoundAt = this.now();
      return "answer";
    }
    return null;
  }

  sample(outcome: TurnOutcome): VoiceTurnSample {
    const since = (at: number | null) => (at === null ? null : at - this.speechEndedAt);
    const streamed = this.partAt !== null;
    // A streamed answer is heard before the turn is ready: its parts run from its first sentence (D-341).
    const readyAt = streamed ? this.partAt : this.readyAt;
    const answered = outcome === "answered" && this.answerSoundAt !== null && readyAt !== null && this.heldAt !== null && this.stagedAt !== null;
    const { modelMs, repairMs, reviewMs } = this.controller;
    // The child's own end of speech is never after the mark `answerMs` counts from.
    const end = this.heard.speechEndAt === null ? null : Math.min(this.heard.speechEndAt, this.speechEndedAt);
    const finalAt = this.heard.finalAt;
    return {
      outcome,
      firstSoundMs: since(this.ackSoundAt ?? this.answerSoundAt),
      answerMs: answered ? since(this.answerSoundAt) : null,
      parts: answered ? {
        heardMs: this.heardAt - this.speechEndedAt,
        ...(streamed ? { modelMs: readyAt! - this.heardAt, repairMs: 0, reviewMs: 0, codeMs: 0 }
          : { modelMs, repairMs, reviewMs, codeMs: readyAt! - this.heardAt - modelMs - repairMs - reviewMs }),
        ackHoldMs: this.heldAt! - readyAt!,
        boardMs: this.stagedAt! - this.heldAt!,
        voiceMs: this.answerSoundAt! - this.stagedAt!,
      } : null,
      sttWaitMs: end !== null && finalAt !== null ? Math.max(0, finalAt - end) : null,
      speechEnd: end !== null ? this.heard.source : null,
      sttHoldMs: this.heard.detectorEndAt != null && finalAt !== null ? Math.max(0, finalAt - this.heard.detectorEndAt) : null,
      waitMs: answered && end !== null ? this.answerSoundAt! - end : null,
      stageMs: answered && this.sentAt !== null ? Math.max(0, this.sentAt - this.heldAt!) : null,
      firstPartMs: since(this.partAt),
      streamed,
      ack: this.ackId,
      ackHeard: this.ackHeard,
      ackSkipped: this.ackSkip,
    };
  }
}

const percentile = (sorted: readonly number[], p: number) => (sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : null);
const spread = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, p50Ms: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95) };
};

/** The counts and times of a call's turns, for the closing log line. */
export function voiceTurnReport(samples: readonly VoiceTurnSample[]) {
  const skipped: Partial<Record<AckSkip, number>> = {};
  for (const s of samples) if (s.ackSkipped) skipped[s.ackSkipped] = (skipped[s.ackSkipped] ?? 0) + 1;
  const parts = samples.flatMap((s) => (s.parts ? [s.parts] : []));
  return {
    turns: samples.length,
    answered: samples.filter((s) => s.outcome === "answered").length,
    interrupted: samples.filter((s) => s.outcome === "interrupted").length,
    noWords: samples.filter((s) => s.outcome === "no_words").length,
    streamed: samples.filter((s) => s.streamed).length,
    firstPart: spread(samples.flatMap((s) => (s.firstPartMs === null ? [] : [s.firstPartMs]))),
    acksQueued: samples.filter((s) => s.ack !== null).length,
    acksHeard: samples.filter((s) => s.ackHeard).length,
    acksSkipped: skipped,
    firstSound: spread(samples.flatMap((s) => (s.firstSoundMs === null ? [] : [s.firstSoundMs]))),
    answer: spread(samples.flatMap((s) => (s.answerMs === null ? [] : [s.answerMs]))),
    sttWait: spread(samples.flatMap((s) => (s.sttWaitMs === null ? [] : [s.sttWaitMs]))),
    sttHold: spread(samples.flatMap((s) => (s.sttHoldMs === null ? [] : [s.sttHoldMs]))),
    wait: spread(samples.flatMap((s) => (s.waitMs === null ? [] : [s.waitMs]))),
    stage: spread(samples.flatMap((s) => (s.stageMs === null ? [] : [s.stageMs]))),
    parts: Object.fromEntries(TURN_PARTS.map((k) => [k, spread(parts.map((p) => p[k]))])) as Record<keyof TurnParts, ReturnType<typeof spread>>,
  };
}
