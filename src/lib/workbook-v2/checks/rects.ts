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
