// The child's ink on "Our board" (#320, spec #297), the web renderer's pure part: each stroke as the outline perfect-freehand
// draws around its points (a filled SVG path that thins and swells as a pen does), and the camera that puts the child's
// layer exactly over Maya's. No DOM, clock or React: the board component (src/components/our-board.tsx) measures and paints.
import { getStroke } from "perfect-freehand";
import { SVG_UNITS } from "@/lib/board-svg";

/** A rectangle on the screen, in CSS pixels. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** An SVG viewBox: x, y, width and height in SVG units (SVG_UNITS per board width). */
export type ViewBox = [x: number, y: number, w: number, h: number];

export const parseViewBox = (text: string): ViewBox | null => {
  const n = text.trim().split(/[\s,]+/).map(Number);
  return n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0 ? [n[0], n[1], n[2], n[3]] : null;
};

/**
 * The viewBox for a layer over the whole canvas, so that its board coordinates land where Maya's board (an SVG with
 * `inner` as its viewBox, shown in the box `shown`, centred as preserveAspectRatio "xMidYMid meet" does) puts them.
 * With no Maya board, one board width is the canvas's width, from its top-left corner.
 */
export function canvasViewBox(canvas: Box, maya: { viewBox: ViewBox; shown: Box } | null): ViewBox {
  if (canvas.width <= 0 || canvas.height <= 0) return [0, 0, SVG_UNITS, SVG_UNITS];
  if (!maya || maya.shown.width <= 0 || maya.shown.height <= 0) return [0, 0, SVG_UNITS, (SVG_UNITS * canvas.height) / canvas.width];
  const [vx, vy, vw, vh] = maya.viewBox;
  const { shown } = maya;
  // "meet": one scale for both axes, the smaller; the drawing is centred in the box.
  const scale = Math.min(shown.width / vw, shown.height / vh);
  const left = shown.left + (shown.width - vw * scale) / 2;
  const top = shown.top + (shown.height - vh * scale) / 2;
  return [vx - (left - canvas.left) / scale, vy - (top - canvas.top) / scale, canvas.width / scale, canvas.height / scale];
}

/** A point on the screen (CSS pixels) as a point on the board, in board widths. */
export function toBoard(view: ViewBox, canvas: Box, clientX: number, clientY: number): [number, number] {
  const scale = canvas.width / view[2];
  return [(view[0] + (clientX - canvas.left) / scale) / SVG_UNITS, (view[1] + (clientY - canvas.top) / scale) / SVG_UNITS];
}

/** How many CSS pixels one board width takes on the screen: the board width a stroke's line width is read against. */
export const boardWidthOf = (view: ViewBox, canvas: Box) => (canvas.width / view[2]) * SVG_UNITS;

const unit = (n: number) => Math.round(n * 10) / 10;

/**
 * A stroke of the child's as the filled outline perfect-freehand draws around it, in SVG path data. Points in board
 * widths; `size` (the pen's width) in board widths too. `finished`: the stroke is done, so its end is drawn whole.
 */
export function inkOutline(pts: readonly (readonly [number, number, ...number[]])[], size: number, finished: boolean): string {
  if (pts.length === 0) return "";
  const outline = getStroke(
    pts.map(([x, y]) => [x * SVG_UNITS, y * SVG_UNITS]),
    { size: size * SVG_UNITS, thinning: 0.5, smoothing: 0.5, streamline: 0.4, simulatePressure: true, last: finished },
  );
  if (outline.length < 2) return "";
  // Quadratic curves through the midpoints of the outline: smooth, and short to write.
  const [first, ...rest] = outline;
  const parts = [`M${unit(first[0])} ${unit(first[1])}Q`];
  rest.forEach(([x, y], i) => {
    const [nx, ny] = outline[(i + 2) % outline.length];
    parts.push(`${unit(x)} ${unit(y)} ${unit((x + nx) / 2)} ${unit((y + ny) / 2)} `);
  });
  return `${parts.join("").trimEnd()}Z`;
}

/** An eraser stroke as an open line (it is painted into a mask with its own width), in SVG path data. */
export function eraserLine(pts: readonly (readonly [number, number, ...number[]])[]): string {
  if (pts.length === 0) return "";
  const line = pts.length === 1 ? [pts[0], pts[0]] : pts;
  return line.map(([x, y], i) => `${i === 0 ? "M" : "L"}${unit(x * SVG_UNITS)} ${unit(y * SVG_UNITS)}`).join("");
}

/**
 * The child's strokes in groups for painting: an eraser stroke clears the child's ink drawn before it, never what comes
 * after, and never Maya's. Each group is the ink under one set of eraser strokes (in a mask) and the ink drawn after them.
 * Consecutive eraser strokes share one mask.
 */
export type InkLayer<T> = { ink: T[] } | { under: InkLayer<T>; erasers: T[]; ink: T[] };

export function inkLayers<T extends { erase: boolean }>(strokes: readonly T[]): InkLayer<T> {
  let layer: InkLayer<T> = { ink: [] };
  let i = 0;
  while (i < strokes.length) {
    if (!strokes[i].erase) {
      layer.ink.push(strokes[i++]);
      continue;
    }
    const erasers: T[] = [];
    while (i < strokes.length && strokes[i].erase) erasers.push(strokes[i++]);
    layer = { under: layer, erasers, ink: [] };
  }
  return layer;
}
