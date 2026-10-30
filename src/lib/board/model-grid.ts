// Coordinate grids: a bounded range of whole-number x and y values, one cell per unit, numbered along the bottom and
// left edges, with the axes where the range holds zero. Points are named by one capital letter and given as
// mathematical values, never positions: the code maps them through the grid. Parts: "point-A", "x-axis", "y-axis",
// "origin".
import { glyphStrokes, missingGlyphs, refuse, type LocalStroke, type LocalTarget } from "@/lib/board/representation";
import { around, ellipse, fields, int, invalid, list, serpentine, type ModelKind } from "@/lib/board/model-kind";
import type { Point } from "@/lib/board/glyphs";
import type { Rect } from "@/lib/board/types";

export interface CoordinateGridSpec {
  kind: "coordinate_grid";
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  points: { name: string; x: number; y: number }[];
}

export const GRID_LIMITS = { value: 10, xSpan: 16, ySpan: 10, points: 8 } as const;

/** Cells kept left of the grid for the y numbers, and around it for the x numbers and point names. */
const LEFT = 2;
const TOP = 1;
const RIGHT = 1;
const BOTTOM = 1.2;
const NUM_H = 0.5;
const NUM_W = 0.35;

const gx = (spec: CoordinateGridSpec, x: number) => LEFT + (x - spec.xMin);
const gy = (spec: CoordinateGridSpec, y: number) => TOP + (spec.yMax - y);
const at = (spec: CoordinateGridSpec, x: number, y: number): Point => [gx(spec, x), gy(spec, y)];
const hasZero = (min: number, max: number) => min <= 0 && max >= 0;
/** The grid's edges in cells, and which axes the range holds. */
const frame = (spec: CoordinateGridSpec) => ({
  left: gx(spec, spec.xMin),
  right: gx(spec, spec.xMax),
  top: gy(spec, spec.yMax),
  bottom: gy(spec, spec.yMin),
  xAxis: hasZero(spec.yMin, spec.yMax),
  yAxis: hasZero(spec.xMin, spec.xMax),
});
const size = (spec: CoordinateGridSpec) => ({ w: Math.ceil(LEFT + spec.xMax - spec.xMin + RIGHT), h: Math.ceil(TOP + spec.yMax - spec.yMin + BOTTOM) });
const numeral = (n: number) => (n < 0 ? `−${-n}` : String(n));

/** The values numbered along an axis: every one, or every second one on a long axis. */
function numbered(min: number, max: number): number[] {
  const step = max - min > 10 ? 2 : 1;
  const out: number[] = [];
  for (let v = min; v <= max; v++) if (v % step === 0) out.push(v);
  return out;
}

export const coordinateGrid: ModelKind<CoordinateGridSpec> = {
  parse(raw) {
    const o = fields(raw, "coordinate_grid model", ["kind", "xMin", "xMax", "yMin", "yMax", "points"]);
    const v = GRID_LIMITS.value;
    const [xMin, xMax, yMin, yMax] = [int(o.xMin, "xMin", -v, v), int(o.xMax, "xMax", -v, v), int(o.yMin, "yMin", -v, v), int(o.yMax, "yMax", -v, v)];
    if (xMax <= xMin || xMax - xMin > GRID_LIMITS.xSpan) invalid(`xMax must be more than xMin, by at most ${GRID_LIMITS.xSpan}.`);
    if (yMax <= yMin || yMax - yMin > GRID_LIMITS.ySpan) invalid(`yMax must be more than yMin, by at most ${GRID_LIMITS.ySpan}.`);
    const names = new Set<string>();
    const points = list(o.points, "points", GRID_LIMITS.points).map((raw, i) => {
      const p = fields(raw, `point ${i + 1}`, ["name", "x", "y"]);
      if (typeof p.name !== "string" || !/^[A-Z]$/.test(p.name)) invalid(`point ${i + 1} name must be one capital letter.`);
      const name = p.name as string;
      if (names.has(name)) invalid(`Two points are named ${name}.`);
      names.add(name);
      return { name, x: int(p.x, `point ${name} x`, xMin, xMax), y: int(p.y, `point ${name} y`, yMin, yMax) };
    });
    return { kind: "coordinate_grid", xMin, xMax, yMin, yMax, points };
  },
  names: (spec) => spec.points.map((p) => ({ piece: `point-${p.name}`, text: p.name })),
  layout(spec, glyphs) {
    const missing = missingGlyphs(glyphs, [...numbered(spec.xMin, spec.xMax), ...numbered(spec.yMin, spec.yMax)].map(numeral).join(""));
    if (missing.length > 0) return refuse("unsupported", `The board pen cannot write ${missing.join(" ")} yet.`);
    return size(spec);
  },
  targets(spec, objectId) {
    const t = (piece: string, label: string, value: string | null, rect: Rect): LocalTarget => ({ target: { objectId, part: "piece", piece }, label: `${objectId} ${label}`, writable: false, value, rect });
    const out: LocalTarget[] = [
      {
        target: { objectId, part: "whole" },
        label: `${objectId}: a coordinate grid, x from ${spec.xMin} to ${spec.xMax}, y from ${spec.yMin} to ${spec.yMax}`,
        writable: false,
        value: null,
        rect: { x: 0, y: 0, ...size(spec) },
      },
    ];
    const { left, right, top, bottom, xAxis, yAxis } = frame(spec);
    if (xAxis) out.push(t("x-axis", "x-axis", null, { x: left, y: gy(spec, 0) - 0.2, w: right - left, h: 0.4 }));
    if (yAxis) out.push(t("y-axis", "y-axis", null, { x: gx(spec, 0) - 0.2, y: top, w: 0.4, h: bottom - top }));
    if (xAxis && yAxis) out.push(t("origin", "origin", "(0, 0)", around(at(spec, 0, 0), 0.5)));
    for (const p of spec.points) out.push(t(`point-${p.name}`, `point ${p.name}`, `(${p.x}, ${p.y})`, around(at(spec, p.x, p.y), 0.5)));
    return out;
  },
  draw(spec, pen, glyphs) {
    const id = pen.objectId;
    const base = { objectId: id, ink: pen.ink, seq: pen.seq };
    const piece = (name: string) => ({ objectId: id, part: "piece" as const, piece: name });
    const { left, right, top, bottom, xAxis, yAxis } = frame(spec);
    const down: [Point, Point][] = [];
    const across: [Point, Point][] = [];
    for (let x = spec.xMin; x <= spec.xMax; x++) down.push([[gx(spec, x), top], [gx(spec, x), bottom]]);
    for (let y = spec.yMax; y >= spec.yMin; y--) across.push([[left, gy(spec, y)], [right, gy(spec, y)]]);
    const lines = { ...base, target: { objectId: id, part: "whole" as const }, kind: "rule" as const, layer: "behind" as const, ink: "black" as const, width: 0.03, opacity: 0.3 };
    const out: LocalStroke[] = [
      { ...lines, key: "grid/down", pts: serpentine(down) },
      { ...lines, key: "grid/across", pts: serpentine(across) },
    ];
    const axis = { ...base, kind: "rule" as const, layer: "math" as const, ink: "black" as const, width: 0.06 };
    if (xAxis) out.push({ ...axis, key: "x-axis", target: piece("x-axis"), pts: [[left, gy(spec, 0)], [right, gy(spec, 0)]] });
    if (yAxis) out.push({ ...axis, key: "y-axis", target: piece("y-axis"), pts: [[gx(spec, 0), bottom], [gx(spec, 0), top]] });
    const numbers = { ...base, target: { objectId: id, part: "whole" as const }, layer: "math" as const, ink: "black" as const, width: 0.04 };
    for (const x of numbered(spec.xMin, spec.xMax)) {
      const text = numeral(x);
      const w = text.length * NUM_W;
      out.push(...glyphStrokes(glyphs, text, { x: gx(spec, x) - w / 2, y: bottom + 0.2, w, h: NUM_H }, numbers, `x/${x}`));
    }
    for (const y of numbered(spec.yMin, spec.yMax)) {
      const text = numeral(y);
      const w = text.length * NUM_W;
      out.push(...glyphStrokes(glyphs, text, { x: left - 0.25 - w, y: gy(spec, y) - NUM_H / 2, w, h: NUM_H }, numbers, `y/${y}`));
    }
    for (const p of spec.points) {
      const [x, y] = at(spec, p.x, p.y);
      out.push({ ...base, key: `point-${p.name}`, target: piece(`point-${p.name}`), kind: "circle", layer: "math", width: 0.1, pts: ellipse(x, y, 0.1, 0.1, 10) });
      // A point's name needs a letter: the placeholder pen has none, so names appear with the real stroke font.
      if (missingGlyphs(glyphs, p.name).length === 0)
        out.push(...glyphStrokes(glyphs, p.name, { x: x + 0.15, y: y - 0.75, w: 0.5, h: 0.6 }, { ...base, target: piece(`point-${p.name}`), layer: "math", width: 0.05 }, `point-${p.name}/name`));
    }
    return out;
  },
};
