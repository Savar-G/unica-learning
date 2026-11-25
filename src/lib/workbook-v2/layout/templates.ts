// The page templates: fixed rectangles in points. Nothing here depends on what a page holds. The design of the
// templates is not chosen yet; these prove the path. A template writes both sides out from the same numbers: the
// spine zone is on the left of a front page and on the right of a back page, and everything moves with it.
import { PAPER, PRINT_RULES, type Face, type Rect, type Side } from "../contract";

export interface PageFrame {
  heading: Rect;
  instruction: Rect;
  footer: Rect;
  qr: Rect;
  marks: { tl: Rect; tr: Rect; br: Rect; bl: Rect };
}

/** One place for one question. `cells` are the digit places of the stack, left to right, top line first. */
export interface ItemPlace {
  slot: Rect;
  label: Rect;
  question: Rect;
  topCells: Rect[];
  bottomCells: Rect[];
  rule: Rect;
  answer: Rect;
  reach: Rect;
  work: Rect;
}

export interface PageTemplate {
  id: string;
  faces: readonly Face["kind"][];
  /** The digit places of one line of a stack and of its answer. */
  digits: number;
  sides: Record<Side, { frame: PageFrame; places: ItemPlace[] }>;
}

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

const TOP = PRINT_RULES.outerMargin;
const BOTTOM = PAPER.h - PRINT_RULES.outerMargin;
const MARK = 13.5;
const QR = 57.6;
const GAP = 8;
const LIVE = PAPER.w - PRINT_RULES.spineZone - PRINT_RULES.outerMargin;
const liveLeft = (side: Side) => (side === "front" ? PRINT_RULES.spineZone : PRINT_RULES.outerMargin);

function frame(side: Side): PageFrame {
  const left = liveLeft(side);
  const right = left + LIVE;
  const textLeft = left + MARK + GAP;
  const textWidth = LIVE - 2 * (MARK + GAP);
  const qrLeft = side === "front" ? right - MARK - GAP - QR : left + MARK + GAP;
  return {
    heading: rect(textLeft, TOP, textWidth, 20),
    instruction: rect(left, TOP + 26, LIVE, 18),
    footer: rect(side === "front" ? textLeft : qrLeft + QR + GAP, BOTTOM - 16, textWidth - QR - GAP, 16),
    qr: rect(qrLeft, BOTTOM - QR, QR, QR),
    marks: {
      tl: rect(left, TOP, MARK, MARK),
      tr: rect(right - MARK, TOP, MARK, MARK),
      br: rect(right - MARK, BOTTOM - MARK, MARK, MARK),
      bl: rect(left, BOTTOM - MARK, MARK, MARK),
    },
  };
}

const COLUMNS = 2;
const ROWS = 4;
const CELL = { w: 24, h: 28 };
/** The room right of the stack before the work area: more than the reach takes. */
const STACK_ROOM = 34;
const SLOT = { w: 236, h: 140, top: 92, pitchX: 250, pitchY: 148 };

function place(side: Side, digits: number, column: number, row: number): ItemPlace {
  const x = liveLeft(side) + column * SLOT.pitchX;
  const y = SLOT.top + row * SLOT.pitchY;
  const stack = x + 44;
  const width = digits * CELL.w;
  const work = stack + width + STACK_ROOM;
  const cells = (top: number) => Array.from({ length: digits }, (_, i) => rect(stack + i * CELL.w, top, CELL.w, CELL.h));
  const answer = rect(stack, y + 86, width, PRINT_RULES.answer.minHeight);
  const { reach } = PRINT_RULES;
  return {
    slot: rect(x, y, SLOT.w, SLOT.h),
    label: rect(x, y + 14, 24, CELL.h),
    question: rect(stack, y + 14, width, 60),
    topCells: cells(y + 14),
    bottomCells: cells(y + 14 + CELL.h),
    rule: rect(stack, y + 72, width, 1.2),
    answer,
    reach: rect(answer.x - reach.left, answer.y - reach.top, answer.w + reach.left + reach.right, answer.h + reach.top + reach.bottom),
    work: rect(work, y, x + SLOT.w - work, SLOT.h),
  };
}

const side = (s: Side, digits: number) => ({
  frame: frame(s),
  places: Array.from({ length: ROWS * COLUMNS }, (_, i) => place(s, digits, i % COLUMNS, Math.floor(i / COLUMNS))),
});

/** Eight column stacks on a side: two across and four down. */
const stacks = (id: string, digits: number): PageTemplate => ({ id, faces: ["column"], digits, sides: { front: side("front", digits), back: side("back", digits) } });

const columns2x4 = stacks("columns-2x4", 3);
const columns2x4Wide = stacks("columns-2x4-wide", 5);

export const TEMPLATES: ReadonlyMap<string, PageTemplate> = new Map([columns2x4, columns2x4Wide].map((t) => [t.id, t]));

/** The digit places that a question and its answer need in a stack. The sign takes the place left of the bottom line. */
export const digitPlaces = (face: Face, answer: string): number => Math.max(face.top.length, face.sign.length + face.bottom.length, answer.length);
