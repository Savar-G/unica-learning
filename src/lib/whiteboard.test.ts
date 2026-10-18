import { describe, expect, it } from "vitest";
import { WORK_TEXT_MAX } from "@/lib/test-api";
import { recordStrokes, replayLength } from "@/lib/strokes";
import {
  PALM_AFTER_PEN_MS,
  decodeDraft,
  encodeDraft,
  exportFrame,
  hasDrawing,
  newPalmGuard,
  openMode,
  pointerDown,
  pointerUp,
  type PalmGuard,
  type Stroke,
  type BoardState,
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

describe("the part of the board the saved image shows", () => {
  const BOARD_PX = 800;
  const inside = (f: { x: number; y: number; w: number; h: number }, [x, y]: [number, number]) => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h;

  it("is the work with a small margin, not the empty board around it", () => {
    const f = exportFrame([stroke([[0.2, 0.3], [0.4, 0.35]])], BOARD_PX);
    expect(inside(f, [0.2, 0.3]) && inside(f, [0.4, 0.35])).toBe(true);
    expect(f.x).toBeGreaterThan(0.1);
    expect(f.w).toBeLessThan(0.4);
    expect(f.h).toBeLessThan(0.3);
  });

  it("still holds work drawn below what the board shows after a resize", () => {
    // Drawn on a tall board, then the board got shorter: the stroke at 1.1 widths down is off screen but kept.
    const f = exportFrame([stroke([[0.5, 0.2], [0.5, 1.1]])], BOARD_PX);
    expect(inside(f, [0.5, 1.1])).toBe(true);
  });

  it("stays inside the board's width", () => {
    const f = exportFrame([stroke([[0, 0], [1, 0.5]])], BOARD_PX);
    expect(f.x).toBe(0);
    expect(f.x + f.w).toBeCloseTo(1, 9);
  });

  it("a single dot still gives a readable image", () => {
    const f = exportFrame([stroke([[0.5, 0.5]])], BOARD_PX);
    expect(f.w).toBeGreaterThanOrEqual(0.2 - 1e-9);
    expect(f.h).toBeGreaterThanOrEqual(0.2 - 1e-9);
    expect(inside(f, [0.5, 0.5])).toBe(true);
  });

  it("eraser strokes do not make it bigger", () => {
    const ink = stroke([[0.2, 0.2], [0.3, 0.3]]);
    expect(exportFrame([ink, stroke([[0.9, 0.9], [0.95, 1.4]], true)], BOARD_PX)).toEqual(exportFrame([ink], BOARD_PX));
  });
});

describe("the saved draft, for a resume of the same question (#72)", () => {
  it("keeps the original drawing chronology and timing across a reload (#186)", () => {
    const first = stroke([[0.1, 0.1], [0.2, 0.2]]);
    const second = stroke([[0.4, 0.4]]);
    const board: BoardState = {
      strokes: [first], text: "", shownAt: 10_000,
      log: [
        { kind: "stroke", stroke: first, times: [10_200, 10_600] },
        { kind: "stroke", stroke: second, times: [11_000] },
        { kind: "undo", at: 11_400 },
      ],
    };
    const back = decodeDraft(encodeDraft(board, 1_000_000), 1_020_000)!;
    const recording = recordStrokes(back.log, back.shownAt!, { width: 800, height: 600 })!;
    expect(recording.events).toEqual([
      { kind: "stroke", erase: false, w: 3, pts: [[0.1, 0.1, 200], [0.2, 0.2, 600]] },
      { kind: "stroke", erase: false, w: 3, pts: [[0.4, 0.4, 1000]] },
      { kind: "undo", t: 1400 },
    ]);
    expect(replayLength(recording)).toBe(1400);
    back.log.push({ kind: "stroke", stroke: second, times: [2000] });
    expect(recordStrokes(back.log, back.shownAt!, { width: 800, height: 600 })?.events.at(-1))
      .toEqual({ kind: "stroke", erase: false, w: 3, pts: [[0.4, 0.4, 12_000]] });
  });

  it("keeps a cleared board's full history through repeated reloads", () => {
    const ink = stroke([[0.2, 0.3]]);
    const board: BoardState = {
      strokes: [], text: "", shownAt: 100,
      log: [{ kind: "stroke", stroke: ink, times: [300] }, { kind: "clear", at: 1500 }],
    };
    const once = decodeDraft(encodeDraft(board, 1_000_000), 1_010_000)!;
    const twice = decodeDraft(encodeDraft(once, 1_010_000), 1_030_000)!;
    expect(twice.strokes).toEqual([]);
    expect(recordStrokes(twice.log, twice.shownAt!, { width: 800, height: 600 })?.events).toEqual([
      { kind: "stroke", erase: false, w: 3, pts: [[0.2, 0.3, 200]] },
      { kind: "clear", t: 1400 },
    ]);
  });

  it("keeps old drafts and visible work when new timing metadata is invalid", () => {
    const work = { strokes: [stroke([[0.3, 0.4]])], text: "12 x 4" };
    for (const metadata of [{}, { v: 2, shownAt: 100, log: [{ kind: "stroke", stroke: work.strokes[0], times: [] }] },
      { v: 2, shownAt: "bad", log: [] }, { v: 2, shownAt: 100, log: [{ kind: "clear", at: "bad" }] }]) {
      const back = decodeDraft(JSON.stringify({ ...work, ...metadata }), 1_020_000)!;
      expect(back.strokes).toEqual(work.strokes);
      expect(back.text).toBe("12 x 4");
      expect(back.log).toEqual([{ kind: "stroke", stroke: work.strokes[0], times: null }]);
    }
  });

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

describe("the mode a revisited board opens in (#252)", () => {
  const line = { erase: false, w: 3.2, pts: [[0.1, 0.1], [0.2, 0.2]] as [number, number][] };
  const eraser = { erase: true, w: 26, pts: [[0.1, 0.1]] as [number, number][] };

  it("Type, when the answer has typed working and no drawing, so the child sees the typed working at once", () => {
    expect(openMode({ strokes: [], text: "3 + 4" }, true)).toBe("type");
    // Eraser strokes alone are not a drawing.
    expect(openMode({ strokes: [eraser], text: "3 + 4" }, true)).toBe("type");
  });

  it("Draw otherwise: a drawing (with or without typed working), no work, or a board that cannot type (grades 1 and 2)", () => {
    expect(openMode({ strokes: [line], text: "3 + 4" }, true)).toBe("draw");
    expect(openMode({ strokes: [line], text: "" }, true)).toBe("draw");
    expect(openMode({ strokes: [], text: "" }, true)).toBe("draw");
    expect(openMode({ strokes: [], text: "3 + 4" }, false)).toBe("draw");
  });
});
