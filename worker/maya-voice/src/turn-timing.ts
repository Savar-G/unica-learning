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
  /** The saves behind the turn and staging the board. */
  boardMs: number;
  /** Words given to the voice, to the first sound. */
  voiceMs: number;
}
export const TURN_PARTS = ["heardMs", "modelMs", "repairMs", "reviewMs", "codeMs", "ackHoldMs", "boardMs", "voiceMs"] as const satisfies readonly (keyof TurnParts)[];

export type TurnOutcome = "answered" | "no_words" | "interrupted";
export type AckSkip = "child_talking" | "child_away" | "closing" | "bank_used" | "board";

export interface VoiceTurnSample {
  outcome: TurnOutcome;
  /** End of speech to the first sound of this reply: the acknowledgement or the answer. Null when nothing was heard. */
  firstSoundMs: number | null;
  /** End of speech to the first sound of the answer. */
  answerMs: number | null;
  /** Only for an answered turn. They add up to `answerMs`. */
  parts: TurnParts | null;
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
  constructor(private readonly now: () => number, private readonly speechEndedAt: number, private readonly heardAt: number) {}

  ready(time: ControllerTime) { this.controller = time; this.readyAt = this.now(); }
  held() { this.heldAt = this.now(); }
  staged() { this.stagedAt = this.now(); this.answerQueued = true; }
  ackQueued(id: string) { this.ackId = id; }
  ackEnded() { this.ackOver = true; }
  ackSkipped(reason: AckSkip) { this.ackSkip = reason; }
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
    parts: Object.fromEntries(TURN_PARTS.map((k) => [k, spread(parts.map((p) => p[k]))])) as Record<keyof TurnParts, ReturnType<typeof spread>>,
  };
}
