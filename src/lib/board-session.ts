// One tab's session on "Our board" (#320, review R370-4-1 and R370-4-2): the board on screen, the stroke in progress,
// whether this tab holds the board, and the ink it drew but could not save. Pure: no DOM; the caller passes the clocks
// and forwards the pointer, the buttons and the board tab's news (src/lib/board-tab.ts). The board component
// (src/components/our-board.tsx) only forwards events and paints `view()`.
//
// One choke point: every way out of holding the board goes through `endHolding(reason)`. It first ends the stroke in
// progress as if the pointer went up. Then, if this tab still owns the board (a hand-over it answers, leaving the page,
// closing the board), it saves; if it no longer does (another tab forced the board away, or the lease is gone), it
// writes nothing and keeps the ink this tab has not saved, with a note, until "Use it here" adds it back. A stroke
// always ends up in exactly one place: stored, or kept. Nothing else clears a stroke in progress.
import {
  childStrokes,
  clear,
  drawStroke,
  givePen,
  historyLength,
  mayaFinished,
  mayaWritingEnds,
  penHasMoved,
  penHolder,
  takePen,
  undo,
  type BoardHistory,
  type Change,
  type InkStroke,
} from "@/lib/board-history";
import type { BoardTab, TabRole } from "@/lib/board-tab";
import { addPoint, capturedPoints, startCapture, type Capture } from "@/lib/child-ink-svg";
import type { TimedPoint } from "@/lib/strokes";

/** What the board tells the child. */
export type SessionNote =
  /** A stroke while Maya holds the pen. */
  | "pen_with_maya"
  /** A stroke on a board another tab holds. */
  | "elsewhere"
  /** Another tab took the board while this one had ink it had not saved: the ink stays here. */
  | "moved"
  /** The stored board was not the one this tab last saved: it shows the stored board now. */
  | "other_tab"
  /** A stroke the board could not keep. */
  | "lost_line"
  /** The board is full. */
  | "full"
  /** Ink kept from before could not be added back after "Use it here" (Maya has the pen). */
  | "not_added";

/** Why this tab stops holding the board. */
export type EndReason =
  /** Another tab asked with "Use it here", and this tab lets go. */
  | "handover"
  /** Another tab took the board without this tab's answer (it saved while this tab thought it held the board). */
  | "forced"
  /** This tab found, before an edit or a save, that it no longer owns the board. */
  | "lost"
  /** The page is leaving (pagehide). */
  | "pagehide"
  /** The board closes: the child picked another question, or left the desk. */
  | "close";

/** The part of a board tab the session uses. */
export type SessionTab = Pick<BoardTab, "owns" | "save" | "stored">;

export interface SessionView {
  history: BoardHistory;
  role: TabRole | "opening";
  /** The stroke in progress, or null. */
  live: { erase: boolean; capture: Capture } | null;
  /** Ink this tab drew but could not save: shown, and added back by "Use it here". */
  kept: readonly InkStroke[];
}

export interface SessionOptions {
  /** The board to start with: the stored draft, or Maya's question. */
  initial: BoardHistory;
  /** The board came from a draft: its pen stays where it was. */
  restored: boolean;
  /** Milliseconds on a clock that only goes forward (performance.now): the board's clock is made from it. */
  clock(): number;
  /** Milliseconds since 1970 (Date.now): the draft's stamp. */
  wall(): number;
  /** Less motion: the question shows at once, so the board's clock starts where Maya's writing ends. */
  still?: boolean;
  /** Pen and eraser widths in CSS pixels, and the gap below which points are dropped. */
  pen?: { w: number; eraserW: number; minGapPx: number };
  /** Starts in a tab with no draft store: it holds the board and saves nothing. */
  noStore?: boolean;
}

export interface BoardSession {
  view(): SessionView;
  /** Calls `fn` after every change; returns the function that stops it. */
  subscribe(fn: () => void): () => void;
  /** Calls `fn` with every note for the child; returns the function that stops it. */
  onNote(fn: (note: SessionNote) => void): () => void;
  /** The board's clock: ms since the board started, going on from where a stored board was left. */
  now(): number;
  /** The board tab opened: this tab holds the board, or shows it read-only. */
  attach(tab: SessionTab, role: TabRole, stored: BoardHistory | null): void;
  /** True when this tab may edit now. A tab that lost the board ends holding it (`lost`) and says false. */
  holds(): boolean;
  /** The pointer went down at a board point (board widths). True when a stroke starts. */
  penDown(point: readonly [number, number], erase: boolean, boardWidth: number): boolean;
  penMove(points: readonly (readonly [number, number])[]): void;
  penUp(): void;
  /** The pointer was cancelled: the stroke in progress is dropped (the browser took the pointer for a scroll). */
  penCancel(): void;
  take(): void;
  giveBack(): void;
  undo(): void;
  clear(): void;
  /** Maya has finished writing the question: the pen passes to the child, once, in the tab that holds the board. */
  mayaDone(): void;
  /** The one way out of holding the board. */
  endHolding(reason: EndReason): void;
  /** The board tab's news: this tab's role, and the stored board. */
  tabChanged(role: TabRole, stored: BoardHistory | null): void;
}

const PEN = { w: 5, eraserW: 28, minGapPx: 0.6 };

/** The stroke in progress, with the board width (CSS pixels) it is drawn at. */
type Live = { erase: boolean; capture: Capture; boardWidth: number };
const key = (s: InkStroke) => JSON.stringify(s);

export function createBoardSession(o: SessionOptions): BoardSession {
  const pen = o.pen ?? PEN;
  let history = o.initial;
  let role: SessionView["role"] = o.noStore ? "holder" : "opening";
  let tab: SessionTab | null = null;
  let live: Live | null = null;
  let kept: InkStroke[] = [];
  /** The board as this tab last saved or read it: the one it need not save again. */
  let saved = history;
  let clock: { origin: number; base: number } | null = null;
  let view: SessionView = { history, role, live: null, kept };
  const listeners = new Set<() => void>();
  const notes = new Set<(note: SessionNote) => void>();

  // A new question starts its clock with Maya's first stroke, or where her writing ends when it shows at once.
  if (!o.restored) clock = { origin: o.clock(), base: o.still ? mayaWritingEnds(history) : 1 };

  const emit = () => {
    view = { history, role, live: live && { erase: live.erase, capture: live.capture }, kept };
    for (const fn of listeners) fn();
  };
  const say = (note: SessionNote) => notes.forEach((fn) => fn(note));

  const now = () => {
    const t = o.clock();
    clock ??= { origin: t, base: historyLength(saved) + 1 };
    return clock.base + (t - clock.origin);
  };

  /** Shows a board read from the store; the clock goes on from where it was left. Never touches a stroke in progress. */
  const adopt = (h: BoardHistory) => {
    history = h;
    saved = h;
    clock = null;
  };

  /** Saves the board when this tab holds it and it changed. */
  const persist = () => {
    if (role !== "holder" || !tab || history === saved) return;
    const result = tab.save(history, o.wall());
    if (result.status === "saved") saved = result.history;
    else if (result.status === "reader") end("lost");
    else if (result.status === "reload") {
      if (result.history) adopt(result.history);
      say("other_tab");
    }
  };

  const apply = (change: Change) => {
    if (change.ok) history = change.history;
    else if (change.code === "pen_with_maya") say("pen_with_maya");
    else if (change.code === "full") say("full");
    else if (change.code === "invalid_stroke") say("lost_line");
    persist();
    emit();
  };

  /** The stroke in progress as a finished stroke, with every point drawn so far. */
  const strokeOf = (l: Live): InkStroke => ({
    erase: l.erase,
    w: l.erase ? pen.eraserW : pen.w,
    boardWidth: l.boardWidth,
    page: 1,
    pts: capturedPoints(l.capture).map(([x, y, t]): TimedPoint => [x, y, t]),
  });

  /** The strokes on screen this tab has not saved: what it keeps when the board leaves without a save. */
  const unsaved = (): InkStroke[] => {
    const stored = tab?.stored() ?? null;
    const known = new Set((stored ? childStrokes(stored) : []).map(key));
    return childStrokes(history).filter((s) => !known.has(key(s)));
  };

  function end(reason: EndReason) {
    if (role !== "holder") return;
    // 1. The stroke in progress ends as if the pointer went up.
    const l = live;
    live = null;
    const owned = reason !== "forced" && reason !== "lost" && (tab ? tab.owns() : true);
    // The ended stroke, when the board could not take it: it is kept, never dropped.
    let homeless: InkStroke | null = null;
    if (l) {
      const s = strokeOf(l);
      const added = drawStroke(history, s);
      if (added.ok) history = added.history;
      else homeless = s;
    }
    // 2a. Still the owner: save now, then the caller lets the board go. A stroke the board refused is said, not hidden.
    if (owned) {
      if (homeless) say("lost_line");
      if (tab && history !== saved) {
        const result = tab.save(history, o.wall());
        if (result.status === "saved") saved = result.history;
      }
      role = "reader";
      emit();
      return;
    }
    // 2b. No longer the owner: write nothing; keep what this tab has not saved, and say so.
    role = "reader";
    const lines = [...unsaved(), ...(homeless ? [homeless] : [])];
    if (lines.length > 0) {
      const have = new Set(kept.map(key));
      kept = [...kept, ...lines.filter((s) => !have.has(key(s)))];
      say("moved");
    } else say("elsewhere");
    emit();
  }

  function holds() {
    if (role !== "holder") return false;
    if (!tab || tab.owns()) return true;
    end("lost");
    return false;
  }

  /** Maya's question is written: the pen passes to the child, once, when this tab holds a board whose pen never moved. */
  let written = false;
  const passPen = () => {
    if (!written || role !== "holder" || penHasMoved(history)) return;
    const passed = mayaFinished(history, now());
    if (passed.ok) {
      history = passed.history;
      persist();
    }
  };

  function penUp() {
    const l = live;
    if (!l) return;
    live = null;
    if (!holds()) {
      // The board went away while the pointer was down: the stroke is kept, never dropped.
      kept = [...kept, strokeOf(l)];
      say("moved");
      emit();
      return;
    }
    apply(drawStroke(history, strokeOf(l)));
  }

  return {
    view: () => view,
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    onNote(fn) {
      notes.add(fn);
      return () => void notes.delete(fn);
    },
    now,
    attach(t, r, stored) {
      tab = t;
      role = r;
      // What this tab read at its start may be older than the stored board now.
      if (stored && stored !== saved) adopt(stored);
      passPen();
      emit();
    },
    holds,
    penDown(point, erase, boardWidth) {
      if (role === "opening") return false;
      const wasHolder = role === "holder";
      if (!holds()) {
        // A tab that has just lost the board said so already (end).
        if (!wasHolder) say("elsewhere");
        return false;
      }
      if (penHolder(history) !== "child") {
        say("pen_with_maya");
        return false;
      }
      live = { erase, capture: startCapture([point[0], point[1], now()]), boardWidth };
      emit();
      return true;
    },
    penMove(points) {
      if (!live) return;
      const gap = pen.minGapPx / live.boardWidth;
      for (const [x, y] of points) {
        const added = addPoint(live.capture, [x, y, now()], gap);
        live.capture = added.capture;
        if (added.full) {
          // A very long stroke: keep what is drawn, and go on with a new stroke from its last point.
          const done: Live = live;
          const last = done.capture.tail[done.capture.tail.length - 1];
          live = { ...done, capture: startCapture(last) };
          apply(drawStroke(history, strokeOf(done)));
          if (!live) return;
        }
      }
      emit();
    },
    penUp,
    penCancel() {
      live = null;
      emit();
    },
    take() {
      if (holds()) apply(takePen(history, now()));
    },
    giveBack() {
      if (!holds()) return;
      // The pen goes to Maya: a stroke in progress is ended first, as if the pointer went up.
      if (live) penUp();
      if (role === "holder") apply(givePen(history, now()));
    },
    undo() {
      if (holds()) apply(undo(history, now()));
    },
    clear() {
      if (holds()) apply(clear(history, now()));
    },
    mayaDone() {
      written = true;
      passPen();
      emit();
    },
    endHolding: end,
    tabChanged(r, stored) {
      if (r === "reader") {
        // The board left this tab without this tab letting go: the one choke point keeps its ink.
        if (role === "holder") end("forced");
        role = "reader";
        // Ink kept here stays on screen until "Use it here" adds it back.
        if (kept.length === 0 && stored) adopt(stored);
        emit();
        return;
      }
      // This tab took the board ("Use it here"): the stored board, then the kept ink as new strokes after it.
      role = "holder";
      if (stored) adopt(stored);
      const lines = kept;
      kept = [];
      let missed = 0;
      for (const line of lines) {
        const at = now();
        const first = line.pts[0][2];
        const added = drawStroke(history, { ...line, pts: line.pts.map(([x, y, t]): TimedPoint => [x, y, at + t - first]) });
        if (added.ok) history = added.history;
        else missed++;
      }
      if (missed > 0) say("not_added");
      persist();
      passPen();
      emit();
    },
  };
}
