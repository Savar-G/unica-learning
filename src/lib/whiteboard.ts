// The whiteboard's rules (#67), apart from the canvas so they can be tested: which pointer may draw (palm rejection),
// what counts as a drawing, the size of the saved image, and the draft that keeps the work through a resume (#72).
// Pure: no DOM. The board itself is src/components/whiteboard.tsx.
import { WORK_TEXT_MAX } from "@/lib/test-api";

/**
 * One line on the board. Points are fractions of the board's width (x and y both), so the drawing keeps its shape
 * when the board changes size. `w` is the line width in CSS pixels; an eraser stroke clears what is under it.
 */
export interface Stroke {
  erase: boolean;
  w: number;
  pts: [number, number][];
}

/**
 * One thing the child did on the board, in order (#186): a finished stroke with the time of each of its points (the
 * clock of performance.now() and the pointer events), an undo, or a clear. `times` is null for a stroke the draft kept
 * from an old draft that did not record times.
 */
export type BoardEvent =
  | { kind: "stroke"; stroke: Stroke; times: number[] | null }
  | { kind: "undo"; at: number }
  | { kind: "clear"; at: number };

/** What is on the board for one question. */
export interface BoardState {
  strokes: Stroke[];
  text: string;
  /** Everything drawn, undone and cleared, in order, for the admin's stroke replay (#186). */
  log: BoardEvent[];
  /** The original question start, on this visit's performance clock. Negative after a reload. */
  shownAt?: number;
}

export const emptyBoard = (): BoardState => ({ strokes: [], text: "", log: [] });

/** True when at least one pencil stroke is on the board. Eraser strokes alone are not a drawing. */
export const hasDrawing = (strokes: readonly Stroke[]) => strokes.some((s) => !s.erase && s.pts.length > 0);

/**
 * #252: the mode the board of an answered question opens in, so the child sees their own work at once: Type when it
 * has typed working and no drawing (and the board can type, grades 3-7); Draw otherwise.
 */
export const openMode = (board: Pick<BoardState, "strokes" | "text">, typing: boolean): "draw" | "type" =>
  typing && board.text !== "" && !hasDrawing(board.strokes) ? "type" : "draw";

// ---------- palm rejection ----------

/** After the pen lifts, touches are ignored this long: a hand resting on the screen is not a finger drawing. */
export const PALM_AFTER_PEN_MS = 3000;
/** A touch this wide or tall (CSS pixels), where the browser reports it, is a palm. */
export const PALM_SIZE = 40;

/** Who is drawing now, and when the pen was last seen. */
export interface PalmGuard {
  active: { id: number; kind: string } | null;
  penAt: number;
}

export const newPalmGuard = (): PalmGuard => ({ active: null, penAt: -Infinity });

export interface PointerInfo {
  id: number;
  /** PointerEvent.pointerType: "mouse", "pen" or "touch". */
  kind: string;
  /** A time in milliseconds (event.timeStamp). */
  time: number;
  width?: number;
  height?: number;
}

/** "draw": start a stroke. "ignore": this pointer draws nothing. "replace": drop the stroke in progress (a palm), then draw. */
export type DownDecision = "draw" | "ignore" | "replace";

/**
 * A pointer touched the board. One stroke at a time. The pen always wins: it takes over from a touch stroke already in
 * progress, because a palm often lands just before the pen. Touches are ignored while the pen draws, shortly after it
 * lifts, and when the contact is as wide as a palm.
 */
export function pointerDown(guard: PalmGuard, p: PointerInfo): [PalmGuard, DownDecision] {
  if (p.kind === "pen") {
    const penAt = p.time;
    if (!guard.active) return [{ active: { id: p.id, kind: p.kind }, penAt }, "draw"];
    if (guard.active.kind === "touch") return [{ active: { id: p.id, kind: p.kind }, penAt }, "replace"];
    return [{ ...guard, penAt }, "ignore"];
  }
  if (guard.active) return [guard, "ignore"];
  if (p.kind === "touch") {
    const palmSized = (p.width ?? 0) >= PALM_SIZE || (p.height ?? 0) >= PALM_SIZE;
    if (palmSized || p.time - guard.penAt < PALM_AFTER_PEN_MS) return [guard, "ignore"];
  }
  return [{ ...guard, active: { id: p.id, kind: p.kind } }, "draw"];
}

/** A pointer lifted (or was cancelled). True when it was the one drawing, so its stroke ends. */
export function pointerUp(guard: PalmGuard, p: PointerInfo): [PalmGuard, boolean] {
  const penAt = p.kind === "pen" ? p.time : guard.penAt;
  if (guard.active?.id !== p.id) return [{ ...guard, penAt }, false];
  return [{ active: null, penAt }, true];
}

// ---------- the saved image ----------

/** Space kept around the work, in board widths. */
const MARGIN = 0.04;
/** The smallest image side, in board widths, so a dot or a short line is still readable. */
const MIN_SIDE = 0.2;
/** The image never reaches further down than this many board widths. */
const MAX_DOWN = 2;

/** A part of the board, in board widths from its top-left corner. */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The part of the board the saved image shows: every pencil stroke with a small margin, inside the board's width.
 * Work below what the board shows now (it got shorter after a resize) is kept. `boardWidth` is in CSS pixels, for the
 * line widths. The image keeps the board's scale, so the work is never blown up.
 */
export function exportFrame(strokes: readonly Stroke[], boardWidth: number): Frame {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of strokes) {
    if (s.erase) continue;
    const r = s.w / 2 / boardWidth;
    for (const [x, y] of s.pts) [x0, y0, x1, y1] = [Math.min(x0, x - r), Math.min(y0, y - r), Math.max(x1, x + r), Math.max(y1, y + r)];
  }
  if (x0 > x1) return { x: 0, y: 0, w: 1, h: 0.75 };
  // The margin, then at least MIN_SIDE; a window past an edge moves back inside rather than shrinking.
  const grow = (lo: number, hi: number, max: number): [number, number] => {
    [lo, hi] = [lo - MARGIN, hi + MARGIN];
    const short = MIN_SIDE - (hi - lo);
    if (short > 0) [lo, hi] = [lo - short / 2, hi + short / 2];
    if (lo < 0) [lo, hi] = [0, Math.min(max, hi - lo)];
    if (hi > max) [lo, hi] = [Math.max(0, lo - (hi - max)), max];
    return [lo, hi];
  };
  const [x, xEnd] = grow(x0, x1, 1);
  const [y, yEnd] = grow(y0, y1, MAX_DOWN);
  return { x, y, w: xEnd - x, h: yEnd - y };
}

// ---------- the draft ----------

/** Every saved board starts with this. */
export const DRAFT_ROOT = "unica-work:";
/** The browser keeps the board for the question on screen under this key, until the answer is stored. */
export const draftKey = (testId: string, questionId: string) => `${DRAFT_ROOT}${testId}:${questionId}`;
/** Every draft of one test starts with this, so the end of the test can clear them all. */
export const draftPrefix = (testId: string) => `${DRAFT_ROOT}${testId}:`;

const round = (n: number) => Math.round(n * 10_000) / 10_000;

const draftStroke = (s: Stroke): Stroke => ({ erase: s.erase, w: round(s.w), pts: s.pts.map(([x, y]) => [round(x), round(y)]) });

/** Store the event clock against its time origin so a later visit can recover the original relative times. */
export function encodeDraft(board: Pick<BoardState, "strokes" | "text"> & Partial<Pick<BoardState, "log" | "shownAt">>, timeOrigin = 0): string {
  return JSON.stringify({
    strokes: board.strokes.map(draftStroke),
    text: board.text,
    ...(board.log ? {
      v: 2,
      shownAt: (board.shownAt ?? 0) + timeOrigin,
      log: board.log.map((e) => e.kind === "stroke"
        ? { kind: e.kind, stroke: draftStroke(e.stroke), times: e.times?.map((t) => t + timeOrigin) ?? null }
        : { kind: e.kind, at: e.at + timeOrigin }),
    } : {}),
  });
}

const isPoint = (p: unknown): p is [number, number] =>
  Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

const isStroke = (s: unknown): s is Stroke => {
  if (!s || typeof s !== "object") return false;
  const { erase, w, pts } = s as Partial<Stroke>;
  return typeof erase === "boolean" && typeof w === "number" && w > 0 && w <= 100 && Array.isArray(pts) && pts.length > 0 && pts.every(isPoint);
};

const isEvent = (e: unknown): e is BoardEvent => {
  if (!e || typeof e !== "object") return false;
  const event = e as Partial<BoardEvent>;
  if (event.kind === "undo" || event.kind === "clear") return Number.isFinite(event.at);
  return event.kind === "stroke" && isStroke(event.stroke) && (event.times === null ||
    (Array.isArray(event.times) && event.times.length === event.stroke.pts.length && event.times.every(Number.isFinite)));
};

/** Restore the log onto this visit's clock. Old drafts keep their visible work, with unknown times. */
export function decodeDraft(raw: string | null, timeOrigin = 0): BoardState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const { strokes, text, v, shownAt, log } = data as { strokes?: unknown; text?: unknown; v?: unknown; shownAt?: unknown; log?: unknown };
  if (!Array.isArray(strokes) || !strokes.every(isStroke) || typeof text !== "string" || [...text].length > WORK_TEXT_MAX) return null;
  if (v === 2 && typeof shownAt === "number" && Number.isFinite(shownAt) && Array.isArray(log) && log.every(isEvent)) {
    return {
      strokes, text, shownAt: shownAt - timeOrigin,
      log: log.map((e) => e.kind === "stroke"
        ? { kind: e.kind, stroke: draftStroke(e.stroke), times: e.times?.map((t) => t - timeOrigin) ?? null }
        : { kind: e.kind, at: e.at - timeOrigin }),
    };
  }
  return { strokes, text, log: strokes.map((stroke) => ({ kind: "stroke", stroke, times: null })) };
}
