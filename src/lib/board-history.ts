// The history of "Our board" (#320, spec #297): everything Maya wrote and the child drew, in order, with who held the pen.
// One versioned log is the board: a reload restores it from the draft, a replay plays it back, and the old test
// whiteboard recordings (#186) play through the same replay. Pure: no DOM, network, clock or randomness. The caller
// passes the time of each change (ms since the board started) and the draft store (the seam: the browser's storage on
// the desk, the in-memory store in tests).
//
// The pen rules (D-184): one holder at a time. Maya writes only while she holds the pen; the child draws, erases, undoes
// and clears only while the child holds it. The pen passes to the child when Maya has finished writing the question
// (`mayaFinished`); "Take the pen" moves it to the child at any time; giving it back moves it to Maya. A
// stroke that ends after the pen moved to Maya is refused. The child's undo and clear touch the child's ink only, and
// nothing of Maya's ever removes or covers it (the board core's rule).
import { addChildInk, applyBatch, boardView, createScene, type Batch, type BoardPath, type Refusal, type Scene } from "@/lib/board";
import { fitView, frameAt, SVG_UNITS, type FrameStroke, type PlayStep, type Timeline } from "@/lib/board-svg";
import type { BoardSnapshot, PenHolder } from "@/lib/board-protocol";
import type { StrokeRecording, TimedPoint } from "@/lib/strokes";

export type { PenHolder } from "@/lib/board-protocol";

/** One stroke of the child's: points [x, y, t] in board widths and ms since the board started; `w` in CSS pixels. */
export interface InkStroke {
  erase: boolean;
  w: number;
  /** The board's width in CSS pixels when the child drew it: `w` is read against it. */
  boardWidth: number;
  page: number;
  pts: TimedPoint[];
}

/** One thing that happened on the board, in order, with when it happened (ms since the board started). */
export type HistoryEvent =
  | { kind: "maya"; t: number; batchId: string; commands: unknown[] }
  | ({ kind: "stroke" } & InkStroke)
  /**
   * A stroke the child drew while holding the pen in a tab that lost the board before it could save it (R370-5-1),
   * added back at `t` by "Use it here". Its points keep their first times (earlier than `t`): replay shows it whole at
   * `t`. It is valid because of where it came from, not because of who holds the pen at `t`.
   */
  | ({ kind: "recovered"; t: number } & InkStroke)
  | { kind: "undo"; t: number }
  | { kind: "clear"; t: number }
  /**
   * A batch of Maya's that reached this board at `t` and that the board refused where it came (it would have covered the
   * child's ink): it is not on the board. A call's replay keeps it out the same way (R625b-1).
   */
  | { kind: "skipped"; t: number; batchId: string }
  | { kind: "pen"; t: number; to: PenHolder };

/**
 * The board's history. `revision` counts the changes: of two copies of the same board, the one with the higher revision
 * is the newer. Read it only through the functions of this module.
 */
export interface BoardHistory {
  /** Voice calls keep the receiver outcomes, including cancellation and presentation times, with the replay. */
  readonly delivery?: BoardSnapshot;
  readonly v: 1;
  readonly revision: number;
  readonly events: readonly HistoryEvent[];
}

export type Refused = { ok: false; code: "pen_with_maya" | "pen_with_child" | "invalid_stroke" | "nothing_to_undo" | "full"; reason: string } | { ok: false; code: "refused"; reason: string; refusal: Refusal };
export type Change = { ok: true; history: BoardHistory } | Refused;

/** The most strokes and batches one board keeps: about a long lesson of drawing. */
export const MAX_EVENTS = 4000;
/** The most events of any kind: past MAX_EVENTS, only the pen, an undo and a clear still go in, so the board never locks. */
const MAX_LOG = 2 * MAX_EVENTS;
/** The most points one stroke keeps. */
export const MAX_POINTS = 2000;

/** The pen starts with Maya: she writes the question first. */
export const createHistory = (): BoardHistory => ({ v: 1, revision: 0, events: [] });

/** Who holds the pen now. */
export function penHolder(h: BoardHistory): PenHolder {
  const last = h.events.findLast((e) => e.kind === "pen");
  return last?.kind === "pen" ? last.to : "maya";
}

/** True once the pen has moved on this board (to the child or back): Maya's question no longer passes it. */
export const penHasMoved = (h: BoardHistory): boolean => h.events.some((e) => e.kind === "pen");

/** When the last thing happened, in ms since the board started: a replay runs this long. */
export function historyLength(h: BoardHistory): number {
  let end = 0;
  for (const e of h.events) end = Math.max(end, e.kind === "stroke" ? e.pts[e.pts.length - 1][2] : e.t);
  return end;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

function push(h: BoardHistory, event: HistoryEvent): Change {
  const ink = event.kind === "stroke" || event.kind === "recovered" || event.kind === "maya";
  if (h.events.length >= (ink ? MAX_EVENTS : MAX_LOG)) return { ok: false, code: "full", reason: "The board is full. Clear it or start a new question." };
  return { ok: true, history: { v: 1, revision: h.revision + 1, events: [...h.events, event] } };
}

/** A time on the board's clock: whole ms, never before the last event (a clock never runs backwards on the board). */
const at = (h: BoardHistory, t: number) => Math.max(historyLength(h), Number.isFinite(t) ? Math.round(t) : 0);

/** The board both of them see, rebuilt from the log: Maya's batches and every stroke of the child's, in order. */
export function boardScene(h: BoardHistory): Scene {
  return replayScene(h.events) ?? createScene();
}

function replayScene(events: readonly HistoryEvent[]): Scene | null {
  let scene = createScene();
  for (const e of events) {
    if (e.kind === "maya") {
      const r = applyBatch(scene, { transactionId: e.batchId, commands: e.commands });
      if (!r.ok) return null;
      scene = r.scene;
    } else if (e.kind === "stroke" || e.kind === "recovered") {
      try {
        scene = addChildInk(scene, { page: e.page, stroke: { erase: e.erase, w: e.w, pts: e.pts.map(([x, y]) => [x, y]) }, boardWidth: e.boardWidth }).scene;
      } catch {
        return null;
      }
    }
  }
  return scene;
}

/** Maya writes a batch. Only while she holds the pen, and only what the board core accepts. */
export function mayaWrites(h: BoardHistory, batch: Batch, t: number): Change {
  if (penHolder(h) !== "maya") return { ok: false, code: "pen_with_child", reason: "The child has the pen: Maya waits until it comes back." };
  const r = applyBatch(boardScene(h), batch);
  if (!r.ok) return { ok: false, code: "refused", reason: r.refusal.reason, refusal: r.refusal };
  return push(h, { kind: "maya", t: at(h, t), batchId: batch.transactionId, commands: [...batch.commands] });
}

/** A batch of Maya's reached the board at `t`, and the board refused it (`mayaWrites` said no): it is recorded as skipped. */
export const mayaSkipped = (h: BoardHistory, batchId: string, t: number): Change => push(h, { kind: "skipped", t: at(h, t), batchId });

/** Moves the pen. Nothing changes when `to` has it already. */
function movePen(h: BoardHistory, to: PenHolder, t: number): Change {
  if (penHolder(h) === to) return { ok: true, history: h };
  return push(h, { kind: "pen", t: at(h, t), to });
}

/** The child takes the pen ("Take the pen"). */
export const takePen = (h: BoardHistory, t: number): Change => movePen(h, "child", t);

/** The pen goes back to Maya. */
export const givePen = (h: BoardHistory, t: number): Change => movePen(h, "maya", t);

/** When Maya's last stroke on the board is finished, in ms since the board started (0 when she has written nothing). */
export const mayaWritingEnds = (h: BoardHistory): number => replayOf(h).maya.durationMs;

/**
 * Maya has finished writing (D-184, Savar 2026-10-30): the pen passes to the child, as an ordinary pen move. It is logged
 * at `t`, or at the end of her last stroke when `t` is earlier, so a stroke the child began while she was still writing
 * stays refused. Nothing changes when the child has the pen already.
 */
export const mayaFinished = (h: BoardHistory, t: number): Change => movePen(h, "child", Math.max(t, mayaWritingEnds(h)));

const withMaya: Refused = { ok: false, code: "pen_with_maya", reason: "Maya has the pen. Take the pen to write." };

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * A finished stroke of the child's. Refused while Maya holds the pen: also a stroke the child started before the pen
 * moved to her. Its point times are on the board's clock; times before the last event move up to it, in order.
 */
export function drawStroke(h: BoardHistory, stroke: InkStroke): Change {
  if (penHolder(h) !== "child") return withMaya;
  const invalid: Refused = { ok: false, code: "invalid_stroke", reason: "That is not a stroke the board can keep." };
  if (!(stroke.w > 0 && stroke.w <= 100) || !(stroke.boardWidth > 0 && stroke.boardWidth <= 100_000)) return invalid;
  const pts = stroke.pts.filter(([x, y, t]) => finite(x) && finite(y) && finite(t) && Math.abs(x) <= 100 && Math.abs(y) <= 100);
  if (pts.length === 0 || pts.length > MAX_POINTS) return invalid;
  // Begun before the child last took the pen: drawn while Maya held it.
  const taken = h.events.findLast((e) => e.kind === "pen");
  if (taken?.kind === "pen" && Math.round(pts[0][2]) < taken.t) return withMaya;
  const pages = boardScene(h);
  if (!Number.isInteger(stroke.page) || stroke.page < 1) return invalid;
  try {
    addChildInk(pages, { page: stroke.page, stroke: { erase: stroke.erase, w: stroke.w, pts: [] }, boardWidth: stroke.boardWidth });
  } catch {
    return invalid;
  }
  let last = historyLength(h);
  const timed: TimedPoint[] = pts.map(([x, y, t]) => {
    last = Math.max(last, Math.round(t));
    return [round4(x), round4(y), last];
  });
  return push(h, { kind: "stroke", erase: stroke.erase, w: round2(stroke.w), boardWidth: round2(stroke.boardWidth), page: stroke.page, pts: timed });
}

/** The child's ink on the board now: strokes (eraser strokes too, painted in order) after the undos and clears. */
export function childStrokes(h: BoardHistory): InkStroke[] {
  return childAt(h.events, Infinity);
}

/** The child takes back their last stroke. */
export function undo(h: BoardHistory, t: number): Change {
  if (penHolder(h) !== "child") return withMaya;
  if (childStrokes(h).length === 0) return { ok: false, code: "nothing_to_undo", reason: "There is nothing of yours to take back." };
  return push(h, { kind: "undo", t: at(h, t) });
}

/** The child clears their own ink. Maya's work stays. */
export function clear(h: BoardHistory, t: number): Change {
  if (penHolder(h) !== "child") return withMaya;
  if (childStrokes(h).length === 0) return { ok: false, code: "nothing_to_undo", reason: "There is nothing of yours to clear." };
  return push(h, { kind: "clear", t: at(h, t) });
}

// ---------- ink kept by a tab that lost the board ----------

/**
 * A stroke a tab drew but could not save, because another tab took the board (R370-5-1). Only strokes the child began
 * while holding the pen are kept: `penHeld` records it, `startedAt` is the stroke's first time on its own board.
 */
export interface KeptStroke {
  stroke: InkStroke;
  penHeld: true;
  startedAt: number;
}

/** A stroke the child drew holding the pen, as the tab that lost the board keeps it. */
export const keptStroke = (stroke: InkStroke): KeptStroke => ({ stroke, penHeld: true, startedAt: stroke.pts[0]?.[2] ?? 0 });

/**
 * Adds kept strokes back to the board at `t` ("Use it here"), as `recovered` events with their first times: valid
 * because the child drew them holding the pen, whoever holds it now. Each one the board cannot take (no points, a page
 * the board does not have, the board full) is returned in `refused`; the rest are in the history, once each.
 */
export function restoreKept(h: BoardHistory, kept: readonly KeptStroke[], t: number): { history: BoardHistory; refused: KeptStroke[] } {
  let history = h;
  const refused: KeptStroke[] = [];
  for (const k of kept) {
    const s = k.stroke;
    const valid =
      k.penHeld === true &&
      s.w > 0 && s.w <= 100 && s.boardWidth > 0 && s.boardWidth <= 100_000 &&
      s.pts.length > 0 && s.pts.length <= MAX_POINTS &&
      s.pts.every(([x, y, pt], i) => finite(x) && finite(y) && Math.abs(x) <= 100 && Math.abs(y) <= 100 && Number.isInteger(pt) && pt >= 0 && (i === 0 || pt >= s.pts[i - 1][2]));
    if (!valid || !Number.isInteger(s.page) || s.page < 1) {
      refused.push(k);
      continue;
    }
    try {
      addChildInk(boardScene(history), { page: s.page, stroke: { erase: s.erase, w: s.w, pts: [] }, boardWidth: s.boardWidth });
    } catch {
      refused.push(k);
      continue;
    }
    const added = push(history, { kind: "recovered", t: at(history, t), erase: s.erase, w: s.w, boardWidth: s.boardWidth, page: s.page, pts: s.pts.map(([x, y, pt]): TimedPoint => [x, y, pt]) });
    if (added.ok) history = added.history;
    else refused.push(k);
  }
  return { history, refused };
}

// ---------- replay ----------

const startOf = (e: HistoryEvent) => (e.kind === "stroke" ? e.pts[0][2] : e.t);

/** The child's strokes `t` ms after the board started: the stroke in progress up to then, undos and clears done. */
function childAt(events: readonly HistoryEvent[], t: number): InkStroke[] {
  let ink: InkStroke[] = [];
  for (const e of events) {
    if (startOf(e) > t) break;
    if (e.kind === "undo") ink = ink.slice(0, -1);
    else if (e.kind === "clear") ink = [];
    else if (e.kind === "stroke") {
      const drawn = e.pts.findIndex((p) => p[2] > t);
      const { kind, ...stroke } = e;
      void kind;
      ink.push(drawn === -1 ? stroke : { ...stroke, pts: stroke.pts.slice(0, drawn) });
    } else if (e.kind === "recovered") {
      const { kind, t: at, ...stroke } = e;
      void kind;
      void at;
      ink.push(stroke);
    }
  }
  return ink;
}

/** What a saved board shows at one moment of its replay. */
export interface ReplayFrame {
  /** Maya's strokes on the page in view, in paint order, each as far as it is drawn. */
  maya: FrameStroke[];
  /** The child's strokes on the page in view, in the order drawn, each as far as it is drawn. */
  child: InkStroke[];
  pen: PenHolder;
  page: number;
}

/** Maya's batches on one clock: each starts at its event's time, and never before the one before it has finished. */
function mayaTimeline(events: readonly HistoryEvent[]): Timeline {
  const strokes: { path: BoardPath; startMs: number; endMs: number; erasedMs: number | null }[] = [];
  const pages: { fromMs: number; page: number }[] = [{ fromMs: 0, page: 1 }];
  let scene = createScene();
  let end = 0;
  const marks: { fromMs: number; page: number }[] = [];
  for (const e of events) {
    if (e.kind === "stroke" || e.kind === "recovered") {
      try {
        scene = addChildInk(scene, { page: e.page, stroke: { erase: e.erase, w: e.w, pts: e.pts.map(([x, y]) => [x, y]) }, boardWidth: e.boardWidth }).scene;
      } catch {
        // A stroke the log could not keep: it was never added, so the board goes on without it.
      }
      marks.push({ fromMs: startOf(e), page: e.page });
      continue;
    }
    if (e.kind !== "maya") continue;
    const r = applyBatch(scene, { transactionId: e.batchId, commands: e.commands });
    if (!r.ok) continue;
    scene = r.scene;
    const offset = Math.max(e.t, end);
    const erased = new Set(r.erased);
    for (const s of strokes) if (erased.has(s.path.id) && s.erasedMs === null) s.erasedMs = offset;
    for (const p of [...r.drawn].sort((a, b) => a.startMs - b.startMs)) {
      const { startMs, ...path } = p;
      strokes.push({ path, startMs: offset + startMs, endMs: offset + startMs + p.durationMs, erasedMs: null });
      marks.push({ fromMs: offset + startMs, page: p.page });
      end = Math.max(end, offset + startMs + p.durationMs);
    }
    end = Math.max(end, offset);
    // Every accepted batch sets the view, even a focus that draws no new strokes.
    marks.push({ fromMs: end, page: boardView(scene).page });
  }
  // The page in view follows the pen: whoever wrote last, Maya or the child.
  for (const m of marks.sort((a, b) => a.fromMs - b.fromMs)) if (m.page !== pages.at(-1)!.page) pages.push(m);
  return { strokes, pages, durationMs: end };
}

/** A saved board, ready to replay: read frames from it with `replayFrame`. */
export interface Replay {
  readonly events: readonly HistoryEvent[];
  readonly maya: Timeline;
  /** How long the replay runs, in ms: until the last thing happened, or Maya's last stroke is finished. */
  readonly durationMs: number;
}

export function replayOf(h: BoardHistory): Replay {
  const maya = mayaTimeline(h.events);
  return { events: h.events, maya, durationMs: Math.max(maya.durationMs, historyLength(h)) };
}

/** The board `t` ms into its replay. Infinity: the board as it was left. */
export function replayFrame(r: Replay, t: number): ReplayFrame {
  const page = (r.maya.pages.findLast((p) => p.fromMs <= t) ?? r.maya.pages[0]).page;
  const pen = r.events.filter((e) => e.kind === "pen" && e.t <= t).at(-1);
  return {
    maya: frameAt(r.maya, t).filter((s) => s.path.page === page),
    child: childAt(r.events, t).filter((s) => s.page === page),
    pen: pen?.kind === "pen" ? pen.to : "maya",
    page,
  };
}

/**
 * An old test whiteboard recording (#186) as a board history: the child's strokes, undos and clears with their times,
 * on page 1 of a board the child held the pen of. Its replay shows what the admin's stroke replay shows (`boardAt`).
 */
export function historyFromRecording(rec: StrokeRecording): BoardHistory {
  const events: HistoryEvent[] = [{ kind: "pen", t: 0, to: "child" }];
  for (const e of rec.events) {
    if (e.kind === "stroke") events.push({ kind: "stroke", erase: e.erase, w: e.w, boardWidth: rec.width, page: 1, pts: e.pts });
    else events.push({ kind: e.kind, t: e.t });
  }
  return { v: 1, revision: events.length, events };
}

/**
 * Maya's batches as the board core drew them on this board, in order, each with the view after it (a chat's board,
 * #534): the child's ink before a batch is on the board when it is laid out, so her writing keeps clear of it as it does
 * in the replay. A batch the board core refuses is left out.
 */
export function mayaSteps(h: BoardHistory): PlayStep[] {
  let scene = createScene();
  const steps: PlayStep[] = [];
  for (const e of h.events) {
    if (e.kind === "maya") {
      const r = applyBatch(scene, { transactionId: e.batchId, commands: e.commands });
      if (!r.ok) continue;
      scene = r.scene;
      steps.push({ drawn: r.drawn, erased: r.erased, view: boardView(r.scene) });
    } else if (e.kind === "stroke" || e.kind === "recovered") {
      try {
        scene = addChildInk(scene, { page: e.page, stroke: { erase: e.erase, w: e.w, pts: e.pts.map(([x, y]) => [x, y]) }, boardWidth: e.boardWidth }).scene;
      } catch {
        // A stroke the board could not keep: it was never added.
      }
    }
  }
  return steps;
}

/**
 * The SVG view of a chat's board (R625b-6): Maya's work and the child's ink, with room around them (`pad`, in board
 * widths), so a line the child drew before her reply stays in sight when her work comes. The whole board when there is
 * nothing on it.
 */
export function chatBoardView(h: BoardHistory, pad = 0.06): string {
  const [x, y, w, height] = fitView(mayaSteps(h).flatMap((s) => s.drawn), pad).split(" ").map(Number);
  let [left, top, right, bottom] = [x, y, x + w, y + height];
  for (const s of childStrokes(h)) {
    if (s.erase) continue;
    const room = (s.w / s.boardWidth + pad) * SVG_UNITS;
    for (const [px, py] of s.pts) {
      left = Math.min(left, px * SVG_UNITS - room);
      top = Math.min(top, py * SVG_UNITS - room);
      right = Math.max(right, px * SVG_UNITS + room);
      bottom = Math.max(bottom, py * SVG_UNITS + room);
    }
  }
  return [left, top, right - left, bottom - top].map((n) => Math.round(n * 10) / 10).join(" ");
}

/** An event with each of its times passed through `at`, which keeps their order. */
function timed(e: HistoryEvent, at: (t: number) => number): HistoryEvent {
  if (e.kind === "stroke") return { ...e, pts: e.pts.map(([x, y, t]): TimedPoint => [x, y, at(t)]) };
  if (e.kind === "recovered") return { ...e, t: at(e.t), pts: e.pts.map(([x, y, t]): TimedPoint => [x, y, at(t)]) };
  return { ...e, t: at(e.t) };
}

/** The child's side of a board: everything that is not Maya's batches. */
const childSide = (e: HistoryEvent) => e.kind !== "maya" && e.kind !== "skipped";

/**
 * A call's board with the child's ink (#534): Maya's batches as the call recorded them (`call`, their commands), and the
 * child's strokes, undos, clears and pen moves from the desk's copy of the board (`desk`).
 *
 * The desk's copy decides where each batch came among the child's events (R625b-1), for the batches it reports in the
 * call's order (R635-5); the call's other batches come after them by the call's times. Whether a batch is drawn is the
 * replay's to say: a batch that would cover the child's ink there is left out (`refusedBatches`), whatever the desk
 * reported. Times: the desk's clock is moved onto the call's by the
 * first batch both hold; a batch shows when it reached the desk, never before the call recorded it; the child's times
 * stay inside the call (from 0 to `endMs`) and between the batches they came between (R625-3). Batches in the desk's
 * copy that the call never recorded are not taken. The child's ink is always kept (R625-1).
 */
export function withChildInk(call: BoardHistory, desk: BoardHistory | null, options: { endMs?: number } = {}): BoardHistory {
  if (!desk || !desk.events.some(childSide)) return call;
  const recorded = new Map(call.events.flatMap((e) => (e.kind === "maya" ? [[e.batchId, e] as const] : [])));
  // The desk reports each batch once, in the call's order (R635-5): a report out of that order is not taken, and its
  // batch comes in by the call's time with the ones the desk never received.
  const order = call.events.flatMap((e) => (e.kind === "maya" ? [e.batchId] : []));
  const taken = new Set<HistoryEvent>();
  for (const e of desk.events) if ((e.kind === "maya" || e.kind === "skipped") && e.batchId === order[taken.size]) taken.add(e);
  const delivered = (e: HistoryEvent): e is Extract<HistoryEvent, { kind: "maya" | "skipped" }> => taken.has(e);
  const anchor = desk.events.find(delivered);
  const by = anchor ? recorded.get(anchor.batchId)!.t - anchor.t : 0;
  const end = Math.max(options.endMs ?? Infinity, historyLength(call));
  const inCall = (t: number) => Math.min(end, Math.max(0, Math.round(t + by)));
  // The desk's events up to its last batch, in its order; then the rest of its events with the call's batches it never
  // received, by time (the child's side first at the same time: the desk moves the pen to Maya before she writes).
  const lastDelivered = desk.events.findLastIndex(delivered);
  const seen = new Set(desk.events.filter(delivered).map((e) => e.batchId));
  type Item = { e: HistoryEvent; maya: boolean };
  const asDelivered = (e: Extract<HistoryEvent, { kind: "maya" | "skipped" }>): Item => {
    const r = recorded.get(e.batchId)!;
    const t = Math.min(end, Math.max(r.t, inCall(e.t)));
    // Drawn or not is the replay's to say, from the call's own batch on the board as it stands (R635-5).
    return { e: { ...r, t }, maya: true };
  };
  const ordered: Item[] = [];
  desk.events.slice(0, lastDelivered + 1).forEach((e) => {
    if (delivered(e)) ordered.push(asDelivered(e));
    else if (childSide(e)) ordered.push({ e: timed(e, inCall), maya: false });
  });
  const rest = [
    ...desk.events.slice(lastDelivered + 1).filter(childSide).map((e, i) => ({ e: timed(e, inCall), maya: false, side: 1, i })),
    ...call.events.filter((e) => e.kind === "maya" && !seen.has(e.batchId)).map((e, i) => ({ e, maya: true, side: 0, i })),
  ].sort((a, b) => startOf(a.e) - startOf(b.e) || b.side - a.side || a.i - b.i);
  ordered.push(...rest);
  // Maya's times only go forward; each child event stays after the event before it and before Maya's next batch.
  let mayaAt = 0;
  for (const item of ordered) {
    if (!item.maya) continue;
    const t = Math.max(mayaAt, (item.e as { t: number }).t);
    if (t !== (item.e as { t: number }).t) item.e = { ...item.e, t } as HistoryEvent;
    mayaAt = t;
  }
  const nextMaya: number[] = [];
  let next = Infinity;
  for (let i = ordered.length - 1; i >= 0; i--) {
    nextMaya[i] = next;
    if (ordered[i].maya) next = (ordered[i].e as { t: number }).t;
  }
  const events: HistoryEvent[] = [];
  let last = 0;
  ordered.forEach(({ e, maya }, i) => {
    const kept = maya ? e : timed(e, (t) => Math.min(Math.max(last, nextMaya[i]), Math.max(last, t)));
    events.push(kept);
    last = kept.kind === "stroke" ? kept.pts[kept.pts.length - 1][2] : kept.t;
  });
  const childCount = desk.events.filter(childSide).length;
  return readHistory(JSON.parse(encodeHistory({ v: 1, revision: call.revision + childCount, events }))) ?? call;
}

/**
 * Maya's batches in a history that are not on its board: those the board refused where they came (`skipped`, R625b-1),
 * and those that do not draw where they stand when replayed. In order.
 */
export function refusedBatches(h: BoardHistory): string[] {
  let scene = createScene();
  const refused: string[] = [];
  for (const e of h.events) {
    if (e.kind === "skipped") refused.push(e.batchId);
    else if (e.kind === "maya") {
      const r = applyBatch(scene, { transactionId: e.batchId, commands: e.commands });
      if (r.ok) scene = r.scene;
      else refused.push(e.batchId);
    } else if (e.kind === "stroke" || e.kind === "recovered") {
      try {
        scene = addChildInk(scene, { page: e.page, stroke: { erase: e.erase, w: e.w, pts: e.pts.map(([x, y]) => [x, y]) }, boardWidth: e.boardWidth }).scene;
      } catch {
        // A stroke the board could not keep: it was never added.
      }
    }
  }
  return refused;
}


// ---------- the child's ink as an event log (#635) ----------

/**
 * One event of a chat board's ink log: the child's events as the board keeps them, and each of Maya's batches as it
 * reached the board (`delivered`, by its id only: her commands come from the call's own record). The log of a board is
 * append-only, so an event's place in it (from 1) is its sequence number, the same on every copy.
 */
export type InkEvent = Exclude<HistoryEvent, { kind: "maya" | "skipped" }> | { kind: "delivered"; t: number; batchId: string };

/** The ink log of a board: every event, Maya's batches as deliveries. */
export function inkLog(h: BoardHistory): InkEvent[] {
  return h.events.map((e): InkEvent => (e.kind === "maya" || e.kind === "skipped" ? { kind: "delivered", t: e.t, batchId: e.batchId } : e));
}

/** An ink event read from plain data (a desk's request, a stored row), or null when it is not one. */
export function readInkEvent(raw: unknown): InkEvent | null {
  if (isRecord(raw) && raw.kind === "delivered") return isTime(raw.t) && typeof raw.batchId === "string" && raw.batchId.length <= 200 ? { kind: "delivered", t: raw.t, batchId: raw.batchId } : null;
  const e = readEvent(raw);
  return e && e.kind !== "maya" && e.kind !== "skipped" ? e : null;
}

/** A log as a board's events: each delivery as Maya's batch from `batches` where the board core takes it, else skipped. */
function logEvents(log: readonly InkEvent[], batches: ReadonlyMap<string, Batch>): HistoryEvent[] {
  let scene = createScene();
  const events: HistoryEvent[] = [];
  // A line drawn on a board that fell behind has an earlier time than the event before it (R639-2): it moves up.
  let last = 0;
  for (const raw of log) {
    const by = last - (raw.kind === "delivered" ? raw.t : startOf(raw));
    const e: InkEvent = by <= 0 ? raw : raw.kind === "delivered" ? { ...raw, t: last } : (timed(raw, (t) => t + by) as InkEvent);
    last = e.kind === "stroke" ? e.pts[e.pts.length - 1][2] : e.t;
    if (e.kind !== "delivered") {
      events.push(e);
      if (e.kind === "stroke" || e.kind === "recovered") {
        try {
          scene = addChildInk(scene, { page: e.page, stroke: { erase: e.erase, w: e.w, pts: e.pts.map(([x, y]) => [x, y]) }, boardWidth: e.boardWidth }).scene;
        } catch {
          // A stroke the board could not keep: it was never added.
        }
      }
      continue;
    }
    const batch = batches.get(e.batchId);
    const r = batch ? applyBatch(scene, batch) : null;
    if (r?.ok && batch) {
      scene = r.scene;
      events.push({ kind: "maya", t: e.t, batchId: e.batchId, commands: [...batch.commands] });
    } else events.push({ kind: "skipped", t: e.t, batchId: e.batchId });
  }
  return events;
}

/**
 * A chat's board rebuilt from its ink log (R635-3): the same events, with Maya's commands from `batches` (the chat's
 * own), so a clear, an eraser and a redraw stay as they were. Null when the log is not a board's (out of time order).
 */
export function historyFromLog(log: readonly InkEvent[], batches: readonly Batch[]): BoardHistory | null {
  const events = logEvents(log, new Map(batches.map((b) => [b.transactionId, b])));
  return decodeHistory(encodeHistory({ v: 1, revision: events.length, events }));
}

/** A stroke apart from when it was drawn: a board built from a log can move a stroke's times, never what it drew. */
const strokeIdentity = (s: InkStroke): string => JSON.stringify([s.page, s.erase, s.w, s.boardWidth, s.pts.map(([x, y]) => [x, y])]);
/**
 * What an ink event is, apart from its time (R639b-1): `historyFromLog` moves up an event that overlaps the one before it,
 * so the same event can come back with another time. Events that look alike (a second clear) are told apart by place.
 */
const inkIdentity = (e: InkEvent): string => {
  if (e.kind === "stroke" || e.kind === "recovered") return `ink:${strokeIdentity(e)}`;
  if (e.kind === "delivered") return `delivered:${e.batchId}`;
  return e.kind === "pen" ? `pen:${e.to}` : e.kind;
};
/** How far two logs are the same, from the first event. `null`: only the call has that event, so it counts as the same. */
const sharedInk = (a: readonly (InkEvent | null)[], b: readonly InkEvent[]): number => {
  let n = 0;
  while (n < a.length && n < b.length && (a[n] === null || a[n] === b[n] || inkIdentity(a[n] as InkEvent) === inkIdentity(b[n]))) n++;
  return n;
};
/** Of `items`, those past what `held` already has: each thing `held` has counts once, so a real repeat stays. */
function notHeld<T>(items: readonly T[], held: readonly string[], identity: (item: T) => string): T[] {
  const counts = new Map<string, number>();
  for (const id of held) counts.set(id, (counts.get(id) ?? 0) + 1);
  return items.filter((item) => {
    const id = identity(item);
    const left = counts.get(id) ?? 0;
    if (left === 0) return true;
    counts.set(id, left - 1);
    return false;
  });
}

/**
 * A log with what a board holds now (R639-1, R639-2). A sequence once given is never given to another event, because the
 * call keeps the first event at each sequence: a board that goes on from the log becomes the log; a shorter one changes
 * nothing; the new events of a board that went another way go at the end, once each. Events are the same by what they are,
 * not when (R639b-1), so a log read back with a moved time adds nothing.
 */
export function growInkLog<T extends InkEvent | null>(log: T[], board: InkEvent[]): (T | InkEvent)[] {
  const shared = sharedInk(log, board);
  if (shared === log.length) return board;
  if (shared === board.length) return log;
  const after = log.slice(shared).flatMap((e) => (e ? [inkIdentity(e)] : []));
  return [...log, ...notHeld(board.slice(shared), after, inkIdentity)];
}

/**
 * The board a chat picked up again starts from (R639-2): the board from the call's log and the ink waiting on the device
 * (`call`), or this device's draft (`draft`), whichever holds the other. A draft a failed storage write left behind never
 * beats the call. A draft that went another way adds back only its own lines, after all that the call holds.
 */
export function startingChatBoard(call: BoardHistory | null, draft: BoardHistory | null): BoardHistory | null {
  if (!call || !draft) return call ?? draft;
  const held = inkLog(call);
  const device = inkLog(draft);
  const shared = sharedInk(held, device);
  if (shared === held.length) return draft;
  if (shared === device.length) return call;
  const own = notHeld(childStrokes(draft), childStrokes(call).map(strokeIdentity), strokeIdentity);
  return restoreKept(call, own.map(keptStroke), historyLength(call) + 1).history;
}

/** Whether `h` holds all of `other`'s log, in order: on a chat's board, nothing is lost by showing `h` in its place. */
export const holdsInk = (h: BoardHistory, other: BoardHistory): boolean => {
  const theirs = inkLog(other);
  return sharedInk(theirs, inkLog(h)) === theirs.length;
};

/** A call's board with the child's ink log (#635): `withChildInk` with the log as the desk's copy. */
export function withInkLog(call: BoardHistory, log: readonly InkEvent[], options: { endMs?: number } = {}): BoardHistory {
  // A delivery stands in the desk's copy as a batch that reached the board; the merge takes the commands from the call.
  const events = log.map((e): HistoryEvent => (e.kind === "delivered" ? { kind: "skipped", t: e.t, batchId: e.batchId } : e));
  return withChildInk(call, { v: 1, revision: events.length, events }, options);
}

/**
 * When a chat board's view is taken again (R635-6): when Maya writes, and when ink comes onto the board from elsewhere
 * (added back after "Use it here", or carried over), never while the child draws under their own pen.
 */
export const chatViewKey = (h: BoardHistory): string =>
  h.events.flatMap((e) => (e.kind === "maya" || e.kind === "skipped" ? [e.batchId] : e.kind === "recovered" ? [`ink@${e.t}`] : [])).join("\n");

// ---------- the saved copy ----------

export const encodeHistory = (h: BoardHistory): string => JSON.stringify({ v: h.v, revision: h.revision, events: h.events });

const isRecord = (raw: unknown): raw is Record<string, unknown> => typeof raw === "object" && raw !== null && !Array.isArray(raw);
const isTime = (t: unknown): t is number => Number.isInteger(t) && (t as number) >= 0;

function readEvent(raw: unknown): HistoryEvent | null {
  if (!isRecord(raw)) return null;
  switch (raw.kind) {
    case "undo":
    case "clear":
      return isTime(raw.t) ? { kind: raw.kind, t: raw.t } : null;
    case "pen":
      return isTime(raw.t) && (raw.to === "maya" || raw.to === "child") ? { kind: "pen", t: raw.t, to: raw.to } : null;
    case "skipped":
      return isTime(raw.t) && typeof raw.batchId === "string" ? { kind: "skipped", t: raw.t, batchId: raw.batchId } : null;
    case "maya":
      return isTime(raw.t) && typeof raw.batchId === "string" && Array.isArray(raw.commands) ? { kind: "maya", t: raw.t, batchId: raw.batchId, commands: raw.commands } : null;
    case "recovered":
    case "stroke": {
      const { erase, w, boardWidth, page, pts } = raw;
      if (typeof erase !== "boolean" || !finite(w) || !(w > 0 && w <= 100) || !finite(boardWidth) || !(boardWidth > 0 && boardWidth <= 100_000)) return null;
      if (!Number.isInteger(page) || (page as number) < 1 || !Array.isArray(pts) || pts.length === 0 || pts.length > MAX_POINTS) return null;
      const out: TimedPoint[] = [];
      for (const p of pts) {
        if (!Array.isArray(p) || p.length !== 3 || !finite(p[0]) || !finite(p[1]) || Math.abs(p[0]) > 100 || Math.abs(p[1]) > 100 || !isTime(p[2])) return null;
        out.push([p[0], p[1], p[2]]);
      }
      const stroke = { erase, w, boardWidth, page: page as number, pts: out };
      if (raw.kind === "stroke") return { kind: "stroke", ...stroke };
      return isTime(raw.t) ? { kind: "recovered", t: raw.t, ...stroke } : null;
    }
    default:
      return null;
  }
}

/**
 * A saved copy read back, or null when it is not a board history: the version, the revision, and events that are in
 * time order and replay on an empty board.
 */
export function decodeHistory(raw: string | null): BoardHistory | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const read = readHistory(data);
  return read && replayScene(read.events) ? read : null;
}

/** A board history read from plain data: the version, the revision, and events in time order. It may not replay. */
function readHistory(data: unknown): BoardHistory | null {
  if (!isRecord(data) || data.v !== 1 || !Number.isInteger(data.revision) || (data.revision as number) < 0 || !Array.isArray(data.events) || data.events.length > MAX_LOG) return null;
  const events: HistoryEvent[] = [];
  let last = 0;
  for (const raw of data.events) {
    const e = readEvent(raw);
    if (!e || startOf(e) < last) return null;
    last = e.kind === "stroke" ? e.pts[e.pts.length - 1][2] : e.t;
    if ((e.kind === "stroke" || e.kind === "recovered") && e.pts.some(([, , t], i) => i > 0 && t < e.pts[i - 1][2])) return null;
    events.push(e);
  }
  return { v: 1, revision: data.revision as number, events };
}

/** Of the copies of one board, the newest that reads back (the highest revision; the first on a tie), or null. */
export function newestHistory(copies: readonly (string | null)[]): BoardHistory | null {
  let best: BoardHistory | null = null;
  for (const c of copies) {
    const h = decodeHistory(c);
    if (h && (!best || h.revision > best.revision)) best = h;
  }
  return best;
}

// ---------- the draft ----------

/**
 * Where the board's draft is kept: the seam. The desk keeps it in the browser's storage; tests use the in-memory store
 * (src/lib/board-history-memory.ts). `write` returns false when the store is full or off: the board is still on screen.
 * Only the tab that holds the board writes its draft (src/lib/board-tab.ts).
 */
export interface DraftStore {
  read(key: string): string | null;
  write(key: string, value: string): boolean;
  remove(key: string): void;
  keys(): string[];
}

/** Every board draft starts with this. */
export const BOARD_DRAFT_ROOT = "unica-board:";
/** The draft of the board for one question of one workbook page. */
export const boardDraftKey = (book: string, page: number, question: number | null) => `${BOARD_DRAFT_ROOT}${book}:${page}:${question ?? "none"}`;
/** The draft of a chat's board (#534), by the chat's id. */
export const chatBoardKey = (chatId: string) => `${BOARD_DRAFT_ROOT}chat:${chatId}`;
/** A board open in a tab says so under this key, with the time it last said it (`markOpen`). */
export const OPEN_ROOT = "unica-board-open:";
/** The board drafts a device keeps: past this, drafts not touched in RECENT_MS and not open in a tab go, oldest first. */
export const MAX_DRAFTS = 30;
/** Past this, the oldest drafts go even when recent; a board open in a tab never goes. */
export const HARD_MAX_DRAFTS = 60;
export const RECENT_MS = 24 * 60 * 60_000;
/** An open board says so every minute: one not heard from in this long is closed. */
export const OPEN_MS = 5 * 60_000;

const STAMP = "@";

const stampOf = (raw: string | null) => Number(raw?.split(STAMP, 1)[0]) || 0;

function decodeDraft(raw: string | null): BoardHistory | null {
  if (!raw) return null;
  const cut = raw.indexOf(STAMP);
  return cut < 0 ? null : decodeHistory(raw.slice(cut + 1));
}

/** The board's draft, or null when there is none or it does not read back (then the board starts again). */
export const loadDraft = (store: DraftStore, key: string): BoardHistory | null => decodeDraft(store.read(key));

/** The tab has this board open at `now` (ms, Date.now()): its draft is not evicted while it says so. */
export function markOpen(store: DraftStore, key: string, now: number): void {
  store.write(`${OPEN_ROOT}${key}`, String(Math.round(now)));
}

/** The tab closed this board. */
export const markClosed = (store: DraftStore, key: string): void => store.remove(`${OPEN_ROOT}${key}`);

/** Makes room for `key`: evicts old drafts that no tab has open, never past what the two caps ask. */
function evict(store: DraftStore, key: string, now: number): void {
  const keys = store.keys();
  const open = (k: string) => now - (Number(store.read(`${OPEN_ROOT}${k}`)) || 0) < OPEN_MS;
  const drafts = keys
    .filter((k) => k.startsWith(BOARD_DRAFT_ROOT) && k !== key)
    .map((k) => ({ k, stamp: stampOf(store.read(k)), open: open(k) }))
    .filter((d) => !d.open)
    .sort((a, b) => a.stamp - b.stamp);
  let total = keys.filter((k) => k.startsWith(BOARD_DRAFT_ROOT) && k !== key).length + 1;
  const drop = (k: string) => {
    store.remove(k);
    store.remove(`${OPEN_ROOT}${k}`);
    total--;
  };
  for (const d of drafts.filter((d) => now - d.stamp >= RECENT_MS)) if (total > MAX_DRAFTS) drop(d.k);
  for (const d of drafts) if (total > HARD_MAX_DRAFTS && store.read(d.k) !== null) drop(d.k);
  // Open marks left by tabs that closed without saying so, for drafts that are gone.
  for (const k of keys) if (k.startsWith(OPEN_ROOT) && !open(k.slice(OPEN_ROOT.length)) && store.read(k.slice(OPEN_ROOT.length)) === null) store.remove(k);
}

/**
 * What a save did. `saved`: the store holds this tab's board. `reload`: the store held something else than the board this
 * tab last loaded or saved; nothing was written, and the tab shows the stored board (`history`, null when there is none
 * that reads back). `failed`: the store is full or off.
 */
export type SaveResult = { status: "saved"; history: BoardHistory } | { status: "reload"; history: BoardHistory | null } | { status: "failed" };

/**
 * Saves the board's draft, stamped with `now` (ms, Date.now()). Only the tab holding the board calls it
 * (src/lib/board-tab.ts); the check here is the safety net: `base` is the board this tab last loaded or saved (null when
 * nothing was stored), and the save writes only when the store still holds exactly that, or nothing that reads back. On
 * any other difference it writes nothing and returns the stored board to show. After writing it reads the draft back; a different value is a reload
 * too. Makes room by evicting old drafts (`evict`). An empty board removes its draft.
 */
export function saveDraft(store: DraftStore, key: string, h: BoardHistory, base: BoardHistory | null, now: number): SaveResult {
  const held = loadDraft(store, key);
  // Nothing stored that reads back (none yet, or a broken draft) loses nothing when written over.
  if (held && (!base || encodeHistory(held) !== encodeHistory(base))) return { status: "reload", history: held };
  if (h.events.length === 0) {
    store.remove(key);
    return { status: "saved", history: h };
  }
  evict(store, key, now);
  const value = `${Math.round(now)}${STAMP}${encodeHistory(h)}`;
  if (!store.write(key, value)) return { status: "failed" };
  if (store.read(key) !== value) return { status: "reload", history: loadDraft(store, key) };
  return { status: "saved", history: h };
}
