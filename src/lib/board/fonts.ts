// Maya's stroke fonts (#319, spec #297): single-line SVG fonts turned into the board's glyph sets. A font's path data
// (font units, y up from the baseline) becomes ordered pen strokes in the unit box the board core lays out (x and y from
// 0 to 1, y down). Pure: no DOM.
import { EMS_TECH_DATA } from "@/lib/board/font-data/ems-tech/glyphs";
import { RELIEF_SINGLELINE_DATA } from "@/lib/board/font-data/relief-singleline/glyphs";
import { OWNED_GLYPHS, PLACEHOLDER_GLYPHS, type GlyphSet, type Point } from "@/lib/board/glyphs";

/** An SVG font's glyphs as the font has them: each character's path data (`d`), in font units with y up. */
export interface SvgFontData {
  name: string;
  glyphs: Record<string, string>;
}

/** Digits fill the box from TOP to BASELINE, as the placeholder set does. */
const TOP = 0.1;
const BASELINE = 0.9;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** How many numbers each path command takes. */
const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Z: 0 };

/** Points along a cubic curve after its start, an even number of steps (so its middle is one), more on longer curves. */
function cubic(p0: Point, p1: Point, p2: Point, p3: Point): Point[] {
  const span = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
  const steps = 2 * Math.min(8, Math.max(2, Math.ceil(span / 160)));
  const pts: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const [a, b, c, e] = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3];
    pts.push([a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]]);
  }
  return pts;
}

/** The pen-down subpaths of path data, in font units. */
function subpaths(d: string): Point[][] {
  const out: Point[][] = [];
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  let cmd = "";
  let at: Point = [0, 0];
  /** The last cubic's second control point, for a smooth curve (S) to reflect. */
  let control: Point | null = null;
  for (let i = 0; i < tokens.length; ) {
    if (/^[a-z]$/i.test(tokens[i])) cmd = tokens[i++];
    const upper = cmd.toUpperCase();
    const arity = ARITY[upper];
    if (arity === undefined) throw new Error(`Unsupported path command "${cmd}" in glyph path data.`);
    const n = tokens.slice(i, i + arity).map(Number);
    if (n.length < arity || n.some(Number.isNaN)) throw new Error(`Path command "${cmd}" is missing numbers.`);
    i += arity;
    const rel = cmd !== upper;
    const [x0, y0] = rel ? at : [0, 0];
    const pt = (k: number): Point => [x0 + n[k], y0 + n[k + 1]];
    let added: Point[] = [];
    let nextControl: Point | null = null;
    switch (upper) {
      case "M":
        at = [x0 + n[0], y0 + n[1]];
        out.push([at]);
        // Numbers after a move are lines.
        cmd = rel ? "l" : "L";
        break;
      case "L":
        at = pt(0);
        added = [at];
        break;
      case "H":
        at = [(rel ? at[0] : 0) + n[0], at[1]];
        added = [at];
        break;
      case "V":
        at = [at[0], (rel ? at[1] : 0) + n[0]];
        added = [at];
        break;
      case "C":
      case "S": {
        const c1: Point = upper === "C" ? pt(0) : control ? [2 * at[0] - control[0], 2 * at[1] - control[1]] : at;
        const c2 = pt(upper === "C" ? 2 : 0);
        const end = pt(upper === "C" ? 4 : 2);
        added = cubic(at, c1, c2, end);
        at = end;
        nextControl = c2;
        break;
      }
      case "Z":
        if (out.length === 0) throw new Error("Path data closes before it starts.");
        at = out.at(-1)![0];
        added = [at];
        // Only a new command may follow a close.
        cmd = "";
        break;
    }
    control = nextControl;
    if (added.length > 0) {
      if (out.length === 0) out.push([[0, 0]]);
      out.at(-1)!.push(...added);
    }
  }
  return out;
}

/** The widest a glyph may be, so neighbouring characters keep a gap. */
const MAX_WIDTH = 0.96;

/**
 * Centres a glyph's ink across the box, then keeps it inside the box: a glyph taller or wider than the box (brackets)
 * shrinks about its centre, and one that reaches past the top or the bottom (a descender) moves inside.
 */
function fit(strokes: Point[][]): Point[][] {
  const pts = strokes.flat();
  const [x0, x1] = [Math.min(...pts.map(([x]) => x)), Math.max(...pts.map(([x]) => x))];
  const [y0, y1] = [Math.min(...pts.map(([, y]) => y)), Math.max(...pts.map(([, y]) => y))];
  const k = Math.min(1, 1 / Math.max(1, y1 - y0), MAX_WIDTH / Math.max(MAX_WIDTH, x1 - x0));
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const [top, bottom] = [cy + (y0 - cy) * k, cy + (y1 - cy) * k];
  const dy = top < 0 ? -top : bottom > 1 ? 1 - bottom : 0;
  return strokes.map((s) => s.map(([x, y]): Point => [0.5 + (x - cx) * k, cy + (y - cy) * k + dy]));
}

/**
 * The pen order the board writes in, whatever order the font file has: the top stroke first (then the leftmost), each
 * stroke from its top end, or from its left end when it runs more across than down. A closed stroke (an 0) keeps its
 * start.
 */
function penOrder(strokes: Point[][]): Point[][] {
  const oriented = strokes.map((s) => {
    const [dx, dy] = [s.at(-1)![0] - s[0][0], s.at(-1)![1] - s[0][1]];
    const backwards = Math.abs(dx) > Math.abs(dy) ? dx < 0 : dy < 0;
    return backwards ? [...s].reverse() : s;
  });
  const top = (s: Point[]) => Math.min(...s.map(([, y]) => y));
  const left = (s: Point[]) => Math.min(...s.map(([x]) => x));
  return oriented.sort((a, b) => top(a) - top(b) || left(a) - left(b));
}

const DIGITS = [..."0123456789"];

/**
 * A glyph set from an SVG font's path data. One scale for the whole font, so digits fill the box from 0.1 to 0.9 and
 * letters keep their sizes; each glyph is centred on its ink, kept inside the box (`fit`) and put in pen order
 * (`penOrder`). The board's own minus and check mark replace the font's. Glyphs other than digits are read on first use.
 */
export function svgFontGlyphs(data: SvgFontData): GlyphSet {
  const digitTop = Math.max(...DIGITS.flatMap((c) => (c in data.glyphs ? subpaths(data.glyphs[c]) : [])).flat().map(([, y]) => y));
  const scale = (BASELINE - TOP) / digitTop;
  const cache = new Map<string, readonly (readonly Point[])[]>();
  const build = (d: string) =>
    Object.freeze(
      penOrder(fit(subpaths(d).map((s) => s.map(([x, y]): Point => [x * scale, BASELINE - y * scale])))).map((s) =>
        Object.freeze(s.map(([x, y]) => Object.freeze([r3(x), r3(y)]) as Point)),
      ),
    );
  return {
    name: data.name,
    strokes(char) {
      if (Object.hasOwn(OWNED_GLYPHS, char)) return OWNED_GLYPHS[char];
      if (!Object.hasOwn(data.glyphs, char)) return char === " " ? [] : null;
      let strokes = cache.get(char);
      if (!strokes) cache.set(char, (strokes = build(data.glyphs[char])));
      return strokes;
    },
  };
}

/** A stroke font Maya can write with, with where it comes from. */
export interface BoardFont {
  id: "ems-tech" | "relief-singleline";
  name: string;
  glyphs: GlyphSet;
  licence: "SIL Open Font License 1.1";
  /** Who made it, as the font's notices say. */
  credit: string;
  source: string;
}

/** The two fonts for Savar to choose from (spec #297). Their licences and notices: src/lib/board/font-data/<id>/. */
export const BOARD_FONTS: readonly BoardFont[] = [
  {
    id: "ems-tech",
    name: "EMS Tech",
    glyphs: /*#__PURE__*/ svgFontGlyphs(EMS_TECH_DATA),
    licence: "SIL Open Font License 1.1",
    credit: "Sheldon B. Michaels and Windell H. Oskay (Evil Mad Scientist), from Architects Daughter by Kimberly Geswein",
    source: "https://gitlab.com/oskay/svg-fonts",
  },
  {
    id: "relief-singleline",
    name: "Relief SingleLine",
    glyphs: /*#__PURE__*/ svgFontGlyphs(RELIEF_SINGLELINE_DATA),
    licence: "SIL Open Font License 1.1",
    credit: "The Relief SingleLine Project Authors (isdaT, Toulouse)",
    source: "https://github.com/isdat-type/Relief-SingleLine",
  },
];

/**
 * The glyphs Maya writes with. Pending Savar's choice of font (D-181): set this to the chosen font's glyphs, for example
 * `BOARD_FONTS[0].glyphs` for EMS Tech. Every board made without its own glyph set follows it.
 */
export const BOARD_GLYPHS: GlyphSet = PLACEHOLDER_GLYPHS;
