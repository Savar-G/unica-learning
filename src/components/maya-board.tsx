"use client";

// Maya's board on the web (#319, spec #297): her strokes as SVG open paths, drawn one after another as a pen would, or
// the finished board at once (a replay's end, a reload). Every frame comes from the pure playback in
// src/lib/board-svg.ts; this component only keeps the clock and paints. The child's ink is a separate layer (M6).
import { useEffect, useMemo, useState } from "react";
import type { Ink } from "@/lib/board";
import { frameAt, pathData, reveal, SVG_UNITS, timeline, type PlayStep } from "@/lib/board-svg";
import "./maya-board.css";

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
 * playback in board-svg.ts decides. `instant`: show the finished board, with no drawing.
 */
export function MayaBoard({ steps, viewBox, label, instant = false }: { steps: readonly PlayStep[]; viewBox: string; label: string; instant?: boolean }) {
  const t = useMemo(() => timeline(steps), [steps]);
  // A stroke's shape never changes: its path data is made once, and each frame only moves the dash.
  const shapes = useMemo(() => new Map(steps.flatMap((s) => s.drawn.map((p) => [p.id, pathData(p.pts)] as const))), [steps]);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (instant) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // A frame's time stamp can come slightly before `start`.
      setElapsed(Math.max(0, now - start));
      if (now - start < t.durationMs) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [t, instant]);

  const strokes = frameAt(t, instant ? Infinity : elapsed);
  return (
    <svg className="maya-board" viewBox={viewBox} role="img" aria-label={label}>
      {strokes.map(({ path, progress }) => {
        const dash = reveal(path, progress);
        return (
          <path
            key={path.id}
            d={shapes.get(path.id)}
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
    </svg>
  );
}
