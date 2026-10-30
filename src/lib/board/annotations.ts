// Maya's marks and arrows: annotations on named targets of any representation. The scene resolves each target to its
// rectangle; this module turns the rectangles into strokes, in grid cells on the page.
import { centre, circleStroke, curvedArrow, polylineHitsRect, traceTouches, type Trace } from "@/lib/board/geometry";
import type { GlyphSet, Point } from "@/lib/board/glyphs";
import { glyphStrokes, type LocalStroke } from "@/lib/board/representation";
import type { Ink, MarkStyle, PageSize, Rect, Target } from "@/lib/board/types";

export interface MarkObject {
  kind: "mark";
  id: string;
  target: Target;
  style: MarkStyle;
  ink: Ink;
  page: number;
  seq: number;
}

export interface ArrowObject {
  kind: "arrow";
  id: string;
  from: Target;
  to: Target;
  /** Chosen once, when the arrow is first drawn, so later work never bends an arrow already on the board. */
  route: ArrowRoute;
  ink: Ink;
  page: number;
  seq: number;
}

/** An arrow's shaft on the page, in grid cells: a curve from `from` to `to`, pulled toward `control`. */
export interface ArrowRoute {
  from: Point;
  control: Point;
  to: Point;
}

/** The polylines of an arrow on a route: the shaft, then the two strokes of the head. */
export const arrowLines = (route: ArrowRoute): Point[][] => curvedArrow(route.from, route.control, route.to);

const ARROW_WIDTH = 0.05;
/** How far outside its target an arrow starts or ends, in cells. */
const END_GAP = 0.05;
/** The gap an arrow keeps from other strokes, in cells, beyond their line widths. */
const ARROW_CLEARANCE = 0.05;
/** How far a route may bow out from the straight line between its ends, in cells. */
const BENDS = [0, 0.3, 0.6, 1, 1.5, 2, 3, 4];

/** The middles of the four sides of a rectangle, just outside it. */
const sides = (r: Rect): Point[] => {
  const [cx, cy] = centre(r);
  return [
    [cx, r.y - END_GAP],
    [cx, r.y + r.h + END_GAP],
    [r.x - END_GAP, cy],
    [r.x + r.w + END_GAP, cy],
  ];
};

/** What an arrow must keep clear of, in page cells: strokes, and the boxes of objects it does not join. */
export interface ArrowObstacles {
  strokes: readonly Trace[];
  boxes: readonly Rect[];
}

/**
 * Chooses an arrow's ends and curve between two targets. The engine, not the model, picks the route: the usual curve when
 * it is clear, else the shortest route that keeps clear of every obstacle and stays on the page. Null when no route is
 * clear.
 */
export function routeArrow(a: Rect, b: Rect, obstacles: ArrowObstacles, page: PageSize): ArrowRoute | null {
  const candidates: { route: ArrowRoute; cost: number }[] = [];
  // The usual look first: over the top between two targets in one row, else from facing side to facing side.
  const sameRow = Math.abs(centre(a)[1] - centre(b)[1]) < 0.5;
  const from: Point = sameRow ? [centre(a)[0], a.y - END_GAP] : edgeToward(a, centre(b));
  const to: Point = sameRow ? [centre(b)[0], b.y - END_GAP] : edgeToward(b, centre(a));
  candidates.push({ route: { from, control: [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - (sameRow ? 0.7 : 0.3)], to }, cost: -1 });
  for (const p of sides(a))
    for (const q of sides(b)) {
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (length < 0.3) continue;
      const normal: Point = [-(q[1] - p[1]) / length, (q[0] - p[0]) / length];
      const mid: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      for (const bend of BENDS)
        for (const sign of bend === 0 ? [1] : [1, -1]) {
          // A quadratic curve bows out half as far as its control point.
          const control: Point = [mid[0] + normal[0] * bend * sign * 2, mid[1] + normal[1] * bend * sign * 2];
          candidates.push({ route: { from: p, control, to: q }, cost: length + bend });
        }
    }
  candidates.sort((x, y) => x.cost - y.cost);
  return candidates.find((c) => routeIsClear(c.route, a, b, obstacles, page))?.route ?? null;
}

function routeIsClear(route: ArrowRoute, a: Rect, b: Rect, obstacles: ArrowObstacles, page: PageSize): boolean {
  const strokes = arrowLines(route);
  if (strokes.some((pts) => pts.some(([x, y]) => x < 0 || y < 0 || x > page.cols || y > page.rows))) return false;
  // The shaft does not run through either target on its way.
  const within = (r: Rect, [x, y]: Point) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
  if (strokes[0].slice(1, -1).some((p) => within(a, p) || within(b, p))) return false;
  if (strokes.some((pts) => obstacles.boxes.some((r) => polylineHitsRect(pts, r)))) return false;
  return !strokes.some((pts) => obstacles.strokes.some((o) => traceTouches({ pts, width: ARROW_WIDTH }, o, ARROW_CLEARANCE)));
}

/** The pen a mark uses when the model names none. */
export const MARK_INK: Record<MarkStyle, Ink> = { highlight: "yellow", circle: "red", underline: "red", strike: "red", check: "green" };

/** The strokes of a mark or an arrow. `rectOf` gives a mark target's rectangle on the page. */
export function annotationStrokes(glyphs: GlyphSet, o: MarkObject | ArrowObject, rectOf: (t: Target) => Rect): LocalStroke[] {
  const base = { objectId: o.id, target: { objectId: o.id, part: "whole" } as Target, ink: o.ink, seq: o.seq };
  if (o.kind === "arrow")
    return arrowLines(o.route).map((pts, i) => ({ ...base, key: `${i}`, kind: "arrow", layer: "annotation", width: ARROW_WIDTH, pts }));
  const r = rectOf(o.target);
  const [cx, cy] = centre(r);
  switch (o.style) {
    case "highlight": {
      const tall = r.h >= r.w;
      const pts: Point[] = tall ? [[cx, r.y + 0.1], [cx, r.y + r.h - 0.1]] : [[r.x + 0.1, cy], [r.x + r.w - 0.1, cy]];
      return [{ ...base, key: "0", kind: "highlight", layer: "behind", width: (tall ? r.w : r.h) * 0.9, opacity: 0.35, pts }];
    }
    case "circle":
      return [{ ...base, key: "0", kind: "circle", layer: "annotation", width: 0.06, pts: circleStroke(r) }];
    case "underline":
      return [{ ...base, key: "0", kind: "underline", layer: "annotation", width: 0.06, pts: [[r.x, r.y + r.h + 0.08], [r.x + r.w, r.y + r.h + 0.08]] }];
    case "strike":
      return [{ ...base, key: "0", kind: "strike", layer: "annotation", width: 0.06, pts: [[r.x + 0.1, r.y + r.h - 0.1], [r.x + r.w - 0.1, r.y + 0.1]] }];
    case "check":
      return glyphStrokes(glyphs, "✓", { x: r.x + r.w, y: r.y, w: 1, h: 1 }, { ...base, layer: "annotation", width: 0.07 }, "check").map((p) => ({ ...p, kind: "check" }));
  }
}

/** The middle of the side of a rectangle that faces a point. */
function edgeToward(r: Rect, p: Point): Point {
  const [cx, cy] = centre(r);
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  if (Math.abs(dx) * r.h > Math.abs(dy) * r.w) return [dx > 0 ? r.x + r.w + END_GAP : r.x - END_GAP, cy];
  return [cx, dy > 0 ? r.y + r.h + END_GAP : r.y - END_GAP];
}
