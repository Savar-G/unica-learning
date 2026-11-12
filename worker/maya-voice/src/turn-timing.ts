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
export type AckSkip = "child_talking" | "child_away" | "closing" | "bank_used" | "board" | "save";
/**
 * Where the child's own end of speech came from: the speech-to-text's end time of the last word (`stt_words`), or the
 * voice activity detector's end of speech (`vad`), which comes after its own silence window (250 ms in LiveKit's default).
 */
export type SpeechEndSource = "stt_words" | "vad";

/** What the worker saw before the turn: the child's own end of speech and the speech-to-text's final transcript. */
export interface HeardMarks {
  /** The child's end of speech, on the turn's clock. Null when neither source gave one. */
  speechEndAt: number | null;
  source: SpeechEndSource | null;
  /** The last final transcript of the turn reached the worker, on the turn's clock. */
  finalAt: number | null;
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
  /** The whole wait of an answered turn: the child's own end of speech to the answer's first sound. */
  waitMs: number | null;
  /**
   * The ready answer to its board plan on the child's screen. It runs beside `voiceMs` (the voice starts on the words
   * while the plan goes out), so it is not one of the parts. The first sound waits for it when it is longer.
   */
  stageMs: number | null;
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
  constructor(
    private readonly now: () => number,
    private readonly speechEndedAt: number,
    private readonly heardAt: number,
    private readonly heard: HeardMarks = { speechEndAt: null, source: null, finalAt: null },
  ) {}

  ready(time: ControllerTime) { this.controller = time; this.readyAt = this.now(); }
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
    const answered = outcome === "answered" && this.answerSoundAt !== null && this.readyAt !== null && this.heldAt !== null && this.stagedAt !== null;
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
        modelMs, repairMs, reviewMs,
        codeMs: this.readyAt! - this.heardAt - modelMs - repairMs - reviewMs,
        ackHoldMs: this.heldAt! - this.readyAt!,
        boardMs: this.stagedAt! - this.heldAt!,
        voiceMs: this.answerSoundAt! - this.stagedAt!,
      } : null,
      sttWaitMs: end !== null && finalAt !== null ? Math.max(0, finalAt - end) : null,
      speechEnd: end !== null ? this.heard.source : null,
      waitMs: answered && end !== null ? this.answerSoundAt! - end : null,
      stageMs: answered && this.sentAt !== null ? Math.max(0, this.sentAt - this.heldAt!) : null,
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
    acksQueued: samples.filter((s) => s.ack !== null).length,
    acksHeard: samples.filter((s) => s.ackHeard).length,
    acksSkipped: skipped,
    firstSound: spread(samples.flatMap((s) => (s.firstSoundMs === null ? [] : [s.firstSoundMs]))),
    answer: spread(samples.flatMap((s) => (s.answerMs === null ? [] : [s.answerMs]))),
    sttWait: spread(samples.flatMap((s) => (s.sttWaitMs === null ? [] : [s.sttWaitMs]))),
    wait: spread(samples.flatMap((s) => (s.waitMs === null ? [] : [s.waitMs]))),
    stage: spread(samples.flatMap((s) => (s.stageMs === null ? [] : [s.stageMs]))),
    parts: Object.fromEntries(TURN_PARTS.map((k) => [k, spread(parts.map((p) => p[k]))])) as Record<keyof TurnParts, ReturnType<typeof spread>>,
  };
}
