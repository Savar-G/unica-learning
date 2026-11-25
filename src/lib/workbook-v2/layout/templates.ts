// The page templates: fixed rectangles in points. Nothing here depends on what a page holds. The design of the
// templates is not chosen yet; these prove the path. A template writes both sides out from the same numbers: the
// spine zone is on the left of a front page and on the right of a back page, and everything moves with it.
import { answerLine, BRACKET_SIGN, PAPER, PRINT_RULES, type Answer, type Face, type FaceToken, type Rect, type Side } from "../contract";

export interface PageFrame {
  heading: Rect;
  instruction: Rect;
  footer: Rect;
  qr: Rect;
  marks: { tl: Rect; tr: Rect; br: Rect; bl: Rect };
}

/** The area that an answer is written in, and the clear space around it. */
export interface AnswerArea { answer: Rect; reach: Rect }

interface PlaceFrame { slot: Rect; label: Rect; question: Rect }

/** A place for one column stack. `cells` are the digit places of the stack, left to right, top line first. */
export interface ColumnPlace extends PlaceFrame, AnswerArea {
  topCells: Rect[];
  bottomCells: Rect[];
  rule: Rect;
  work: Rect;
}

/** A place for one token: what can stand there is not null. */
export interface TokenCell { text: Rect | null; area: AnswerArea | null }

/**
 * A place for tokens, with no work area. `forms` are the fixed cells of each form of a question, in reading order: one
 * form for each place of a blank. A question with fewer tokens than cells takes the first cells, or the last ones so
 * that all answer areas are in one column.
 * A `rule` is a line above a question that stands below another one.
 */
export interface TokenPlace extends PlaceFrame { forms: TokenCell[][]; from: "first" | "last"; textSize: number; rule: Rect | null }

/**
 * A place for one bracket. `above` are the cells over it, which a question must have exactly: the first area stands over
 * `inside`, a cell for each character of the number in the bracket, from the sign on. `line` is the line of the bracket.
 */
export interface BracketPlace extends PlaceFrame { above: TokenCell[]; outside: Rect; sign: Rect; inside: Rect[]; line: Rect; work: Rect | null }

export type ItemPlace = ColumnPlace | TokenPlace | BracketPlace;

/** How large a question is, in each way that a template cares about. */
export type Needs = Readonly<Record<string, number>>;

export interface PageTemplate<P extends ItemPlace = ItemPlace> {
  id: string;
  faces: readonly Face["kind"][];
  /** The largest question that each place holds, under the names that `needsOf` uses. */
  holds: Needs;
  sides: Record<Side, { frame: PageFrame; places: P[] }>;
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
const { cell: CELL, line: PRINTED_LINE, textHeight: TEXT_HEIGHT } = PRINT_RULES;
/** The room right of the stack before the work area: more than the reach takes. */
const STACK_ROOM = 34;
const SLOT = { w: 236, h: 140, top: 92, pitchX: 250, pitchY: 148 };

/** An answer area with exactly the clear space that the print rules want. */
function areaAt(answer: Rect): AnswerArea {
  const { reach } = PRINT_RULES;
  return { answer, reach: rect(answer.x - reach.left, answer.y - reach.top, answer.w + reach.left + reach.right, answer.h + reach.top + reach.bottom) };
}

function place(side: Side, digits: number, column: number, row: number): ColumnPlace {
  const x = liveLeft(side) + column * SLOT.pitchX;
  const y = SLOT.top + row * SLOT.pitchY;
  const stack = x + 44;
  const width = digits * CELL.w;
  const work = stack + width + STACK_ROOM;
  const cells = (top: number) => Array.from({ length: digits }, (_, i) => rect(stack + i * CELL.w, top, CELL.w, CELL.h));
  return {
    slot: rect(x, y, SLOT.w, SLOT.h),
    label: rect(x, y + 14, 24, CELL.h),
    question: rect(stack, y + 14, width, 60),
    topCells: cells(y + 14),
    bottomCells: cells(y + 14 + CELL.h),
    rule: rect(stack, y + 14 + 2 * CELL.h + PRINTED_LINE.gap, width, PRINTED_LINE.height),
    ...areaAt(rect(stack, y + 86, width, PRINT_RULES.answer.minHeight)),
    work: rect(work, y, x + SLOT.w - work, SLOT.h),
  };
}

const bothSides = <P extends ItemPlace>(count: number, place: (side: Side, index: number) => P): PageTemplate<P>["sides"] => {
  const side = (s: Side) => ({ frame: frame(s), places: Array.from({ length: count }, (_, i) => place(s, i)) });
  return { front: side("front"), back: side("back") };
};

/** Eight column stacks on a side: two across and four down. */
const stacks = (id: string, digits: number): PageTemplate<ColumnPlace> =>
  ({ id, faces: ["column"], holds: { "digit places": digits }, sides: bothSides(ROWS * COLUMNS, (s, i) => place(s, digits, i % COLUMNS, Math.floor(i / COLUMNS))) });

export const columns2x4 = stacks("columns-2x4", 3);
const columns2x4Wide = stacks("columns-2x4-wide", 5);

// The templates of tokens. A row is as high as the smallest answer area with its reach, so ten rows are the most that
// stand between the instruction and the QR code. The questions run down a column, then down the next one.

const LINE = { top: 82, pitch: 61.6, rows: 10 };
const AREA = { w: PRINT_RULES.answer.minWidth, h: PRINT_RULES.answer.minHeight };
/** An answer area of the smallest size with its reach. */
const CLEAR_WIDTH = PRINT_RULES.reach.left + AREA.w + PRINT_RULES.reach.right;
const LABEL = 22;
const TWO = { w: 240, pitch: 246 };
/** The characters that the smallest answer area has room for. */
const AREA_CHARACTERS = Math.floor((AREA.w - PRINT_RULES.answer.extra) / PRINT_RULES.answer.perCharacter);

/** The cells of one line, one after the other: a width of text, or "area". */
function lineCells(x: number, y: number, cells: readonly (number | "area")[], pitch = LINE.pitch): TokenCell[] {
  let left = x;
  return cells.map((cell) => {
    const at = left;
    left += cell === "area" ? CLEAR_WIDTH : cell;
    if (cell === "area") return { text: null, area: areaAt(rect(at + PRINT_RULES.reach.left, y + (pitch - AREA.h) / 2, AREA.w, AREA.h)) };
    return { text: rect(at, y + (pitch - TEXT_HEIGHT) / 2, cell, TEXT_HEIGHT), area: null };
  });
}

const labelAt = (x: number, y: number): Rect => rect(x, y + (LINE.pitch - TEXT_HEIGHT) / 2, LABEL - 2, TEXT_HEIGHT);
const rowTop = (row: number) => LINE.top + row * LINE.pitch;

/** A number and the sign after it. */
const FACT = { number: 33, sign: 16 };
const SUM = { number: 24, sign: 14 };
const SUM_NUMBERS = 9;
const FACT_LINE = [FACT.number, FACT.sign, FACT.number, FACT.sign, "area"] as const;
const SUM_LINE = [...Array.from({ length: SUM_NUMBERS }, () => [SUM.number, SUM.sign]).flat(), "area" as const];

/** Equations that end in their one blank. */
function endBlank(id: string, columns: number, cells: readonly (number | "area")[], width: number, characters: number, textSize: number): PageTemplate<TokenPlace> {
  const place = (s: Side, i: number): TokenPlace => {
    const x = liveLeft(s) + Math.floor(i / LINE.rows) * TWO.pitch;
    const y = rowTop(i % LINE.rows);
    const form = lineCells(x + width - CLEAR_WIDTH - cells.reduce<number>((sum, cell) => sum + (cell === "area" ? 0 : cell), 0), y, cells);
    const [first] = form;
    const textLeft = first.text?.x ?? x;
    return {
      slot: rect(x, y, width, LINE.pitch), label: labelAt(x, y), forms: [form], from: "last", textSize, rule: null,
      question: rect(textLeft, y + (LINE.pitch - TEXT_HEIGHT) / 2, x + width - CLEAR_WIDTH - textLeft, TEXT_HEIGHT),
    };
  };
  return { id, faces: ["equation"], holds: { "places in its line": cells.length, "characters in a number": characters }, sides: bothSides(columns * LINE.rows, place) };
}

/** Equations with one blank in the place of the first or the second number. The answer areas are in one column. */
function innerBlank(id: string): PageTemplate<TokenPlace> {
  const { number, sign } = FACT;
  const place = (s: Side, i: number): TokenPlace => {
    const x = liveLeft(s);
    const y = rowTop(i);
    const areaLeft = x + LABEL + number + sign;
    return {
      slot: rect(x, y, LIVE, LINE.pitch), label: labelAt(x, y), from: "first", textSize: 18, rule: null,
      question: rect(x + LABEL, y, 4 * (number + sign) + CLEAR_WIDTH, LINE.pitch),
      forms: [lineCells(areaLeft, y, ["area", sign, number, sign, number]), lineCells(x + LABEL, y, [number, sign, "area", sign, number])],
    };
  };
  return { id, faces: ["equation"], holds: { "places in its line": 5, "characters in a number": 3 }, sides: bothSides(LINE.rows, place) };
}

/** The terms of a sequence: as close as the reaches of two answer areas allow, so that a line fits between two sequences. */
const LADDER = { top: 80.2, pitch: PRINT_RULES.reach.top + AREA.h + PRINT_RULES.reach.bottom, gap: 5.4 };

/** Sequences that go down the page, so that the blanks of a side are in two columns. Each cell holds a term or a blank. */
function ladders(id: string, terms: number, down: number): PageTemplate<TokenPlace> {
  const height = terms * LADDER.pitch;
  const place = (s: Side, i: number): TokenPlace => {
    const x = liveLeft(s) + Math.floor(i / down) * TWO.pitch;
    const left = x + LABEL;
    const y = LADDER.top + (i % down) * (height + LADDER.gap);
    // The line and the room below it belong to the lower sequence.
    const above = i % down > 0 ? LADDER.gap / 2 : 0;
    const form = Array.from({ length: terms }, (_, t): TokenCell => {
      const top = y + t * LADDER.pitch;
      const area = areaAt(rect(left + PRINT_RULES.reach.left, top + PRINT_RULES.reach.top, AREA.w, AREA.h));
      return { area, text: rect(area.answer.x, top + (LADDER.pitch - TEXT_HEIGHT) / 2, AREA.w, TEXT_HEIGHT) };
    });
    return {
      slot: rect(x, y - above, TWO.w, height + above), label: rect(x, y + (LADDER.pitch - TEXT_HEIGHT) / 2, LABEL - 2, TEXT_HEIGHT),
      question: rect(left, y - above, CLEAR_WIDTH, height + above), forms: [form], from: "first", textSize: 20,
      rule: above > 0 ? rect(left, y - above, CLEAR_WIDTH, PRINTED_LINE.height) : null,
    };
  };
  return { id, faces: ["sequence"], holds: { terms, "characters in a number": AREA_CHARACTERS }, sides: bothSides(2 * down, place) };
}

/** Equations that end in two blanks with a text between them. The answer areas are in two columns. */
function twoBlanks(id: string): PageTemplate<TokenPlace> {
  const { number, sign } = { number: 42, sign: 18 };
  const place = (s: Side, i: number): TokenPlace => {
    const [x, y] = [liveLeft(s), rowTop(i)];
    const form = lineCells(x + LABEL, y, [number, sign, number, sign, "area", sign, "area"]);
    const width = 2 * (number + sign) + 2 * CLEAR_WIDTH + sign;
    return { slot: rect(x, y, LIVE, LINE.pitch), label: labelAt(x, y), question: rect(x + LABEL, y, width, LINE.pitch), forms: [form], from: "last", textSize: 18, rule: null };
  };
  return { id, faces: ["equation"], holds: { "places in its line": 7, "characters in a number": 3 }, sides: bothSides(LINE.rows, place) };
}

/** The brackets of a side: where they start, the room for a text between two areas, and the room above the work. */
const BRACKET = { ...PRINT_RULES.bracket, top: 82, height: 616, between: 16, gap: 2 };
const CLEAR_HEIGHT = PRINT_RULES.reach.top + AREA.h + PRINT_RULES.reach.bottom;
const INSIDE = Math.floor(AREA.w / CELL.w);

/**
 * Brackets with the answer area above, so that a digit stands over each digit inside, and a work area below. With a text
 * and a second area above, the areas of one question are the two columns of the side.
 */
function brackets(id: string, columns: 1 | 2, rows: number): PageTemplate<BracketPlace> {
  const height = BRACKET.height / rows;
  const numberTop = CLEAR_HEIGHT + PRINTED_LINE.height + PRINTED_LINE.gap;
  const workTop = numberTop + CELL.h + BRACKET.gap;
  const workLines = Math.floor((height - workTop) / PRINT_RULES.workLine);
  const place = (s: Side, i: number): BracketPlace => {
    const x = liveLeft(s) + (i % columns) * TWO.pitch;
    const y = BRACKET.top + Math.floor(i / columns) * height;
    const width = columns === 1 ? LIVE : TWO.w;
    const outside = x + LABEL;
    const sign = outside + BRACKET.outside;
    const number = sign + BRACKET.sign;
    const above = lineCells(number - PRINT_RULES.reach.left, y, columns === 1 ? ["area", BRACKET.between, "area"] : ["area"], CLEAR_HEIGHT);
    const last = above[above.length - 1].area?.reach ?? rect(x, y, 0, 0);
    return {
      slot: rect(x, y, width, height), label: rect(x, y + numberTop, LABEL - 2, CELL.h), above,
      question: rect(outside, y, last.x + last.w - outside, numberTop + CELL.h),
      outside: rect(outside, y + numberTop, BRACKET.outside, CELL.h), sign: rect(sign, y + CLEAR_HEIGHT + PRINTED_LINE.height, BRACKET.sign, PRINTED_LINE.gap + CELL.h),
      inside: Array.from({ length: INSIDE }, (_, c) => rect(number + c * CELL.w, y + numberTop, CELL.w, CELL.h)),
      line: rect(sign, y + CLEAR_HEIGHT, BRACKET.sign + AREA.w, PRINTED_LINE.height),
      work: workLines > 0 ? rect(x, y + workTop, width, height - workTop) : null,
    };
  };
  const holds = { "characters outside": 2, "characters inside": INSIDE, "characters in an answer": AREA_CHARACTERS, "lines of work": workLines };
  return { id, faces: ["bracket"], holds, sides: bothSides(columns * rows, place) };
}

const ALL: readonly PageTemplate[] = [
  columns2x4, columns2x4Wide,
  endBlank("facts-2x10", 2, FACT_LINE, TWO.w, 3, 18),
  endBlank("sums-1x10", 1, SUM_LINE, LIVE, 2, 16),
  innerBlank("blanks-1x10"),
  ladders("sequences-2x2", 5, 2),
  ladders("sequences-2x1", 10, 1),
  twoBlanks("remainders-1x10"),
  brackets("brackets-2x6", 2, 6), brackets("brackets-2x4", 2, 4), brackets("brackets-2x3", 2, 3),
  brackets("brackets-1x4", 1, 4), brackets("brackets-1x3", 1, 3),
];
export const TEMPLATES: ReadonlyMap<string, PageTemplate> = new Map(ALL.map((t) => [t.id, t]));

/** How large a question is with its answer. A stack has its sign in the place left of the bottom line. */
export function needsOf(face: Face, { parts }: Answer): Needs {
  const answer = parts.reduce((most, p) => Math.max(most, p.value.length), 0);
  if (face.kind === "column") return { "digit places": Math.max(face.top.length, face.sign.length + face.bottom.length, answer) };
  if (face.kind === "bracket") return { "characters outside": face.outside.length, "characters inside": face.inside.length, "characters in an answer": answer, "lines of work": face.workLines };
  const characters = face.tokens.reduce((most, t) => ("text" in t ? Math.max(most, t.text.length) : most), answer);
  return face.kind === "equation" ? { "places in its line": face.tokens.length, "characters in a number": characters } : { terms: face.tokens.length, "characters in a number": characters };
}

/** The cells of the form of a place that has a text cell for each text of the question, and an area for each blank. */
export function cellsFor({ forms, from }: TokenPlace, tokens: readonly FaceToken[]): TokenCell[] | null {
  for (const form of forms) {
    const cells = from === "first" ? form.slice(0, tokens.length) : form.slice(Math.max(0, form.length - tokens.length));
    if (cells.length === tokens.length && tokens.every((token, i) => isAt(cells[i], token))) return cells;
  }
  return null;
}

const isAt = (cell: TokenCell, token: FaceToken): boolean => ("text" in token ? cell.text : cell.area) !== null;

/** The tokens of a face: of its line, or of what stands above its bracket. A stack has none. */
export const tokensOf = (face: Face): readonly FaceToken[] => (face.kind === "column" ? [] : face.kind === "bracket" ? face.above : face.tokens);

/** Whether a place has a text cell for each text of the question, and an area for each blank. */
function hasCells(place: ItemPlace, face: Face): boolean {
  const tokens = tokensOf(face);
  if (face.kind === "column") return "topCells" in place;
  if (face.kind === "bracket") return "above" in place && place.above.length === tokens.length && tokens.every((token, i) => isAt(place.above[i], token));
  return "forms" in place && cellsFor(place, tokens) !== null;
}

/** A question with its answer, as a problem shows it. */
export function questionText(face: Face, answer: Answer): string {
  if (face.kind === "column") return `${face.top} ${face.sign} ${face.bottom} = ${answerLine(answer)}`;
  const value = (blank: string) => answer.parts.find((p) => p.name === blank)?.value ?? "?";
  const tokens = tokensOf(face).map((t) => ("text" in t ? t.text : `[${value(t.blank)}]`)).join(" ");
  return face.kind === "bracket" ? `${face.outside}${BRACKET_SIGN}${face.inside} = ${tokens}` : tokens;
}

/** Why a question of this size does not fit a template, or null. */
function needsProblem(template: PageTemplate, needs: Needs): string | null {
  const name = Object.keys(needs).find((n) => !(needs[n] <= template.holds[n]));
  return name === undefined ? null : `needs ${needs[name]} ${name} and the template "${template.id}" has ${template.holds[name]}`;
}

/** Why a question does not fit one place of a template, or null. */
export function placeProblem(template: PageTemplate, place: ItemPlace, face: Face, answer: Answer): string | null {
  if (!template.faces.includes(face.kind)) return `is ${face.kind === "equation" ? "an" : "a"} ${face.kind} question and the template "${template.id}" has no place for one`;
  const problem = needsProblem(template, needsOf(face, answer));
  if (problem) return problem;
  if (face.kind === "column" && answer.parts.length !== 1) return `has ${answer.parts.length} answer parts and a stack has one answer area`;
  return hasCells(place, face) ? null : `has its blanks where the template "${template.id}" has no answer area`;
}

/** Why a question does not fit some place of a template, on any side, or null. */
export function fitProblem(template: PageTemplate, face: Face, answer: Answer): string | null {
  for (const place of [...template.sides.front.places, ...template.sides.back.places]) {
    const problem = placeProblem(template, place, face, answer);
    if (problem) return problem;
  }
  return null;
}
