import { AudioFrame } from "@livekit/rtc-node";
import { voice } from "@livekit/agents";
import { SPEECH_SCOPE_DATA, type BoardSpeech, type SpeechScope } from "@/lib/board-speech";

interface Clock {
  now(): number;
  set(ms: number, run: () => void): unknown;
  clear(handle: unknown): void;
}
const same = (a: SpeechScope | null, b: SpeechScope) => !!b && a?.utteranceId === b.utteranceId && a.generation === b.generation;

/** The SDK requires no-argument media controls. Keep that interface at this adapter boundary. */
class PlaybackAdapter extends voice.AudioOutput {
  constructor(private readonly output: voice.AudioOutput, private readonly hooks: {
    capture(frame: AudioFrame): Promise<void>;
    admit(): void;
    scope(): SpeechScope | null;
    clear(scope: SpeechScope): void;
    pause(scope: SpeechScope): void;
  }) { super(output.sampleRate, output); }
  override captureFrame(frame: AudioFrame) { return this.hooks.capture(frame); }
  admitFrame(frame: AudioFrame) { super.flush(); void super.captureFrame(frame); }
  seal() { super.flush(); }
  override onPlaybackStarted(at: number) { this.hooks.admit(); super.onPlaybackStarted(at); }
  override onPlaybackFinished(event: voice.PlaybackFinishedEvent) { this.hooks.admit(); super.onPlaybackFinished(event); }
  override flush() { super.flush(); this.output.flush(); }
  override clearBuffer() { const scope = this.hooks.scope(); if (scope) this.hooks.clear(scope); }
  override pause() { const scope = this.hooks.scope(); if (scope) this.hooks.pause(scope); }
  override resume() { this.output.resume(); }
}

/** Pace cues against the actual output start. Each native playback segment retains its original owner. */
export class CuePlaybackOutput {
  private readonly adapter: PlaybackAdapter;
  /** Only the SDK receives its required AudioOutput interface. App cleanup uses the scoped methods below. */
  get audio(): voice.AudioOutput { return this.adapter; }
  get capturedPlayoutSegments() { return this.adapter.capturedPlayoutSegments; }
  get pendingPlayoutSegments() { return this.adapter.pendingPlayoutSegments; }
  waitForPlayout() { return this.adapter.waitForPlayout(); }
  private scope: SpeechScope | null = null;
  private anchor = 0;
  private bufferedMs = 0;
  private timer: unknown = null;
  private suspended = false;
  private generation = 0;
  private forwarding: { scope: SpeechScope; frame: AudioFrame } | null = null;
  private segments: { scope: SpeechScope; started: boolean }[] = [];
  constructor(
    private readonly output: voice.AudioOutput,
    private readonly board: BoardSpeech,
    private readonly clock: Clock,
    private readonly task: (work: Promise<unknown>, scope: SpeechScope) => void,
    private readonly interrupted: (scope: SpeechScope) => void,
  ) {
    this.adapter = new PlaybackAdapter(output, {
      capture: frame => this.captureFrame(frame),
      admit: () => { if (this.forwarding) this.admit(this.forwarding.scope, this.forwarding.frame); },
      scope: () => this.segments[0]?.scope ?? this.forwarding?.scope ?? this.scope,
      clear: scope => this.clearBuffer(scope),
      pause: scope => this.pause(scope),
    });
    this.adapter.on(voice.AudioOutput.EVENT_PLAYBACK_STARTED, (ev: voice.PlaybackStartedEvent) => {
      const segment = this.segments.find(s => !s.started);
      if (!segment) return;
      segment.started = true;
      if (this.board.owns(segment.scope) && same(this.scope, segment.scope)) this.anchor = ev.createdAt;
    });
    this.adapter.on(voice.AudioOutput.EVENT_PLAYBACK_FINISHED, (ev: voice.PlaybackFinishedEvent) => {
      const segment = this.segments.shift();
      if (!segment || !this.board.owns(segment.scope)) return;
      this.cancelPending(segment.scope);
      if (ev.interrupted) this.interrupted(segment.scope);
      else this.task(this.board.played(segment.scope, ev.playbackPosition * 1000), segment.scope);
    });
  }

  /** Count a segment only after the downstream output has admitted it. */
  private admit(scope: SpeechScope, frame: AudioFrame) {
    if (this.capturedPlayoutSegments >= this.output.capturedPlayoutSegments) return;
    this.segments.push({ scope, started: false });
    this.adapter.admitFrame(frame);
  }

  /** A stale cleanup cannot stop a newer plan's cue clock. */
  cancelPending(scope: SpeechScope) {
    if (!same(this.scope, scope)) return;
    this.generation++;
    this.suspended = true;
    if (this.timer !== null) this.clock.clear(this.timer);
    this.timer = null;
  }

  private schedule(scope: SpeechScope) {
    if (this.timer !== null || this.suspended || !this.board.owns(scope)) return;
    const generation = this.generation;
    const run = () => {
      this.timer = null;
      if (this.suspended || generation !== this.generation || !this.board.owns(scope)) return;
      const position = Math.min(this.bufferedMs, Math.max(0, this.clock.now() - this.anchor));
      if (position > 0) this.task(this.board.played(scope, position, this.anchor), scope);
      if (position < this.bufferedMs) this.timer = this.clock.set(Math.min(10, this.bufferedMs - position), run);
    };
    this.timer = this.clock.set(0, run);
  }

  async captureFrame(frame: AudioFrame) {
    // Only frames labelled by their producer can enter playback. Never infer ownership from the current plan.
    const scope = frame.userdata[SPEECH_SCOPE_DATA] as SpeechScope | undefined;
    if (!scope || !this.board.owns(scope)) return;
    if (!same(this.scope, scope)) {
      // A new owner cannot join an unfinished native segment belonging to the previous turn.
      if (this.scope) this.flush();
      if (this.scope) this.cancelPending(this.scope);
      this.scope = scope;
      this.bufferedMs = 0;
      this.anchor = this.clock.now();
      this.suspended = false;
    }
    const generation = this.generation;
    // An interruption may arrive before forwarding. Such a frame creates no segment on either output.
    await Promise.resolve();
    const samples = Math.max(1, Math.round(frame.sampleRate * 0.02));
    for (let offset = 0; offset < frame.samplesPerChannel; offset += samples) {
      if (generation !== this.generation || !this.board.owns(scope)) return;
      const size = Math.min(samples, frame.samplesPerChannel - offset);
      const part = new AudioFrame(frame.data.subarray(offset * frame.channels, (offset + size) * frame.channels), frame.sampleRate, frame.channels, size);
      const forwarding = { scope, frame: part };
      this.forwarding = forwarding;
      try {
        const captured = this.output.captureFrame(part);
        this.admit(scope, part);
        await captured;
        this.admit(scope, part);
      } finally {
        if (this.forwarding === forwarding) this.forwarding = null;
      }
      if (generation !== this.generation || !this.board.owns(scope)) return;
      if (this.clock.now() > this.anchor + this.bufferedMs + 30) this.anchor = this.clock.now() - this.bufferedMs;
      this.bufferedMs += size / frame.sampleRate * 1000;
      this.schedule(scope);
    }
  }
  flush() { this.adapter.flush(); }
  clearBuffer(scope: SpeechScope) {
    if (!same(this.segments[0]?.scope ?? this.forwarding?.scope ?? this.scope, scope)) return;
    this.cancelPending(scope);
    this.adapter.seal();
    this.output.clearBuffer();
  }
  pause(scope: SpeechScope) {
    if (!this.board.owns(scope) || !same(this.segments[0]?.scope ?? null, scope)) return;
    this.cancelPending(scope);
    this.interrupted(scope);
    this.output.pause();
  }
  resume() { this.output.resume(); }
}
