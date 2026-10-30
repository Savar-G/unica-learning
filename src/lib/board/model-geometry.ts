// Named geometry shapes from a closed list, each with bounded whole-number dimensions in units. The corners are named
// A, B, C, D counter-clockwise from the bottom left, so the parts are "vertex-A", "side-AB" and "angle-A" (a circle has
// "centre" and "radius"). A label shows a side's length or an angle's size, which the code computes; a label the code
// cannot write as a whole number, or a right-angle mark on an angle that is not one, is refused.
import { glyphStrokes, missingGlyphs, refuse, type LocalStroke, type LocalTarget, type RefusalBody } from "@/lib/board/representation";
import { around, choice, ellipse, fields, grow, int, invalid, list, r3, type ModelKind } from "@/lib/board/model-kind";
import type { Point } from "@/lib/board/glyphs";
import type { Rect } from "@/lib/board/types";

export const SHAPES = ["square", "rectangle", "right_triangle", "triangle", "parallelogram", "trapezoid", "circle"] as const;
export type Shape = (typeof SHAPES)[number];
export const LABEL_SHOWS = ["length", "measure", "right", "unknown"] as const;
export type LabelShow = (typeof LABEL_SHOWS)[number];

export type GeometrySpec = {
  kind: "geometry";
  /** What each named part shows: a side its length, an angle its size or a right-angle mark, or "?" for unknown. */
  labels: { piece: string; show: LabelShow }[];
} & (
  | { shape: "square"; side: number }
  | { shape: "rectangle"; width: number; height: number }
  | { shape: "right_triangle"; base: number; height: number }
  /** `apex` is how far along the base the top corner is. */
  | { shape: "triangle"; base: number; height: number; apex: number }
  /** `slant` is how far right the top side starts. */
  | { shape: "parallelogram"; base: number; height: number; slant: number }
  /** An isosceles trapezoid: the top is shorter than the bottom and centred over it. */
  | { shape: "trapezoid"; bottom: number; top: number; height: number }
  | { shape: "circle"; radius: number }
);

export const GEOMETRY_LIMITS = { side: 10, slant: 5, radius: 5, labels: 12 } as const;

/** The dimensions each shape takes, in units. */
const DIMENSIONS: Record<Shape, readonly string[]> = {
  square: ["side"],
  rectangle: ["width", "height"],
  right_triangle: ["base", "height"],
  triangle: ["base", "height", "apex"],
  parallelogram: ["base", "height", "slant"],
  trapezoid: ["bottom", "top", "height"],
  circle: ["radius"],
};

/** Cells kept around the shape for names and labels. */
const PAD = 1.5;
const OUTLINE = 0.06;
const TEXT_H = 0.7;
const CHAR_W = 0.5;

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const add = (a: Point, b: Point, by = 1): Point => [r3(a[0] + b[0] * by), r3(a[1] + b[1] * by)];
const unit = (v: Point): Point => {
  const n = Math.hypot(v[0], v[1]);
  return [v[0] / n, v[1] / n];
};
/** A value as a whole number, or null when it is not one (to floating-point noise). */
const whole = (n: number) => (Math.abs(n - Math.round(n)) < 1e-9 ? Math.round(n) : null);

interface Side {
  name: string;
  /** Its part name: "side-AB", or "radius". */
  piece: string;
  from: Point;
  to: Point;
  /** The length in units. */
  length: number;
}
interface Angle {
  name: string;
  at: Point;
  /** The two neighbouring corners. */
  arms: [Point, Point];
  degrees: number;
  right: boolean;
}
interface Figure {
  vertices: { name: string; at: Point }[];
  sides: Side[];
  angles: Angle[];
  /** The circle, for a circle. */
  circle?: { centre: Point; radius: number };
  w: number;
  h: number;
}

/** The corners in units, x right and y up, counter-clockwise from the bottom left. */
function corners(spec: GeometrySpec): Point[] {
  switch (spec.shape) {
    case "square":
      return [[0, 0], [spec.side, 0], [spec.side, spec.side], [0, spec.side]];
    case "rectangle":
      return [[0, 0], [spec.width, 0], [spec.width, spec.height], [0, spec.height]];
    case "right_triangle":
      return [[0, 0], [spec.base, 0], [0, spec.height]];
    case "triangle":
      return [[0, 0], [spec.base, 0], [spec.apex, spec.height]];
    case "parallelogram":
      return [[0, 0], [spec.base, 0], [spec.base + spec.slant, spec.height], [spec.slant, spec.height]];
    case "trapezoid": {
      const inset = (spec.bottom - spec.top) / 2;
      return [[0, 0], [spec.bottom, 0], [spec.bottom - inset, spec.height], [inset, spec.height]];
    }
    case "circle":
      return [];
  }
}

/** The shape in cells from the object's top-left corner, scaled so a small shape is not tiny. */
function figure(spec: GeometrySpec): Figure {
  if (spec.shape === "circle") {
    const k = scale(2 * spec.radius);
    const r = spec.radius * k;
    const centre: Point = [PAD + r, PAD + r];
    return { vertices: [], sides: [{ name: "radius", piece: "radius", from: centre, to: [centre[0] + r, centre[1]], length: spec.radius }], angles: [], circle: { centre, radius: r }, w: Math.ceil(2 * r + 2 * PAD), h: Math.ceil(2 * r + 2 * PAD) };
  }
  const pts = corners(spec);
  const width = Math.max(...pts.map(([x]) => x));
  const height = Math.max(...pts.map(([, y]) => y));
  const k = scale(Math.max(width, height));
  const cells = pts.map(([x, y]): Point => [PAD + x * k, PAD + (height - y) * k]);
  const names = "ABCD".slice(0, pts.length).split("");
  const n = pts.length;
  const sides = names.map((name, i) => {
    const j = (i + 1) % n;
    return { name: name + names[j], piece: `side-${name}${names[j]}`, from: cells[i], to: cells[j], length: Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]) };
  });
  const angles = names.map((name, i) => {
    const [p, q] = [pts[(i + n - 1) % n], pts[(i + 1) % n]];
    const [u, v] = [sub(p, pts[i]), sub(q, pts[i])];
    const dot = u[0] * v[0] + u[1] * v[1];
    const degrees = (Math.acos(Math.max(-1, Math.min(1, dot / (Math.hypot(...u) * Math.hypot(...v))))) * 180) / Math.PI;
    return { name, at: cells[i], arms: [cells[(i + n - 1) % n], cells[(i + 1) % n]] as [Point, Point], degrees, right: dot === 0 };
  });
  return { vertices: names.map((name, i) => ({ name, at: cells[i] })), sides, angles, w: Math.ceil(width * k + 2 * PAD), h: Math.ceil(height * k + 2 * PAD) };
}

/** Cells per unit: whole numbers, so corners land on grid lines; a shape up to 2 units across is drawn 4 times as big. */
const scale = (largest: number) => (largest <= 2 ? 4 : largest <= 4 ? 2 : 1);

/** The pieces a label may name: the sides and angles (a circle's radius). */
function labelled(f: Figure): Map<string, { kind: "side"; side: Side } | { kind: "angle"; angle: Angle }> {
  const out = new Map<string, { kind: "side"; side: Side } | { kind: "angle"; angle: Angle }>();
  for (const side of f.sides) out.set(side.piece, { kind: "side", side });
  for (const angle of f.angles) out.set(`angle-${angle.name}`, { kind: "angle", angle });
  return out;
}

/** What each label writes, by piece name, or why a label is refused. */
function labelTexts(spec: GeometrySpec, f: Figure): Map<string, string> | RefusalBody {
  const parts = labelled(f);
  const out = new Map<string, string>();
  for (const { piece, show } of spec.labels) {
    const part = parts.get(piece);
    if (!part) return refuse("invalid_command", `This ${spec.shape.replace("_", " ")} has no part "${piece}" to label: it has ${[...parts.keys()].join(", ")}.`);
    if (out.has(piece)) return refuse("invalid_command", `"${piece}" is labelled twice.`);
    if (show === "unknown") {
      out.set(piece, "?");
      continue;
    }
    if (part.kind === "side") {
      if (show !== "length") return refuse("invalid_command", `A side shows its "length" or "unknown", not "${show}".`);
      const length = whole(part.side.length);
      if (length === null) return refuse("not_allowed", `Side ${part.side.name} is about ${part.side.length.toFixed(2)} units, not a whole number: label it "unknown" or leave it.`);
      out.set(piece, String(length));
      continue;
    }
    if (show === "length") return refuse("invalid_command", `An angle shows its "measure", a "right" mark or "unknown", not a length.`);
    if (show === "right" && !part.angle.right) return refuse("not_allowed", `Angle ${part.angle.name} is not a right angle.`);
    const degrees = whole(part.angle.degrees);
    if (degrees === null) return refuse("not_allowed", `Angle ${part.angle.name} is about ${part.angle.degrees.toFixed(1)} degrees, not a whole number: label it "unknown" or leave it.`);
    out.set(piece, String(degrees));
  }
  return out;
}

/** The unit vector halfway between an angle's arms, into the shape. */
const bisector = (a: Angle) => unit(add(unit(sub(a.arms[0], a.at)), unit(sub(a.arms[1], a.at))));
/** The unit normal of a side that points away from the shape's middle. */
function outward(side: Side, f: Figure): Point {
  if (side.name === "radius") return [0, -1];
  const d = unit(sub(side.to, side.from));
  const n: Point = [-d[1], d[0]];
  const middle = f.vertices.reduce<Point>((m, v) => [m[0] + v.at[0] / f.vertices.length, m[1] + v.at[1] / f.vertices.length], [0, 0]);
  const mid: Point = [(side.from[0] + side.to[0]) / 2, (side.from[1] + side.to[1]) / 2];
  return n[0] * (mid[0] - middle[0]) + n[1] * (mid[1] - middle[1]) >= 0 ? n : [-n[0], -n[1]];
}
/** A text box of `chars` characters centred on a point. */
const textBox = ([x, y]: Point, chars: number): Rect => ({ x: x - (chars * CHAR_W) / 2, y: y - TEXT_H / 2, w: chars * CHAR_W, h: TEXT_H });
/** Where a side's label goes: beside its middle, outside the shape, far enough that the text keeps clear of the line. */
function sideLabelBox(side: Side, f: Figure, chars: number): Rect {
  const mid: Point = [(side.from[0] + side.to[0]) / 2, (side.from[1] + side.to[1]) / 2];
  const n = outward(side, f);
  const reach = Math.abs(n[0]) * ((chars * CHAR_W) / 2) + Math.abs(n[1]) * (TEXT_H / 2) + 0.2;
  return textBox(add(mid, n, reach), chars);
}
/** Where an angle's size goes: inside the angle, far enough along its bisector to clear both arms. */
function angleLabelBox(a: Angle, chars: number): Rect {
  const half = ((a.degrees / 2) * Math.PI) / 180;
  const radius = Math.hypot((chars * CHAR_W) / 2, TEXT_H / 2) + 0.1;
  return textBox(add(a.at, bisector(a), Math.min(3, radius / Math.sin(half))), chars);
}

const sideRect = (s: Side): Rect => grow({ x: Math.min(s.from[0], s.to[0]), y: Math.min(s.from[1], s.to[1]), w: Math.abs(s.to[0] - s.from[0]), h: Math.abs(s.to[1] - s.from[1]) }, 0.15);

export const geometry: ModelKind<GeometrySpec> = {
  parse(raw) {
    const shape = choice((raw as { shape?: unknown }).shape, SHAPES, "geometry.shape");
    const dims = DIMENSIONS[shape];
    const o = fields(raw, `${shape} geometry`, ["kind", "shape", ...dims], ["labels"]);
    const max = { slant: GEOMETRY_LIMITS.slant, radius: GEOMETRY_LIMITS.radius } as Record<string, number>;
    const d: Record<string, number> = {};
    for (const k of dims) if (k !== "apex" && k !== "top") d[k] = int(o[k], k, 1, max[k] ?? GEOMETRY_LIMITS.side);
    if (shape === "triangle") d.apex = int(o.apex, "apex", 0, d.base);
    if (shape === "trapezoid") {
      if (d.bottom < 2) invalid("A trapezoid's bottom must be from 2, longer than its top.");
      d.top = int(o.top, "top", 1, d.bottom - 1);
    }
    const labels = list(o.labels ?? [], "labels", GEOMETRY_LIMITS.labels).map((l, i) => {
      const label = fields(l, `label ${i + 1}`, ["piece", "show"]);
      if (typeof label.piece !== "string" || label.piece.length > 32) invalid(`label ${i + 1} piece must be a part name.`);
      return { piece: label.piece as string, show: choice(label.show, LABEL_SHOWS, `label ${i + 1} show`) };
    });
    return { kind: "geometry", shape, ...d, labels } as GeometrySpec;
  },
  names: (spec) => figure(spec).vertices.map((v) => ({ piece: `vertex-${v.name}`, text: v.name })),
  layout(spec, glyphs) {
    const f = figure(spec);
    const texts = labelTexts(spec, f);
    if (!(texts instanceof Map)) return texts;
    const missing = missingGlyphs(glyphs, [...texts.values()].join(""));
    if (missing.length > 0) return refuse("unsupported", `The board pen cannot write ${missing.join(" ")} yet.`);
    return { w: f.w, h: f.h };
  },
  targets(spec, objectId) {
    const f = figure(spec);
    const texts = labelTexts(spec, f) as Map<string, string>;
    const t = (piece: string, label: string, rect: Rect): LocalTarget => ({ target: { objectId, part: "piece", piece }, label: `${objectId} ${label}`, writable: false, value: texts.get(piece) ?? null, rect });
    const out: LocalTarget[] = [{ target: { objectId, part: "whole" }, label: `${objectId}: a ${spec.shape.replace("_", " ")}`, writable: false, value: null, rect: { x: 0, y: 0, w: f.w, h: f.h } }];
    if (f.circle) {
      out.push(t("centre", "centre", around(f.circle.centre, 0.5)));
      out.push(t("radius", "radius", sideRect(f.sides[0])));
      return out;
    }
    for (const v of f.vertices) out.push(t(`vertex-${v.name}`, `corner ${v.name}`, around(v.at, 0.5)));
    for (const s of f.sides) out.push(t(`side-${s.name}`, `side ${s.name}`, sideRect(s)));
    for (const a of f.angles) out.push(t(`angle-${a.name}`, `angle ${a.name}`, around(add(a.at, bisector(a), 0.5), 0.6)));
    return out;
  },
  draw(spec, pen, glyphs) {
    const f = figure(spec);
    const texts = labelTexts(spec, f) as Map<string, string>;
    const out: LocalStroke[] = [];
    const base = (piece: string | null) => ({
      objectId: pen.objectId,
      target: piece === null ? { objectId: pen.objectId, part: "whole" as const } : { objectId: pen.objectId, part: "piece" as const, piece },
      layer: "math" as const,
      ink: pen.ink,
      seq: pen.seq,
    });
    const write = (piece: string | null, text: string, box: Rect, key: string) => out.push(...glyphStrokes(glyphs, text, box, { ...base(piece), width: 0.06 }, key));
    if (f.circle) {
      const { centre, radius } = f.circle;
      out.push({ ...base(null), key: "circle", kind: "rule", width: OUTLINE, pts: ellipse(centre[0], centre[1], radius, radius, 48) });
      out.push({ ...base("centre"), key: "centre", kind: "circle", width: 0.08, pts: ellipse(centre[0], centre[1], 0.06, 0.06, 8) });
    }
    for (const s of f.sides) out.push({ ...base(s.piece), key: s.piece, kind: "rule", width: OUTLINE, pts: [s.from, s.to] });
    for (const a of f.angles) {
      const piece = `angle-${a.name}`;
      const text = texts.get(piece);
      if (text === undefined) continue;
      if (spec.labels.find((l) => l.piece === piece)?.show === "right") {
        const [u, v] = [unit(sub(a.arms[0], a.at)), unit(sub(a.arms[1], a.at))];
        out.push({ ...base(piece), key: `${piece}/mark`, kind: "rule", width: 0.04, pts: [add(a.at, u, 0.4), add(add(a.at, u, 0.4), v, 0.4), add(a.at, v, 0.4)] });
      } else write(piece, text, angleLabelBox(a, text.length), `${piece}/label`);
    }
    for (const s of f.sides) {
      const text = texts.get(s.piece);
      if (text !== undefined) write(s.piece, text, sideLabelBox(s, f, text.length), `${s.piece}/label`);
    }
    // Corner names need letters: the placeholder pen has none, so they appear with the real stroke font.
    for (const v of f.vertices) {
      if (missingGlyphs(glyphs, v.name).length > 0) continue;
      const angle = f.angles.find((a) => a.name === v.name)!;
      write(`vertex-${v.name}`, v.name, textBox(add(v.at, bisector(angle), -0.6), 1), `vertex-${v.name}/name`);
    }
    return out;
  },
};
