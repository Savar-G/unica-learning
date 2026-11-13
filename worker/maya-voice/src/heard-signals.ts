// What the worker knows about each final transcript besides its words, for the worker log (#326). Real calls heard
// words in silence (a child turn "Yes!" from a silent test microphone) and wrong words ("Bye-bye" for "hi"). The logs
// show which signals separate those from a child's short real answers ("24", "yes", "six"): the speech-to-text's
// confidence, the word confidences, how long the speech-to-text says the speech was, how long a voice activity detector
// heard speech, and the input level. No words go in the log (docs/maya-voice.md). One rule drops a transcript, and only
// the plainest case (`silentFinal`): no detector speech at all and a peak far below any voice.
//
// The detector is a second stream of the session's own VAD (LiveKit's local Silero), fed the same frames as the
// speech-to-text. The session's user state cannot be used: with `turnDetection: "stt"`, LiveKit raises "speaking" for
// the speech-to-text's own start of speech too (voice/audio_recognition.js), which a phantom transcript also sends.
import { VADEventType, type stt, type VAD, type VADStream } from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";
import { speechWords } from "@/lib/board-speech";

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

  constructor(vad: VAD | undefined) {
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
        if (ev.type === VADEventType.INFERENCE_DONE) this.going = ev.speaking ? ev.speechDuration : 0;
        else if (ev.type === VADEventType.END_OF_SPEECH) {
          this.ended += Math.max(0, ev.speechDuration - this.counted);
          this.going = 0;
          this.counted = 0;
        }
      }
    } catch {
      this.stream = null;
    }
  }

  frame(frame: AudioFrame) {
    const data = frame.data;
    for (let i = 0; i < data.length; i++) {
      const s = Math.abs(data[i]) / 32768;
      if (s > this.peak) this.peak = s;
      this.sumSquares += s * s;
    }
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

  /** The measures for a final transcript, and a new window from here. */
  final(alternatives: readonly stt.SpeechData[]): FinalSignals {
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
