import { describe, expect, it } from "vitest";
import { encodeStrokes, fitStrokes, recordStrokes, type StrokeEvent, type StrokeRecording, type TimedPoint } from "@/lib/strokes";
import type { BoardEvent } from "@/lib/whiteboard";

// The whiteboard strokes (#186): what the child drew, in order, with times since the question was shown, so an admin
// can replay how the child worked. The drawing (PNG) stays the record for the report and the AI review.

const BOARD = { width: 812.4, height: 640 };
/** performance.now() when the question appeared. */
const SHOWN = 10_000;

describe("the recording of a question's whiteboard", () => {
  it("keeps every stroke, undo and clear in order, with times since the question was shown", () => {
    const log: BoardEvent[] = [
      { kind: "stroke", stroke: { erase: false, w: 3.2, pts: [[0.1, 0.2], [0.15, 0.25]] }, times: [10_400.4, 10_480] },
      { kind: "stroke", stroke: { erase: true, w: 26, pts: [[0.12, 0.22]] }, times: [11_000] },
      { kind: "undo", at: 11_500 },
      { kind: "clear", at: 12_000 },
      { kind: "stroke", stroke: { erase: false, w: 3.2, pts: [[0.5, 0.5], [0.6, 0.6]] }, times: [13_000, 13_100] },
    ];
    expect(recordStrokes(log, SHOWN, BOARD)).toEqual({
      v: 1,
      width: 812,
      height: 640,
      events: [
        { kind: "stroke", erase: false, w: 3.2, pts: [[0.1, 0.2, 400], [0.15, 0.25, 480]] },
        { kind: "stroke", erase: true, w: 26, pts: [[0.12, 0.22, 1000]] },
        { kind: "undo", t: 1500 },
        { kind: "clear", t: 2000 },
        { kind: "stroke", erase: false, w: 3.2, pts: [[0.5, 0.5, 3000], [0.6, 0.6, 3100]] },
      ],
    });
  });

  it("starts with the strokes kept from before a resume, never runs time backwards, and drops points that are not on the board", () => {
    const log: BoardEvent[] = [
      // Drawn before a stop and kept by the draft: their times belong to an earlier visit, so they show at the start.
      { kind: "stroke", stroke: { erase: false, w: 3, pts: [[0.3, 0.3], [0.4, 0.4]] }, times: null },
      // A coalesced point from just before the question appeared, and a clock that stepped back.
      { kind: "stroke", stroke: { erase: false, w: 3, pts: [[0.1, 0.1], [0.2, 0.2], [Number.NaN, 0.3], [0.3, 0.3]] }, times: [9_990, 10_500, 10_520, 10_400] },
    ];
    expect(recordStrokes(log, SHOWN, BOARD)?.events).toEqual([
      { kind: "stroke", erase: false, w: 3, pts: [[0.3, 0.3, 0], [0.4, 0.4, 0]] },
      { kind: "stroke", erase: false, w: 3, pts: [[0.1, 0.1, 0], [0.2, 0.2, 500], [0.3, 0.3, 500]] },
    ]);
  });

  it("is nothing when the child drew nothing", () => {
    expect(recordStrokes([], SHOWN, BOARD)).toBeNull();
    expect(recordStrokes([{ kind: "clear", at: 10_500 }], SHOWN, BOARD)).toBeNull();
  });
});

/** A recording of the given strokes on an 800 x 600 board. */
const recording = (...events: StrokeEvent[]): StrokeRecording => ({ v: 1, width: 800, height: 600, events });
/** A pencil stroke through the given points. */
const line = (pts: TimedPoint[]): StrokeEvent => ({ kind: "stroke", erase: false, w: 3.2, pts });
const bytes = (r: StrokeRecording | null) => (r ? new TextEncoder().encode(encodeStrokes(r)).length : 0);

describe("the size limit of a recording", () => {
  it("a recording under the limit is sent as it is", () => {
    const small = recording(line([[0.1, 0.1, 0], [0.1, 0.1, 50], [0.2, 0.2, 100]]));
    expect(fitStrokes(small, 10_000)).toEqual(small);
  });

  it("a long recording is thinned until it fits, and each stroke keeps its first and last point", () => {
    // A slow stylus: 20 rows of 1,000 points, each 0.0004 board widths (a third of a pixel) from the last.
    const rows = Array.from({ length: 20 }, (_, r) => line(Array.from({ length: 1000 }, (_, i): TimedPoint => [round(0.1 + i * 0.0004), round(0.05 + r * 0.04), r * 5000 + i * 4])));
    const long = recording(...rows);
    expect(bytes(long)).toBeGreaterThan(300_000);
    const fitted = fitStrokes(long, 100_000);
    expect(bytes(fitted)).toBeLessThanOrEqual(100_000);
    expect(fitted?.events).toHaveLength(20);
    fitted?.events.forEach((e, r) => {
      const pts = (e as Extract<StrokeEvent, { kind: "stroke" }>).pts;
      const all = (rows[r] as Extract<StrokeEvent, { kind: "stroke" }>).pts;
      expect([pts[0], pts.at(-1)]).toEqual([all[0], all.at(-1)]);
      // Still a line to replay, not two dots.
      expect(pts.length).toBeGreaterThan(10);
    });
  });

  it("a recording that cannot be thinned to fit is not sent: the drawing still goes", () => {
    // 2,000 separate dots: nothing to thin.
    const dots = recording(...Array.from({ length: 2000 }, (_, i) => line([[round(i / 2000), 0.5, i * 10]])));
    expect(fitStrokes(dots, 20_000)).toBeNull();
  });
});

const round = (n: number) => Math.round(n * 10_000) / 10_000;
