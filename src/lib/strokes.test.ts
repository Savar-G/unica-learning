import { describe, expect, it } from "vitest";
import { boardAt, encodeStrokes, fitStrokes, storedBoard, recordStrokes, replayLength, type StrokeEvent, type StrokeRecording, type TimedPoint } from "@/lib/strokes";
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

describe("the admin's replay", () => {
  // A line, a second line that is undone, an eraser stroke over the first line, a clear, then a dot.
  const work = recording(
    line([[0.1, 0.1, 100], [0.2, 0.1, 200], [0.3, 0.1, 300]]),
    line([[0.1, 0.5, 1000], [0.2, 0.5, 1100]]),
    { kind: "undo", t: 1500 },
    { kind: "stroke", erase: true, w: 26, pts: [[0.2, 0.1, 2000], [0.25, 0.1, 2100]] },
    { kind: "clear", t: 3000 },
    line([[0.6, 0.6, 3500]]),
  );
  /** The board at `t`, as each stroke's points (x, y) and whether it erases. */
  const at = (t: number) => boardAt(work, t).map((s) => ({ erase: s.erase, pts: s.pts.map(([x, y]) => [x, y]) }));

  it("draws the strokes in the order the child drew them, and a stroke in progress up to that moment", () => {
    expect(at(0)).toEqual([]);
    expect(at(250)).toEqual([{ erase: false, pts: [[0.1, 0.1], [0.2, 0.1]] }]);
    expect(at(1100)).toEqual([{ erase: false, pts: [[0.1, 0.1], [0.2, 0.1], [0.3, 0.1]] }, { erase: false, pts: [[0.1, 0.5], [0.2, 0.5]] }]);
  });

  it("an undo takes the last stroke away, the eraser is a stroke of its own, and a clear empties the board", () => {
    expect(at(1499)).toHaveLength(2);
    expect(at(1500)).toEqual([{ erase: false, pts: [[0.1, 0.1], [0.2, 0.1], [0.3, 0.1]] }]);
    expect(at(2100)).toEqual([{ erase: false, pts: [[0.1, 0.1], [0.2, 0.1], [0.3, 0.1]] }, { erase: true, pts: [[0.2, 0.1], [0.25, 0.1]] }]);
    expect(at(3000)).toEqual([]);
    expect(at(3500)).toEqual([{ erase: false, pts: [[0.6, 0.6]] }]);
  });

  it("lasts until the last thing the child did", () => {
    expect(replayLength(work)).toBe(3500);
    expect(replayLength(recording(line([[0.1, 0.1, 0]])))).toBe(0);
  });
});

describe("the stored work back on the board on a revisit (#252)", () => {
  // A stroke, an eraser stroke, an undo (the eraser goes), a stroke, a clear, a stroke: only the last stroke stays.
  const stored: StrokeRecording = {
    v: 1,
    width: 812,
    height: 640,
    events: [
      { kind: "stroke", erase: false, w: 3.2, pts: [[0.1, 0.2, 400], [0.15, 0.25, 480]] },
      { kind: "stroke", erase: true, w: 26, pts: [[0.12, 0.22, 1000]] },
      { kind: "undo", t: 1500 },
      { kind: "stroke", erase: false, w: 3.2, pts: [[0.3, 0.3, 1600]] },
      { kind: "clear", t: 2000 },
      { kind: "stroke", erase: false, w: 3.2, pts: [[0.5, 0.5, 3000], [0.6, 0.6, 3100]] },
    ],
  };
  /** performance.now() when the question opens again. */
  const NOW = 50_000;

  it("shows what was on the board when the child left it, with the typed working", () => {
    const board = storedBoard({ strokes: stored, text: "3 + 4" }, NOW);
    expect(board.strokes).toEqual([{ erase: false, w: 3.2, pts: [[0.5, 0.5], [0.6, 0.6]] }]);
    expect(board.text).toBe("3 + 4");
  });

  it("keeps every earlier stroke, undo and clear, so new work records after them and the replay loses nothing", () => {
    const board = storedBoard({ strokes: stored }, NOW);
    expect(board.text).toBe("");
    // The child draws one more stroke 2 seconds after the question opens again.
    const log: BoardEvent[] = [...board.log, { kind: "stroke", stroke: { erase: false, w: 3.2, pts: [[0.7, 0.7]] }, times: [NOW + 2000] }];
    expect(recordStrokes(log, board.shownAt!, { width: 812, height: 640 })).toEqual({
      ...stored,
      events: [...stored.events, { kind: "stroke", erase: false, w: 3.2, pts: [[0.7, 0.7, 5100]] }],
    });
  });

  it("with typed working only, or no work: the board has no strokes", () => {
    expect(storedBoard({ text: "12" }, NOW)).toMatchObject({ strokes: [], text: "12", log: [] });
    expect(storedBoard({}, NOW)).toMatchObject({ strokes: [], text: "", log: [] });
  });
});

const round = (n: number) => Math.round(n * 10_000) / 10_000;
