import type { Rect } from "../contract";

/** Lengths are sums of decimals, so equal positions can differ in the last digits. */
export const EPSILON = 0.01;

export const right = (r: Rect) => r.x + r.w;
export const bottom = (r: Rect) => r.y + r.h;

export const overlaps = (a: Rect, b: Rect): boolean =>
  Math.min(right(a), right(b)) - Math.max(a.x, b.x) > EPSILON && Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y) > EPSILON;

export const inside = (a: Rect, outer: Rect): boolean =>
  a.x >= outer.x - EPSILON && a.y >= outer.y - EPSILON && right(a) <= right(outer) + EPSILON && bottom(a) <= bottom(outer) + EPSILON;

export const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPSILON;

/** The four lines of an outline of this width, with their corners: an outline inks only these. */
export function outlineLines({ x, y, w, h }: Rect, line: number): Rect[] {
  const [left, top, width, height] = [x - line / 2, y - line / 2, w + line, h + line];
  return [{ x: left, y: top, w: width, h: line }, { x: left, y: y + h - line / 2, w: width, h: line }, { x: left, y: top, w: line, h: height }, { x: x + w - line / 2, y: top, w: line, h: height }];
}
