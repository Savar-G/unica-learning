// Shapes the board draws from rectangles: arrows, circles and the arrowhead. All in grid cells; pure and deterministic
// (no randomness, so a replay draws the same strokes).
import type { Point } from "@/lib/board/glyphs";
import type { Rect } from "@/lib/board/types";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const centre = (r: Rect): Point => [r.x + r.w / 2, r.y + r.h / 2];

/** A curved arrow from one point to another, bending up by `lift` cells: the shaft, then the two strokes of the head. */
export function arrowStrokes(from: Point, to: Point, lift = 0.6): Point[][] {
  return curvedArrow(from, [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - lift], to);
}

/** An arrow whose shaft is the quadratic curve from `from` to `to` pulled toward `control`, then the head's two strokes. */
export function curvedArrow(from: Point, control: Point, to: Point): Point[][] {
  const shaft: Point[] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) ** 2 * from[0] + 2 * (1 - t) * t * control[0] + t ** 2 * to[0];
    const y = (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * control[1] + t ** 2 * to[1];
    shaft.push([r3(x), r3(y)]);
  }
  const [px, py] = shaft[steps - 1];
  const angle = Math.atan2(to[1] - py, to[0] - px);
  const head = (turn: number): Point[] => [
    [r3(to[0] - 0.28 * Math.cos(angle - turn)), r3(to[1] - 0.28 * Math.sin(angle - turn))],
    [r3(to[0]), r3(to[1])],
  ];
  return [shaft, head(0.5), head(-0.5)];
}

/** A hand-drawn circle around a rectangle: one ellipse that overlaps its start a little. */
export function circleStroke(r: Rect): Point[] {
  const [cx, cy] = centre(r);
  const rx = r.w / 2 + 0.25;
  const ry = r.h / 2 + 0.2;
  const pts: Point[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const a = ((-100 + (380 * i) / steps) * Math.PI) / 180;
    pts.push([r3(cx + rx * Math.cos(a)), r3(cy + ry * Math.sin(a))]);
  }
  return pts;
}

/** The length of a polyline. */
export function polylineLength(pts: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return total;
}

/** True when two rectangles overlap (touching edges do not count). */
export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** True when rectangle `inner` lies inside rectangle `outer` (edges may touch). */
export const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

/** The distance from a point to a segment. */
function pointToSegment(p: Point, a: Point, b: Point): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const d = dx * dx + dy * dy;
  const t = d === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** The distance between two segments: 0 when they cross. */
function segmentGap(a: Point, b: Point, c: Point, d: Point): number {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pointToSegment(a, c, d), pointToSegment(b, c, d), pointToSegment(c, a, b), pointToSegment(d, a, b));
}

/** True when two polylines cross: a segment of each passes through the other. Touching, or sharing an end, does not count. */
export function polylinesCross(a: readonly Point[], b: readonly Point[]): boolean {
  const strict = (p: Point, q: Point, r: Point, s: Point) => cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0;
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) if (strict(a[i - 1], a[i], b[j - 1], b[j])) return true;
  return false;
}

/** The closest two polylines come. A polyline of one point is a dot. */
export function polylineGap(a: readonly Point[], b: readonly Point[]): number {
  const segs = (pts: readonly Point[]): [Point, Point][] => (pts.length === 1 ? [[pts[0], pts[0]]] : pts.slice(1).map((p, i) => [pts[i], p]));
  let best = Infinity;
  for (const [p, q] of segs(a)) for (const [r, s] of segs(b)) best = Math.min(best, segmentGap(p, q, r, s));
  return best;
}

/** The smallest rectangle around the points. */
export function bounds(pts: readonly Point[]): Rect {
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** A stroke with its line width, for collision checks: the line covers `width / 2` on each side of its points. */
export interface Trace {
  pts: readonly Point[];
  width: number;
}

/** True when the two strokes come closer than their half widths plus `clearance`. */
export function traceTouches(a: Trace, b: Trace, clearance = 0): boolean {
  const reach = (a.width + b.width) / 2 + clearance;
  const ra = bounds(a.pts);
  const rb = bounds(b.pts);
  if (ra.x - reach > rb.x + rb.w || rb.x - reach > ra.x + ra.w || ra.y - reach > rb.y + rb.h || rb.y - reach > ra.y + ra.h) return false;
  return polylineGap(a.pts, b.pts) < reach;
}

/** True when a polyline enters a rectangle (touching its edge counts). */
export function polylineHitsRect(pts: readonly Point[], r: Rect): boolean {
  const inside = ([x, y]: Point) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (pts.some(inside)) return true;
  const corners: Point[] = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ];
  const edges = corners.map((c, i): [Point, Point] => [c, corners[(i + 1) % 4]]);
  return pts.slice(1).some((p, i) => edges.some(([c, d]) => segmentGap(pts[i], p, c, d) === 0));
}
