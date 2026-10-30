// Maya's marks and arrows: annotations on named targets of any representation. The scene resolves each target to its
// rectangle; this module turns the rectangles into strokes, in grid cells on the page.
import { arrowStrokes, centre, circleStroke } from "@/lib/board/geometry";
import type { GlyphSet, Point } from "@/lib/board/glyphs";
import { glyphStrokes, type LocalStroke } from "@/lib/board/representation";
import type { Ink, MarkStyle, Rect, Target } from "@/lib/board/types";

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
  ink: Ink;
  page: number;
  seq: number;
}

/** The pen a mark uses when the model names none. */
export const MARK_INK: Record<MarkStyle, Ink> = { highlight: "yellow", circle: "red", underline: "red", strike: "red", check: "green" };

/** The strokes of a mark or an arrow. `rectOf` gives a target's rectangle on the page. */
export function annotationStrokes(glyphs: GlyphSet, o: MarkObject | ArrowObject, rectOf: (t: Target) => Rect): LocalStroke[] {
  const base = { objectId: o.id, target: { objectId: o.id, part: "whole" } as Target, ink: o.ink, seq: o.seq };
  if (o.kind === "arrow") {
    const a = rectOf(o.from);
    const b = rectOf(o.to);
    const sameRow = Math.abs(centre(a)[1] - centre(b)[1]) < 0.5;
    const start: Point = sameRow ? [centre(a)[0], a.y - 0.05] : edgeToward(a, centre(b));
    const end: Point = sameRow ? [centre(b)[0], b.y - 0.05] : edgeToward(b, centre(a));
    return arrowStrokes(start, end, sameRow ? 0.7 : 0.3).map((pts, i) => ({ ...base, key: `${i}`, kind: "arrow", layer: "annotation", width: 0.05, pts }));
  }
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
  if (Math.abs(dx) * r.h > Math.abs(dy) * r.w) return [dx > 0 ? r.x + r.w + 0.05 : r.x - 0.05, cy];
  return [cx, dy > 0 ? r.y + r.h + 0.05 : r.y - 0.05];
}
