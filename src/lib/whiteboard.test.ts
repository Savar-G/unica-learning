import { describe, expect, it } from "vitest";
import { WORK_TEXT_MAX } from "@/lib/test-api";
import {
  PALM_AFTER_PEN_MS,
  decodeDraft,
  encodeDraft,
  exportSize,
  hasDrawing,
  newPalmGuard,
  pointerDown,
  pointerUp,
  type PalmGuard,
  type Stroke,
} from "@/lib/whiteboard";

// The whiteboard (#67): mouse, finger and stylus; a palm resting on a tablet must not draw or spoil the pen's stroke.

/** Plays pointer events through the guard and returns what each one did. */
function play(events: [type: "down" | "up", id: number, kind: string, time: number, size?: number][]) {
  let guard: PalmGuard = newPalmGuard();
  return events.map(([type, id, kind, time, size]) => {
    if (type === "down") {
      const [next, decision] = pointerDown(guard, { id, kind, time, width: size, height: size });
      guard = next;
      return decision;
    }
    const [next, ended] = pointerUp(guard, { id, kind, time });
    guard = next;
    return ended ? "end" : "-";
  });
}

describe("palm rejection", () => {
  it("a pen stroke drawn while a palm rests on the board is kept, and the palm draws nothing", () => {
    // The palm lands first and looks like a finger, then the pen comes down: the palm's stroke is dropped.
    expect(play([["down", 1, "touch", 0], ["down", 2, "pen", 40], ["up", 2, "pen", 900], ["up", 1, "touch", 950]]))
      .toEqual(["draw", "replace", "end", "-"]);
  });

  it("a palm that lands during a pen stroke is ignored", () => {
    expect(play([["down", 2, "pen", 0], ["down", 1, "touch", 100], ["up", 1, "touch", 300], ["up", 2, "pen", 800]]))
      .toEqual(["draw", "ignore", "-", "end"]);
  });

  it("a wide contact is a palm, even with no pen", () => {
    expect(play([["down", 1, "touch", 0, 80]])).toEqual(["ignore"]);
  });

  it("a touch just after the pen lifts is ignored; a finger can draw again later", () => {
    expect(play([["down", 2, "pen", 0], ["up", 2, "pen", 500], ["down", 1, "touch", 500 + PALM_AFTER_PEN_MS - 1], ["up", 1, "touch", 600 + PALM_AFTER_PEN_MS]]))
      .toEqual(["draw", "end", "ignore", "-"]);
    expect(play([["down", 2, "pen", 0], ["up", 2, "pen", 500], ["down", 1, "touch", 501 + PALM_AFTER_PEN_MS]])).toEqual(["draw", "end", "draw"]);
  });

  it("one stroke at a time: a second finger or a mouse does not start another", () => {
    expect(play([["down", 1, "touch", 0, 12], ["down", 3, "touch", 10, 12], ["down", 4, "mouse", 20], ["up", 1, "touch", 30]]))
      .toEqual(["draw", "ignore", "ignore", "end"]);
  });

  it("a mouse draws", () => {
    expect(play([["down", 1, "mouse", 0], ["up", 1, "mouse", 100]])).toEqual(["draw", "end"]);
  });
});

const stroke = (pts: [number, number][], erase = false): Stroke => ({ erase, w: 3, pts });

describe("what counts as a drawing", () => {
  it("any pencil stroke; eraser strokes alone are not a drawing", () => {
    expect(hasDrawing([])).toBe(false);
    expect(hasDrawing([stroke([[0.1, 0.1]], true)])).toBe(false);
    expect(hasDrawing([stroke([[0.1, 0.1]])])).toBe(true);
  });
});

describe("the saved image", () => {
  it("keeps the board's shape at the width asked for", () => {
    expect(exportSize(0.75, [stroke([[0.2, 0.3]])], 1000)).toEqual({ width: 1000, height: 750 });
  });

  it("still holds work drawn below what the board shows after a resize", () => {
    // Drawn on a tall board, then the board got shorter: the stroke at 1.1 widths down is off screen but kept.
    const { height } = exportSize(0.5, [stroke([[0.5, 0.2], [0.5, 1.1]])], 1000);
    expect(height).toBeGreaterThanOrEqual(1100);
    expect(height).toBeLessThanOrEqual(1200);
  });
});

describe("the saved draft, for a resume of the same question (#72)", () => {
  it("comes back with the same strokes and text", () => {
    const work = { strokes: [stroke([[0.123456, 0.654321], [0.2, 0.3]]), stroke([[0.5, 0.5]], true)], text: "12 x 4" };
    const back = decodeDraft(encodeDraft(work));
    expect(back?.text).toBe("12 x 4");
    expect(back?.strokes).toHaveLength(2);
    expect(back?.strokes[0].pts[0][0]).toBeCloseTo(0.123456, 3);
    expect(back?.strokes[1].erase).toBe(true);
  });

  it("anything else reads as no draft", () => {
    for (const raw of [null, "", "{", "[]", '{"strokes":"x","text":""}', '{"strokes":[{"pts":[["a",1]]}],"text":""}', JSON.stringify({ strokes: [], text: "x".repeat(WORK_TEXT_MAX + 1) })]) {
      expect(decodeDraft(raw), String(raw)).toBeNull();
    }
  });
});
