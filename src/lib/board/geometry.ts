// Shapes the board draws from rectangles: arrows, circles and the arrowhead. All in grid cells; pure and deterministic
// (no randomness, so a replay draws the same strokes).
import type { Point } from "@/lib/board/glyphs";
import type { Rect } from "@/lib/board/types";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const centre = (r: Rect): Point => [r.x + r.w / 2, r.y + r.h / 2];

/** A curved arrow from one point to another, bending up by `lift` cells: the shaft, then the two strokes of the head. */
export function arrowStrokes(from: Point, to: Point, lift = 0.6): Point[][] {
  const control: Point = [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - lift];
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
