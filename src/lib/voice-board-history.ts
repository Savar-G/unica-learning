import type { BoardHistory, HistoryEvent } from "@/lib/board-history";
import { restoreScene, type BoardSnapshot } from "@/lib/board-protocol";

/** A voice replay contains receiver observations. Accepted controller plans stay in the teaching trace. */
export function voiceBoardHistory(snapshot: BoardSnapshot, start: number, receivedAt: number, previous?: BoardHistory | null): BoardHistory {
  const events = snapshot.events.map((e, i) => ({ ...structuredClone(e), at: e.at ?? previous?.delivery?.events[i]?.at ?? receivedAt }));
  const prior = previous?.delivery?.events ?? [];
  if (events.length < prior.length || prior.some((e, i) => JSON.stringify(e) !== JSON.stringify(events[i]))) throw new Error("The observed board history cannot be replaced.");
  if (!restoreScene({ events })) throw new Error("The observed board does not replay.");
  const history: HistoryEvent[] = [];
  let t = 0;
  for (const e of events) {
    t = Math.max(t, e.at - start, 0);
    if (e.kind === "batch") history.push({ kind: "maya", t, batchId: e.batchId, commands: structuredClone(e.commands) });
    if (e.kind === "ink") history.push({ kind: "recovered", t, page: e.page, erase: e.stroke.erase, w: e.stroke.w,
      boardWidth: e.boardWidth, pts: e.stroke.pts.map(([x, y]) => [x, y, t]) });
  }
  return { v: 1, revision: history.length, events: history, delivery: { events } };
}
