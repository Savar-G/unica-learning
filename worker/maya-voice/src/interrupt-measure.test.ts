import { describe, expect, it } from "vitest";
import { audibleStop, cutByChild, interruptReport } from "./interrupt-measure";

/** 10 ms level frames of Maya's audio as the child receives it: loud until `stopAt`, then quiet. */
function levels(from: number, to: number, stopAt: number, loud = -20, quiet = -80) {
  const frames = [];
  for (let at = from; at < to; at += 10) frames.push({ at, db: at < stopAt ? loud : quiet });
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
