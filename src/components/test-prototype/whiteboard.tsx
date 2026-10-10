"use client";

// PROTOTYPE ONLY (ticket #60). Whiteboard for shown work: draw with mouse, finger or stylus, or type.
// Strokes are stored relative to the board width, so they survive a resize or a layout change.
import { useEffect, useRef, useState } from "react";
import type { Stroke } from "./flow";

export type Paper = "grid" | "lines" | "plain" | "dots";

type Props = {
  strokes: Stroke[];
  onStrokes: (s: Stroke[]) => void;
  text: string;
  onText: (t: string) => void;
  paper?: Paper;
  className?: string;
  /** Text shown on the empty board. */
  hint?: string;
  /** Layout of the tool row. */
  tools?: "top" | "bottom" | "side";
  autoFocusText?: boolean;
};

const INK = "#2a2622";

function draw(ctx: CanvasRenderingContext2D, s: Stroke, w: number, from = 0) {
  if (s.pts.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = s.w;
  if (s.pts.length === 1) {
    const [x, y] = s.pts[0];
    ctx.beginPath();
    ctx.arc(x * w, y * w, s.w / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    const start = Math.max(0, from - 1);
    ctx.moveTo(s.pts[start][0] * w, s.pts[start][1] * w);
    for (let i = start + 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0] * w, s.pts[i][1] * w);
    ctx.stroke();
  }
  ctx.restore();
}

export function Whiteboard({ strokes, onStrokes, text, onText, paper = "grid", className = "", hint = "Show your work here", tools = "top", autoFocusText }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cur = useRef<Stroke | null>(null);
  const size = useRef({ w: 0, h: 0 });
  const penSeen = useRef(0);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const latest = useRef(strokes);

  const redraw = () => {
    const c = canvas.current;
    const { w, h } = size.current;
    if (!c || !w) return;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const s of latest.current) draw(ctx, s, w);
  };

  useEffect(() => {
    const el = wrap.current, c = canvas.current;
    if (!el || !c) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = window.devicePixelRatio || 1;
      size.current = { w: r.width, h: r.height };
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
      redraw();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    latest.current = strokes;
    redraw();
  }, [strokes]);

  const point = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width];
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "pen") penSeen.current = Date.now();
    // simple palm rejection: ignore touch for 2 s after a stylus was used
    if (e.pointerType === "touch" && Date.now() - penSeen.current < 2000) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const width = tool === "eraser" ? 26 : e.pointerType === "pen" ? 2 + (e.pressure || 0.5) * 3 : 3.2;
    cur.current = { erase: tool === "eraser", w: width, pts: [point(e)] };
    const ctx = canvas.current!.getContext("2d")!;
    draw(ctx, cur.current, size.current.w);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = cur.current;
    if (!s) return;
    const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    const from = s.pts.length;
    const r = canvas.current!.getBoundingClientRect();
    for (const ev of events.length ? events : [e.nativeEvent]) s.pts.push([(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.width]);
    draw(canvas.current!.getContext("2d")!, s, size.current.w, from);
  };
  const up = () => {
    if (!cur.current) return;
    onStrokes([...latest.current, cur.current]);
    cur.current = null;
  };

  const empty = strokes.length === 0;

  return (
    <div className={`wb wb-tools-${tools} ${className}`.trim()} data-mode={mode}>
      <div className="wb-tools" role="toolbar" aria-label="Whiteboard tools">
        <div className="wb-seg" role="tablist" aria-label="Draw or type">
          <button type="button" role="tab" aria-selected={mode === "draw"} onClick={() => setMode("draw")}>
            <PenIcon /> Draw
          </button>
          <button type="button" role="tab" aria-selected={mode === "type"} onClick={() => setMode("type")}>
            <span aria-hidden className="wb-aa">Aa</span> Type
          </button>
        </div>
        {mode === "draw" && (
          <>
            <button type="button" className="wb-tool" aria-pressed={tool === "pen"} onClick={() => setTool("pen")} aria-label="Pencil"><PenIcon /></button>
            <button type="button" className="wb-tool" aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} aria-label="Eraser"><EraserIcon /></button>
            <button type="button" className="wb-tool" onClick={() => onStrokes(strokes.slice(0, -1))} disabled={empty} aria-label="Undo"><UndoIcon /></button>
            <button type="button" className="wb-tool wb-clear" onClick={() => onStrokes([])} disabled={empty}>Clear</button>
          </>
        )}
      </div>
      <div className={`wb-surface wb-${paper}`} ref={wrap}>
        <canvas
          ref={canvas}
          className={tool === "eraser" ? "is-eraser" : ""}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          aria-label="Drawing area for your work"
          role="img"
        />
        {empty && mode === "draw" && <p className="wb-hint" aria-hidden>{hint}</p>}
        {mode === "type" && (
          <textarea
            className="wb-text"
            value={text}
            onChange={(e) => onText(e.target.value)}
            placeholder="Type how you worked it out"
            aria-label="Type your work"
            autoFocus={autoFocusText}
          />
        )}
      </div>
    </div>
  );
}

export function PenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
      <path d="M14 6l3 3" />
    </svg>
  );
}
function EraserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 20h12" />
      <path d="M4.5 15.5l9-9a2 2 0 012.8 0l3.2 3.2a2 2 0 010 2.8L13 19H8.5l-4-4z" />
    </svg>
  );
}
function UndoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 010 12h-3" />
    </svg>
  );
}
