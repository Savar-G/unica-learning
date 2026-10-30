// Maya's pen glyphs: each character as ordered open strokes (pen down to pen up) in a unit box, x and y from 0 to 1 with
// the origin top-left. This is a placeholder single-stroke set, drawn by hand for the board core (#315). The real stroke
// font (EMS Tech, with Relief SingleLine as the fallback, spec #297) replaces it in a later ticket through `GlyphSet`.

export type Point = [number, number];

/** A stroke font: the strokes of a character in pen order, or null when the font has no glyph for it. */
export interface GlyphSet {
  name: string;
  strokes(char: string): readonly (readonly Point[])[] | null;
}

/** Points on an ellipse, from one angle to another (degrees, 0 = right, clockwise on screen). */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    pts.push([round(cx + rx * Math.cos(a)), round(cy + ry * Math.sin(a))]);
  }
  return pts;
}
const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The board's own paths, the same in every font (spec #297): the minus (the fonts have no U+2212, and a font hyphen is
 * too short and too slanted for a sum; the ASCII hyphen draws the same) and the check mark (no font has one). Rules and
 * arrowheads are the board's own lines too (columns.ts, geometry.ts).
 */
export const OWNED_GLYPHS: Readonly<Record<string, readonly (readonly Point[])[]>> = {
  "-": [[[0.22, 0.5], [0.78, 0.5]]],
  "−": [[[0.22, 0.5], [0.78, 0.5]]],
  "✓": [[[0.18, 0.55], [0.4, 0.8], [0.84, 0.15]]],
};

const TABLE: Record<string, readonly (readonly Point[])[]> = {
  ...OWNED_GLYPHS,
  "0": [arc(0.5, 0.5, 0.24, 0.4, -90, 270, 24)],
  "1": [[[0.34, 0.26], [0.52, 0.1], [0.52, 0.9]]],
  "2": [[[0.27, 0.28], [0.36, 0.15], [0.5, 0.1], [0.64, 0.15], [0.71, 0.29], [0.66, 0.44], [0.27, 0.9], [0.75, 0.9]]],
  "3": [[[0.28, 0.18], [0.45, 0.1], [0.63, 0.14], [0.69, 0.29], [0.6, 0.43], [0.46, 0.49], [0.62, 0.55], [0.72, 0.7], [0.65, 0.85], [0.46, 0.9], [0.27, 0.83]]],
  "4": [
    [[0.58, 0.1], [0.22, 0.64], [0.78, 0.64]],
    [[0.6, 0.36], [0.6, 0.9]],
  ],
  "5": [[[0.7, 0.1], [0.33, 0.1], [0.29, 0.45], [0.48, 0.39], [0.66, 0.46], [0.72, 0.65], [0.65, 0.84], [0.46, 0.9], [0.27, 0.83]]],
  "6": [[[0.66, 0.13], [0.47, 0.13], [0.32, 0.32], [0.27, 0.58], [0.32, 0.81], [0.5, 0.9], [0.67, 0.82], [0.72, 0.66], [0.65, 0.52], [0.5, 0.47], [0.35, 0.52], [0.28, 0.64]]],
  "7": [[[0.25, 0.1], [0.75, 0.1], [0.42, 0.9]]],
  "8": [
    [
      [0.5, 0.47], [0.34, 0.4], [0.3, 0.26], [0.38, 0.13], [0.5, 0.1], [0.62, 0.13], [0.7, 0.26], [0.66, 0.4], [0.5, 0.47],
      [0.32, 0.57], [0.27, 0.73], [0.36, 0.87], [0.5, 0.9], [0.64, 0.87], [0.73, 0.73], [0.68, 0.57], [0.5, 0.47],
    ],
  ],
  "9": [[[0.71, 0.33], [0.62, 0.47], [0.48, 0.52], [0.34, 0.46], [0.28, 0.31], [0.36, 0.15], [0.5, 0.1], [0.65, 0.15], [0.72, 0.31], [0.7, 0.57], [0.6, 0.9]]],
  "+": [
    [[0.2, 0.5], [0.8, 0.5]],
    [[0.5, 0.2], [0.5, 0.8]],
  ],
  "×": [
    [[0.27, 0.27], [0.73, 0.73]],
    [[0.73, 0.27], [0.27, 0.73]],
  ],
  "÷": [
    [[0.2, 0.5], [0.8, 0.5]],
    [[0.5, 0.25], [0.5, 0.27]],
    [[0.5, 0.73], [0.5, 0.75]],
  ],
  "=": [
    [[0.22, 0.4], [0.78, 0.4]],
    [[0.22, 0.6], [0.78, 0.6]],
  ],
  ".": [[[0.5, 0.86], [0.5, 0.88]]],
  "(": [arc(0.75, 0.5, 0.3, 0.45, 240, 120, 10)],
  ")": [arc(0.25, 0.5, 0.3, 0.45, -60, 60, 10)],
  "?": [[...arc(0.5, 0.3, 0.2, 0.2, 200, 420, 10), [0.5, 0.65]], [[0.5, 0.86], [0.5, 0.88]]],
  " ": [],
};

/** The placeholder set: digits, + − × ÷ = . ( ) ? and the check mark. No letters until the real font comes. */
export const PLACEHOLDER_GLYPHS: GlyphSet = {
  name: "placeholder-1",
  strokes: (char) => TABLE[char] ?? null,
};
