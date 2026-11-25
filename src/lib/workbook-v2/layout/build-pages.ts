// Puts the content of a sheet into the rectangles of its templates. It decides no position of its own.
import type { SnapshotSheet } from "../bank/snapshot";
import { PAPER, partRegionName, PRINT_RULES, type BookItem, type Ink, type PageModel, type Rect, type Region, type RegionRole, type Side } from "../contract";
import { qrSquares } from "./qr";
import { cellsFor, placeProblem, type AnswerArea, type ColumnPlace, type ItemPlace, type PageFrame, type TokenPlace } from "./templates";

export interface PlannedSheet {
  sheet: SnapshotSheet;
  levelName: string;
  attempt: number;
  qr: Record<Side, string>;
  items: readonly BookItem[];
}

export type PagesResult = { ok: true; pages: PageModel[] } | { ok: false; problems: string[] };

const SIDES: readonly Side[] = ["front", "back"];
const BLACK = "black";
const REGULAR = 400;
const BOLD = 600;
const MARK_LINE = 2;

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

function tokenRegions(make: MakeRegion, place: TokenPlace, { face }: LaidOut): Region[] {
  const tokens = face.kind === "column" ? [] : face.tokens;
  const cells = cellsFor(place, tokens) ?? [];
  const ink: Ink[] = place.rule ? [fill(place.rule)] : [];
  const areas: Region[] = [];
  tokens.forEach((token, i) => {
    const { text: rect, area } = cells[i];
    if ("text" in token && rect) ink.push(text(rect, token.text, place.textSize, REGULAR, "center"));
    if ("blank" in token && area) areas.push(...areaRegions(make, area, token.blank));
  });
  return [make("question", place.question, ink), ...areas];
}

/** The rectangles of one question that fits its place (`placeProblem`). */
export function itemRegions(place: ItemPlace, item: LaidOut, at: (name: string) => string): Region[] {
  const { number } = item;
  const make: MakeRegion = (role, rect, ink = [], part = null) => ({ id: at(partRegionName(role, number, part)), role, rect, item: item.id, part, ink });
  return [
    make("slot", place.slot),
    make("label", place.label, [text(place.label, String(number), 11, BOLD, "left")]),
    ...("forms" in place ? tokenRegions(make, place, item) : columnRegions(make, place, item)),
  ];
}

function buildPage({ sheet, levelName, attempt, qr, items }: PlannedSheet, side: Side): PageModel | string {
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
  const { heading, footer, marks } = frame;
  return {
    id, sheetId: sheet.id, attempt, side, page, levelName, instruction, template: template.id, qr: qr[side],
    topicCode: sheet.topic.code, topicTitle: sheet.topic.title, size: { ...PAPER },
    regions: [
      ...(["tl", "tr", "br", "bl"] as const).map((corner) => region(`mark-${corner}`, "scan-mark", marks[corner], markInk(marks[corner], corner))),
      region("heading", "heading", heading, [text(heading, `${sheet.topic.code} · ${sheet.topic.title}`, 15, BOLD, "left")]),
      region("instruction", "instruction", frame.instruction, [text(frame.instruction, instruction, 12, REGULAR, "left")]),
      ...onSide.flatMap((item, i) => itemRegions(places[i], item, at)),
      region("footer", "footer", footer, [text(footer, `Level ${levelName} · Page ${page}`, 11, REGULAR, side === "front" ? "left" : "right")]),
      region("qr", "qr", frame.qr, squares),
    ],
  };
}

export function buildPages(sheets: readonly PlannedSheet[]): PagesResult {
  const built = sheets.flatMap((sheet) => SIDES.map((side) => buildPage(sheet, side)));
  const problems = built.filter((p) => typeof p === "string");
  return problems.length > 0 ? { ok: false, problems } : { ok: true, pages: built.filter((p) => typeof p !== "string") };
}
