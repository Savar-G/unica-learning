import { AudioFrame } from "@livekit/rtc-node";
import { voice } from "@livekit/agents";
import type { BoardSpeech } from "@/lib/board-speech";

interface Clock {
  now(): number;
  set(ms: number, run: () => void): unknown;
  clear(handle: unknown): void;
}

/** Pace cues against the actual output start. Completed-run events are not a continuous playhead. */
export class CuePlaybackOutput extends voice.AudioOutput {
  private id = "";
  private anchor = 0;
  private bufferedMs = 0;
  private timer: unknown = null;
  private suspended = false;
  private generation = 0;
  constructor(
    private readonly output: voice.AudioOutput,
    private readonly board: BoardSpeech,
    private readonly clock: Clock,
    private readonly utterance: () => string,
    private readonly task: (work: Promise<unknown>) => void,
    private readonly interrupted: () => void,
  ) {
    super(output.sampleRate, output);
    this.on(voice.AudioOutput.EVENT_PLAYBACK_STARTED, (ev: voice.PlaybackStartedEvent) => {
      this.anchor = ev.createdAt;
    });
    this.on(voice.AudioOutput.EVENT_PLAYBACK_FINISHED, (ev: voice.PlaybackFinishedEvent) => {
      this.cancelPending();
      if (ev.interrupted) this.interrupted();
      else this.task(this.board.played(this.id, ev.playbackPosition * 1000));
    });
  }

  /** Stop the local clock immediately, even when the remote receiver cannot answer. */
  cancelPending() {
    this.generation++;
    this.suspended = true;
    if (this.timer !== null) this.clock.clear(this.timer);
    this.timer = null;
  }

  private schedule() {
    if (this.timer !== null || this.suspended) return;
    const generation = this.generation;
    const run = () => {
      this.timer = null;
      if (this.suspended || generation !== this.generation) return;
      const position = Math.min(this.bufferedMs, Math.max(0, this.clock.now() - this.anchor));
      if (position > 0) this.task(this.board.played(this.id, position, this.anchor));
      if (position < this.bufferedMs) this.timer = this.clock.set(Math.min(10, this.bufferedMs - position), run);
    };
    this.timer = this.clock.set(0, run);
  }

  override async captureFrame(frame: AudioFrame) {
    const id = this.utterance();
    if (id !== this.id) {
      this.cancelPending();
      this.id = id;
      this.bufferedMs = 0;
      this.anchor = this.clock.now();
      this.suspended = false;
    }
    const generation = this.generation;
    await super.captureFrame(frame);
    // Small frames bound the amount admitted before the downstream output can confirm it.
    const samples = Math.max(1, Math.round(frame.sampleRate * 0.02));
    for (let offset = 0; offset < frame.samplesPerChannel; offset += samples) {
      if (generation !== this.generation) return;
      const size = Math.min(samples, frame.samplesPerChannel - offset);
      const part = new AudioFrame(frame.data.subarray(offset * frame.channels, (offset + size) * frame.channels), frame.sampleRate, frame.channels, size);
      await this.output.captureFrame(part);
      if (generation !== this.generation) return;
      // A dry output starts the next run now. Never spend a synthesis/network gap as played audio.
      if (this.clock.now() > this.anchor + this.bufferedMs + 30) this.anchor = this.clock.now() - this.bufferedMs;
      this.bufferedMs += size / frame.sampleRate * 1000;
      this.schedule();
    }
  }
  override flush() { super.flush(); this.output.flush(); }
  override clearBuffer() { this.cancelPending(); this.output.clearBuffer(); }
  override pause() { this.cancelPending(); this.interrupted(); this.output.pause(); }
  override resume() { this.output.resume(); }
}
