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

/** What is on the board for one question. */
export interface BoardState {
  strokes: Stroke[];
  text: string;
}

export const emptyBoard = (): BoardState => ({ strokes: [], text: "" });

/** True when at least one pencil stroke is on the board. Eraser strokes alone are not a drawing. */
export const hasDrawing = (strokes: readonly Stroke[]) => strokes.some((s) => !s.erase && s.pts.length > 0);

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

/** Space kept below the lowest stroke, as a fraction of the width. */
const BOTTOM_MARGIN = 0.02;
/** The image is never taller than this many widths. */
const MAX_TALL = 2;

/**
 * The PNG's size in pixels: `width` wide, with the board's shape (`aspect` = height / width), made taller when
 * strokes sit below what the board shows now (it got shorter after a resize), so no work is cut off.
 */
export function exportSize(aspect: number, strokes: readonly Stroke[], width: number): { width: number; height: number } {
  let bottom = 0;
  for (const s of strokes) for (const [, y] of s.pts) bottom = Math.max(bottom, y);
  const tall = Math.min(MAX_TALL, Math.max(aspect > 0 ? aspect : 0.75, strokes.length ? bottom + BOTTOM_MARGIN : 0));
  return { width, height: Math.round(width * tall) };
}

// ---------- the draft ----------

/** Every saved board starts with this. */
export const DRAFT_ROOT = "unica-work:";
/** The browser keeps the board for the question on screen under this key, until the answer is stored. */
export const draftKey = (testId: string, questionId: string) => `${DRAFT_ROOT}${testId}:${questionId}`;
/** Every draft of one test starts with this, so the end of the test can clear them all. */
export const draftPrefix = (testId: string) => `${DRAFT_ROOT}${testId}:`;

const round = (n: number) => Math.round(n * 10_000) / 10_000;

export function encodeDraft(board: BoardState): string {
  return JSON.stringify({
    strokes: board.strokes.map((s) => ({ erase: s.erase, w: round(s.w), pts: s.pts.map(([x, y]) => [round(x), round(y)]) })),
    text: board.text,
  });
}

const isPoint = (p: unknown): p is [number, number] =>
  Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

const isStroke = (s: unknown): s is Stroke => {
  if (!s || typeof s !== "object") return false;
  const { erase, w, pts } = s as Partial<Stroke>;
  return typeof erase === "boolean" && typeof w === "number" && w > 0 && w <= 100 && Array.isArray(pts) && pts.length > 0 && pts.every(isPoint);
};

/** The board saved under a draft key, or null when there is none or it is not a board. */
export function decodeDraft(raw: string | null): BoardState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const { strokes, text } = data as { strokes?: unknown; text?: unknown };
  if (!Array.isArray(strokes) || !strokes.every(isStroke) || typeof text !== "string" || [...text].length > WORK_TEXT_MAX) return null;
  return { strokes, text };
}
