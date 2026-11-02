// Admin call replay (#334). The board history from #320 owns the playback rules.
import { replayOf } from "@/lib/board-history";
import { fitView, SVG_UNITS } from "@/lib/board-svg";
import type { CallView } from "@/lib/maya-call";

export function callReplay(view: Pick<CallView, "boardHistory" | "transcript" | "outcome">) {
  const replay = replayOf(view.boardHistory);
  const durationMs = Math.max(replay.durationMs, (view.outcome?.seconds ?? 0) * 1000, ...view.transcript.map((l) => l.second * 1000));
  const bounds = fitView(replay.maya.strokes.map((s) => s.path), 0.03).split(" ").map(Number);
  let [left, top] = bounds;
  let right = left + bounds[2], bottom = top + bounds[3];
  for (const e of replay.events) {
    if (e.kind !== "stroke" && e.kind !== "recovered") continue;
    const pad = (e.w / e.boardWidth + 0.03) * SVG_UNITS;
    for (const [x, y] of e.pts) {
      left = Math.min(left, x * SVG_UNITS - pad);
      top = Math.min(top, y * SVG_UNITS - pad);
      right = Math.max(right, x * SVG_UNITS + pad);
      bottom = Math.max(bottom, y * SVG_UNITS + pad);
    }
  }
  return { ...replay, durationMs, viewBox: [left, top, right - left, bottom - top].join(" ") };
}
