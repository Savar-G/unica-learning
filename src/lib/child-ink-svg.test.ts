import { describe, expect, it } from "vitest";
import { boardWidthOf, canvasViewBox, eraserLine, inkLayers, inkOutline, parseViewBox, toBoard } from "@/lib/child-ink-svg";

// The child's ink on "Our board" (#320): perfect-freehand outlines, eraser groups, and the camera that puts the child's
// layer exactly over Maya's board.

describe("the camera over Maya's board", () => {
  const canvas = { left: 100, top: 50, width: 800, height: 600 };

  it("puts a board point where Maya's board shows it, also outside her board's box", () => {
    // Maya's board: viewBox 40 30 300 150, shown centred in a 400 x 400 box at (300, 150) of the page.
    const maya = { viewBox: parseViewBox("40 30 300 150")!, shown: { left: 300, top: 150, width: 400, height: 400 } };
    const view = canvasViewBox(canvas, maya);
    // "meet": the scale is 400/300; the drawing is 200 px high, centred: its top is 150 + 100.
    const scale = 400 / 300;
    const corner = toBoard(view, canvas, 300, 250);
    expect(corner[0] * 1000).toBeCloseTo(40);
    expect(corner[1] * 1000).toBeCloseTo(30);
    const far = toBoard(view, canvas, 700, 450);
    expect(far[0] * 1000).toBeCloseTo(340);
    expect(far[1] * 1000).toBeCloseTo(180);
    // One board width is 1000 SVG units: that many CSS pixels at Maya's scale.
    expect(boardWidthOf(view, canvas)).toBeCloseTo(1000 * scale);
    // Left of her board, on the canvas.
    expect(toBoard(view, canvas, 100, 50)[0]).toBeLessThan(0.04);
  });

  it("with no question, makes one board width the canvas's width", () => {
    expect(canvasViewBox(canvas, null)).toEqual([0, 0, 1000, 750]);
    expect(toBoard(canvasViewBox(canvas, null), canvas, 500, 350)).toEqual([0.5, 0.375]);
    expect(boardWidthOf(canvasViewBox(canvas, null), canvas)).toBe(800);
  });

  it("reads only a viewBox of four numbers with a size", () => {
    expect(parseViewBox("0 0 10 5")).toEqual([0, 0, 10, 5]);
    expect(parseViewBox("0 0 0 5")).toBeNull();
    expect(parseViewBox("0 0 10")).toBeNull();
  });
});

describe("the child's strokes", () => {
  it("are filled outlines, and a single tap is a dot", () => {
    const line = inkOutline([[0.1, 0.1], [0.15, 0.12], [0.2, 0.15]], 0.004, true);
    expect(line).toMatch(/^M[\d.]+ [\d.]+Q.*Z$/);
    expect(inkOutline([[0.1, 0.1]], 0.004, true)).toMatch(/Z$/);
    expect(inkOutline([], 0.004, true)).toBe("");
  });

  it("an eraser stroke is an open line", () => {
    expect(eraserLine([[0.1, 0.2], [0.3, 0.4]])).toBe("M100 200L300 400");
    expect(eraserLine([[0.1, 0.2]])).toBe("M100 200L100 200");
  });

  it("an eraser clears only the ink drawn before it; erasers in a row share one mask", () => {
    const s = (name: string, erase = false) => ({ name, erase });
    expect(inkLayers([s("a"), s("b"), s("x", true), s("y", true), s("c"), s("z", true), s("d")])).toEqual({
      under: { under: { ink: [s("a"), s("b")] }, erasers: [s("x", true), s("y", true)], ink: [s("c")] },
      erasers: [s("z", true)],
      ink: [s("d")],
    });
    expect(inkLayers([s("a")])).toEqual({ ink: [s("a")] });
  });
});
