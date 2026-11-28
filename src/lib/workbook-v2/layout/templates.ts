// The page templates: fixed rectangles in points. Nothing here depends on what a page holds. The design of the
// templates is not chosen yet; these prove the path. A template writes both sides out from the same numbers: the
// spine zone is on the left of a front page and on the right of a back page, and everything moves with it.
import { answerLine, BRACKET_SIGN, PAPER, PRINT_RULES, SCAN_LAYOUTS, V2_SCAN_LAYOUT_VERSION, tokenText, type Answer, type Face, type FaceToken, type Rect, type Side, type TimeLogPlace } from "../contract";

export interface PageFrame {
  heading: Rect;
  instruction: Rect;
  footer: Rect;
  qr: Rect;
  marks: { tl: Rect; tr: Rect; br: Rect; bl: Rect };
  /** Only a front page has a place for it: the first page of a day is a front page. */
  timeLog: TimeLogPlace | null;
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

/**
 * A place for a prompt and its rows, one below the other: in each row a label, then an answer area. A question with fewer
 * rows than the place takes the first ones. A `rule` is a line above a question that stands below another one.
 */
export interface FieldsPlace extends PlaceFrame { prompt: Rect; fields: { label: Rect; area: AnswerArea }[]; promptSize: number; labelSize: number; rule: Rect | null }

/**
 * A place for one drawn figure, with no work area. `frame` is the outer frame of the bars, which share its width; below it
 * stand the bracket of the total in `bracket`, the label of the total in `totalLabel`, and the prompt in `prompt`, right
 * before the reach of the answer area.
 */
export interface FigurePlace extends PlaceFrame, AnswerArea { frame: Rect; bracket: Rect; totalLabel: Rect; prompt: Rect; textSize: number }

/**
 * A place for one word problem: the flow text across the top, the work area below it on the left, and the answer area on
 * the right of the work area with the unit after its reach. The question holds them all; only the text and the unit ink it.
 */
export interface StoryPlace extends PlaceFrame, AnswerArea { flow: Rect; work: Rect; unit: Rect }

export type ItemPlace = ColumnPlace | TokenPlace | BracketPlace | FieldsPlace | FigurePlace | StoryPlace;

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
const { gap: GAP, mark: { size: MARK }, heading: HEADING, instruction: INSTRUCTION, footer: FOOTER } = PRINT_RULES.frame;
const LIVE = PAPER.w - PRINT_RULES.spineZone - PRINT_RULES.outerMargin;
const liveLeft = (side: Side) => (side === "front" ? PRINT_RULES.spineZone : PRINT_RULES.outerMargin);

function frame(side: Side): PageFrame {
  const { content: { x: left }, qr, marks, timeLog } = SCAN_LAYOUTS[V2_SCAN_LAYOUT_VERSION][side];
  const textLeft = left + MARK + GAP;
  const textWidth = LIVE - 2 * (MARK + GAP);
  return {
    heading: rect(textLeft, TOP, textWidth, HEADING.h),
    instruction: rect(left, TOP + INSTRUCTION.top, LIVE, INSTRUCTION.h),
    footer: rect(side === "front" ? textLeft : qr.x + qr.w + GAP, BOTTOM - FOOTER.h, textWidth - qr.w - GAP, FOOTER.h),
    qr,
    marks,
    timeLog,
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
    label: rect(x, y + 14, CELL.w, CELL.h),
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
/** The number of a question, and the space after it. */
const LABEL = PRINT_RULES.label.w + 2;
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

const labelAt = (x: number, y: number): Rect => rect(x, y + (LINE.pitch - TEXT_HEIGHT) / 2, PRINT_RULES.label.w, TEXT_HEIGHT);
const rowTop = (row: number) => LINE.top + row * LINE.pitch;

/** A number and the sign after it. */
const FACT = { number: 33, sign: 16 };
const SUM = { number: 24, sign: 14 };
const SUM_NUMBERS = 9;
/**
 * Any number of three digits fits its cell: "500" is wider than "100". The signs have less room and stand a little before
 * the area, so that each text has the same middle as in cells of 33 and 16 points.
 */
const WIDE_FACT = { number: 36.9375, sign: 12.0625, gap: 1.96875 };
const FACT_LINE = [WIDE_FACT.number, WIDE_FACT.sign, WIDE_FACT.number, WIDE_FACT.sign];
const SUM_LINE = Array.from({ length: SUM_NUMBERS }, () => [SUM.number, SUM.sign]).flat();

/** Equations that end in their one blank. `gap` is the space before its area. */
function endBlank(id: string, columns: number, texts: readonly number[], gap: number, width: number, characters: number, textSize: number): PageTemplate<TokenPlace> {
  const place = (s: Side, i: number): TokenPlace => {
    const x = liveLeft(s) + Math.floor(i / LINE.rows) * TWO.pitch;
    const y = rowTop(i % LINE.rows);
    const area = x + width - CLEAR_WIDTH;
    const form = [...lineCells(area - gap - texts.reduce((sum, cell) => sum + cell, 0), y, texts), ...lineCells(area, y, ["area"])];
    const [first] = form;
    const textLeft = first.text?.x ?? x;
    return {
      slot: rect(x, y, width, LINE.pitch), label: labelAt(x, y), forms: [form], from: "last", textSize, rule: null,
      question: rect(textLeft, y + (LINE.pitch - TEXT_HEIGHT) / 2, x + width - CLEAR_WIDTH - textLeft, TEXT_HEIGHT),
    };
  };
  return { id, faces: ["equation"], holds: { "places in its line": texts.length + 1, "characters in a number": characters }, sides: bothSides(columns * LINE.rows, place) };
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
      slot: rect(x, y - above, TWO.w, height + above), label: rect(x, y + (LADDER.pitch - TEXT_HEIGHT) / 2, PRINT_RULES.label.w, TEXT_HEIGHT),
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
      slot: rect(x, y, width, height), label: rect(x, y + numberTop, PRINT_RULES.label.w, CELL.h), above,
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

/** Where the questions of fields start, their height together, the room above a prompt, and the size of the texts. */
const FIELDS = { top: 82, height: 616, above: 8, promptSize: 22, labelSize: 16, labelCharacters: 9, promptCharacters: 4 };

/**
 * Questions of fields in two columns, `down` of them in each: the prompt, then a row for each field, as high as an answer
 * area with its reach. The answer areas are at the right end of each column, so that a side has two columns of them.
 */
function fieldsTemplate(id: string, down: number): PageTemplate<FieldsPlace> {
  const height = FIELDS.height / down;
  const first = FIELDS.above + TEXT_HEIGHT;
  const rows = Math.floor((height - first) / CLEAR_HEIGHT);
  const place = (s: Side, i: number): FieldsPlace => {
    const x = liveLeft(s) + (i % 2) * TWO.pitch;
    const y = FIELDS.top + Math.floor(i / 2) * height;
    const left = x + LABEL;
    const reach = x + TWO.w - CLEAR_WIDTH;
    const fields = Array.from({ length: rows }, (_, r) => {
      const top = y + first + r * CLEAR_HEIGHT;
      return { label: rect(left, top + (CLEAR_HEIGHT - TEXT_HEIGHT) / 2, reach - left, TEXT_HEIGHT), area: areaAt(rect(reach + PRINT_RULES.reach.left, top + PRINT_RULES.reach.top, AREA.w, AREA.h)) };
    });
    return {
      slot: rect(x, y, TWO.w, height), label: rect(x, y + FIELDS.above, LABEL - 2, TEXT_HEIGHT),
      question: rect(left, y, TWO.w - LABEL, first + rows * CLEAR_HEIGHT), prompt: rect(left, y + FIELDS.above, TWO.w - LABEL, TEXT_HEIGHT),
      fields, promptSize: FIELDS.promptSize, labelSize: FIELDS.labelSize, rule: i >= 2 ? rect(left, y, TWO.w - LABEL, PRINTED_LINE.height) : null,
    };
  };
  const holds = { rows, "characters in the prompt": FIELDS.promptCharacters, "characters in a label": FIELDS.labelCharacters, "characters in an answer": AREA_CHARACTERS };
  return { id, faces: ["fields"], holds, sides: bothSides(2 * down, place) };
}

/** Where the figures start, their height together, and the room above the frame of the bars. */
const FIGURES = { top: 82, height: 616, above: 12 };
const FIGURE = PRINT_RULES.figure;

/**
 * Figures down the page, one in each row: the bars at the top, the bracket below them, and in the line below that the label
 * of the total under the middle of the bars, the prompt and the answer area at the right end, so that a side has one column
 * of areas. The bars stand in a line of their own, so that no text of them is read with the line of the answer.
 */
function figuresTemplate(id: string, rows: number): PageTemplate<FigurePlace> {
  const height = FIGURES.height / rows;
  const place = (s: Side, i: number): FigurePlace => {
    const x = liveLeft(s);
    const y = FIGURES.top + i * height;
    const left = x + LABEL;
    const frame = rect(left, y + FIGURES.above, FIGURE.width, FIGURE.bar);
    const bracket = rect(left, frame.y + FIGURE.bar + FIGURE.gap, FIGURE.width, FIGURE.tick);
    const area = areaAt(rect(x + LIVE - CLEAR_WIDTH + PRINT_RULES.reach.left, bracket.y + FIGURE.tick + FIGURE.gap, AREA.w, AREA.h));
    const line = area.answer.y + (AREA.h - TEXT_HEIGHT) / 2;
    const totalLabel = rect(left + (FIGURE.width - FIGURE.totalLabel) / 2, line, FIGURE.totalLabel, TEXT_HEIGHT);
    const promptLeft = totalLabel.x + totalLabel.w;
    return {
      slot: rect(x, y, LIVE, height), label: rect(x, frame.y + (FIGURE.bar - TEXT_HEIGHT) / 2, PRINT_RULES.label.w, TEXT_HEIGHT),
      question: rect(left, y, LIVE - LABEL, height), frame, bracket, totalLabel, prompt: rect(promptLeft, line, area.reach.x - promptLeft, TEXT_HEIGHT), textSize: FIGURE.size, ...area,
    };
  };
  return { id, faces: ["figure"], holds: { bars: 6 }, sides: bothSides(rows, place) };
}

/** Where the word problems start and the height of each. Three of them end above the time log and the QR code. */
const STORIES = { top: 82, pitch: 205 };
const STORY = PRINT_RULES.story;

/** Word problems down the page, one in each row, with one column of answer areas at the right. */
function storiesTemplate(id: string, rows: number): PageTemplate<StoryPlace> {
  const place = (s: Side, i: number): StoryPlace => {
    const x = liveLeft(s);
    const y = STORIES.top + i * STORIES.pitch;
    const left = x + LABEL;
    const flow = rect(left, y + STORY.top, LIVE - LABEL, STORY.flow.h);
    const work = rect(left, flow.y + flow.h + STORY.gap, PRINT_RULES.storyWork.w, PRINT_RULES.storyWork.h);
    const unitLeft = x + LIVE - STORY.unit.w;
    const area = areaAt(rect(unitLeft - PRINT_RULES.reach.right - AREA.w, work.y + PRINT_RULES.reach.top, AREA.w, AREA.h));
    return {
      slot: rect(x, y, LIVE, STORIES.pitch), label: rect(x, flow.y, PRINT_RULES.label.w, STORY.label), flow, work,
      question: rect(left, y, LIVE - LABEL, work.y + work.h - y), unit: rect(unitLeft, area.answer.y + (AREA.h - TEXT_HEIGHT) / 2, STORY.unit.w, TEXT_HEIGHT), ...area,
    };
  };
  return { id, faces: ["story"], holds: { "characters in an answer": AREA_CHARACTERS }, sides: bothSides(rows, place) };
}

const ALL: readonly PageTemplate[] = [
  columns2x4, columns2x4Wide,
  endBlank("facts-2x10", 2, FACT_LINE, WIDE_FACT.gap, TWO.w, 3, 18),
  endBlank("sums-1x10", 1, SUM_LINE, 0, LIVE, 2, 16),
  innerBlank("blanks-1x10"),
  ladders("sequences-2x2", 5, 2),
  ladders("sequences-2x1", 10, 1),
  twoBlanks("remainders-1x10"),
  brackets("brackets-2x6", 2, 6), brackets("brackets-2x4", 2, 4), brackets("brackets-2x3", 2, 3),
  brackets("brackets-1x4", 1, 4), brackets("brackets-1x3", 1, 3),
  fieldsTemplate("places-2x2", 2), fieldsTemplate("places-2x3", 3),
  figuresTemplate("figures-1x4", 4),
  storiesTemplate("stories-1x3", 3),
];
export const TEMPLATES: ReadonlyMap<string, PageTemplate> = new Map(ALL.map((t) => [t.id, t]));

/** How large a question is with its answer. A stack has its sign in the place left of the bottom line. */
export function needsOf(face: Face, { parts }: Answer): Needs {
  const answer = parts.reduce((most, p) => Math.max(most, p.value.length), 0);
  if (face.kind === "column") return { "digit places": Math.max(face.top.length, face.sign.length + face.bottom.length, answer) };
  if (face.kind === "bracket") return { "characters outside": face.outside.length, "characters inside": face.inside.length, "characters in an answer": answer, "lines of work": face.workLines };
  // A figure asks only for its bars, so that the question with the most bars is the largest one: each bar holds any number
  // that a shape prints there, and the bank check measures each one. The page rules check the width of the answer area.
  if (face.kind === "figure") return { bars: face.figure.parts.length };
  // The flow text and the unit are measured by the typesetter (checks/fit.ts) and by the bank check, word by word.
  if (face.kind === "story") return { "characters in an answer": answer };
  if (face.kind === "fields") return { rows: face.rows.length, "characters in the prompt": face.prompt.length, "characters in a label": face.rows.reduce((most, r) => Math.max(most, r.label.length), 0), "characters in an answer": answer };
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

/** The tokens of a face: of its line, of what stands above its bracket, or its prompt and each label with its blank. A stack has none. */
export function tokensOf(face: Face): readonly FaceToken[] {
  if (face.kind === "story") return [{ text: face.tokens.map(tokenText).join(" ") }, { text: face.unit }, { blank: face.blank }];
  if (face.kind === "figure") return [...face.figure.parts.map((text) => ({ text })), { text: face.figure.totalLabel }, { text: face.prompt }, { blank: face.blank }];
  if (face.kind === "fields") return [{ text: face.prompt }, ...face.rows.flatMap((row): FaceToken[] => [{ text: row.label }, { blank: row.blank }])];
  return face.kind === "column" ? [] : face.kind === "bracket" ? face.above : face.tokens;
}

/** Whether a place has a text cell for each text of the question, and an area for each blank. */
function hasCells(place: ItemPlace, face: Face): boolean {
  const tokens = tokensOf(face);
  if (face.kind === "column") return "topCells" in place;
  if (face.kind === "fields") return "fields" in place && face.rows.length <= place.fields.length;
  if (face.kind === "figure") return "frame" in place;
  if (face.kind === "story") return "flow" in place;
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
