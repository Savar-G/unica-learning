"use client";

// The admin's replay of a child's whiteboard strokes (#186): the strokes appear in the order and at the pace the child
// drew them, from when the question was shown, with each undo and clear. Play and pause, a position slider and a
// speed. The strokes load from their short-lived signed URL when the admin first presses Play. Admin pages only: the
// strokes never reach the parent report. The rules (what is on the board at a time) are in src/lib/strokes.ts.
import { useEffect, useRef, useState } from "react";
import { boardAt, readStrokes, replayLength, type StrokeRecording } from "@/lib/strokes";
import { paint } from "./board-paint";
import "./stroke-replay.css";

const SPEEDS = [1, 2, 4];

/** "1:07.4": minutes, seconds and tenths. */
function clock(ms: number): string {
  const tenths = Math.floor(ms / 100);
  const minutes = Math.floor(tenths / 600);
  return `${minutes}:${String(Math.floor((tenths % 600) / 10)).padStart(2, "0")}.${tenths % 10}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** How tall the replayed board is, in board widths: the child's board, or more when work went below it. */
function extentOf(recording: StrokeRecording): number {
  let bottom = recording.height / recording.width;
  for (const e of recording.events) if (e.kind === "stroke") for (const [, y] of e.pts) bottom = Math.max(bottom, y + 0.03);
  return Math.min(bottom, 3);
}

type Loaded = { recording: StrokeRecording; length: number; extent: number; summary: string };

/** `src`: the signed URL of the strokes. `label`: what the board shows, for screen readers ("Strokes for question 3"). */
export function StrokeReplay({ src, label }: { src: string; label: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "failed">("idle");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [width, setWidth] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  /** The replay position the animation moves on from. */
  const position = useRef(0);

  const seek = (t: number) => {
    position.current = t;
    setTime(t);
  };

  const play = async () => {
    if (loaded) {
      if (position.current >= loaded.length) seek(0);
      setPlaying(true);
      return;
    }
    if (status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch(src, { cache: "no-store" });
      const recording = res.ok ? readStrokes(await res.json()) : null;
      if (!recording) throw new Error("Not a stroke recording");
      const strokes = recording.events.filter((e) => e.kind === "stroke").length;
      const undos = recording.events.filter((e) => e.kind === "undo").length;
      const clears = recording.events.filter((e) => e.kind === "clear").length;
      setLoaded({ recording, length: replayLength(recording), extent: extentOf(recording), summary: [plural(strokes, "stroke"), plural(undos, "undo"), plural(clears, "clear")].join(", ") });
      setStatus("idle");
      seek(0);
      setPlaying(true);
    } catch {
      setStatus("failed");
    }
  };

  // The animation: the position moves on with the clock, at the chosen speed, and stops at the end.
  useEffect(() => {
    if (!playing || !loaded) return;
    let last = performance.now();
    let id = requestAnimationFrame(function step(now) {
      const next = Math.min(loaded.length, position.current + (now - last) * speed);
      last = now;
      position.current = next;
      setTime(next);
      if (next >= loaded.length) setPlaying(false);
      else id = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(id);
  }, [playing, speed, loaded]);

  // The board follows the width of its frame.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  // Paints the board as it was at the current position.
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !loaded || width <= 0) return;
    const height = Math.round(width * loaded.extent);
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(width * dpr) || c.height !== Math.round(height * dpr)) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
      c.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const s of boardAt(loaded.recording, time)) paint(ctx, s, width, width / loaded.recording.width);
  }, [loaded, time, width]);

  if (!loaded) {
    return (
      <div className="sr">
        <div className="sr-controls">
          <button type="button" className="is-primary" onClick={play} disabled={status === "loading"} aria-busy={status === "loading"}>
            {status === "loading" ? "Loading…" : "Replay the strokes"}
          </button>
        </div>
        {status === "failed" && <p className="sr-note" role="alert">The strokes did not load. Reload the page to try again.</p>}
      </div>
    );
  }
  const ended = time >= loaded.length;
  return (
    <div className="sr">
      <div className="sr-board" ref={frame}>
        <canvas ref={canvas} role="img" aria-label={label} />
      </div>
      <div className="sr-controls">
        <button type="button" className="is-primary" onClick={() => (playing ? setPlaying(false) : void play())}>
          {playing ? "Pause" : ended ? "Play again" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={loaded.length}
          step={1}
          value={Math.round(time)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Replay position"
          aria-valuetext={`${clock(time)} of ${clock(loaded.length)}`}
        />
        <span className="sr-time">{clock(time)} / {clock(loaded.length)}</span>
        <button type="button" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])} aria-label={`Speed ${speed} times. Change the speed`}>
          {speed}x
        </button>
      </div>
      <p className="sr-note">{loaded.summary}. Times run from when the question was shown.</p>
    </div>
  );
}
