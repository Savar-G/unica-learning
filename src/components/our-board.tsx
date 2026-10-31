"use client";

// "Our board" on the child's desk (#320, D-184): Maya's strokes (src/components/maya-board.tsx) with the child's ink on a
// layer over them, drawn with perfect-freehand, the pen tools, and the pen bar ("Maya has the pen / Take the pen"). The
// rules (who holds the pen, undo and clear, the draft, the replay) are the board history (src/lib/board-history.ts);
// this component keeps the clock, measures the screen and paints. The board is kept as a draft in this browser, so a
// reload brings it back as it was left.
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  boardDraftKey,
  childStrokes,
  clear,
  createHistory,
  drawStroke,
  givePen,
  historyLength,
  loadDraft,
  markClosed,
  markOpen,
  mayaFinished,
  mayaWrites,
  mayaWritingEnds,
  penHasMoved,
  penHolder,
  takePen,
  undo,
  type BoardHistory,
  type Change,
  type DraftStore,
} from "@/lib/board-history";
import { addPoint, boardWidthOf, canvasViewBox, capturedPoints, eraserLine, inkLayers, inkOutline, parseViewBox, startCapture, toBoard, type Box, type Capture, type CapturePoint, type InkLayer, type ViewBox } from "@/lib/child-ink-svg";
import { leaseLocks, openBoardTab, type BoardChannel, type BoardLocks, type BoardMessage, type BoardTab, type TabRole, type TabTimers } from "@/lib/board-tab";
import type { QuestionBoard } from "@/lib/desk-board";
import { newPalmGuard, pointerDown, pointerUp, type PalmGuard } from "@/lib/whiteboard";
import type { TimedPoint } from "@/lib/strokes";
import { Avatar, Icon } from "@/components/desk-icons";
import { MayaBoard } from "@/components/maya-board";

/** The pen and the eraser, in CSS pixels. */
const PEN_W = 5;
const ERASER_W = 28;
/** How long the note "Maya has the pen" stays. */
const NOTE_MS = 2600;
/** Points closer than this (CSS pixels) to the last one kept are dropped while drawing. */
const MIN_GAP_PX = 0.6;
/** How often an open board tells other tabs it is open, so its draft is never evicted (R370-3). */
const OPEN_EVERY_MS = 60_000;
/** What the board says when another tab changed this board in a way that cannot be put together with this one. */
const OTHER_TAB_NOTE = "This board changed in another tab. It shows the newest work now.";
/** What a tab says when another tab holds the board (R370-2-1): it shows the board read-only. */
const ELSEWHERE_NOTE = "This board is open in another tab.";
/** What "Use it here" says when the other tab keeps the board. */
const KEPT_NOTE = "The other tab is still using this board. Close it, then try again.";
/** What the board says when it cannot keep a stroke, so a line never disappears without a word. */
const LOST_NOTE = "That line could not be kept. Please draw it again.";
/** What the board says to a stroke while Maya holds the pen. */
const PEN_NOTE = "Maya has the pen. Tap “Take the pen” to write.";

/** The browser's storage as the draft store. Storage can be full or off (private mode): then nothing is kept. */
const localDrafts: DraftStore = {
  read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to remove.
    }
  },
  keys() {
    try {
      return Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i)).filter((k): k is string => k !== null);
    } catch {
      return [];
    }
  },
};

const browserTimers: TabTimers = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  every(ms, fn) {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  },
};

/** The browser's Web Locks: a lock is held until let go, or until its tab closes or crashes. */
const webLocks = (locks: LockManager): BoardLocks => ({
  tryTake: (name) =>
    new Promise((resolve) => {
      locks
        .request(name, { ifAvailable: true }, (lock) => {
          if (!lock) return resolve(null);
          return new Promise<void>((letGo) => resolve(() => letGo()));
        })
        .catch(() => resolve(null));
    }),
});

/** Tabs talk through a BroadcastChannel; where there is none, through a storage key and its storage event. */
function browserChannel(): BoardChannel & { close(): void } {
  const fns = new Set<(m: BoardMessage) => void>();
  const listen = (fn: (m: BoardMessage) => void) => {
    fns.add(fn);
    return () => void fns.delete(fn);
  };
  if (typeof BroadcastChannel !== "undefined") {
    const bc = new BroadcastChannel("unica-board");
    bc.onmessage = (e: MessageEvent<BoardMessage>) => fns.forEach((fn) => fn(e.data));
    return { post: (m) => bc.postMessage(m), listen, close: () => bc.close() };
  }
  const KEY = "unica-board-message";
  const heard = (e: StorageEvent) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      const m = JSON.parse(e.newValue) as BoardMessage;
      fns.forEach((fn) => fn(m));
    } catch {
      // Not a board message.
    }
  };
  window.addEventListener("storage", heard);
  return {
    // The time makes each message a change, so the storage event fires for a message sent twice.
    post: (m) => localDrafts.write(KEY, JSON.stringify({ ...m, sentAt: Date.now() })),
    listen,
    close: () => window.removeEventListener("storage", heard),
  };
}

const noSubscribe = () => () => {};
/** False on the server and in the first render: the draft is read after hydration, so both render the same board. */
const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);

export interface OurBoardProps {
  /** The picked question, written by Maya, or null. */
  question: QuestionBoard | null;
  /** Where the board's draft is kept: the workbook, its page and the question. */
  at: { book: string; page: number; question: number | null };
  label: string;
  caption: ReactNode;
  /** Less motion: Maya's strokes show at once. */
  still: boolean;
}

export function OurBoard(props: OurBoardProps) {
  const hydrated = useHydrated();
  const key = boardDraftKey(props.at.book, props.at.page, props.at.question);
  // After hydration the board starts again with its draft: a new key, so its state starts from the store.
  return <LiveBoard key={hydrated ? key : `server:${key}`} draftKey={key} store={hydrated ? localDrafts : null} {...props} />;
}

const firstBoard = (question: QuestionBoard | null): BoardHistory => {
  if (!question) return createHistory();
  const written = mayaWrites(createHistory(), question.batch, 0);
  return written.ok ? written.history : createHistory();
};

/** The outlines of the frozen chunks of a stroke in progress: each is made once. */
const chunkPaths = new WeakMap<object, string>();

const box = (r: DOMRect): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height });

function LiveBoard({ question, label, caption, still, draftKey, store }: OurBoardProps & { draftKey: string; store: DraftStore | null }) {
  const [restored] = useState(() => (store ? loadDraft(store, draftKey) : null));
  const [history, setHistory] = useState<BoardHistory>(() => restored ?? firstBoard(question));
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [note, setNote] = useState<string | null>(null);
  const [camera, setCamera] = useState<{ view: ViewBox; boardWidth: number } | null>(null);
  const [live, setLive] = useState<{ erase: boolean; capture: Capture } | null>(null);
  /** This tab holds the board and writes it, or shows it read-only; "opening" until the lock answers. */
  const [role, setRole] = useState<TabRole | "opening">(store ? "opening" : "holder");
  const [moving, setMoving] = useState(false);
  /** Maya's question is written (or was before a reload): the pen may pass. */
  const [written, setWritten] = useState(restored !== null || !question);
  const [tabId] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${performance.now()}`));
  const tab = useRef<BoardTab | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const guard = useRef<PalmGuard>(newPalmGuard());
  const stroke = useRef<{ id: number; erase: boolean; capture: Capture } | null>(null);
  /** The board as it is now, also between a change and the render it causes. */
  const latest = useRef(history);
  /** A pointer pressed while this tab cannot draw, with what the board said: it says it again when the pointer lifts. */
  const refused = useRef<{ id: number; note: string } | null>(null);
  const clock = useRef<{ origin: number; base: number } | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saved = useRef(history);
  const maskId = useId();

  const pen = penHolder(history);
  const ink = useMemo(() => childStrokes(history), [history]);
  // Each kept stroke is outlined once per change of the board, never on a pointer move.
  const inkPaths = useMemo(() => ink.map((s) => (s.erase ? eraserLine(s.pts) : inkOutline(s.pts, s.w / s.boardWidth, true))), [ink]);

  const setBoard = useCallback((h: BoardHistory) => {
    latest.current = h;
    setHistory(h);
  }, []);

  /** The board's clock: ms since the board started, going on from where a restored board was left. */
  const now = useCallback(() => {
    const t = performance.now();
    clock.current ??= { origin: t, base: historyLength(saved.current) + 1 };
    return clock.current.base + (t - clock.current.origin);
  }, []);

  const say = useCallback((text: string) => {
    setNote(text);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  }, []);

  /** Shows a board read from the store, with the clock going on from where it was left; a stroke in progress is dropped. */
  const adopt = useCallback((h: BoardHistory | null) => {
    const board = h ?? firstBoard(question);
    stroke.current = null;
    setLive(null);
    saved.current = board;
    clock.current = null;
    setBoard(board);
    // question is fixed for this board: the key changes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setBoard]);

  // Open the board in this tab (R370-2-1): the first tab holds it and writes it; another shows it read-only.
  useEffect(() => {
    if (!store) return;
    let gone = false;
    const channel = browserChannel();
    const locks = typeof navigator !== "undefined" && navigator.locks ? webLocks(navigator.locks) : leaseLocks({ store, tabId, now: Date.now, timers: browserTimers });
    void openBoardTab({
      key: draftKey, tabId, store, locks, channel, timers: browserTimers,
      onChange(r, h) {
        if (gone) return;
        setRole(r);
        adopt(h);
      },
      // The board goes to another tab: save what is on the screen first.
      beforeRelease: () => tab.current?.save(latest.current, Date.now()),
    }).then((t) => {
      if (gone) return t.close();
      tab.current = t;
      setRole(t.role());
      // What this tab read at its start may be older than the draft now.
      if (t.stored() && saved.current !== t.stored()) adopt(t.stored());
    });
    return () => {
      gone = true;
      tab.current?.close();
      tab.current = null;
      channel.close();
    };
  }, [store, draftKey, tabId, adopt]);

  // Keep the draft after every change, from the tab that holds the board. The board as it started needs none. On any
  // difference from what this tab last loaded or saved, nothing is written: the tab shows the stored board.
  useEffect(() => {
    if (!store || role !== "holder" || history === saved.current || !tab.current) return;
    saved.current = history;
    const result = tab.current.save(history, Date.now());
    if (result.status === "reload") {
      adopt(result.history);
      say(OTHER_TAB_NOTE);
    }
  }, [history, store, role, adopt, say]);

  // While the board is open, it says so every minute, so no tab evicts its draft.
  useEffect(() => {
    if (!store) return;
    markOpen(store, draftKey, Date.now());
    const beat = setInterval(() => markOpen(store, draftKey, Date.now()), OPEN_EVERY_MS);
    return () => {
      clearInterval(beat);
      markClosed(store, draftKey);
    };
  }, [store, draftKey]);

  // The child's layer sits exactly over Maya's board: measure both whenever either changes size.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const measure = () => {
      const maya = el.querySelector<SVGSVGElement>("svg.maya-board");
      const viewBox = maya ? parseViewBox(maya.getAttribute("viewBox") ?? "") : null;
      const at = box(el.getBoundingClientRect());
      const view = canvasViewBox(at, maya && viewBox ? { viewBox, shown: box(maya.getBoundingClientRect()) } : null);
      setCamera({ view, boardWidth: boardWidthOf(view, at) });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const maya = el.querySelector("svg.maya-board");
    if (maya) observer.observe(maya);
    return () => observer.disconnect();
  }, []);

  // A new question: when Maya has finished writing it, the pen passes to the child (D-184), logged in the history. The
  // board's clock starts with her first stroke. A restored board keeps the pen where it was.
  useEffect(() => {
    if (restored || !question) return;
    const ends = mayaWritingEnds(saved.current);
    // With less motion the question shows at once, as if her writing had just ended: the clock starts at its end.
    clock.current = { origin: performance.now(), base: still ? ends : 1 };
    const done = setTimeout(() => setWritten(true), still ? 0 : ends);
    return () => clearTimeout(done);
    // Only when the board starts: a later render never passes the pen again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The question is written: the pen passes to the child, once, in the tab that holds the board. A board whose pen has
  // moved already (restored, or taken over from another tab) keeps it where it is.
  useEffect(() => {
    if (!written || role !== "holder" || penHasMoved(latest.current)) return;
    const passed = mayaFinished(latest.current, now());
    if (passed.ok) setBoard(passed.history);
  }, [written, role, history, now, setBoard]);

  useEffect(() => () => clearTimeout(noteTimer.current), []);

  /** "Use it here": the other tab saves and lets go, then this tab takes the board and reads its draft. */
  const moveHere = async () => {
    if (!tab.current || moving) return;
    setMoving(true);
    const taken = await tab.current.takeOver();
    setMoving(false);
    if (!taken) say(KEPT_NOTE);
  };

  const apply = (change: Change) => {
    if (change.ok) setBoard(change.history);
    else if (change.code === "pen_with_maya") say(PEN_NOTE);
    else if (change.code === "full") say(change.reason);
    else if (change.code === "invalid_stroke") say(LOST_NOTE);
  };

  /** Keeps a stroke the child drew: the whole stroke, or the part drawn so far when it is long (R370-2). */
  const keep = (erase: boolean, capture: Capture) => {
    if (!camera) return say(LOST_NOTE);
    apply(drawStroke(latest.current, { erase, w: erase ? ERASER_W : PEN_W, boardWidth: camera.boardWidth, page: 1, pts: capturedPoints(capture).map(([x, y, t]): TimedPoint => [x, y, t]) }));
  };

  const pointAt = (e: { clientX: number; clientY: number }): CapturePoint | null => {
    if (!canvas.current || !camera) return null;
    const [x, y] = toBoard(camera.view, box(canvas.current.getBoundingClientRect()), e.clientX, e.clientY);
    return [x, y, now()];
  };

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const [next, decision] = pointerDown(guard.current, { id: e.pointerId, kind: e.pointerType, time: e.timeStamp, width: e.width, height: e.height });
    guard.current = next;
    if (decision === "ignore") return;
    if (role !== "holder" || pen !== "child") {
      // Another tab holds the board, or Maya holds the pen: nothing is drawn. The pointer is let go, so a finger can
      // still scroll the page.
      guard.current = pointerUp(guard.current, { id: e.pointerId, kind: e.pointerType, time: e.timeStamp })[0];
      // A mouse drag would select the page's text instead.
      if (e.pointerType === "mouse") e.preventDefault();
      if (role === "opening") return;
      const text = role === "reader" ? ELSEWHERE_NOTE : PEN_NOTE;
      refused.current = { id: e.pointerId, note: text };
      say(text);
      return;
    }
    const p = pointAt(e);
    if (!p) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    stroke.current = { id: e.pointerId, erase: tool === "eraser", capture: startCapture(p) };
    setLive({ erase: tool === "eraser", capture: stroke.current.capture });
  };

  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const s = stroke.current;
    if (!s || s.id !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const gap = camera ? MIN_GAP_PX / camera.boardWidth : 0;
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = pointAt(ev);
      if (!p) continue;
      const added = addPoint(s.capture, p, gap);
      s.capture = added.capture;
      if (added.full) {
        // A very long stroke: keep what is drawn, and go on with a new stroke from its last point.
        keep(s.erase, s.capture);
        s.capture = startCapture(p);
      }
    }
    setLive({ erase: s.erase, capture: s.capture });
  };

  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (refused.current?.id === e.pointerId) {
      say(refused.current.note);
      refused.current = null;
    }
    const [next, ended] = pointerUp(guard.current, { id: e.pointerId, kind: e.pointerType, time: e.timeStamp });
    guard.current = next;
    const s = stroke.current;
    if (!ended || !s || s.id !== e.pointerId) return;
    stroke.current = null;
    setLive(null);
    if (e.type === "pointercancel") return;
    keep(s.erase, s.capture);
  };

  const take = () => {
    setNote(null);
    apply(takePen(latest.current, now()));
  };
  const giveBack = () => {
    // A stroke in progress is dropped: the pen is Maya's now.
    stroke.current = null;
    setLive(null);
    apply(givePen(latest.current, now()));
  };

  type Piece = { key: string; erase: boolean; width: number; d: string };
  const paint = (p: Piece) => (p.erase ? null : <path key={p.key} d={p.d} />);

  const layer = (l: InkLayer<Piece>, depth: number): ReactNode => {
    if (!("under" in l)) return l.ink.map(paint);
    const id = `${maskId}-erase-${depth}`;
    return (
      <>
        <mask id={id} maskUnits="userSpaceOnUse" x={-1e5} y={-1e5} width={2e5} height={2e5}>
          <rect x={-1e5} y={-1e5} width={2e5} height={2e5} fill="#fff" />
          {l.erasers.map((p) => <path key={p.key} d={p.d} fill="none" stroke="#000" strokeWidth={p.width * 1000} strokeLinecap="round" strokeLinejoin="round" />)}
        </mask>
        <g mask={`url(#${id})`}>{layer(l.under, depth + 1)}</g>
        {l.ink.map(paint)}
      </>
    );
  };

  const pieces: Piece[] = ink.map((s, i) => ({ key: `ink-${i}`, erase: s.erase, width: s.w / s.boardWidth, d: inkPaths[i] }));
  if (live && camera) {
    // The stroke in progress: frozen chunks are outlined once (cached by object); only the short tail is new each move.
    const width = (live.erase ? ERASER_W : PEN_W) / camera.boardWidth;
    const outline = (pts: readonly CapturePoint[], finished: boolean) => (live.erase ? eraserLine(pts) : inkOutline(pts, width, finished));
    live.capture.chunks.forEach((chunk, i) => {
      let d = chunkPaths.get(chunk);
      if (d === undefined) chunkPaths.set(chunk, (d = outline(chunk.pts, true)));
      pieces.push({ key: `live-${i}`, erase: live.erase, width, d });
    });
    pieces.push({ key: "live-tail", erase: live.erase, width, d: outline(live.capture.tail, false) });
  }
  const layers = inkLayers(pieces);
  const childHas = pen === "child" && role === "holder";

  return (
    <>
      <section className="desk-board" aria-labelledby="desk-board-title">
        <header>
          <h2 id="desk-board-title">Our board</h2>
          <p><Avatar size={22} />Maya draws here in a call</p>
        </header>
        <div className="desk-board-body">
          <div ref={canvas} className="desk-canvas" data-pen={pen}>
            {question ? (
              // A restored board shows Maya's work at once: she wrote it before the reload.
              <MayaBoard steps={question.steps} viewBox={question.viewBox} instant={still || restored !== null} label={label} />
            ) : null}
            <svg
              className="child-ink"
              viewBox={camera ? camera.view.join(" ") : undefined}
              preserveAspectRatio="none"
              role="img"
              aria-label={ink.length ? `Your writing on the board: ${ink.filter((s) => !s.erase).length} lines` : "Your writing on the board"}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onPointerLeave={(e) => { if (refused.current?.id === e.pointerId) up(e); }}
            >
              <g className="child-ink-strokes">{camera ? layer(layers, 0) : null}</g>
            </svg>
            <p className="desk-caption">{caption}</p>
            {note && <p className="desk-board-note" role="status">{note}</p>}
          </div>
          <div className="desk-tools" role="group" aria-label="Board tools">
            <button type="button" disabled={!childHas} aria-pressed={tool === "pen"} aria-label="Pen" onClick={() => setTool("pen")}><Icon name="pen" /></button>
            <button type="button" disabled={!childHas} aria-pressed={tool === "eraser"} aria-label="Eraser" onClick={() => setTool("eraser")}><Icon name="eraser" /></button>
            <button type="button" disabled={!childHas || ink.length === 0} aria-label="Undo" onClick={() => apply(undo(latest.current, now()))}><Icon name="undo" /></button>
            <button type="button" disabled={!childHas || ink.length === 0} className="desk-clear" onClick={() => apply(clear(latest.current, now()))}>Clear</button>
            <span className="desk-ink maya"><i />Maya</span>
            <span className="desk-ink you"><i />You</span>
          </div>
        </div>
      </section>

      {role === "reader" ? (
        // Another tab holds this board (R370-2-1): this one shows it read-only and can take it over.
        <div className={`desk-pen elsewhere${note ? " nudge" : ""}`} data-pen="elsewhere">
          <span className="desk-pen-tab" aria-hidden="true"><Icon name="board" size={16} /></span>
          <span>{ELSEWHERE_NOTE}</span>
          <button type="button" onClick={moveHere} disabled={moving}>{moving ? "Moving it here…" : "Use it here"}</button>
        </div>
      ) : (
        <div className={`desk-pen${note ? " nudge" : ""}`} data-pen={pen}>
          {pen === "child" ? (
            <>
              <span className="desk-pen-you" aria-hidden="true"><Icon name="pen" size={16} /></span>
              <span>You have the pen</span>
              <button type="button" className="give" onClick={giveBack} disabled={role !== "holder"}>Give it back</button>
            </>
          ) : (
            <>
              <Avatar size={26} />
              <span>Maya has the pen</span>
              <button type="button" onClick={take} disabled={role !== "holder"}>Take the pen</button>
            </>
          )}
        </div>
      )}
    </>
  );
}
