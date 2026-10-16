import { describe, expect, it } from "vitest";
import { recordStrokes } from "@/lib/strokes";
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
