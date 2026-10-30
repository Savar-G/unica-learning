import { describe, expect, it } from "vitest";
import { applyBatch, BOARD_FONTS, boardPaths, createScene, PLACEHOLDER_GLYPHS, svgFontGlyphs, type Scene } from "@/lib/board";

// Maya's stroke fonts (#319): an SVG font's single-line path data becomes ordered pen strokes in the board's unit box.
// These tests use only the public API of the board core.

describe("a stroke font from SVG path data", () => {
  it("turns a straight glyph into one stroke, written from the top, centred, digits 0.1 to 0.9 high", () => {
    const font = svgFontGlyphs({ name: "test", glyphs: { "1": "M 100 0 L 100 700" } });
    expect(font.strokes("1")).toEqual([
      [
        [0.5, 0.1],
        [0.5, 0.9],
      ],
    ]);
  });

  it("reads relative and horizontal or vertical moves, with a pen lift at each move", () => {
    const font = svgFontGlyphs({ name: "test", glyphs: { "1": "M 0 0 L 0 800", T: "M 0 800 h 400 M 200 800 l 0 -400 v -400" } });
    expect(font.strokes("T")).toEqual([
      [
        [0.3, 0.1],
        [0.7, 0.1],
      ],
      [
        [0.5, 0.1],
        [0.5, 0.5],
        [0.5, 0.9],
      ],
    ]);
  });

  it("follows cubic curves, a smooth curve reflecting the last control point, as one open stroke", () => {
    const font = svgFontGlyphs({ name: "test", glyphs: { "1": "M 0 0 L 0 800", S: "M 0 400 C 0 800 400 800 400 400 s 400 -400 400 0" } });
    const strokes = font.strokes("S")!;
    expect(strokes).toHaveLength(1);
    const [stroke] = strokes;
    expect(stroke[0]).toEqual([0.1, 0.5]);
    expect(stroke.at(-1)).toEqual([0.9, 0.5]);
    // The curves pass through their own end points and their middles: (200, 700) and (600, 100) in font units.
    expect(stroke).toContainEqual([0.5, 0.5]);
    expect(stroke).toContainEqual([0.3, 0.2]);
    expect(stroke).toContainEqual([0.7, 0.8]);
    expect(stroke.length).toBeGreaterThan(8);
  });

  it("draws a glyph's strokes top first, a stroke across from its left end, whatever order the font has", () => {
    const font = svgFontGlyphs({ name: "test", glyphs: { "1": "M 0 0 L 0 800", "=": "M 400 340 L 0 300 M 0 500 L 400 520" } });
    expect(font.strokes("=")).toEqual([
      [
        [0.3, 0.4],
        [0.7, 0.38],
      ],
      [
        [0.3, 0.6],
        [0.7, 0.56],
      ],
    ]);
  });

  it("refuses path data it cannot follow", () => {
    expect(() => svgFontGlyphs({ name: "test", glyphs: { "1": "M 0 0 A 5 5 0 0 1 10 10" } })).toThrow(/A/);
    expect(() => svgFontGlyphs({ name: "test", glyphs: { "1": "M 0 0 Z 5 5" } })).toThrow();
  });
});

const DIGITS = [..."0123456789"];
const inUnitBox = (strokes: readonly (readonly [number, number])[][]) => strokes.flat().every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1);

describe("the two fonts Savar chooses from: EMS Tech and Relief SingleLine", () => {
  it("offers both, each with its licence", () => {
    expect(BOARD_FONTS.map((f) => f.name)).toEqual(["EMS Tech", "Relief SingleLine"]);
    for (const font of BOARD_FONTS) expect(font.licence).toBe("SIL Open Font License 1.1");
  });

  for (const font of BOARD_FONTS) {
    describe(font.name, () => {
      it("draws every digit, school math sign, letter and punctuation mark inside its box", () => {
        for (const char of [...DIGITS, ..."+×÷=.,()?!%:'/<>", ..."abcdefghijklmnopqrstuvwxyz", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]) {
          const strokes = font.glyphs.strokes(char);
          expect(strokes, char).not.toBeNull();
          expect(strokes!.length, char).toBeGreaterThan(0);
          expect(inUnitBox(strokes as [number, number][][]), char).toBe(true);
        }
      });

      it("starts each stroke at its top end, or its left end when it runs across, and the top stroke first", () => {
        for (const char of [...DIGITS, ..."+×÷="]) {
          const strokes = font.glyphs.strokes(char)!;
          for (const s of strokes) {
            const [[x0, y0], [x1, y1]] = [s[0], s.at(-1)!];
            if (Math.abs(x1 - x0) > Math.abs(y1 - y0)) expect(x0, char).toBeLessThanOrEqual(x1);
            else expect(y0, char).toBeLessThanOrEqual(y1);
          }
          const tops = strokes.map((s) => Math.min(...s.map(([, y]) => y)));
          expect(tops, char).toEqual([...tops].sort((a, b) => a - b));
        }
      });

      it("makes digits as tall as the board's own digits: 0.1 to 0.9 of the box", () => {
        const ys = DIGITS.flatMap((d) => font.glyphs.strokes(d)!.flat().map(([, y]) => y));
        expect(Math.min(...ys)).toBeCloseTo(0.1, 2);
        expect(Math.max(...ys)).toBeLessThanOrEqual(0.92);
      });

      it("uses the board's own paths for the minus and the check mark, the same in every font", () => {
        for (const char of ["−", "-", "✓"]) expect(font.glyphs.strokes(char), char).toEqual(PLACEHOLDER_GLYPHS.strokes(char));
      });

      it("has letters for notes, and no glyph for a character it does not have", () => {
        expect(font.glyphs.strokes("a")!.length).toBeGreaterThan(0);
        expect(font.glyphs.strokes(" ")).toEqual([]);
        expect(font.glyphs.strokes("@")).toBeNull();
      });

      it("draws 27 + 39 = 66 with the carry and the check, through the board core", () => {
        let scene: Scene = createScene({ glyphs: font.glyphs });
        const cell = (rowId: string, column: string) => ({ objectId: "sum1", part: "cell", rowId, column });
        const batches = [
          [{ op: "columns", id: "sum1", operation: "add", operands: [{ id: "top", value: "27" }, { id: "bottom", value: "39" }], place: { region: "main" } }],
          [{ op: "put", target: cell("answer", "ones"), value: "6", ink: "green" }, { op: "regroup", id: "carry1", objectId: "sum1", rowId: "answer", kind: "carry", from: "ones", to: "tens" }],
          [{ op: "put", target: cell("answer", "tens"), value: "6", ink: "green" }],
          [{ op: "mark", id: "done", target: { objectId: "sum1", part: "row", rowId: "answer" }, style: "check" }],
        ];
        batches.forEach((commands, i) => {
          const r = applyBatch(scene, { transactionId: `t${i}`, commands });
          if (!r.ok) throw new Error(`${r.refusal.code}: ${r.refusal.reason}`);
          scene = r.scene;
        });
        const glyphs = boardPaths(scene).map((p) => p.glyph).filter(Boolean);
        expect(new Set(glyphs)).toEqual(new Set(["2", "7", "3", "9", "+", "6", "1", "✓"]));
      });
    });
  }
});
