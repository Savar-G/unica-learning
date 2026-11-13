// The fake speech-to-text and voice of Maya's voice worker (#326): no account, no network, no audio processing. They
// let a whole voice call run in tests and on a laptop with LiveKit's own pipeline (AgentSession, turn handling,
// interruptions, the room) in between.
//
// - FakeSTT hears what `FakeSpeech.say` is given, as text: one final transcript per call, between a start and an end of
//   speech, with the confidence and alternatives given. In a room the child's screen sends the text over LiveKit (the
//   "maya.fake.say" RPC, worker/maya-voice/src/room.ts), in place of a microphone the fake cannot understand.
// - FakeTTS speaks silence: 24 kHz mono frames, `msPerChar` of audio per character (60 ms by default, about a calm
//   speaking pace), and records each text it was given in `spoken`.
import { AudioFrame } from "@livekit/rtc-node";
import { normalizeLanguage, stt, tts, voice, type APIConnectOptions } from "@livekit/agents";

export interface Utterance {
  text: string;
  /** 0 to 1. */
  confidence: number;
  alternatives: string[];
}

/** The fake microphone: what the child says, as text. */
export class FakeSpeech {
  private listeners = new Set<(u: Utterance) => void>();
  /** Says `text`; false when no speech-to-text stream is listening yet. */
  say(text: string, options: { confidence?: number; alternatives?: string[] } = {}): boolean {
    const u: Utterance = { text, confidence: options.confidence ?? 0.95, alternatives: options.alternatives ?? [] };
    for (const l of this.listeners) l(u);
    return this.listeners.size > 0;
  }
  get listening(): boolean {
    return this.listeners.size > 0;
  }
  listen(l: (u: Utterance) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

const EN = normalizeLanguage("en");

export class FakeSTT extends stt.STT {
  label = "fake.STT";
  constructor(readonly speech: FakeSpeech) {
    super({ streaming: true, interimResults: false });
  }
  override get model() {
    return "fake";
  }
  override get provider() {
    return "fake";
  }
  protected async _recognize(): Promise<stt.SpeechEvent> {
    throw new Error("the fake speech-to-text only streams");
  }
  stream(options?: { connOptions?: APIConnectOptions }): stt.SpeechStream {
    return new FakeSpeechStream(this, options?.connOptions);
  }
}

class FakeSpeechStream extends stt.SpeechStream {
  label = "fake.SpeechStream";
  constructor(private readonly fake: FakeSTT, connOptions?: APIConnectOptions) {
    super(fake, undefined, connOptions);
  }
  protected async run(): Promise<void> {
    const stop = this.fake.speech.listen((u) => {
      if (this.queue.closed) return;
      const data = (text: string, confidence: number): stt.SpeechData => ({ language: EN, text, startTime: 0, endTime: 0, confidence });
      this.queue.put({ type: stt.SpeechEventType.START_OF_SPEECH });
      this.queue.put({ type: stt.SpeechEventType.FINAL_TRANSCRIPT, alternatives: [data(u.text, u.confidence), ...u.alternatives.map((a) => data(a, 0))] });
      this.queue.put({ type: stt.SpeechEventType.END_OF_SPEECH });
    });
    try {
      // The audio is not listened to; it is read so the pipeline never waits on this stream.
      for await (const frame of this.input) {
        void frame;
        if (this.abortSignal.aborted) break;
      }
    } finally {
      stop();
    }
  }
}

export const FAKE_SAMPLE_RATE = 24_000;
const FRAME_MS = 20;

export class FakeTTS extends tts.TTS {
  label = "fake.TTS";
  /** Every text spoken, in order. */
  readonly spoken: string[] = [];
  /** For tests: this many next texts give no audio at all (a voice provider that fails quietly). They go to `silenced`. */
  silentNext = 0;
  readonly silenced: string[] = [];
  constructor(readonly msPerChar = 60, readonly timestamps = true) {
    super(FAKE_SAMPLE_RATE, 1, { streaming: true, alignedTranscript: timestamps });
  }
  override get model() {
    return "fake";
  }
  override get provider() {
    return "fake";
  }
  synthesize(): tts.ChunkedStream {
    throw new Error("the fake voice only streams");
  }
  stream(options?: { connOptions?: APIConnectOptions }): tts.SynthesizeStream {
    return new FakeSynthesizeStream(this, options?.connOptions);
  }
}

class FakeSynthesizeStream extends tts.SynthesizeStream {
  label = "fake.SynthesizeStream";
  private segment = 0;
  constructor(private readonly fake: FakeTTS, connOptions?: APIConnectOptions) {
    super(fake, connOptions);
  }
  private speak(text: string) {
    if (!text.trim() || this.queue.closed) return;
    if (this.fake.silentNext > 0) {
      this.fake.silentNext--;
      this.fake.silenced.push(text.trim());
      return;
    }
    this.markStarted();
    this.fake.spoken.push(text.trim());
    const id = `fake-${++this.segment}`;
    const samples = (FAKE_SAMPLE_RATE * FRAME_MS) / 1000;
    const frames = Math.max(1, Math.ceil((text.length * this.fake.msPerChar) / FRAME_MS));
    for (let i = 0; i < frames; i++) {
      this.queue.put({ requestId: id, segmentId: id, frame: new AudioFrame(new Int16Array(samples), FAKE_SAMPLE_RATE, 1, samples), final: i === frames - 1, ...(i === 0 ? { deltaText: text, ...(this.fake.timestamps ? {
        timedTranscripts: [...text.matchAll(/\S+/g)].map(m => voice.createTimedString({ text: `${m[0]} `,
          startTime: m.index * this.fake.msPerChar / 1000, endTime: (m.index + m[0].length) * this.fake.msPerChar / 1000 })),
      } : {}) } : {}) });
    }
  }
  protected async run(): Promise<void> {
    let text = "";
    for await (const data of this.input) {
      if (this.abortSignal.aborted) break;
      if (data === tts.SynthesizeStream.FLUSH_SENTINEL) {
        this.speak(text);
        text = "";
        continue;
      }
      text += data;
    }
    this.speak(text);
    if (!this.queue.closed) this.queue.put(tts.SynthesizeStream.END_OF_STREAM);
  }
}
