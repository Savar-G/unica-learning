// The contract of the workbook engine: types and print facts only. The engine fills it, and later the scan code reads
// it, so it imports nothing. All lengths are points (72 to the inch) from the top left corner of the page.

/** Changes when the same input can give other bytes. A book records it, so a replay can tell which part differs. */
export const ENGINE_VERSION = "2.0.0-s11";

export interface Rect { x: number; y: number; w: number; h: number }

export type Side = "front" | "back";

/**
 * The answer kinds that marking can read. A shape may use only one of these. A "digit" is one digit, 0 to 9: the digit of
 * one place of a number. A "quantity" is a whole number with the unit that prints beside its answer area (24 muffins).
 */
export const ANSWER_KINDS = ["whole-number", "digit", "quantity"] as const;
export type AnswerKind = (typeof ANSWER_KINDS)[number];

/** What one answer area must hold. The name is unique in its question: "answer", "blank-1", "quotient", "remainder". Only a quantity has a unit. */
export interface AnswerPart { name: string; kind: AnswerKind; value: string; unit?: string }
/** The parts of an answer in reading order, each with an answer area of its own. A question with one area has one part. */
export interface Answer { parts: AnswerPart[] }

/** The value of a part, with its unit when it is a quantity: 24 muffins. */
const partValue = (part: AnswerPart): string => (part.kind === "quantity" ? `${part.value} ${part.unit ?? ""}` : part.value);
/** The line that ends the worked steps: the value of each part (20, 30). A remainder says that it is one: 9 R1. */
export const answerLine = ({ parts }: Answer): string => parts.map((p, i) => (i === 0 ? partValue(p) : p.name === "remainder" ? ` R${p.value}` : `, ${partValue(p)}`)).join("");

/** What a question looks like, with no knowledge of its math: the layout draws it, and nothing else reads it. */
export const FACE_KINDS = ["column", "equation", "sequence", "bracket", "fields", "figure", "story"] as const;
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
/** A prompt, and below it one row for each blank: a label and the answer area of the part with the name `blank`. */
export interface FieldsFace { kind: "fields"; prompt: string; rows: { label: string; blank: string }[] }
/** A bar model: one outlined bar for each part, side by side, and below them a bracket over all of them with the label of the total. */
export interface BarModelFigure { kind: "bar-model"; parts: string[]; totalLabel: string }
/** What a drawn figure shows, as data. The layout draws it from rectangles, lines and texts; it knows no math in it. */
export type FigureData = BarModelFigure;
/** A drawn figure, and below it a prompt and the answer area of the part with the name `blank`. */
export interface FigureFace { kind: "figure"; figure: FigureData; prompt: string; blank: string }
/** A word problem: flow text of words and math, an answer area with the unit after it, and a work area below the text. */
export interface StoryFace { kind: "story"; tokens: FlowToken[]; unit: string; blank: string }
export type Face = ColumnFace | EquationFace | SequenceFace | BracketFace | FieldsFace | FigureFace | StoryFace;

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
export const REGION_ROLES = ["heading", "instruction", "footer", "qr", "scan-mark", "slot", "label", "question", "answer", "reach", "work", "capture"] as const;
export type RegionRole = (typeof REGION_ROLES)[number];

/** A token of flow text. A line may end between two pieces of a word and between two tokens, and nowhere else. Math is one piece. */
export interface FlowToken { kind: "word" | "math"; pieces: string[] }
/** A word may be split after each hyphen. */
export const wordToken = (word: string): FlowToken => ({ kind: "word", pieces: word.split(/(?<=-)/) });
export const mathToken = (math: string): FlowToken => ({ kind: "math", pieces: [math] });
export const tokenText = ({ pieces }: FlowToken): string => pieces.join("");

/** What the typesetter draws. A text is one line in the middle of the height of its rectangle; a flow is lines from its top. Each rectangle is on the page, not inside its region. */
export type Ink =
  | { kind: "fill"; rect: Rect; color: string }
  | { kind: "outline"; rect: Rect; color: string; width: number }
  | { kind: "text"; rect: Rect; color: string; text: string; size: number; weight: number; align: "left" | "center" | "right" }
  | { kind: "flow"; rect: Rect; color: string; tokens: FlowToken[]; size: number; weight: number; leading: number };

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
  /** What a child writes on the page that is not an answer: never scored and never in the answers of a book. */
  captures: Capture[];
}

/** The kinds of writing that a page captures beside its answers. A time log is the start and the finish time of a day. */
export const CAPTURE_KINDS = ["time-log"] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];
/** One box of a capture, with the clear space around it. */
export interface CaptureField { name: string; rect: Rect; reach: Rect }
/** A capture prints in the region with its id and the role "capture"; its fields are in reading order. */
export interface Capture { id: string; kind: CaptureKind; rect: Rect; fields: CaptureField[] }

/** Where the typesetter says that it put a region. `sheet` counts the pages of the file from 1. */
export interface Position { id: string; sheet: number; rect: Rect }

/** A text that the typesetter says that it drew. */
export interface DrawnText {
  sheet: number;
  /** The top left corner of the rectangle that it drew a text in. A piece of flow text has no rectangle of its own. */
  x: number;
  y: number;
  text: string;
  size: number;
  weight: number;
  /** Where the text starts and ends, on the line that its letters stand on. */
  start: { x: number; y: number };
  end: { x: number; y: number };
  /** Its size with all the room it wants: its width, the height of a capital, and how far its ink goes above and below its line. */
  natural: { w: number; capitals: number; above: number; below: number };
  /** For a piece of a flow: the width of a space, and the parts of a line above and below the line that its letters stand on. */
  flow: { space: number; rise: number; fall: number } | null;
}

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
  /** The smallest height of a line of work that a child writes, the smallest work area beside a stack, and below a word problem. */
  workLine: 18,
  stackWork: { w: 38, h: 140 },
  storyWork: { w: 220, h: 104 },
  /** The place of one digit of a stack or inside a bracket, and the height of a text that stands in a line. */
  cell: { w: 24, h: 28 },
  textHeight: 28,
  /** The smallest and the largest size of a text of a question. */
  questionSize: { min: 16, max: 30 },
  /** A line of a question, and its distance to the digits that it belongs to. */
  line: { height: 1.2, gap: 2 },
  /** The most space between the texts of an equation and the reach of the area after them. */
  equationGap: 2,
  /** The widths of the number outside a bracket and of its sign. */
  bracket: { outside: 28, sign: 12 },
  /** The frame of a page: the space beside its scan marks and its QR code, the marks and their lines, and its texts. */
  frame: {
    gap: 8,
    mark: { size: 13.5, line: 2 },
    heading: { h: 20, size: 15, weight: 600 },
    instruction: { top: 26, h: 18, size: 12, weight: 400 },
    footer: { h: 16, size: 11, weight: 400 },
  },
  /** The number of a question, at the left end of its slot. The one of a stack has the width of a digit place. */
  label: { w: 20, size: 11, weight: 600 },
  /**
   * A bar model: the frame of its bars, their height, the room between a bar and its text, and their outline; below them
   * the bracket of the total (a line with a tick at each end, `gap` below the bars), and the width of the label of the total.
   */
  figure: { width: 288, bar: 36, inset: 4, outline: 1, tick: 10, gap: 4, totalLabel: 40, size: 18 },
  /**
   * The time log on the first page of a day: a band above the footer, beside the QR code, from the left end of the footer.
   * Each field is a label, `labelGap`, and a box with `reach` of clear space round it; `gap` is the room between the fields.
   */
  /**
   * A word problem: its flow text starts `top` below the top of its question and has room for `lines` lines; its number
   * stands at the left of the first line in a box of `label` points; the unit stands right of the reach of the answer
   * area, in the middle of its height; the work area starts `gap` below the text.
   */
  story: { top: 8, flow: { h: 68, size: 12, weight: 400, leading: 5 }, label: 15, unit: { w: 118, size: 16, weight: 400 }, gap: 6 },
  timeLog: { top: 700, h: 36, label: { w: 40, size: 11, weight: 600 }, box: { w: 72, h: 26, outline: 0.75 }, reach: 5, labelGap: 2, gap: 8, fields: ["start", "finish"], labels: ["Start", "Finish"] },
  maxAnswerColumns: 2,
  maxInstructionCharacters: 60,
  maxTitleCharacters: 44,
} as const;

/** The characters that every bundled font holds. The typesetter prints an empty box, with no warning, for any other. */
const PRINTABLE = /^[ -~×÷·–‘’“”°½¼¾]*$/;
export const isPrintable = (text: string): boolean => PRINTABLE.test(text);
