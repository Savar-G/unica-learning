// Paints one whiteboard stroke on a canvas (#67). The board (whiteboard.tsx) and the admin's stroke replay
// (stroke-replay.tsx, #186) paint the same way. No CSS here, so the admin pages do not load the test screen's styles.

export const INK = "#1f1c19";

/** A stroke to paint. Points are [x, y] in board widths; a time after them (a replayed point) is not used. */
export interface PaintStroke {
  erase: boolean;
  /** The line width in the board's CSS pixels. */
  w: number;
  pts: readonly (readonly [number, number, ...number[]])[];
}

/**
 * Paints `s` on a board `width` CSS pixels wide, its line `scale` times as wide; an eraser stroke clears what is under
 * it. `from`: paint only the part from this point on (the board adds to the stroke in progress).
 */
export function paint(ctx: CanvasRenderingContext2D, s: PaintStroke, width: number, scale = 1, from = 0) {
  if (s.pts.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = s.w * scale;
  if (s.pts.length === 1) {
    const [x, y] = s.pts[0];
    ctx.beginPath();
    ctx.arc(x * width, y * width, (s.w * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const start = Math.max(0, from - 1);
    ctx.beginPath();
    ctx.moveTo(s.pts[start][0] * width, s.pts[start][1] * width);
    for (let i = start + 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0] * width, s.pts[i][1] * width);
    ctx.stroke();
  }
  ctx.restore();
}
