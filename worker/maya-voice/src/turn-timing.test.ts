import { normalizeLanguage, voice, type stt } from "@livekit/agents";
import { describe, expect, it } from "vitest";
import { finalMark, heardMarks, TurnClock } from "./turn-timing";

// The child's real end of speech, from a final transcript the speech-to-text held (2026-11-13). Real calls: the browser
// measured Maya's first sound 7028 ms after the child's audio ended while the worker logged `waitMs: 3186`, and 4377 ms
// against 1269, both with `speechEnd: 'stt_words'`. Through LiveKit Inference the transcript's own end time is
// `start + duration` of the turn (inference/stt.js), which runs on while the speech-to-text holds the turn; the last
// word's end time does not.

const EN = normalizeLanguage("en");
/** A final transcript with word times (seconds on the speech-to-text's audio clock), its own end time at `turnEnd`. */
const final = (words: [string, number, number][], turnEnd: number): stt.SpeechData => ({
  language: EN, text: words.map((w) => w[0]).join(" "), startTime: words[0]?.[1] ?? 0, endTime: turnEnd, confidence: 0.9,
  words: words.map(([text, startTime, endTime]) => voice.createTimedString({ text, startTime, endTime })),
});

const T = 1_000_000;
/** "Then 4 minus 2 is 2, so it's 24.", ending 1.0 s into the stream, held 4 s: the transcript's own end is 5.0 s. */
const HELD = final([["Then", 0.1, 0.3], ["4", 0.3, 0.4], ["minus", 0.4, 0.6], ["2", 0.6, 0.7], ["is", 0.7, 0.75], ["2,", 0.75, 0.8], ["so", 0.8, 0.85], ["it's", 0.85, 0.9], ["24.", 0.9, 1.0]], 5.0);

describe("the marks of a final transcript (finalMark)", () => {
  it("ends the child's speech at the last word, not at the transcript's own end the speech-to-text held", () => {
    const mark = finalMark(HELD, T, T + 5100, T + 1030);
    expect(mark.wordEndAt).toBe(T + 1000);
    expect(mark).toEqual({ finalAt: T + 5100, wordEndAt: T + 1000, detectorEndAt: T + 1030 });
  });

  it("gives no word mark without word times, whatever the transcript's own end time says", () => {
    expect(finalMark(final([], 5.0), T, T + 5100, null)).toEqual({ finalAt: T + 5100, wordEndAt: null, detectorEndAt: null });
    expect(finalMark(undefined, T, T + 5100, null).wordEndAt).toBeNull();
  });

  it("drops a mark after its own final: that clock does not fit", () => {
    expect(finalMark(HELD, T + 4500, T + 5100, T + 5200)).toEqual({ finalAt: T + 5100, wordEndAt: null, detectorEndAt: null });
  });

  it("has no word mark before the first audio frame went in", () => {
    expect(finalMark(HELD, null, T + 5100, null).wordEndAt).toBeNull();
  });
});

describe("the child's end of speech for a turn (heardMarks)", () => {
  const same = (at: number) => at;
  it("takes the last word first, then the worker's detector, then LiveKit's end of speech before the final", () => {
    expect(heardMarks({ finalAt: 5100, wordEndAt: 1000, detectorEndAt: 1030 }, 1300, same)).toEqual({ speechEndAt: 1000, source: "stt_words", finalAt: 5100, detectorEndAt: 1030 });
    expect(heardMarks({ finalAt: 5100, wordEndAt: null, detectorEndAt: 1030 }, 1300, same)).toEqual({ speechEndAt: 1030, source: "detector", finalAt: 5100, detectorEndAt: 1030 });
    expect(heardMarks({ finalAt: 5100, wordEndAt: null, detectorEndAt: null }, 1300, same)).toEqual({ speechEndAt: 1300, source: "vad", finalAt: 5100, detectorEndAt: null });
    // LiveKit's end of speech at or after the final is the speech-to-text's own end of turn, not the child's.
    expect(heardMarks({ finalAt: 5100, wordEndAt: null, detectorEndAt: null }, 5100, same)).toEqual({ speechEndAt: null, source: null, finalAt: 5100, detectorEndAt: null });
    expect(heardMarks(null, 1300, same)).toEqual({ speechEndAt: null, source: null, finalAt: null, detectorEndAt: null });
  });

  it("puts every mark on the turn's clock", () => {
    expect(heardMarks({ finalAt: T + 5100, wordEndAt: T + 1000, detectorEndAt: T + 1030 }, null, (at) => at - T)).toEqual({ speechEndAt: 1000, source: "stt_words", finalAt: 5100, detectorEndAt: 1030 });
  });
});

describe("the wait of a turn the speech-to-text held", () => {
  /** The real call's turn: the child stops at 1000, the final comes at 5100, the turn reaches the worker at 5200. */
  function heldTurn(wordEndAt: number | null) {
    let now = 5200;
    const heard = heardMarks({ finalAt: 5100, wordEndAt, detectorEndAt: 1030 }, null, (at) => at);
    const clock = new TurnClock(() => now, 5100, 5200, heard);
    clock.ready({ modelMs: 1000, repairMs: 0, reviewMs: 0 });
    now = 6200;
    clock.held();
    clock.staged();
    now = 8028;
    clock.sound();
    return clock.sample("answered");
  }

  it("counts the whole hold in the wait, and the detector's hold agrees", () => {
    const s = heldTurn(1000);
    expect(s).toMatchObject({ speechEnd: "stt_words", sttWaitMs: 4100, sttHoldMs: 4070, answerMs: 2928, waitMs: 7028 });
    expect(s.waitMs).toBe(s.sttWaitMs! + s.answerMs!);
  });

  it("with no word times, measures from the worker's detector", () => {
    expect(heldTurn(null)).toMatchObject({ speechEnd: "detector", sttWaitMs: 4070, sttHoldMs: 4070, waitMs: 6998 });
  });

  it("has no hold of its own with no detector", () => {
    const clock = new TurnClock(() => 0, 5100, 5200, heardMarks({ finalAt: 5100, wordEndAt: 1000, detectorEndAt: null }, null, (at) => at));
    expect(clock.sample("interrupted")).toMatchObject({ sttWaitMs: 4100, sttHoldMs: null });
  });
});
