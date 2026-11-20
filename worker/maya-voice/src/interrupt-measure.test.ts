import { describe, expect, it } from "vitest";
import { audibleStop, cutByChild, interruptReport, pace, readWav, scoreTrials, type TrialRow } from "./interrupt-measure";

/** 10 ms level frames of Maya's audio as the child receives it: loud until `stopAt`, then quiet. */
function levels(from: number, to: number, stopAt: number, loud = -20, quiet = -80) {
  const frames = [];
  for (let at = from; at < to; at += 10) frames.push({ at, db: at < stopAt ? loud : quiet, ms: 10 });
  return frames;
}

describe("audibleStop", () => {
  it("measures from the child's speech onset to the end of Maya's last audible frame", () => {
    expect(audibleStop(levels(0, 4000, 1240), 1000)).toEqual({ speaking: true, stopMs: 240 });
  });

  it("does not count a short pause between Maya's sentences as the stop", () => {
    const frames = levels(0, 5000, 2000).map(f => (f.at >= 1100 && f.at < 1300 ? { ...f, db: -80 } : f));
    expect(audibleStop(frames, 1000)).toEqual({ speaking: true, stopMs: 1000 });
  });

  it("reports a trial where Maya was not audible just before the onset", () => {
    expect(audibleStop(levels(0, 3000, 500), 1000)).toEqual({ speaking: false, stopMs: 0 });
  });

  it("uses each frame's own duration, not the gap between the first two arrivals", () => {
    const frames = levels(0, 4000, 1240);
    frames[1] = { ...frames[1], at: 30 };
    expect(audibleStop(frames, 1000)).toEqual({ speaking: true, stopMs: 240 });
  });

  it("reports no stop when Maya is still audible at the end of the window", () => {
    expect(audibleStop(levels(0, 3000, 9000), 1000)).toEqual({ speaking: true, stopMs: null });
  });
});

describe("interruptReport", () => {
  it("gives n, median, nearest-rank p95 and the share within the target, counting a missing stop as a miss", () => {
    const stops = [100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340, 360, 380, 400, 420, 440, 460, 480];
    const report = interruptReport([...stops.map(stopMs => ({ stopMs })), { stopMs: null }], 300);
    expect(report).toEqual({ n: 21, stopped: 20, neverStopped: 1, p50: 300, p95: 480, withinTarget: 11, targetMs: 300 });
  });
});

describe("cutByChild", () => {
  it("counts Maya going to listening after the child's speech starts as the child's cut, even without an interrupted handle", () => {
    expect(cutByChild({ vadMs: 270, agentListeningMs: 470, cleared: false })).toBe(true);
  });

  it("does not count a speech that ended before the child's speech was detected, or long after it", () => {
    expect(cutByChild({ vadMs: 255, agentListeningMs: 32, cleared: false })).toBe(false);
    expect(cutByChild({ vadMs: 300, agentListeningMs: 5100, cleared: false })).toBe(false);
    expect(cutByChild({ vadMs: null, agentListeningMs: 400, cleared: false })).toBe(false);
  });

  it("counts a cleared output as a cut", () => {
    expect(cutByChild({ vadMs: null, agentListeningMs: null, cleared: true })).toBe(true);
  });
});

/** A RIFF WAV with one fmt chunk and one data chunk. */
function wavFile(format: number, channels: number, rate: number, bits: number, samples: number[]) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(v, i * 2));
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0, "ascii"); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(format, 8); fmt.writeUInt16LE(channels, 10);
  fmt.writeUInt32LE(rate, 12); fmt.writeUInt32LE(rate * channels * bits / 8, 16); fmt.writeUInt16LE(channels * bits / 8, 20); fmt.writeUInt16LE(bits, 22);
  const head = Buffer.alloc(12);
  head.write("RIFF", 0, "ascii"); head.writeUInt32LE(4 + fmt.length + 8 + data.length, 4); head.write("WAVE", 8, "ascii");
  const dataHead = Buffer.alloc(8);
  dataHead.write("data", 0, "ascii"); dataHead.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, fmt, dataHead, data]);
}

describe("readWav", () => {
  it("reads 16-bit mono PCM at the expected rate", () => {
    expect([...readWav(wavFile(1, 1, 48_000, 16, [1, -2, 3]), 48_000)]).toEqual([1, -2, 3]);
  });

  it("refuses another rate, channel count or sample format", () => {
    expect(() => readWav(wavFile(1, 1, 44_100, 16, [0]), 48_000)).toThrow(/44100 Hz/);
    expect(() => readWav(wavFile(1, 2, 48_000, 16, [0, 0]), 48_000)).toThrow(/2 channels/);
    expect(() => readWav(wavFile(3, 1, 48_000, 16, [0]), 48_000)).toThrow(/format 3/);
  });
});

describe("pace", () => {
  it("keeps a small lead, and dates each frame by its schedule", () => {
    const p = { start: 0, sent: 0 };
    expect(pace(p, 0)).toBe(2);
    p.sent = 2;
    expect(pace(p, 10)).toBe(1);
    expect(p.start).toBe(0);
  });

  it("moves the schedule to now after a stall, so a frame's time is its send time and the backlog is not added", () => {
    const p = { start: 0, sent: 10 };
    expect(pace(p, 500)).toBe(2);
    expect(p.start + p.sent * 10).toBe(500);
  });
});

describe("scoreTrials", () => {
  const row = (r: Partial<TrialRow> & Pick<TrialRow, "kind" | "onsetAt">): TrialRow => ({
    clip: r.kind === "intentional" ? "int1.wav" : "mmhm", speaking: true, stopMs: 400, vadMs: 180, agentListeningMs: 420,
    speechInterrupted: null, output: [], transcripts: [], resumed: false, ...r,
  });

  it("gives a later trial's clear to that trial, not to the incidental sound before it", () => {
    const rows = [
      row({ kind: "incidental", onsetAt: 0, vadMs: null, agentListeningMs: null, output: ["clear@900"] }),
      row({ kind: "intentional", onsetAt: 700, output: ["clear@200"], transcripts: ["Wait."] }),
    ];
    const scored = scoreTrials(rows, [{ at: 1500, text: "Wait." }]);
    expect(scored.falseStops).toMatchObject({ n: 1, stopped: 0 });
    expect(scored.stop.n).toBe(1);
  });

  it("counts lost speech over every request, also one Maya did not stop for", () => {
    const rows = [
      row({ kind: "intentional", onsetAt: 0, transcripts: ["Show me."] }),
      row({ kind: "intentional", onsetAt: 5000, vadMs: null, agentListeningMs: null, transcripts: [] }),
      row({ kind: "intentional", onsetAt: 9000, speaking: false, transcripts: ["Show me."] }),
    ];
    const scored = scoreTrials(rows, [{ at: 800, text: "Show me." }, { at: 9800, text: "Show me." }]);
    // The second request was not heard and Maya talked through it: a missed stop.
    expect(scored.stop).toMatchObject({ n: 2, stopped: 1, missed: 1 });
    expect(scored.lostSpeech).toMatchObject({ n: 3, lost: 1, notATurn: 1 });
  });

  it("matches each request to a child turn of its own window, so an earlier identical turn cannot hide a later drop", () => {
    const rows = [
      row({ kind: "intentional", onsetAt: 0, transcripts: ["Show me."] }),
      row({ kind: "intentional", onsetAt: 5000, transcripts: ["Show me."] }),
    ];
    const scored = scoreTrials(rows, [{ at: 800, text: "Show me." }]);
    expect(scored.lostSpeech).toMatchObject({ n: 2, lost: 0, notATurn: 1 });
  });

  it("counts a request Maya talked through as a missed stop, so one stop and one miss do not pass", () => {
    const rows = [
      row({ kind: "intentional", onsetAt: 0, stopMs: 200, transcripts: ["Show me."] }),
      row({ kind: "intentional", onsetAt: 5000, stopMs: null, vadMs: 180, agentListeningMs: null, transcripts: ["Show me."] }),
    ];
    const scored = scoreTrials(rows, [{ at: 800, text: "Show me." }, { at: 5800, text: "Show me." }]);
    expect(scored.stop).toMatchObject({ n: 2, stopped: 1, neverStopped: 1, p95: null, missed: 1 });
  });

  it("keeps a speech that ended before the child was heard out of the stop count", () => {
    const rows = [row({ kind: "intentional", onsetAt: 0, stopMs: 40, vadMs: 180, agentListeningMs: 30, transcripts: ["Show me."] })];
    expect(scoreTrials(rows, [{ at: 800, text: "Show me." }]).stop).toMatchObject({ n: 0, endedOnTheirOwn: 1, missed: 0 });
  });

  it("credits no stop that lands after the next clip began, a restart clip included", () => {
    const rows = [row({ kind: "intentional", onsetAt: 0, stopMs: 610, agentListeningMs: 560, transcripts: ["Show me."] })];
    const scored = scoreTrials(rows, [{ at: 500, text: "Show me." }], 300, [], [550]);
    expect(scored.stop).toMatchObject({ n: 1, stopped: 0, missed: 1 });
  });

  it("counts a request as delivered only when a child turn holds its whole transcript", () => {
    const rows = [row({ kind: "intentional", onsetAt: 0, transcripts: ["Okay four."] })];
    expect(scoreTrials(rows, [{ at: 800, text: "Okay." }]).lostSpeech).toMatchObject({ notATurn: 1 });
    expect(scoreTrials(rows, [{ at: 800, text: "okay, four" }]).lostSpeech).toMatchObject({ notATurn: 0 });
  });

  it("counts a request split into two finals as delivered when its turns hold the same words", () => {
    const rows = [row({ kind: "intentional", onsetAt: 0, transcripts: ["What does that mean?", "Show me."] })];
    expect(scoreTrials(rows, [{ at: 800, text: "What does that mean?" }, { at: 1100, text: "Show me." }]).lostSpeech).toMatchObject({ split: 1, notATurn: 0 });
    expect(scoreTrials(rows, [{ at: 800, text: "What does that mean?" }]).lostSpeech).toMatchObject({ notATurn: 1 });
  });
});

