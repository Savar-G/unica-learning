// What every math model kind provides (#318), and the field checks they share. A kind names its fields and their bounds;
// a missing field, an unknown field or a value out of bounds is refused with a reason, never repaired. A kind computes
// its size, named parts and strokes from its fields alone: the model never supplies a position.
import type { GlyphSet, Point } from "@/lib/board/glyphs";
import type { LocalStroke, LocalTarget, RefusalBody } from "@/lib/board/representation";
import type { Ink, Rect } from "@/lib/board/types";

/** The pen a model draws with: its object, its ink and the command that made it. */
export interface Pen {
  objectId: string;
  ink: Ink;
  seq: number;
}

export interface ModelKind<S> {
  /** Checks the fields of an object whose `kind` is this one. Throws `ModelInvalid` with the reason. */
  parse(raw: Fields): S;
  /** Checks what the fields alone cannot show (a label on a side that is not a whole number) and gives the size in cells. */
  layout(spec: S, glyphs: GlyphSet): { w: number; h: number } | RefusalBody;
  /** The letters it writes beside its parts (corner and point names): a pen without letters leaves them out. */
  names?(spec: S): { piece: string; text: string }[];
  /** Every named part, the whole first, in cells from the object's top-left corner. */
  targets(spec: S, objectId: string): LocalTarget[];
  draw(spec: S, pen: Pen, glyphs: GlyphSet): LocalStroke[];
}

export class ModelInvalid extends Error {}
export const invalid = (reason: string): never => {
  throw new ModelInvalid(reason);
};

export type Fields = Record<string, unknown>;

export function fields(v: unknown, what: string, required: readonly string[], optional: readonly string[] = []): Fields {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return invalid(`${what} must be an object.`);
  const o = v as Fields;
  for (const k of required) if (o[k] === undefined) invalid(`${what} needs "${k}".`);
  for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) invalid(`${what} has an unknown field "${k}".`);
  return o;
}

export function int(v: unknown, what: string, min: number, max: number): number {
  if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) return invalid(`${what} must be a whole number from ${min} to ${max}.`);
  return v as number;
}

export function choice<T extends string>(v: unknown, values: readonly T[], what: string): T {
  if (!values.includes(v as T)) return invalid(`${what} must be one of ${values.join(", ")}.`);
  return v as T;
}

export function list(v: unknown, what: string, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) return invalid(`${what} must be a list of up to ${max}.`);
  return v;
}

// ---------- drawing helpers, in cells ----------

export const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The closed outline of a rectangle, from its top-left corner clockwise. */
export const rectOutline = (r: Rect): Point[] => [
  [r.x, r.y],
  [r.x + r.w, r.y],
  [r.x + r.w, r.y + r.h],
  [r.x, r.y + r.h],
  [r.x, r.y],
];

/** Parallel lines drawn as one pen stroke, each line the other way round from the last, so a grid draws in two strokes. */
export function serpentine(lines: readonly [Point, Point][]): Point[] {
  return lines.flatMap(([a, b], i) => (i % 2 === 0 ? [a, b] : [b, a]));
}

/** A closed ellipse around a centre, `steps` segments, starting at the top. */
export function ellipse(cx: number, cy: number, rx: number, ry: number, steps: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / steps;
    pts.push([r3(cx + rx * Math.cos(a)), r3(cy + ry * Math.sin(a))]);
  }
  return pts;
}

/** A small box centred on a point. */
export const around = ([x, y]: Point, size: number): Rect => ({ x: x - size / 2, y: y - size / 2, w: size, h: size });

/** The rectangle around some rectangles. */
export function union(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
}

/** A rectangle grown by `by` cells on every side. */
export const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by });
