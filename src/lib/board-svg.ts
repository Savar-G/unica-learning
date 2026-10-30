// The web renderer's pure part for Maya's board (#319, spec #297): the core's stroke paths as SVG path data, and the
// playback of drawn strokes as a pure function of the time since playing started. No DOM, clock or React: the board
// component (src/components/maya-board.tsx) asks these for a frame and paints it.
import type { BoardPath, TimedPath, View } from "@/lib/board";

/** SVG units per board width: the board's points (in board widths) times this. */
export const SVG_UNITS = 1000;

const unit = (n: number) => Math.round(n * SVG_UNITS * 10) / 10;

/** A stroke as one open polyline in SVG path data. A single point draws as a dot (round caps). */
export function pathData(pts: readonly (readonly [number, number])[]): string {
  if (pts.length === 0) return "";
  const line = pts.length === 1 ? [pts[0], pts[0]] : pts;
  return line.map(([x, y], i) => `${i === 0 ? "M" : "L"}${unit(x)} ${unit(y)}`).join("");
}

/** An SVG viewBox around the work: every stroke with its line width, and `pad` board widths around it. */
export function fitView(paths: readonly BoardPath[], pad: number): string {
  const [x0, y0, x1, y1] = paths.reduce(
    ([a, b, c, d], p) => {
      const r = p.width / 2;
      for (const [x, y] of p.pts) [a, b, c, d] = [Math.min(a, x - r), Math.min(b, y - r), Math.max(c, x + r), Math.max(d, y + r)];
      return [a, b, c, d];
    },
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  if (x0 > x1) return `0 0 ${SVG_UNITS} ${SVG_UNITS}`;
  return [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad].map(unit).join(" ");
}

/**
 * One applied batch, as `applyBatch` returns it: the strokes it drew (times from the batch's start) and the ids it
 * erased, with the board's view after it (`boardView`), which says the page to show: a new page when the work
 * overflowed, or an earlier one Maya points back at. Without a view, the page is the one the batch last drew on.
 */
export interface PlayStep {
  drawn: readonly TimedPath[];
  erased?: readonly string[];
  view?: View;
}

interface Scheduled {
  path: BoardPath;
  startMs: number;
  endMs: number;
  /** When a later batch takes the stroke away, or null. */
  erasedMs: number | null;
}

/** Batches laid end to end on one clock: what a frame at any time is read from. */
export interface Timeline {
  readonly strokes: readonly Scheduled[];
  /** The page in view from each time on, earliest first; the board starts on page 1. */
  readonly pages: readonly { fromMs: number; page: number }[];
  /** When the last stroke is finished. */
  readonly durationMs: number;
}

/** The pause between one batch's last stroke and the next batch. */
export const BATCH_GAP_MS = 500;

/** Lays batches end to end: each starts when the one before has finished drawing, after a pause. */
export function timeline(steps: readonly PlayStep[], options: { gapMs?: number } = {}): Timeline {
  const gap = options.gapMs ?? BATCH_GAP_MS;
  const strokes: Scheduled[] = [];
  const pages = [{ fromMs: 0, page: 1 }];
  let end = 0;
  steps.forEach((step, i) => {
    const offset = i === 0 ? 0 : end + gap;
    const page = step.view?.page ?? step.drawn.at(-1)?.page;
    if (page !== undefined && page !== pages.at(-1)!.page) pages.push({ fromMs: offset, page });
    const erased = new Set(step.erased ?? []);
    for (const s of strokes) if (erased.has(s.path.id) && s.erasedMs === null) s.erasedMs = offset;
    end = offset;
    for (const p of step.drawn) {
      const { startMs, ...path } = p;
      strokes.push({ path, startMs: offset + startMs, endMs: offset + startMs + p.durationMs, erasedMs: null });
      end = Math.max(end, offset + startMs + p.durationMs);
    }
  });
  return { strokes, pages, durationMs: end };
}

/** The page the board shows `elapsedMs` after playing started. */
export function pageAt(t: Timeline, elapsedMs: number): number {
  return t.pages.findLast((p) => p.fromMs <= elapsedMs)!.page;
}

/** A stroke to paint now, and how much of it: from just started (above 0) to whole (1). */
export interface FrameStroke {
  path: BoardPath;
  progress: number;
}

const LAYERS: Record<BoardPath["layer"], number> = { behind: 0, math: 1, annotation: 2 };

/**
 * What the board shows `elapsedMs` after playing started: the strokes on the page in view (`pageAt`), in paint order: highlights under the math, carries and marks
 * over it, and the core's paint order within a layer (a stroke an undo brings back goes where it was, not on top). Infinity gives the finished board at once (a replay's end, a reload).
 */
export function frameAt(t: Timeline, elapsedMs: number): FrameStroke[] {
  const out: (FrameStroke & { order: number })[] = [];
  const page = pageAt(t, elapsedMs);
  t.strokes.forEach((s, order) => {
    if (s.path.page !== page || elapsedMs <= s.startMs || (s.erasedMs !== null && elapsedMs >= s.erasedMs)) return;
    const progress = s.endMs <= s.startMs ? 1 : Math.min(1, (elapsedMs - s.startMs) / (s.endMs - s.startMs));
    out.push({ path: s.path, progress, order });
  });
  out.sort((a, b) => LAYERS[a.path.layer] - LAYERS[b.path.layer] || a.path.order - b.path.order || a.order - b.order);
  return out.map(({ path, progress }) => ({ path, progress }));
}

/**
 * The finished board at once, from the core's paths (a reload or a saved board): the strokes on `page` (the page in
 * `boardView`), in the same paint order as a frame.
 */
export function finishedFrame(paths: readonly BoardPath[], page: number): FrameStroke[] {
  return frameAt(timeline([{ drawn: paths.map((p) => ({ ...p, startMs: 0 })), view: { page, target: null } }]), Infinity);
}

/**
 * How to show the drawn part of a stroke: a dash as long as the stroke, moved back by the part not yet drawn (SVG dashing
 * restarts at each subpath, which is why every stroke is its own path). Null for a whole stroke, drawn plainly.
 */
export function reveal(path: BoardPath, progress: number): { dasharray: string; dashoffset: number } | null {
  if (progress >= 1) return null;
  const length = unit(path.length);
  return { dasharray: `${length} ${length}`, dashoffset: unit(path.length * (1 - progress)) };
}
