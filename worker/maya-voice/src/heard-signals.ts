// What the worker knows about each final transcript besides its words, for the worker log (#326). Real calls heard
// words in silence (a child turn "Yes!" from a silent test microphone) and wrong words ("Bye-bye" for "hi"). The logs
// show which signals separate those from a child's short real answers ("24", "yes", "six"): the speech-to-text's
// confidence, the word confidences, how long the speech-to-text says the speech was, how long a voice activity detector
// heard speech, and the input level. No words go in the log (docs/maya-voice.md). One rule drops a transcript, and only
// the plainest case (`silentFinal`): no detector speech at all and a peak far below any voice.
//
// The detector is LiveKit's local Silero, fed the same frames as the speech-to-text. A real call gives it a VAD of its
// own (`detectorVad`), with its own minimum silence (`detectorMinSilenceMs`), so the session's VAD, which decides when
// the child's speech stops Maya, keeps LiveKit's settings. The session's user state cannot be used: with
// `turnDetection: "stt"`, LiveKit raises "speaking" for the speech-to-text's own start of speech too
// (voice/audio_recognition.js), which a phantom transcript also sends.
import { inference, VADEventType, type stt, type VAD, type VADStream } from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";
import { speechWords } from "@/lib/board-speech";

/**
 * The detector for a call: a VAD of its own with `minSilenceMs` as its minimum silence, when the session's VAD is
 * LiveKit's local one (`inference.VAD`, the session's default, made with LiveKit's defaults, so only the minimum silence
 * differs). Null `minSilenceMs`, no session VAD (the fakes) or another kind of VAD: the session's own, as before.
 * LiveKit Agents 1.9.5's local VAD already defaults to 250 ms (`defaultVADOptions` in inference/vad.js).
 */
export function detectorVad(sessionVad: VAD | undefined, minSilenceMs: number | null): VAD | undefined {
  if (!sessionVad || minSilenceMs === null || !(sessionVad instanceof inference.VAD)) return sessionVad;
  return new inference.VAD({ model: "silero", minSilenceDuration: minSilenceMs });
}

/**
 * An input frame at or above this level (dBFS) counts as sound for the `levelEnd` mark: the last such frame before the
 * detector's end of speech is the worker's view of when the child's audio ended, by level alone, as a browser meter
 * reads it. Speech in real calls peaked near -3 dBFS; a quiet room stays below -50.
 */
export const LEVEL_END_DBFS = -40;

/** When the detector's last speech ended, all on the system clock (`HeardSignals.speechEnd`). */
export interface DetectorEnd {
  /** The end of speech: the time the detector reported it, less the silence it waited for. */
  endAt: number;
  /** When the detector reported it (`endAt` plus its minimum silence and one step). */
  heardAt: number;
  /** The last input frame at or above LEVEL_END_DBFS before it; null when none came. */
  levelEndAt: number | null;
}

/** One `[maya voice] final transcript` log line, without the call id. */
export interface FinalSignals {
  /** Words in the best alternative. */
  words: number;
  /** The transcript's confidence as LiveKit reports it. LiveKit Inference gives 1 when the gateway sends none. */
  confidence: number | null;
  /** The lowest word confidence, when the provider gave word confidences. */
  minWordConfidence: number | null;
  /** The speech's length by the speech-to-text's own start and end times (ms), when it gave them. */
  sttSpeechMs: number | null;
  /** Speech the detector heard since the previous final transcript (ms). Null: no detector in this session. */
  vadSpeechMs: number | null;
  /** The input's loudest sample and its mean level since the previous final transcript (dBFS, -120 for no sound). */
  peakDbfs: number;
  rmsDbfs: number;
}

const FLOOR_DBFS = -120;
const dbfs = (ratio: number) => (ratio > 0 ? Math.max(FLOOR_DBFS, Math.round(20 * Math.log10(ratio) * 10) / 10) : FLOOR_DBFS);

/** The measures of one final transcript's alternatives, levels and detector speech. */
export function finalSignals(alternatives: readonly stt.SpeechData[], levels: { peak: number; sumSquares: number; samples: number }, vadSpeechMs: number | null): FinalSignals {
  const best = alternatives[0];
  const wordConfidences = (best?.words ?? []).map(w => w.confidence).filter((c): c is number => typeof c === "number" && Number.isFinite(c));
  const span = best && Number.isFinite(best.startTime) && Number.isFinite(best.endTime) && best.endTime > best.startTime ? Math.round((best.endTime - best.startTime) * 1000) : null;
  return {
    words: best ? speechWords(best.text).length : 0,
    confidence: best && Number.isFinite(best.confidence) ? best.confidence : null,
    minWordConfidence: wordConfidences.length ? Math.min(...wordConfidences) : null,
    sttSpeechMs: span,
    vadSpeechMs: vadSpeechMs === null ? null : Math.round(vadSpeechMs),
    peakDbfs: dbfs(levels.peak),
    rmsDbfs: dbfs(levels.samples ? Math.sqrt(levels.sumSquares / levels.samples) : 0),
  };
}

/**
 * A final transcript heard in silence (docs/maya-voice.md, "Silent transcripts"): the detector heard no speech at all
 * since the previous final, and the input's peak stayed below `limitDbfs`. Both must hold: a quiet real answer has
 * detector speech or a louder peak, and is kept. No detector (`vadSpeechMs` null, the fakes) or no limit: never silent.
 */
export function silentFinal(signals: Pick<FinalSignals, "vadSpeechMs" | "peakDbfs">, limitDbfs: number | null): boolean {
  return limitDbfs !== null && signals.vadSpeechMs === 0 && signals.peakDbfs < limitDbfs;
}

/**
 * Follows the input between final transcripts: its level, and the speech a detector stream heard. `vad` absent (the
 * fakes): no detector, and `vadSpeechMs` is null. Never throws into the audio path: a detector that fails stops counting.
 */
export class HeardSignals {
  private peak = 0;
  private sumSquares = 0;
  private samples = 0;
  private stream: VADStream | null = null;
  /** Detector speech of segments that ended since the last final, and of the segment still going on. */
  private ended = 0;
  private going = 0;
  /** The part of the going segment already counted at an earlier final. */
  private counted = 0;
  /** When the detector's last speech ended (system clock), if no speech followed it since the previous final. */
  private end: DetectorEnd | null = null;
  /** The last input frame at or above LEVEL_END_DBFS (system clock). */
  private loudAt: number | null = null;
  /** Called when the detector reports an end of speech (after its minimum silence). Never throws into the detector. */
  onSpeechEnd: ((end: DetectorEnd) => void) | null = null;

  constructor(vad: VAD | undefined, private readonly now: () => number = Date.now) {
    if (!vad) return;
    try {
      this.stream = vad.stream();
      void this.read(this.stream);
    } catch {
      this.stream = null;
    }
  }

  private async read(stream: VADStream) {
    try {
      for await (const ev of stream) {
        if (ev.type === VADEventType.INFERENCE_DONE) {
          this.going = ev.speaking ? ev.speechDuration : 0;
          // Speech again after an end: that end is not the child's last.
          if (ev.speaking) this.end = null;
        } else if (ev.type === VADEventType.END_OF_SPEECH) {
          this.ended += Math.max(0, ev.speechDuration - this.counted);
          this.going = 0;
          this.counted = 0;
          // The detector reports the end after its silence window (`silenceDuration`): the speech ended that long ago.
          // Its `timestamp` is on the detector's audio clock, not the system clock (inference/vad.js), so it is not used.
          const heardAt = this.now();
          const end = { endAt: heardAt - Math.max(0, ev.silenceDuration), heardAt, levelEndAt: this.loudAt };
          this.end = end;
          try { this.onSpeechEnd?.(end); } catch { /* the listener never stops the detector */ }
        }
      }
    } catch {
      this.stream = null;
    }
  }

  frame(frame: AudioFrame) {
    const data = frame.data;
    let framePeak = 0;
    for (let i = 0; i < data.length; i++) {
      const s = Math.abs(data[i]) / 32768;
      if (s > framePeak) framePeak = s;
      this.sumSquares += s * s;
    }
    if (framePeak > this.peak) this.peak = framePeak;
    if (dbfs(framePeak) >= LEVEL_END_DBFS) this.loudAt = this.now();
    this.samples += data.length;
    if (!this.stream) return;
    try { this.stream.pushFrame(frame); } catch { this.stream = null; }
  }

  private detected() { return this.stream || this.ended || this.going ? this.ended + Math.max(0, this.going - this.counted) : null; }

  /** The window so far is silent by `silentFinal`: no detector speech and a low peak. It starts no new window. */
  quiet(limitDbfs: number | null): boolean {
    const detected = this.detected();
    return silentFinal({ vadSpeechMs: detected === null ? null : Math.round(detected), peakDbfs: dbfs(this.peak) }, limitDbfs);
  }

  /**
   * When the detector's last speech ended before now (system clock), with no speech after it; null when it heard none or
   * the speech goes on. Read it before `final`, which starts a new window.
   */
  get speechEndAt(): number | null { return this.end?.endAt ?? null; }

  /** The detector's last end of speech with its marks (`speechEndAt`'s), or null. Read it before `final`. */
  get speechEnd(): DetectorEnd | null { return this.end; }

  /** The measures for a final transcript, and a new window from here. */
  final(alternatives: readonly stt.SpeechData[]): FinalSignals {
    this.end = null;
    const detected = this.detected();
    const signals = finalSignals(alternatives, { peak: this.peak, sumSquares: this.sumSquares, samples: this.samples }, detected);
    this.peak = this.sumSquares = this.samples = 0;
    this.ended = 0;
    this.counted = this.going;
    return signals;
  }

  close() {
    const stream = this.stream;
    this.stream = null;
    try { stream?.close(); } catch { /* already closed */ }
  }
}
