// Puts the content of a sheet into the rectangles of its templates. It decides no position of its own.
import type { SnapshotSheet } from "../bank/snapshot";
import { PAPER, type BookItem, type Ink, type PageModel, type Rect, type Region, type RegionRole, type Side } from "../contract";
import { qrSquares } from "./qr";
import { digitPlaces, type ItemPlace, type PageFrame, type PageTemplate } from "./templates";

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

export function itemRegions(template: PageTemplate, place: ItemPlace, item: BookItem, at: (name: string) => string): Region[] {
  const { face, number } = item;
  const needed = digitPlaces(face, item.answer.value);
  if (needed > template.digits) throw new Error(`question ${number} needs ${needed} digit places and the template has ${template.digits}`);
  const part = (role: RegionRole, rect: Rect, ink: Ink[] = []): Region => ({ id: at(`${role}-${number}`), role, rect, item: item.id, ink });
  const signCell = place.bottomCells[place.bottomCells.length - face.bottom.length - 1];
  return [
    part("slot", place.slot),
    part("label", place.label, [text(place.label, String(number), 11, BOLD, "left")]),
    part("question", place.question, [
      ...digitsInk(place.topCells, face.top),
      text(signCell, face.sign, 22, REGULAR, "center"),
      ...digitsInk(place.bottomCells, face.bottom),
      fill(place.rule),
    ]),
    part("answer", place.answer, [{ kind: "outline", rect: place.answer, color: BLACK, width: 0.75 }]),
    part("reach", place.reach),
    part("work", place.work),
  ];
}

function buildPage({ sheet, levelName, attempt, qr, items }: PlannedSheet, side: Side): PageModel | string {
  const { template, instruction } = sheet[side];
  const { frame, places } = template.sides[side];
  const page = side === "front" ? sheet.firstPage : sheet.firstPage + 1;
  const id = `${sheet.id}/${attempt}/${side}`;
  const at = (name: string) => `${id}/${name}`;
  const region = (name: string, role: RegionRole, rect: Rect, ink: Ink[]): Region => ({ id: at(name), role, rect, item: null, ink });
  const squares = qrSquares(frame.qr, qr[side]);
  if (typeof squares === "string") return `Page ${page}: ${squares}.`;
  const onSide = items.filter((item) => item.side === side);
  if (onSide.length > places.length) return `Page ${page}: ${onSide.length} questions do not fit the template "${template.id}", which has ${places.length} places.`;
  const { heading, footer, marks } = frame;
  return {
    id, sheetId: sheet.id, attempt, side, page, levelName, instruction, template: template.id, qr: qr[side],
    topicCode: sheet.topic.code, topicTitle: sheet.topic.title, size: { ...PAPER },
    regions: [
      ...(["tl", "tr", "br", "bl"] as const).map((corner) => region(`mark-${corner}`, "scan-mark", marks[corner], markInk(marks[corner], corner))),
      region("heading", "heading", heading, [text(heading, `${sheet.topic.code} · ${sheet.topic.title}`, 15, BOLD, "left")]),
      region("instruction", "instruction", frame.instruction, [text(frame.instruction, instruction, 12, REGULAR, "left")]),
      ...onSide.flatMap((item, i) => itemRegions(template, places[i], item, at)),
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
