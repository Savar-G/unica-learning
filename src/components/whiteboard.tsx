"use client";

// The whiteboard for shown work (#67, D-088): always open beside the question, full height, with its tools in a side
// rail. Draw with a mouse, a finger or a stylus; grades 3-7 can also type. Its own component, so the test-screen design
// (#79) can move it as one piece. The rules (palm rejection, image size, the draft) are in src/lib/whiteboard.ts.
// Strokes are stored as fractions of the board's width, so the drawing keeps its shape when the board changes size.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { WORK_IMAGE_MAX_BYTES, WORK_TEXT_MAX } from "@/lib/test-api";
import {
  DRAFT_ROOT,
  decodeDraft,
  encodeDraft,
  exportFrame,
  hasDrawing,
  newPalmGuard,
  pointerDown,
  pointerUp,
  type BoardState,
  type Stroke,
} from "@/lib/whiteboard";
import "./whiteboard.css";

const INK = "#1f1c19";
const PENCIL_W = 3.2;
const ERASER_W = 26;

/** The board's size in CSS pixels, for the saved image. */
export interface BoardSize {
  width: number;
  height: number;
}

export interface WhiteboardProps {
  board: BoardState;
  onChange: (board: BoardState) => void;
  /** Grades 3-7: Draw and Type. Grades 1-2: drawing only (#67). */
  typing: boolean;
  /** A show-your-work question: the label asks for work. */
  required: boolean;
  /** The child answered a show-your-work question with an empty board: a tangerine outline (D-088). */
  nudge: boolean;
  /** Called with the board's size whenever it changes. */
  onSize?: (size: BoardSize) => void;
}

function paint(ctx: CanvasRenderingContext2D, s: Stroke, width: number, scale = 1, from = 0) {
  if (s.pts.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = s.w * scale;
  if (s.pts.length === 1) {
    const [x, y] = s.pts[0];
    ctx.beginPath();
    ctx.arc(x * width, y * width, (s.w * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const start = Math.max(0, from - 1);
    ctx.beginPath();
    ctx.moveTo(s.pts[start][0] * width, s.pts[start][1] * width);
    for (let i = start + 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0] * width, s.pts[i][1] * width);
    ctx.stroke();
  }
  ctx.restore();
}

const toBlob = (canvas: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:image\/png;base64,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * The drawing as a PNG in base64, dark ink on white, or null when nothing is drawn. It shows the work with a small
 * margin (exportFrame), also work below what the board shows now. Made smaller until it fits the server's limit.
 */
export async function boardImage(strokes: readonly Stroke[], size: BoardSize): Promise<string | null> {
  if (!hasDrawing(strokes)) return null;
  const boardWidth = size.width > 0 ? size.width : 800;
  const frame = exportFrame(strokes, boardWidth);
  let blob: Blob | null = null;
  // Image pixels per board width: 1200 first, smaller only when the PNG is over the limit.
  for (const perWidth of [1200, 900, 600]) {
    const width = Math.max(1, Math.round(frame.w * perWidth));
    const height = Math.max(1, Math.round(frame.h * perWidth));
    // The ink on its own layer first, so the eraser clears ink only and never makes holes in the white.
    const ink = document.createElement("canvas");
    ink.width = width;
    ink.height = height;
    const inkCtx = ink.getContext("2d");
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const outCtx = out.getContext("2d");
    if (!inkCtx || !outCtx) return null;
    inkCtx.translate(-frame.x * perWidth, -frame.y * perWidth);
    for (const s of strokes) paint(inkCtx, s, perWidth, perWidth / boardWidth);
    outCtx.fillStyle = "#fff";
    outCtx.fillRect(0, 0, width, height);
    outCtx.drawImage(ink, 0, 0);
    blob = await toBlob(out);
    if (blob && blob.size <= WORK_IMAGE_MAX_BYTES) break;
  }
  return blob ? toBase64(blob) : null;
}

// The draft (#72): the board of the question on screen stays in this browser until its answer is stored, so a stop and
// a resume of the same question on the same device bring the work back. Storage can be full or off (private mode):
// then the board simply starts empty.

export function loadDraft(key: string): BoardState | null {
  try {
    return decodeDraft(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function saveDraft(key: string, board: BoardState): void {
  try {
    if (board.strokes.length === 0 && board.text === "") window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, encodeDraft(board));
  } catch {
    // Full or blocked storage: the work is still on the screen.
  }
}

/** Removes every saved board whose key passes `drop`. */
export function clearDrafts(drop: (key: string) => boolean): void {
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i)).filter((k): k is string => k !== null);
    for (const k of keys) if (k.startsWith(DRAFT_ROOT) && drop(k)) window.localStorage.removeItem(k);
  } catch {
    // Nothing to clear.
  }
}

export function Whiteboard({ board, onChange, typing, required, nudge, onSize }: WhiteboardProps) {
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useRef<BoardSize>({ width: 0, height: 0 });
  const strokes = useRef(board.strokes);
  const current = useRef<{ id: number; stroke: Stroke } | null>(null);
  const guard = useRef(newPalmGuard());
  const [tool, setTool] = useState<"pencil" | "eraser">("pencil");
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const sizeListener = useRef(onSize);
  useEffect(() => {
    sizeListener.current = onSize;
  });

  const redraw = useCallback(() => {
    const c = canvas.current;
    const { width, height } = size.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !width) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const s of strokes.current) paint(ctx, s, width);
    if (current.current) paint(ctx, current.current.stroke, width);
  }, []);

  // The canvas follows the board's size (a resize, a rotated tablet), drawn sharp for the screen's pixel density.
  useEffect(() => {
    const el = surface.current;
    const c = canvas.current;
    if (!el || !c) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = window.devicePixelRatio || 1;
      size.current = { width: r.width, height: r.height };
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
      redraw();
      sizeListener.current?.(size.current);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(() => {
    strokes.current = board.strokes;
    redraw();
  }, [board.strokes, redraw]);

  const at = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width];
  };

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const [next, decision] = pointerDown(guard.current, { id: e.pointerId, kind: e.pointerType, time: e.timeStamp, width: e.width, height: e.height });
    guard.current = next;
    if (decision === "ignore") return;
    e.preventDefault();
    // A palm landed just before the pen: its stroke goes.
    if (decision === "replace") current.current = null;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is already gone; the stroke still ends on pointerup.
    }
    const w = tool === "eraser" ? ERASER_W : e.pointerType === "pen" ? 2 + (e.pressure || 0.5) * 3 : PENCIL_W;
    current.current = { id: e.pointerId, stroke: { erase: tool === "eraser", w, pts: [at(e)] } };
    redraw();
  };

  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const cur = current.current;
    if (!cur || cur.id !== e.pointerId) return;
    const from = cur.stroke.pts.length;
    const native = e.nativeEvent;
    const events = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [native]) cur.stroke.pts.push(at(ev));
    const ctx = canvas.current?.getContext("2d");
    if (ctx) paint(ctx, cur.stroke, size.current.width, 1, from);
  };

  const up = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const [next, ended] = pointerUp(guard.current, { id: e.pointerId, kind: e.pointerType, time: e.timeStamp });
    guard.current = next;
    const cur = current.current;
    if (!ended || !cur || cur.id !== e.pointerId) return;
    current.current = null;
    strokes.current = [...strokes.current, cur.stroke];
    onChange({ ...board, strokes: strokes.current });
  };

  const empty = board.strokes.length === 0;
  const typingNow = typing && mode === "type";
  const hint = required ? "Show how you got your answer" : typing ? "Draw or write here" : "Draw here";

  return (
    <section className={`wb${nudge ? " is-nudge" : ""}`} data-mode={typingNow ? "type" : "draw"} aria-label="Whiteboard">
      <div className="wb-head">
        <h2>My work</h2>
        <p className={required ? "is-required" : undefined}>{required ? "Show your work for this one" : "Use it if it helps"}</p>
      </div>
      <div className="wb-body">
        <div className={`wb-surface${tool === "eraser" && !typingNow ? " is-eraser" : ""}`} ref={surface}>
          <canvas
            ref={canvas}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            role="img"
            aria-label={empty ? "Drawing area, empty" : "Drawing area with your work"}
          />
          {empty && !typingNow && <p className="wb-hint" aria-hidden>{hint}</p>}
          {typingNow && (
            <textarea
              className="wb-text"
              value={board.text}
              maxLength={WORK_TEXT_MAX}
              onChange={(e) => onChange({ ...board, text: e.target.value })}
              placeholder="Type how you worked it out"
              aria-label="Type your work"
              autoFocus
            />
          )}
        </div>
        <div className="wb-rail" role="toolbar" aria-label="Whiteboard tools" aria-orientation="vertical">
          {typing && (
            <div className="wb-modes" role="group" aria-label="Draw or type">
              <button type="button" aria-pressed={!typingNow} onClick={() => setMode("draw")}><PencilIcon /> Draw</button>
              <button type="button" aria-pressed={typingNow} onClick={() => setMode("type")}><span aria-hidden className="wb-aa">Aa</span> Type</button>
            </div>
          )}
          {!typingNow && (
            <div className="wb-tools">
              <button type="button" className="wb-tool" aria-pressed={tool === "pencil"} onClick={() => setTool("pencil")} aria-label="Pencil"><PencilIcon /></button>
              <button type="button" className="wb-tool" aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} aria-label="Eraser"><EraserIcon /></button>
              <button type="button" className="wb-tool" onClick={() => onChange({ ...board, strokes: board.strokes.slice(0, -1) })} disabled={empty} aria-label="Undo"><UndoIcon /></button>
              <button type="button" className="wb-tool wb-clear" onClick={() => onChange({ ...board, strokes: [] })} disabled={empty}>Clear</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PencilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
      <path d="M14 6l3 3" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 20h12" />
      <path d="M4.5 15.5l9-9a2 2 0 012.8 0l3.2 3.2a2 2 0 010 2.8L13 19H8.5l-4-4z" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 010 12h-3" />
    </svg>
  );
}
