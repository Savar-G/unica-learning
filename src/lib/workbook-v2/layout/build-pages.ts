// Puts the content of a sheet into the rectangles of its templates. It decides no position of its own.
import type { SnapshotSheet } from "../bank/snapshot";
import { BRACKET_SIGN, PAPER, partRegionName, PRINT_RULES, type BookItem, type Capture, type FaceToken, type Ink, type PageModel, type Rect, type Region, type RegionRole, type Side } from "../contract";
import { qrSquares } from "./qr";
import { cellsFor, placeProblem, tokensOf, type AnswerArea, type BracketPlace, type ColumnPlace, type FieldsPlace, type FigurePlace, type ItemPlace, type PageFrame, type StoryPlace, type TokenCell, type TokenPlace } from "./templates";

export interface PlannedSheet {
  sheet: SnapshotSheet;
  levelName: string;
  attempt: number;
  qr: Record<Side, string>;
  items: readonly BookItem[];
  /** The sheet is the first of a day, so its front page has the time log. */
  startsDay?: boolean;
}

export type PagesResult = { ok: true; pages: PageModel[] } | { ok: false; problems: string[] };

const SIDES: readonly Side[] = ["front", "back"];
const BLACK = "black";
const REGULAR = 400;
const { mark: { line: MARK_LINE }, heading: HEADING, instruction: INSTRUCTION, footer: FOOTER } = PRINT_RULES.frame;
const LABEL = PRINT_RULES.label;

const text = (rect: Rect, value: string, size: number, weight: number, align: "left" | "center" | "right"): Ink =>
  ({ kind: "text", rect, color: BLACK, text: value, size, weight, align });
const fill = (rect: Rect): Ink => ({ kind: "fill", rect, color: BLACK });

/** An L-shaped scan mark: its corner is the corner of the rectangle that is nearest the corner of the paper. */
function markInk(rect: Rect, corner: keyof PageFrame["marks"]): Ink[] {
  const right = corner === "tr" || corner === "br";
  const bottom = corner === "bl" || corner === "br";
  return [
    fill({ ...rect, y: bottom ? rect.y + rect.h - MARK_LINE : rect.y, h: MARK_LINE }),
    fill({ ...rect, x: right ? rect.x + rect.w - MARK_LINE : rect.x, w: MARK_LINE }),
  ];
}

/** The digits of one line, from the ones on the right. */
const digitsInk = (cells: readonly Rect[], digits: string): Ink[] =>
  [...digits].map((digit, i) => text(cells[cells.length - digits.length + i], digit, 22, REGULAR, "center"));

/** The parts of a question that decide its rectangles. */
export type LaidOut = Pick<BookItem, "id" | "number" | "face" | "answer">;

type MakeRegion = (role: RegionRole, rect: Rect, ink?: Ink[], part?: string | null) => Region;

const areaRegions = (make: MakeRegion, { answer, reach }: AnswerArea, part: string): Region[] => [
  make("answer", answer, [{ kind: "outline", rect: answer, color: BLACK, width: PRINT_RULES.answer.outline }], part),
  make("reach", reach, [], part),
];

function columnRegions(make: MakeRegion, place: ColumnPlace, { face, answer }: LaidOut): Region[] {
  if (face.kind !== "column" || answer.parts.length !== 1) throw new Error("a stack has one answer area");
  const signCell = place.bottomCells[place.bottomCells.length - face.bottom.length - 1];
  return [
    make("question", place.question, [
      ...digitsInk(place.topCells, face.top),
      text(signCell, face.sign, 22, REGULAR, "center"),
      ...digitsInk(place.bottomCells, face.bottom),
      fill(place.rule),
    ]),
    ...areaRegions(make, place, answer.parts[0].name),
    make("work", place.work),
  ];
}

/** The texts of tokens, and the areas of their blanks. */
function tokenInk(make: MakeRegion, cells: readonly TokenCell[], tokens: readonly FaceToken[], size: number): { ink: Ink[]; areas: Region[] } {
  const ink: Ink[] = [];
  const areas: Region[] = [];
  tokens.forEach((token, i) => {
    const { text: rect, area } = cells[i];
    if ("text" in token && rect) ink.push(text(rect, token.text, size, REGULAR, "center"));
    if ("blank" in token && area) areas.push(...areaRegions(make, area, token.blank));
  });
  return { ink, areas };
}

function tokenRegions(make: MakeRegion, place: TokenPlace, { face }: LaidOut): Region[] {
  const tokens = tokensOf(face);
  const { ink, areas } = tokenInk(make, cellsFor(place, tokens) ?? [], tokens, place.textSize);
  return [make("question", place.question, [...(place.rule ? [fill(place.rule)] : []), ...ink]), ...areas];
}

/** The texts above, then the bracket, so that the ink is in the order of the face. */
function bracketRegions(make: MakeRegion, place: BracketPlace, { face }: LaidOut): Region[] {
  if (face.kind !== "bracket") throw new Error("a bracket has two numbers");
  const { ink, areas } = tokenInk(make, place.above, face.above, 18);
  return [
    make("question", place.question, [
      ...ink,
      text(place.outside, face.outside, 22, REGULAR, "right"),
      text(place.sign, BRACKET_SIGN, 30, REGULAR, "center"),
      ...[...face.inside].map((digit, i) => text(place.inside[i], digit, 22, REGULAR, "center")),
      fill(place.line),
    ]),
    ...areas,
    ...(place.work ? [make("work", place.work)] : []),
  ];
}

/** The prompt on the left, and each label on the right of its cell, next to its answer area. The rows take the first fields. */
function fieldsRegions(make: MakeRegion, place: FieldsPlace, { face }: LaidOut): Region[] {
  if (face.kind !== "fields" || face.rows.length > place.fields.length) throw new Error("the rows of a question must fit its place");
  const rows = face.rows.map((row, i) => ({ row, ...place.fields[i] }));
  return [
    make("question", place.question, [
      ...(place.rule ? [fill(place.rule)] : []),
      text(place.prompt, face.prompt, place.promptSize, REGULAR, "left"),
      ...rows.map(({ row, label }) => text(label, row.label, place.labelSize, REGULAR, "right")),
    ]),
    ...rows.flatMap(({ row, area }) => areaRegions(make, area, row.blank)),
  ];
}

const FIGURE = PRINT_RULES.figure;
const outline = (rect: Rect, width: number): Ink => ({ kind: "outline", rect, color: BLACK, width });

/**
 * The bars share the frame, each outlined with its part in it, away from its border. Below them the bracket of the total:
 * a tick at each end and a line between them. Then the label of the total, the prompt, and the answer area.
 */
function figureRegions(make: MakeRegion, place: FigurePlace, { face, answer }: LaidOut): Region[] {
  if (face.kind !== "figure" || answer.parts.length !== 1) throw new Error("a figure has one answer area");
  const { frame, bracket } = place;
  const { parts, totalLabel } = face.figure;
  const width = frame.w / parts.length;
  const bars = parts.flatMap((part, i): Ink[] => {
    const bar = { ...frame, x: frame.x + i * width, w: width };
    return [outline(bar, FIGURE.outline), text({ x: bar.x + FIGURE.inset, y: bar.y + (bar.h - PRINT_RULES.textHeight) / 2, w: width - 2 * FIGURE.inset, h: PRINT_RULES.textHeight }, part, place.textSize, REGULAR, "center")];
  });
  const line = PRINT_RULES.line.height;
  return [
    make("question", place.question, [
      ...bars,
      fill({ ...bracket, w: line }),
      fill({ ...bracket, x: bracket.x + bracket.w - line, w: line }),
      fill({ ...bracket, y: bracket.y + bracket.h - line, h: line }),
      text(place.totalLabel, totalLabel, place.textSize, REGULAR, "center"),
      text(place.prompt, face.prompt, place.textSize, REGULAR, "right"),
    ]),
    ...areaRegions(make, place, face.blank),
  ];
}

const STORY = PRINT_RULES.story;

/** The flow text of a word problem and the unit after the reach of its answer area; the work area below the text is empty. */
function storyRegions(make: MakeRegion, place: StoryPlace, { face }: LaidOut): Region[] {
  if (face.kind !== "story") throw new Error("a word problem has flow text");
  return [
    make("question", place.question, [
      { kind: "flow", rect: place.flow, color: BLACK, tokens: face.tokens, size: STORY.flow.size, weight: STORY.flow.weight, leading: STORY.flow.leading },
      text(place.unit, face.unit, STORY.unit.size, STORY.unit.weight, "left"),
    ]),
    ...areaRegions(make, place, face.blank),
    make("work", place.work),
  ];
}

/** The rectangles of a question that the kind of its place decides. */
function faceRegions(make: MakeRegion, place: ItemPlace, item: LaidOut): Region[] {
  if ("flow" in place) return storyRegions(make, place, item);
  if ("frame" in place) return figureRegions(make, place, item);
  if ("fields" in place) return fieldsRegions(make, place, item);
  if ("forms" in place) return tokenRegions(make, place, item);
  return "above" in place ? bracketRegions(make, place, item) : columnRegions(make, place, item);
}

/** The rectangles of one question that fits its place (`placeProblem`). */
export function itemRegions(place: ItemPlace, item: LaidOut, at: (name: string) => string): Region[] {
  const { number } = item;
  const make: MakeRegion = (role, rect, ink = [], part = null) => ({ id: at(partRegionName(role, number, part)), role, rect, item: item.id, part, ink });
  return [
    make("slot", place.slot),
    make("label", place.label, [text(place.label, String(number), LABEL.size, LABEL.weight, "left")]),
    ...faceRegions(make, place, item),
  ];
}

/** The time log of a front page: the region that prints it, and the capture that says where a child writes each time. */
function timeLogOf(frame: PageFrame, id: string): { region: Region; capture: Capture } | string {
  const place = frame.timeLog;
  if (!place) return "the template has no place for a time log on this side";
  const { label, box } = PRINT_RULES.timeLog;
  const ink = place.fields.flatMap((field): Ink[] => [text(field.labelRect, field.label, label.size, label.weight, "right"), { kind: "outline", rect: field.box, color: BLACK, width: box.outline }]);
  return {
    region: { id, role: "capture", rect: place.rect, item: null, part: null, ink },
    capture: { id, kind: "time-log", rect: place.rect, fields: place.fields.map(({ name, box: rect, reach }) => ({ name, rect, reach })) },
  };
}

function buildPage({ sheet, levelName, attempt, qr, items, startsDay = false }: PlannedSheet, side: Side): PageModel | string {
  const { template, instruction } = sheet[side];
  const { frame, places } = template.sides[side];
  const page = side === "front" ? sheet.firstPage : sheet.firstPage + 1;
  const id = `${sheet.id}/${attempt}/${side}`;
  const at = (name: string) => `${id}/${name}`;
  const region = (name: string, role: RegionRole, rect: Rect, ink: Ink[]): Region => ({ id: at(name), role, rect, item: null, part: null, ink });
  const squares = qrSquares(frame.qr, qr[side]);
  if (typeof squares === "string") return `Page ${page}: ${squares}.`;
  const onSide = items.filter((item) => item.side === side);
  if (onSide.length > places.length) return `Page ${page}: ${onSide.length} questions do not fit the template "${template.id}", which has ${places.length} places.`;
  for (const [i, { number, face, answer }] of onSide.entries()) {
    const problem = placeProblem(template, places[i], face, answer);
    if (problem) return `Page ${page}: question ${number} ${problem}.`;
  }
  const timeLog = startsDay && side === "front" ? timeLogOf(frame, at("time-log")) : null;
  if (typeof timeLog === "string") return `Page ${page}: ${timeLog}.`;
  const { heading, footer, marks } = frame;
  return {
    id, sheetId: sheet.id, attempt, side, page, levelName, instruction, template: template.id, qr: qr[side],
    topicCode: sheet.topic.code, topicTitle: sheet.topic.title, size: { ...PAPER },
    regions: [
      ...(["tl", "tr", "br", "bl"] as const).map((corner) => region(`mark-${corner}`, "scan-mark", marks[corner], markInk(marks[corner], corner))),
      region("heading", "heading", heading, [text(heading, `${sheet.topic.code} · ${sheet.topic.title}`, HEADING.size, HEADING.weight, "left")]),
      region("instruction", "instruction", frame.instruction, [text(frame.instruction, instruction, INSTRUCTION.size, INSTRUCTION.weight, "left")]),
      ...onSide.flatMap((item, i) => itemRegions(places[i], item, at)),
      // A repeated sheet says its attempt after the page (#2); the first attempt prints as it always did.
      region("footer", "footer", footer, [text(footer, `Level ${levelName} · Page ${page}${attempt > 1 ? ` · #${attempt}` : ""}`, FOOTER.size, FOOTER.weight, side === "front" ? "left" : "right")]),
      region("qr", "qr", frame.qr, squares),
      ...(timeLog ? [timeLog.region] : []),
    ],
    captures: timeLog ? [timeLog.capture] : [],
  };
}

export function buildPages(sheets: readonly PlannedSheet[]): PagesResult {
  const built = sheets.flatMap((sheet) => SIDES.map((side) => buildPage(sheet, side)));
  const problems = built.filter((p) => typeof p === "string");
  return problems.length > 0 ? { ok: false, problems } : { ok: true, pages: built.filter((p) => typeof p !== "string") };
}
