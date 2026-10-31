"use client";

// "Our board" on the child's desk (#320, D-184): Maya's strokes (src/components/maya-board.tsx) with the child's ink on a
// layer over them, drawn with perfect-freehand, the pen tools, and the pen bar ("Maya has the pen / Take the pen"). The
// rules are pure modules: the board history (who holds the pen, undo and clear, the draft, the replay,
// src/lib/board-history.ts), the board tab (one tab writes a board, src/lib/board-tab.ts) and the board session (the
// stroke in progress, holding the board and the ink kept when it moves away, src/lib/board-session.ts). This component
// measures the screen, forwards events to the session and paints what it shows.
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { boardDraftKey, childStrokes, createHistory, loadDraft, markClosed, markOpen, mayaWrites, mayaWritingEnds, penHolder, type BoardHistory, type DraftStore } from "@/lib/board-history";
import { createBoardSession, type SessionNote } from "@/lib/board-session";
import { boardWidthOf, canvasViewBox, eraserLine, inkLayers, inkOutline, parseViewBox, toBoard, type Box, type CapturePoint, type InkLayer, type ViewBox } from "@/lib/child-ink-svg";
import { leaseLocks, openBoardTab, type BoardChannel, type BoardLocks, type BoardMessage, type BoardTab, type TabTimers } from "@/lib/board-tab";
import type { QuestionBoard } from "@/lib/desk-board";
import { newPalmGuard, pointerDown, pointerUp, type PalmGuard } from "@/lib/whiteboard";
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
/** What a tab says when another tab took the board while this one had lines it had not saved (R370-3-1). */
const MOVED_NOTE = "This board moved to another tab. Your newest lines stay here: tap “Use it here” to add them back.";
/** What a tab says when lines it kept could not be added back after "Use it here". */
const NOT_ADDED_NOTE = "Some of your lines could not be added back. They stay here: tap “Use it here” again.";
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

const browserTimers: TabTimers = { sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

/** The browser's Web Locks: a lock is held until let go, or until its tab closes or crashes. */
const webLocks = (locks: LockManager): BoardLocks => ({
  tryTake: (name) =>
    new Promise((resolve) => {
      locks
        .request(name, { ifAvailable: true }, (lock) => {
          if (!lock) return resolve(null);
          return new Promise<void>((letGo) => {
            let held = true;
            resolve({
              owned: () => held,
              release() {
                held = false;
                letGo();
              },
            });
          });
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

const NOTES: Record<SessionNote, string> = {
  pen_with_maya: PEN_NOTE,
  elsewhere: ELSEWHERE_NOTE,
  moved: MOVED_NOTE,
  other_tab: OTHER_TAB_NOTE,
  lost_line: LOST_NOTE,
  full: "The board is full. Clear it or start a new question.",
  not_added: NOT_ADDED_NOTE,
};

function LiveBoard({ question, label, caption, still, draftKey, store }: OurBoardProps & { draftKey: string; store: DraftStore | null }) {
  const [restored] = useState(() => (store ? loadDraft(store, draftKey) : null));
  const [session] = useState(() =>
    createBoardSession({
      initial: restored ?? firstBoard(question),
      restored: restored !== null,
      clock: () => performance.now(),
      wall: () => Date.now(),
      still,
      pen: { w: PEN_W, eraserW: ERASER_W, minGapPx: MIN_GAP_PX },
      noStore: !store,
    }),
  );
  const view = useSyncExternalStore(session.subscribe, session.view, session.view);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [note, setNote] = useState<string | null>(null);
  const [camera, setCamera] = useState<{ view: ViewBox; boardWidth: number } | null>(null);
  const [moving, setMoving] = useState(false);
  /** Counts the times the page came back from the back-forward cache: the board is opened again. */
  const [opened, setOpened] = useState(0);
  const [tabId] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${performance.now()}`));
  const tab = useRef<BoardTab | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const guard = useRef<PalmGuard>(newPalmGuard());
  /** A pointer pressed while this tab cannot draw: the note is said again when it lifts. */
  const refused = useRef<number | null>(null);
  const lastNote = useRef<string | null>(null);
  /** Counts the notes said, so a refused pointer knows whether it caused one. */
  const notesSaid = useRef(0);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const maskId = useId();

  const { history, role, live, kept } = view;
  const pen = penHolder(history);
  const ink = useMemo(() => childStrokes(history), [history]);
  // Kept ink this tab could not save (the board moved away) stays on screen with the rest.
  const shown = useMemo(() => {
    const on = new Set(ink.map((s) => JSON.stringify(s)));
    return [...ink, ...kept.filter((s) => !on.has(JSON.stringify(s)))];
  }, [ink, kept]);
  // Each kept stroke is outlined once per change of the board, never on a pointer move.
  const inkPaths = useMemo(() => shown.map((s) => (s.erase ? eraserLine(s.pts) : inkOutline(s.pts, s.w / s.boardWidth, true))), [shown]);

  const say = (text: string) => {
    lastNote.current = text;
    notesSaid.current++;
    setNote(text);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  };
  const sayRef = useRef(say);
  useEffect(() => {
    sayRef.current = say;
  });
  useEffect(() => session.onNote((n) => sayRef.current(NOTES[n])), [session]);
  useEffect(() => () => clearTimeout(noteTimer.current), []);

  // Open the board in this tab: the first tab holds it and writes it; another shows it read-only (src/lib/board-tab.ts).
  // Every way out of holding it (a hand-over, leaving the page, closing the board) goes through session.endHolding.
  useEffect(() => {
    if (!store) return;
    let gone = false;
    let held: BoardTab | null = null;
    const channel = browserChannel();
    const locks = typeof navigator !== "undefined" && navigator.locks ? webLocks(navigator.locks) : leaseLocks({ store, tabId, timers: browserTimers });
    void openBoardTab({
      key: draftKey, tabId, store, locks, channel, timers: browserTimers,
      onChange: (r, h) => {
        if (!gone) session.tabChanged(r, h);
      },
      beforeRelease: () => session.endHolding("handover"),
    }).then((t) => {
      if (gone) return t.close();
      held = t;
      tab.current = t;
      session.attach(t, t.role(), t.stored());
    });
    const letGo = (reason: "pagehide" | "close") => {
      session.endHolding(reason);
      held?.close();
      held = null;
      tab.current = null;
    };
    const hide = () => letGo("pagehide");
    const show = (e: PageTransitionEvent) => {
      if (e.persisted) setOpened((n) => n + 1);
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      gone = true;
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      letGo("close");
      channel.close();
    };
  }, [store, draftKey, tabId, session, opened]);

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
      const v = canvasViewBox(at, maya && viewBox ? { viewBox, shown: box(maya.getBoundingClientRect()) } : null);
      setCamera({ view: v, boardWidth: boardWidthOf(v, at) });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const maya = el.querySelector("svg.maya-board");
    if (maya) observer.observe(maya);
    return () => observer.disconnect();
  }, []);

  // When Maya has finished writing the question, the pen passes to the child (D-184). A restored board keeps it.
  useEffect(() => {
    const ends = restored || !question || still ? 0 : mayaWritingEnds(session.view().history);
    const done = setTimeout(() => session.mayaDone(), ends);
    return () => clearTimeout(done);
    // Only when the board starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  /** "Use it here": the other tab saves and lets go, then this tab takes the board and reads its draft. */
  const moveHere = async () => {
    if (!tab.current || moving) return;
    setMoving(true);
    const taken = await tab.current.takeOver();
    setMoving(false);
    if (!taken) say(KEPT_NOTE);
  };

  const pointAt = (e: { clientX: number; clientY: number }): [number, number] | null => {
    if (!canvas.current || !camera) return null;
    return toBoard(camera.view, box(canvas.current.getBoundingClientRect()), e.clientX, e.clientY);
  };

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const [next, decision] = pointerDown(guard.current, { id: e.pointerId, kind: e.pointerType, time: e.timeStamp, width: e.width, height: e.height });
    guard.current = next;
    if (decision === "ignore") return;
    // The pen takes over from a touch stroke already in progress (a palm that landed first): that stroke is dropped.
    const touch = session.view().live;
    if (decision === "replace" && touch) session.penCancel(touch.pointer);
    const p = pointAt(e);
    const before = notesSaid.current;
    if (!p || !camera || !session.penDown(p, tool === "eraser", camera.boardWidth, e.pointerId)) {
      // Nothing is drawn. The pointer is let go, so a finger can still scroll the page.
      guard.current = pointerUp(guard.current, { id: e.pointerId, kind: e.pointerType, time: e.timeStamp })[0];
      // A mouse drag would select the page's text instead.
      if (e.pointerType === "mouse") e.preventDefault();
      if (notesSaid.current !== before) refused.current = e.pointerId;
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // Only the pointer that started the stroke feeds it: a second finger is ignored (R370-5-2).
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!session.view().live) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const points: [number, number][] = [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = pointAt(ev);
      if (p) points.push(p);
    }
    session.penMove(points, e.pointerId);
  };

  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (refused.current === e.pointerId) {
      refused.current = null;
      if (lastNote.current) say(lastNote.current);
    }
    const [next, ended] = pointerUp(guard.current, { id: e.pointerId, kind: e.pointerType, time: e.timeStamp });
    guard.current = next;
    if (!ended) return;
    if (e.type === "pointercancel") session.penCancel(e.pointerId);
    else session.penUp(e.pointerId);
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

  const pieces: Piece[] = shown.map((s, i) => ({ key: `ink-${i}`, erase: s.erase, width: s.w / s.boardWidth, d: inkPaths[i] }));
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
              // The drawing pointer lost its capture (the window lost focus, say): the stroke ends as if it lifted.
              onLostPointerCapture={up}
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
            <button type="button" disabled={!childHas || ink.length === 0} aria-label="Undo" onClick={() => session.undo()}><Icon name="undo" /></button>
            <button type="button" disabled={!childHas || ink.length === 0} className="desk-clear" onClick={() => session.clear()}>Clear</button>
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
              <button type="button" className="give" onClick={() => session.giveBack()} disabled={role !== "holder"}>Give it back</button>
            </>
          ) : (
            <>
              <Avatar size={26} />
              <span>Maya has the pen</span>
              <button type="button" onClick={() => { setNote(null); session.take(); }} disabled={role !== "holder"}>Take the pen</button>
            </>
          )}
        </div>
      )}
    </>
  );
}
