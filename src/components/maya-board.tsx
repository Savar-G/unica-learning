"use client";

// Maya's board on the web (#319, spec #297): her strokes as SVG open paths, drawn one after another as a pen would, or
// the finished board at once (a replay's end, a reload). Every frame comes from the pure playback in
// src/lib/board-svg.ts; this component only keeps the clock and paints. The child's ink is a separate layer (M6).
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { Ink, Rect } from "@/lib/board";
import type { ReplayFrame } from "@/lib/board-history";
import { eraserLine, inkLayers, inkOutline, type InkLayer } from "@/lib/child-ink-svg";
import { BATCH_GAP_MS, frameAt, pathData, reveal, SVG_UNITS, timeline, type PlayStep } from "@/lib/board-svg";
import "./maya-board.css";

/** The box around each object's painted strokes, in SVG units. */
function objectBoxes(strokes: readonly { path: { objectId: string; pts: readonly (readonly [number, number])[]; width: number }; progress: number }[]): Map<string, Rect> {
  const edges = new Map<string, [number, number, number, number]>();
  for (const { path, progress } of strokes) {
    if (progress <= 0) continue;
    const r = path.width / 2;
    const e = edges.get(path.objectId) ?? [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of path.pts) e.splice(0, 4, Math.min(e[0], x - r), Math.min(e[1], y - r), Math.max(e[2], x + r), Math.max(e[3], y + r));
    edges.set(path.objectId, e);
  }
  return new Map([...edges].map(([id, [x0, y0, x1, y1]]) => [id, { x: x0 * SVG_UNITS, y: y0 * SVG_UNITS, w: (x1 - x0) * SVG_UNITS, h: (y1 - y0) * SVG_UNITS }]));
}

const INK: Record<Ink, string> = {
  blue: "var(--board-blue)",
  red: "var(--board-red)",
  green: "var(--board-green)",
  yellow: "var(--board-yellow)",
  black: "var(--board-black)",
};

/**
 * Plays `steps` (batches as the board core applied them, each with the board's view after it) from the start when
 * mounted; give it a new `key` to replay. It shows one board page at a time: the page in view at that moment, as the
 * playback in board-svg.ts decides. `instant`: show the finished board, with no drawing. `shown`: how many of the
 * steps are on the board already (a live call): those show at once and only the later ones draw.
 */
export function MayaBoard({ steps, viewBox, label, instant = false, shown = 0, frame: savedFrame, overlay }: {
  steps: readonly PlayStep[]; viewBox: string; label: string; instant?: boolean; shown?: number; frame?: ReplayFrame;
  /** #1152: drawn over Maya's strokes, with a box (SVG units) around each object painted now. */
  overlay?: (boxes: ReadonlyMap<string, Rect>) => ReactNode;
}) {
  const t = useMemo(() => timeline(steps), [steps]);
  const offset = useMemo(() => (shown <= 0 ? 0 : shown >= steps.length ? Infinity : timeline(steps.slice(0, shown)).durationMs + BATCH_GAP_MS), [steps, shown]);
  // A stroke's shape never changes: its path data is made once, and each frame only moves the dash.
  const shapes = useMemo(() => new Map(steps.flatMap((s) => s.drawn.map((p) => [p.id, pathData(p.pts)] as const))), [steps]);
  const [elapsed, setElapsed] = useState(0);
  const controlled = savedFrame !== undefined;
  useEffect(() => {
    if (controlled || instant || offset === Infinity) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // A frame's time stamp can come slightly before `start`.
      setElapsed(offset + Math.max(0, now - start));
      if (offset + now - start < t.durationMs) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [t, instant, offset, controlled]);

  const strokes = savedFrame?.maya ?? frameAt(t, instant || offset === Infinity ? Infinity : Math.max(elapsed, offset));
  const maskId = useId();
  const child = (savedFrame?.child ?? []).map((s, i) => ({
    key: i, erase: s.erase, width: s.w / s.boardWidth,
    d: s.erase ? eraserLine(s.pts) : inkOutline(s.pts, s.w / s.boardWidth, true),
  }));
  // The same ink outlines and eraser layers as the child's board (#320). Erasers affect only child ink.
  const layer = (ink: InkLayer<(typeof child)[number]>, depth = 0): ReactNode => {
    if (!("under" in ink)) return ink.ink.map((s) => <path key={s.key} d={s.d} fill="var(--ink, #111)" />);
    const id = `${maskId}-${depth}`;
    return <>
      <mask id={id} maskUnits="userSpaceOnUse" x={-1e5} y={-1e5} width={2e5} height={2e5}>
        <rect x={-1e5} y={-1e5} width={2e5} height={2e5} fill="#fff" />
        {ink.erasers.map((s) => <path key={s.key} d={s.d} fill="none" stroke="#000" strokeWidth={s.width * SVG_UNITS} strokeLinecap="round" strokeLinejoin="round" />)}
      </mask>
      <g mask={`url(#${id})`}>{layer(ink.under, depth + 1)}</g>
      {ink.ink.map((s) => <path key={s.key} d={s.d} fill="var(--ink, #111)" />)}
    </>;
  };
  return (
    <svg className="maya-board" viewBox={viewBox} role="img" aria-label={label}>
      {strokes.map(({ path, progress }) => {
        const dash = reveal(path, progress);
        return (
          <path
            key={path.id}
            d={savedFrame ? pathData(path.pts) : shapes.get(path.id) ?? pathData(path.pts)}
            fill="none"
            stroke={INK[path.ink]}
            strokeOpacity={path.opacity}
            strokeWidth={path.width * SVG_UNITS}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dash?.dasharray}
            strokeDashoffset={dash?.dashoffset}
          />
        );
      })}
      {child.length > 0 && <g aria-label="Child's writing">{layer(inkLayers(child))}</g>}
      {overlay?.(objectBoxes(strokes))}
    </svg>
  );
}
