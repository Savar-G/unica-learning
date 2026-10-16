// The whiteboard strokes (#186, spec #181): every stroke the child drew on a question, with its undos and clears, as
// vectors with times since the question was shown, so an admin can replay how the child worked. The drawing (PNG)
// stays the record for the parent report and the AI review. Strokes are for admins only: the answer route stores them
// as a JSON file in the private bucket (src/lib/test-attempt.ts), never in the report or the copy without names.
// Pure: no DOM, network or clock. The browser builds the recording when the child presses Next (src/components/test.tsx),
// the server checks it (src/lib/work-payload.ts), and the admin replay reads it (src/components/stroke-replay.tsx).
import type { BoardEvent } from "@/lib/whiteboard";

/** One point: x and y in board widths from the top-left corner (as the board keeps them), t in ms since the question was shown. */
export type TimedPoint = [x: number, y: number, t: number];

/** One thing the child did, in order: a stroke (an eraser stroke clears what is under it), an undo, or a clear. */
export type StrokeEvent =
  | { kind: "stroke"; erase: boolean; w: number; pts: TimedPoint[] }
  | { kind: "undo"; t: number }
  | { kind: "clear"; t: number };

/** The strokes of one answer, as stored. */
export interface StrokeRecording {
  v: 1;
  /** The board's size in CSS pixels when the child answered. Line widths `w` are in these pixels. */
  width: number;
  height: number;
  events: StrokeEvent[];
}

/** A time is never later than this: a test closes 24 hours after its last answer (#72). */
export const STROKE_TIME_MAX_MS = 24 * 60 * 60_000;

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The recording of a question's board, from its log, or null when the child drew no stroke. `shownAt` is when the
 * question appeared, on the clock of the log's times (performance.now()). Times are whole milliseconds that never run
 * backwards; a stroke the draft kept from before a resume shows at the start. Points that are not numbers are dropped.
 */
export function recordStrokes(log: readonly BoardEvent[], shownAt: number, size: { width: number; height: number }): StrokeRecording | null {
  let last = 0;
  const since = (at: number) => {
    const t = Number.isFinite(at) ? Math.min(STROKE_TIME_MAX_MS, Math.max(0, Math.round(at - shownAt))) : last;
    last = Math.max(last, t);
    return last;
  };
  const events: StrokeEvent[] = [];
  for (const e of log) {
    if (e.kind !== "stroke") {
      events.push({ kind: e.kind, t: since(e.at) });
      continue;
    }
    const pts: TimedPoint[] = [];
    e.stroke.pts.forEach(([x, y], i) => {
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push([round4(x), round4(y), e.times ? since(e.times[i]) : last]);
    });
    if (pts.length > 0 && e.stroke.w > 0) events.push({ kind: "stroke", erase: e.stroke.erase, w: round2(Math.min(e.stroke.w, 100)), pts });
  }
  if (!events.some((e) => e.kind === "stroke")) return null;
  const width = size.width > 0 ? Math.round(size.width) : 800;
  const height = size.height > 0 ? Math.round(size.height) : Math.round(width * 0.75);
  return { v: 1, width, height, events };
}
