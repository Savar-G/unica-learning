// The contract of the workbook engine: types and print facts only. The engine fills it, and later the scan code reads
// it, so it imports nothing. All lengths are points (72 to the inch) from the top left corner of the page.

/** Changes when the same input can give other bytes. A book records it, so a replay can tell which part differs. */
export const ENGINE_VERSION = "2.0.0-s6";

export interface Rect { x: number; y: number; w: number; h: number }

export type Side = "front" | "back";

/** The answer kinds that marking can read. A shape may use only one of these. */
export const ANSWER_KINDS = ["whole-number"] as const;
export type AnswerKind = (typeof ANSWER_KINDS)[number];

/** What one answer area must hold. The name is unique in its question: "answer", "blank-1", "quotient", "remainder". */
export interface AnswerPart { name: string; kind: AnswerKind; value: string }
/** The parts of an answer in reading order, each with an answer area of its own. A question with one area has one part. */
export interface Answer { parts: AnswerPart[] }

/** The line that ends the worked steps: the value of each part (20, 30). A remainder says that it is one: 9 R1. */
export const answerLine = ({ parts }: Answer): string => parts.map((p, i) => (i === 0 ? p.value : p.name === "remainder" ? ` R${p.value}` : `, ${p.value}`)).join("");

/** What a question looks like, with no knowledge of its math: the layout draws it, and nothing else reads it. */
export const FACE_KINDS = ["column", "equation", "sequence", "bracket"] as const;
export interface ColumnFace { kind: "column"; top: string; sign: string; bottom: string }
/** A printed text, or a blank: the answer area of the part with that name. */
export type FaceToken = { text: string } | { blank: string };
/** Tokens on one line, such as 5 × 7 = and a blank. */
export interface EquationFace { kind: "equation"; tokens: FaceToken[] }
/** Terms one after the other, down the page. */
export interface SequenceFace { kind: "sequence"; tokens: FaceToken[] }
/**
 * A number inside a bracket, one outside it, and tokens that stand above it: the first one over the number inside.
 * `workLines` is how many lines of writing the work below it needs, and 0 for a question that is worked in the head.
 */
export interface BracketFace { kind: "bracket"; above: FaceToken[]; outside: string; inside: string; workLines: number }
/** How the bracket prints between its two numbers. */
export const BRACKET_SIGN = ")";
export type Face = ColumnFace | EquationFace | SequenceFace | BracketFace;

/**
 * What a step puts on the paper. "write" is a digit of the answer; "carry" is the small digit above the next column.
 * "cross-out" strikes the number that a place of a printed row shows now, and "borrow" writes the new one above it: 3
 * above the 4 tens that gave 1, then 12 above the 2 ones that got it. A division writes one digit a mark: of the quotient,
 * of a product, of what is left, and the digit of the dividend that comes down next to it.
 */
export const STEP_MARKS = ["write", "carry", "cross-out", "borrow", "quotient", "product", "rest", "bring-down"] as const;
/** One mark of the working. Place 0 is the ones, place 1 the tens, and so on. A digit has two figures only from 10 to 18. */
export type StepMark =
  | { mark: "write" | "carry"; place: number; digit: string }
  | { mark: "cross-out" | "borrow"; row: "top"; place: number; digit: string }
  /** Row 0 is the line above the dividend, with the quotient only; the rows of the work below it count from 1. The places are those of the dividend. */
  | { mark: "quotient" | "product" | "rest" | "bring-down"; row: number; place: number; digit: string };

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

/** Every role a printed rectangle can have. `slot` holds the other rectangles of one item; `reach` holds one of its answers. */
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
  /** The answer part that an answer or reach rectangle belongs to. */
  part: string | null;
  ink: Ink[];
}

/** The last part of the id of a rectangle of a question. The part of a question with one answer area is "answer", and needs no other name. */
export const partRegionName = (role: RegionRole, number: number, part: string | null): string => `${role}-${number}${part === null || part === "answer" ? "" : `-${part}`}`;

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
  /** The smallest answer area: a width for each character, plus room, and never less than the minimum. Its outline is a line. */
  answer: { perCharacter: 14.4, extra: 14.4, minWidth: 72, minHeight: 42, outline: 0.75 },
  /** The smallest height of a line of work that a child writes, and the smallest work area beside a stack. */
  workLine: 18,
  stackWork: { w: 38, h: 140 },
  /** The place of one digit of a stack or inside a bracket, and the height of a text that stands in a line. */
  cell: { w: 24, h: 28 },
  textHeight: 28,
  /** A line of a question, and its distance to the digits that it belongs to. */
  line: { height: 1.2, gap: 2 },
  /** The widths of the number outside a bracket and of its sign. */
  bracket: { outside: 28, sign: 12 },
  maxAnswerColumns: 2,
  maxInstructionCharacters: 60,
  maxTitleCharacters: 44,
} as const;

/** The characters that every bundled font holds. The typesetter prints an empty box, with no warning, for any other. */
const PRINTABLE = /^[ -~×÷·–‘’“”°½¼¾]*$/;
export const isPrintable = (text: string): boolean => PRINTABLE.test(text);
