// B1 ("shown means shown"): what the child's screen did with each of Maya's board batches, read from the screen's own
// record, for the call. A drawing counts as on the board only when the screen showed it (src/lib/maya/session.ts,
// `boardFate`). Pure: no DOM and no network.
//
// Chat: the desk's board history (src/lib/board-history.ts) records each of Maya's batches as it came: `maya` when it
// went on the board, `skipped` when the board refused it because it would cover the child's ink. Voice: the board log
// the child's screen returns to the worker (src/lib/board-protocol.ts) has a `batch` event for each batch it showed and
// a `cancelled` event for the staged batches it dropped before their cue (the child talked first). A batch the board
// core refused at staging never reaches the log: the worker reports it as skipped. A batch with no record gets no word.
import type { BoardHistory } from "@/lib/board-history";
import type { BoardSnapshot } from "@/lib/board-protocol";

/** What the child's screen did with one of Maya's batches (the same words as BoardFate in the session). */
export type ScreenFate = "shown" | "skipped" | "cancelled";
export interface ScreenFateReport { batchId: string; fate: ScreenFate }

/** The most words a chat request carries: the newest batches (the call ignores words it already has). */
export const CHAT_FATE_LIMIT = 16;

/** Chat: the fate of each of Maya's batches on the desk's board, oldest first, the newest `limit` only. */
export function chatBoardFates(history: BoardHistory, limit = CHAT_FATE_LIMIT): ScreenFateReport[] {
  const out: ScreenFateReport[] = [];
  for (const e of history.events) {
    if ((e.kind !== "maya" && e.kind !== "skipped") || out.some((f) => f.batchId === e.batchId)) continue;
    out.push({ batchId: e.batchId, fate: e.kind === "maya" ? "shown" : "skipped" });
  }
  return out.slice(-limit);
}

/** Voice: the fate of each batch in the board log the child's screen returned. A batch shown and then cancelled is shown. */
export function snapshotFates(snapshot: BoardSnapshot): ScreenFateReport[] {
  const out = new Map<string, ScreenFate>();
  for (const e of snapshot.events) {
    if (e.kind === "batch") out.set(e.batchId, "shown");
    if (e.kind === "cancelled") for (const id of e.batchIds) if (!out.has(id)) out.set(id, "cancelled");
  }
  return [...out].map(([batchId, fate]) => ({ batchId, fate }));
}
