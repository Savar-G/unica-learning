// The contract of the workbook engine: types and print facts only. The engine fills it, and later the scan code reads
// it, so it imports nothing. All lengths are points (72 to the inch) from the top left corner of the page.

/** Changes when the same input can give other bytes. A book records it, so a replay can tell which part differs. */
export const ENGINE_VERSION = "2.0.0-s3";

export interface Rect { x: number; y: number; w: number; h: number }

export type Side = "front" | "back";

/** The answer kinds that marking can read. A shape may use only one of these. */
export const ANSWER_KINDS = ["whole-number"] as const;
export type AnswerKind = (typeof ANSWER_KINDS)[number];

export interface Answer { kind: AnswerKind; value: string }

/** What a question looks like, with no knowledge of its math: the layout draws it, and nothing else reads it. */
export interface ColumnFace { kind: "column"; top: string; sign: string; bottom: string }
export type Face = ColumnFace;

/** What a step puts on the paper. "write" is a digit of the answer; "carry" is the small digit above the next column. */
export const STEP_MARKS = ["write", "carry"] as const;
/** One digit of the working. Place 0 is the ones, place 1 the tens, and so on. */
export interface StepMark { mark: (typeof STEP_MARKS)[number]; place: number; digit: string }

/** One worked step: the line that a parent reads, and what it draws. The last step is the answer, with no marks. */
export interface Step { text: string; marks: StepMark[] }

/** One printed question of one child. */
export interface BookItem {
  id: string;
  sheetId: string;
  side: Side;
  rowId: string;
  /** The number printed beside the question, from 1 on each side. */
  number: number;
  shape: string;
  shapeVersion: number;
  question: unknown;
  face: Face;
  answer: Answer;
  steps: Step[];
  difficulty: number;
}

/** Every role a printed rectangle can have. `slot` holds the other rectangles of one item; `reach` holds its answer. */
export const REGION_ROLES = ["heading", "instruction", "footer", "qr", "scan-mark", "slot", "label", "question", "answer", "reach", "work"] as const;
export type RegionRole = (typeof REGION_ROLES)[number];

/** What the typesetter draws. Each rectangle is on the page, not inside its region. */
export type Ink =
  | { kind: "fill"; rect: Rect; color: string }
  | { kind: "outline"; rect: Rect; color: string; width: number }
  | { kind: "text"; rect: Rect; color: string; text: string; size: number; weight: number; align: "left" | "center" | "right" };

export interface Region {
  id: string;
  role: RegionRole;
  rect: Rect;
  /** The item that a slot, label, question, answer, reach or work rectangle belongs to. */
  item: string | null;
  ink: Ink[];
}

export interface PageModel {
  id: string;
  sheetId: string;
  attempt: number;
  side: Side;
  /** The running page number in the level. */
  page: number;
  levelName: string;
  topicCode: string;
  topicTitle: string;
  instruction: string;
  template: string;
  size: { w: number; h: number };
  /** The text that the QR code of this page holds. */
  qr: string;
  regions: Region[];
}

/** Where the typesetter says that it put a region. `sheet` counts the pages of the file from 1. */
export interface Position { id: string; sheet: number; rect: Rect }

/** A text that the typesetter says that it drew, with the top left corner of the rectangle it drew it in. */
export interface DrawnText { sheet: number; x: number; y: number; text: string }

/** How fine a page image is. A page image is the paper at this size, so a point of the model has one place in it. */
export const IMAGE_PIXELS_PER_INCH = 150;

/** The paper and the space rules of every v2 page (product rules; a template must obey them). */
export const PAPER = { w: 612, h: 792 } as const;
export const PRINT_RULES = {
  /** Clear space next to the binding edge. */
  spineZone: 90,
  /** Clear space at each other edge. */
  outerMargin: 36,
  /** The smallest QR code, with its quiet zone, and the smallest square in it. */
  qrMin: 43.2,
  qrModuleMin: 1.2,
  /** Clear space around an answer area. */
  reach: { left: 19.2, right: 28.8, top: 9.6, bottom: 9.6 },
  /** The smallest answer area: a width for each character, plus room, and never less than the minimum. */
  answer: { perCharacter: 14.4, extra: 14.4, minWidth: 72, minHeight: 42 },
  maxAnswerColumns: 2,
  maxInstructionCharacters: 60,
  maxTitleCharacters: 44,
} as const;

/** The characters that every bundled font holds. The typesetter prints an empty box, with no warning, for any other. */
const PRINTABLE = /^[ -~×÷·–‘’“”°½¼¾]*$/;
export const isPrintable = (text: string): boolean => PRINTABLE.test(text);
