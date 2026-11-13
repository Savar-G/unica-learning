import { inference, initializeLogger, normalizeLanguage, stt, VADEventType, voice, type VAD, type VADEvent } from "@livekit/agents";
import { AudioFrame } from "@livekit/rtc-node";
import { describe, expect, it } from "vitest";
import { finalSignals, HeardSignals, silentFinal } from "./heard-signals";

initializeLogger({ pretty: false, level: "silent" });

const EN = normalizeLanguage("en");
const heard = (text: string, confidence: number, words?: { text: string; confidence: number }[], startTime = 0, endTime = 0): stt.SpeechData =>
  ({ language: EN, text, startTime, endTime, confidence, ...(words ? { words: words.map(w => voice.createTimedString(w)) } : {}) });
const frame = (amplitude: number, ms = 20) => {
  const samples = 16 * ms;
  return new AudioFrame(new Int16Array(samples).fill(amplitude), 16_000, 1, samples);
};

/** A detector whose events the test sends. */
function fakeVad() {
  const queue: VADEvent[] = [];
  let wake: (() => void) | null = null;
  const pushed: AudioFrame[] = [];
  const event = (type: VADEventType, speechDuration: number, speaking: boolean, silenceDuration = 0): VADEvent =>
    ({ type, samplesIndex: 0, timestamp: 0, speechDuration, silenceDuration, frames: [], probability: speaking ? 0.9 : 0.1, inferenceDuration: 1, speaking, rawAccumulatedSilence: 0, rawAccumulatedSpeech: 0 });
  const stream = {
    pushFrame: (f: AudioFrame) => void pushed.push(f),
    close: () => {},
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (queue.length) yield queue.shift()!;
        await new Promise<void>(r => (wake = r));
      }
    },
  };
  return {
    vad: { stream: () => stream } as unknown as VAD,
    pushed,
    async send(type: VADEventType, speechDuration: number, speaking: boolean, silenceDuration = 0) {
      queue.push(event(type, speechDuration, speaking, silenceDuration));
      wake?.();
      for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r));
    },
  };
}

describe("the signals of a final transcript (worker log only)", () => {
  it("measures words, confidences, the speech-to-text's span and the input level", () => {
    const s = finalSignals([heard("Yes!", 0.42, [{ text: "Yes!", confidence: 0.42 }], 1.2, 1.5)], { peak: 0, sumSquares: 0, samples: 0 }, 0);
    expect(s).toEqual({ words: 1, confidence: 0.42, minWordConfidence: 0.42, sttSpeechMs: 300, vadSpeechMs: 0, peakDbfs: -120, rmsDbfs: -120 });
    const loud = finalSignals([heard("twenty four", 0.9)], { peak: 0.5, sumSquares: 0.01 * 100, samples: 100 }, null);
    expect(loud).toMatchObject({ words: 2, minWordConfidence: null, sttSpeechMs: null, vadSpeechMs: null, peakDbfs: -6, rmsDbfs: -20 });
  });

  it("silence: a phantom one-word final has no detector speech and no sound", async () => {
    const v = fakeVad();
    const signals = new HeardSignals(v.vad);
    for (let i = 0; i < 50; i++) signals.frame(frame(0));
    await v.send(VADEventType.INFERENCE_DONE, 0, false);
    expect(signals.final([heard("Yes!", 1)])).toMatchObject({ words: 1, vadSpeechMs: 0, peakDbfs: -120 });
    expect(v.pushed).toHaveLength(50);
  });

  it("a quiet real 'yes': the detector's speech and the level are counted, once per final", async () => {
    const v = fakeVad();
    const signals = new HeardSignals(v.vad);
    signals.frame(frame(300));
    await v.send(VADEventType.START_OF_SPEECH, 60, true);
    await v.send(VADEventType.INFERENCE_DONE, 250, true);
    // The final comes while the detector still hears the segment: 250 ms now, the rest at the next final.
    const first = signals.final([heard("yes", 0.8)]);
    expect(first.vadSpeechMs).toBe(250);
    expect(first.peakDbfs).toBeGreaterThan(-41);
    expect(first.peakDbfs).toBeLessThan(-40);
    await v.send(VADEventType.END_OF_SPEECH, 400, false);
    expect(signals.final([heard("six", 0.8)]).vadSpeechMs).toBe(150);
    // Nothing heard since: nothing counted, and no sound.
    expect(signals.final([heard("no", 0.8)])).toMatchObject({ vadSpeechMs: 0, peakDbfs: -120 });
  });

  it("with no detector (the fakes) the detector's speech is unknown", () => {
    const signals = new HeardSignals(undefined);
    signals.frame(frame(1000));
    expect(signals.final([heard("24", 0.95)])).toMatchObject({ words: 1, vadSpeechMs: null });
  });

  it("LiveKit's own Silero detector, as a real call runs it: silence gives no detector speech", async () => {
    const signals = new HeardSignals(new inference.VAD({ model: "silero" }));
    try {
      for (let i = 0; i < 100; i++) {
        signals.frame(frame(0));
        if (i % 10 === 0) await new Promise(r => setTimeout(r, 5));
      }
      await new Promise(r => setTimeout(r, 200));
      expect(signals.final([heard("Yes!", 1)])).toMatchObject({ words: 1, vadSpeechMs: 0, peakDbfs: -120 });
    } finally { signals.close(); }
  });
});

describe("the detector's own end of speech (the hold's check, 2026-11-13)", () => {
  it("is when the speech ended: the time the end came, less the silence the detector waited for", async () => {
    let now = 10_000;
    const v = fakeVad();
    const signals = new HeardSignals(v.vad, () => now);
    await v.send(VADEventType.START_OF_SPEECH, 60, true);
    await v.send(VADEventType.INFERENCE_DONE, 900, true);
    expect(signals.speechEndAt).toBeNull();
    // The detector reports the end after 250 ms of silence: the child stopped at 9750.
    await v.send(VADEventType.END_OF_SPEECH, 900, false, 250);
    expect(signals.speechEndAt).toBe(9750);
    // The speech-to-text holds the turn: the end stays the same however long it waits.
    now = 13_500;
    await v.send(VADEventType.INFERENCE_DONE, 0, false);
    expect(signals.speechEndAt).toBe(9750);
    // A final starts a new window.
    signals.final([heard("then it's 24", 0.9)]);
    expect(signals.speechEndAt).toBeNull();
  });

  it("is forgotten when speech starts again before the final", async () => {
    let now = 5_000;
    const v = fakeVad();
    const signals = new HeardSignals(v.vad, () => now);
    await v.send(VADEventType.START_OF_SPEECH, 60, true);
    await v.send(VADEventType.END_OF_SPEECH, 400, false, 250);
    expect(signals.speechEndAt).toBe(4750);
    now = 6_000;
    await v.send(VADEventType.START_OF_SPEECH, 60, true);
    await v.send(VADEventType.INFERENCE_DONE, 120, true);
    expect(signals.speechEndAt).toBeNull();
  });

  it("is unknown with no detector (the fakes)", () => {
    expect(new HeardSignals(undefined).speechEndAt).toBeNull();
  });
});

describe("the one rule that drops a final transcript (silentFinal)", () => {
  const LIMIT = -50;
  it("drops a final with no detector speech and digital silence", () => {
    expect(silentFinal({ vadSpeechMs: 0, peakDbfs: -120 }, LIMIT)).toBe(true);
  });

  it("keeps a quiet real answer: any detector speech, however low the level", () => {
    // "six" said softly: 120 ms of detector speech at a low level.
    expect(silentFinal({ vadSpeechMs: 120, peakDbfs: -60 }, LIMIT)).toBe(false);
  });

  it("keeps a final with no detector speech but a peak at or above the limit", () => {
    expect(silentFinal({ vadSpeechMs: 0, peakDbfs: -50 }, LIMIT)).toBe(false);
    expect(silentFinal({ vadSpeechMs: 0, peakDbfs: -2.7 }, LIMIT)).toBe(false);
  });

  it("drops nothing with no detector (the fakes), or with the rule off", () => {
    expect(silentFinal({ vadSpeechMs: null, peakDbfs: -120 }, LIMIT)).toBe(false);
    expect(silentFinal({ vadSpeechMs: 0, peakDbfs: -120 }, null)).toBe(false);
  });

  it("reads the window so far without starting a new one (quiet)", async () => {
    const v = fakeVad();
    const signals = new HeardSignals(v.vad);
    for (let i = 0; i < 10; i++) signals.frame(frame(0));
    await v.send(VADEventType.INFERENCE_DONE, 0, false);
    expect(signals.quiet(LIMIT)).toBe(true);
    // A quiet real "six": the detector hears it, so the window is no longer quiet, and its final is kept.
    signals.frame(frame(20));
    await v.send(VADEventType.START_OF_SPEECH, 60, true);
    await v.send(VADEventType.INFERENCE_DONE, 120, true);
    expect(signals.quiet(LIMIT)).toBe(false);
    const six = signals.final([heard("six", 0.8)]);
    expect(six.vadSpeechMs).toBe(120);
    expect(six.peakDbfs).toBeLessThan(-50);
    expect(silentFinal(six, LIMIT)).toBe(false);
  });
});
