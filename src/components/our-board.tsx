"use client";

// "Our board" on the child's desk (#320, D-184): Maya's strokes (src/components/maya-board.tsx) with the child's ink on a
// layer over them, drawn with perfect-freehand, the pen tools, and the pen bar ("Maya has the pen / Take the pen"). The
// rules (who holds the pen, undo and clear, the draft, the replay) are the board history (src/lib/board-history.ts);
// this component keeps the clock, measures the screen and paints. The board is kept as a draft in this browser, so a
// reload brings it back as it was left.
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  boardDraftKey,
  childStrokes,
  clear,
  createHistory,
  drawStroke,
  givePen,
  historyLength,
  loadDraft,
  mayaFinished,
  mayaWrites,
  mayaWritingEnds,
  penHolder,
  saveDraft,
  takePen,
  undo,
  type BoardHistory,
  type Change,
  type DraftStore,
  type InkStroke,
} from "@/lib/board-history";
import { boardWidthOf, canvasViewBox, eraserLine, inkLayers, inkOutline, parseViewBox, toBoard, type Box, type InkLayer, type ViewBox } from "@/lib/child-ink-svg";
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

const box = (r: DOMRect): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height });

function LiveBoard({ question, label, caption, still, draftKey, store }: OurBoardProps & { draftKey: string; store: DraftStore | null }) {
  const [restored] = useState(() => (store ? loadDraft(store, draftKey) : null));
  const [history, setHistory] = useState<BoardHistory>(() => restored ?? firstBoard(question));
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [note, setNote] = useState<string | null>(null);
  const [camera, setCamera] = useState<{ view: ViewBox; boardWidth: number } | null>(null);
  const [live, setLive] = useState<{ erase: boolean; pts: TimedPoint[] } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const guard = useRef<PalmGuard>(newPalmGuard());
  const stroke = useRef<{ id: number; erase: boolean; pts: TimedPoint[] } | null>(null);
  /** A pointer pressed while Maya holds the pen: the note stays until a while after it lifts. */
  const refused = useRef<number | null>(null);
  const clock = useRef<{ origin: number; base: number } | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saved = useRef(history);
  const maskId = useId();

  const pen = penHolder(history);
  const ink = childStrokes(history);

  /** The board's clock: ms since the board started, going on from where a restored board was left. */
  const now = useCallback(() => {
    const t = performance.now();
    clock.current ??= { origin: t, base: historyLength(saved.current) + 1 };
    return clock.current.base + (t - clock.current.origin);
  }, []);

  // Keep the draft after every change. The board as it started (the question alone) needs none.
  useEffect(() => {
    if (!store || history === saved.current) return;
    saved.current = history;
    saveDraft(store, draftKey, history, Date.now());
  }, [history, store, draftKey]);

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
    const done = setTimeout(() => {
      const t = now();
      setHistory((h) => {
        const passed = mayaFinished(h, t);
        return passed.ok ? passed.history : h;
      });
    }, still ? 0 : ends);
    return () => clearTimeout(done);
    // Only when the board starts: a later render never passes the pen again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => clearTimeout(noteTimer.current), []);

  const say = (text: string) => {
    setNote(text);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  };

  const apply = (change: Change) => {
    if (change.ok) setHistory(change.history);
    else if (change.code === "pen_with_maya") say(PEN_NOTE);
    else if (change.code === "full") say(change.reason);
  };

  const pointAt = (e: { clientX: number; clientY: number }): TimedPoint | null => {
    if (!canvas.current || !camera) return null;
    const [x, y] = toBoard(camera.view, box(canvas.current.getBoundingClientRect()), e.clientX, e.clientY);
    return [x, y, now()];
  };

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const [next, decision] = pointerDown(guard.current, { id: e.pointerId, kind: e.pointerType, time: e.timeStamp, width: e.width, height: e.height });
    guard.current = next;
    if (decision === "ignore") return;
    if (pen !== "child") {
      // Maya holds the pen: nothing is drawn. The pointer is let go, so a finger can still scroll the page.
      guard.current = pointerUp(guard.current, { id: e.pointerId, kind: e.pointerType, time: e.timeStamp })[0];
      // A mouse drag would select the page's text instead.
      if (e.pointerType === "mouse") e.preventDefault();
      refused.current = e.pointerId;
      say(PEN_NOTE);
      return;
    }
    const p = pointAt(e);
    if (!p) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    stroke.current = { id: e.pointerId, erase: tool === "eraser", pts: [p] };
    setLive({ erase: tool === "eraser", pts: [p] });
  };

  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const s = stroke.current;
    if (!s || s.id !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = pointAt(ev);
      if (p) s.pts.push(p);
    }
    setLive({ erase: s.erase, pts: [...s.pts] });
  };

  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (refused.current === e.pointerId) {
      refused.current = null;
      say(PEN_NOTE);
    }
    const [next, ended] = pointerUp(guard.current, { id: e.pointerId, kind: e.pointerType, time: e.timeStamp });
    guard.current = next;
    const s = stroke.current;
    if (!ended || !s || s.id !== e.pointerId) return;
    stroke.current = null;
    setLive(null);
    if (e.type === "pointercancel" || !camera) return;
    apply(drawStroke(history, { erase: s.erase, w: s.erase ? ERASER_W : PEN_W, boardWidth: camera.boardWidth, page: 1, pts: s.pts }));
  };

  const take = () => {
    setNote(null);
    apply(takePen(history, now()));
  };
  const giveBack = () => {
    // A stroke in progress is dropped: the pen is Maya's now.
    stroke.current = null;
    setLive(null);
    apply(givePen(history, now()));
  };

  const paint = (s: Pick<InkStroke, "erase" | "w" | "boardWidth" | "pts">, key: string, finished = true) =>
    s.erase ? null : <path key={key} d={inkOutline(s.pts, s.w / s.boardWidth, finished)} />;

  const layer = (l: InkLayer<InkStroke & { key: string }>, depth: number): ReactNode => {
    if (!("under" in l)) return l.ink.map((s) => paint(s, s.key));
    const id = `${maskId}-erase-${depth}`;
    return (
      <>
        <mask id={id} maskUnits="userSpaceOnUse" x={-1e5} y={-1e5} width={2e5} height={2e5}>
          <rect x={-1e5} y={-1e5} width={2e5} height={2e5} fill="#fff" />
          {l.erasers.map((s) => <path key={s.key} d={eraserLine(s.pts)} fill="none" stroke="#000" strokeWidth={(s.w / s.boardWidth) * 1000} strokeLinecap="round" strokeLinejoin="round" />)}
        </mask>
        <g mask={`url(#${id})`}>{layer(l.under, depth + 1)}</g>
        {l.ink.map((s) => paint(s, s.key))}
      </>
    );
  };

  const liveStroke = live && camera ? { erase: live.erase, w: live.erase ? ERASER_W : PEN_W, boardWidth: camera.boardWidth, page: 1, pts: live.pts } : null;
  const shown = liveStroke ? [...ink, liveStroke] : ink;
  const layers = inkLayers(shown.map((s, i) => ({ ...s, key: `ink-${i}` })));
  const childHas = pen === "child";

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
              onPointerLeave={(e) => { if (refused.current === e.pointerId) up(e); }}
            >
              <g className="child-ink-strokes">{camera ? layer(layers, 0) : null}</g>
            </svg>
            <p className="desk-caption">{caption}</p>
            {note && <p className="desk-board-note" role="status">{note}</p>}
          </div>
          <div className="desk-tools" role="group" aria-label="Board tools">
            <button type="button" disabled={!childHas} aria-pressed={tool === "pen"} aria-label="Pen" onClick={() => setTool("pen")}><Icon name="pen" /></button>
            <button type="button" disabled={!childHas} aria-pressed={tool === "eraser"} aria-label="Eraser" onClick={() => setTool("eraser")}><Icon name="eraser" /></button>
            <button type="button" disabled={!childHas || ink.length === 0} aria-label="Undo" onClick={() => apply(undo(history, now()))}><Icon name="undo" /></button>
            <button type="button" disabled={!childHas || ink.length === 0} className="desk-clear" onClick={() => apply(clear(history, now()))}>Clear</button>
            <span className="desk-ink maya"><i />Maya</span>
            <span className="desk-ink you"><i />You</span>
          </div>
        </div>
      </section>

      <div className={`desk-pen${note ? " nudge" : ""}`} data-pen={pen}>
        {childHas ? (
          <>
            <span className="desk-pen-you" aria-hidden="true"><Icon name="pen" size={16} /></span>
            <span>You have the pen</span>
            <button type="button" className="give" onClick={giveBack}>Give it back</button>
          </>
        ) : (
          <>
            <Avatar size={26} />
            <span>Maya has the pen</span>
            <button type="button" onClick={take}>Take the pen</button>
          </>
        )}
      </div>
    </>
  );
}
