// The whiteboard strokes (#186, spec #181): every stroke the child drew on a question, with its undos and clears, as
// vectors with times since the question was shown, so an admin can replay how the child worked. The drawing (PNG)
// stays the record for the parent report and the AI review. Strokes are for admins only: the answer route stores them
// as a JSON file in the private bucket (src/lib/test-attempt.ts), never in the report or the copy without names.
// #252: the test step also sends them back to the child's own test, so a revisit shows the board as the child left it.
// Pure: no DOM, network or clock. The browser builds the recording when the child presses Next (src/components/test.tsx),
// the server checks it (src/lib/work-payload.ts), and the admin replay reads it (src/components/stroke-replay.tsx).
import { STROKES_MAX_BYTES } from "@/lib/test-api";
import type { BoardEvent, BoardState } from "@/lib/whiteboard";

/** One point: x and y in board widths from the top-left corner (as the board keeps them), t in ms since the question was shown. */
export type TimedPoint = [x: number, y: number, t: number];

/** One thing the child did, in order: a stroke (an eraser stroke clears what is under it), an undo, or a clear. */
export type StrokeEvent =
  | { kind: "stroke"; erase: boolean; w: number; pts: TimedPoint[] }
  | { kind: "undo"; t: number }
  | { kind: "clear"; t: number };

/** The strokes of one answer, as stored. */
export interface StrokeRecording {
  v: 1;
  /** The board's size in CSS pixels when the child answered. Line widths `w` are in these pixels. */
  width: number;
  height: number;
  events: StrokeEvent[];
}

/** A time is never later than this: a test closes 24 hours after its last answer (#72). */
export const STROKE_TIME_MAX_MS = 24 * 60 * 60_000;

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The recording of a question's board, from its log, or null when the child drew no stroke. `shownAt` is when the
 * question appeared, on the clock of the log's times (performance.now()). Times are whole milliseconds that never run
 * backwards; a stroke the draft kept from before a resume shows at the start. Points that are not numbers are dropped.
 */
export function recordStrokes(log: readonly BoardEvent[], shownAt: number, size: { width: number; height: number }): StrokeRecording | null {
  let last = 0;
  const since = (at: number) => {
    const t = Number.isFinite(at) ? Math.min(STROKE_TIME_MAX_MS, Math.max(0, Math.round(at - shownAt))) : last;
    last = Math.max(last, t);
    return last;
  };
  const events: StrokeEvent[] = [];
  for (const e of log) {
    if (e.kind !== "stroke") {
      events.push({ kind: e.kind, t: since(e.at) });
      continue;
    }
    const pts: TimedPoint[] = [];
    e.stroke.pts.forEach(([x, y], i) => {
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push([round4(x), round4(y), e.times ? since(e.times[i]) : last]);
    });
    if (pts.length > 0 && e.stroke.w > 0) events.push({ kind: "stroke", erase: e.stroke.erase, w: round2(Math.min(e.stroke.w, 100)), pts });
  }
  if (!events.some((e) => e.kind === "stroke")) return null;
  const width = size.width > 0 ? Math.round(size.width) : 800;
  const height = size.height > 0 ? Math.round(size.height) : Math.round(width * 0.75);
  return { v: 1, width, height, events };
}

/** The recording as stored and sent: JSON. Every character is ASCII, so its length is its size in bytes. */
export const encodeStrokes = (recording: StrokeRecording): string => JSON.stringify(recording);

/** How far apart (in board widths) the kept points of a stroke must be, tried in turn until the recording fits. */
const THIN_STEPS = [0, 0.001, 0.002, 0.004, 0.008, 0.016];

/**
 * The recording within `maxBytes`: as it is when it fits, else with fewer points on each stroke (a point closer than
 * the step to the last kept point goes; the first and last points stay). Null when even the coarsest step does not
 * fit: then the answer goes with its drawing and no strokes.
 */
export function fitStrokes(recording: StrokeRecording, maxBytes = STROKES_MAX_BYTES): StrokeRecording | null {
  for (const step of THIN_STEPS) {
    const fitted = step === 0 ? recording : { ...recording, events: recording.events.map((e) => (e.kind === "stroke" ? { ...e, pts: thin(e.pts, step) } : e)) };
    if (encodeStrokes(fitted).length <= maxBytes) return fitted;
  }
  return null;
}

const isRecord = (raw: unknown): raw is Record<string, unknown> => typeof raw === "object" && raw !== null && !Array.isArray(raw);
const isTime = (t: unknown): t is number => Number.isInteger(t) && (t as number) >= 0 && (t as number) <= STROKE_TIME_MAX_MS;
/** A board coordinate. Work can reach past the board's edge (the pointer leaves it mid-stroke), but not far. */
const isCoordinate = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100;
const isSide = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 10_000;

function readEvent(raw: unknown): StrokeEvent | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "undo" || raw.kind === "clear") return isTime(raw.t) ? { kind: raw.kind, t: raw.t } : null;
  if (raw.kind !== "stroke" || typeof raw.erase !== "boolean" || typeof raw.w !== "number" || !(raw.w > 0 && raw.w <= 100)) return null;
  if (!Array.isArray(raw.pts) || raw.pts.length === 0) return null;
  const pts: TimedPoint[] = [];
  for (const p of raw.pts) {
    if (!Array.isArray(p) || p.length !== 3 || !isCoordinate(p[0]) || !isCoordinate(p[1]) || !isTime(p[2])) return null;
    pts.push([p[0], p[1], p[2]]);
  }
  return { kind: "stroke", erase: raw.erase, w: raw.w, pts };
}

/**
 * A stroke recording rebuilt from its known fields only, or null when `raw` is not one: the version, a board size,
 * and events with points [x, y, t] (t a whole number of milliseconds, up to STROKE_TIME_MAX_MS), at least one a stroke.
 */
export function readStrokes(raw: unknown): StrokeRecording | null {
  if (!isRecord(raw) || raw.v !== 1 || !isSide(raw.width) || !isSide(raw.height) || !Array.isArray(raw.events)) return null;
  const events: StrokeEvent[] = [];
  for (const e of raw.events) {
    const event = readEvent(e);
    if (!event) return null;
    events.push(event);
  }
  if (!events.some((e) => e.kind === "stroke")) return null;
  return { v: 1, width: raw.width, height: raw.height, events };
}

/**
 * The strokes sent with an answer, checked on the server: the JSON to store (only the recording's known fields), or
 * null when none came. Strokes that are not a recording, or are over STROKES_MAX_BYTES, are left out with the reason:
 * they are for admins only, so they never stop the child's answer.
 */
export function parseStrokes(raw: unknown): { strokes: string | null; dropped?: "invalid" | "too_big" } {
  if (raw === undefined || raw === null) return { strokes: null };
  const recording = readStrokes(raw);
  if (!recording) return { strokes: null, dropped: "invalid" };
  const json = encodeStrokes(recording);
  return json.length <= STROKES_MAX_BYTES ? { strokes: json } : { strokes: null, dropped: "too_big" };
}

/** A stroke on the replayed board: the points drawn so far. */
export type ReplayStroke = Omit<Extract<StrokeEvent, { kind: "stroke" }>, "kind">;

/** When an event starts: a stroke's first point, an undo's or a clear's time. */
const startOf = (e: StrokeEvent) => (e.kind === "stroke" ? e.pts[0][2] : e.t);

/**
 * The board as it was `t` ms after the question was shown, for the admin's replay: the strokes in the order the child
 * drew them, the stroke in progress up to that moment, with each undo (the last stroke goes) and clear (every stroke
 * goes) done at its time. Eraser strokes are strokes of their own, painted in order.
 */
export function boardAt(recording: StrokeRecording, t: number): ReplayStroke[] {
  let board: ReplayStroke[] = [];
  for (const e of recording.events) {
    if (startOf(e) > t) break;
    if (e.kind === "undo") board = board.slice(0, -1);
    else if (e.kind === "clear") board = [];
    else {
      const drawn = e.pts.findIndex((p) => p[2] > t);
      board.push({ erase: e.erase, w: e.w, pts: drawn === -1 ? e.pts : e.pts.slice(0, drawn) });
    }
  }
  return board;
}

/** How long the replay runs, in ms: until the last thing the child did. */
export function replayLength(recording: StrokeRecording): number {
  let end = 0;
  for (const e of recording.events) end = Math.max(end, e.kind === "stroke" ? e.pts[e.pts.length - 1][2] : e.t);
  return end;
}

/** #252: the stored work of an answered question, as the test step carries it: the strokes and the typed working. */
export interface StoredWork {
  strokes?: StrokeRecording;
  text?: string;
}

/**
 * #252: the board an answered question opens with on a revisit (`now` on the clock of performance.now()): what was on
 * it when the child left it, with the typed working. The log keeps every earlier stroke, undo and clear, timed so the
 * question was shown the replay's length ago: new work records after them, and the replay keeps the earlier work.
 */
export function storedBoard(work: StoredWork, now: number): BoardState {
  const text = work.text ?? "";
  if (!work.strokes) return { strokes: [], text, log: [], shownAt: now };
  const shownAt = now - replayLength(work.strokes);
  const strokes = boardAt(work.strokes, Infinity).map(({ erase, w, pts }) => ({ erase, w, pts: pts.map(([x, y]): [number, number] => [x, y]) }));
  const log: BoardEvent[] = work.strokes.events.map((e) => e.kind === "stroke"
    ? { kind: "stroke", stroke: { erase: e.erase, w: e.w, pts: e.pts.map(([x, y]): [number, number] => [x, y]) }, times: e.pts.map(([, , t]) => shownAt + t) }
    : { kind: e.kind, at: shownAt + e.t });
  return { strokes, text, log, shownAt };
}

function thin(pts: TimedPoint[], step: number): TimedPoint[] {
  if (pts.length <= 2) return pts;
  const kept = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = kept[kept.length - 1];
    if (Math.hypot(pts[i][0] - x, pts[i][1] - y) >= step) kept.push(pts[i]);
  }
  kept.push(pts[pts.length - 1]);
  return kept;
}
