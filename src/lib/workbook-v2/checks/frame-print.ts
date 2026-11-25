// What the frame of a page must print: the lines of each scan mark, the heading, the instruction, the footer and the number
// of each question, at its place, in its size and weight. The places follow from the paper, the print rules, the QR code
// and the print of the question (face-print.ts), never from a template. The words are for the rules of the page.
import { PRINT_RULES, type Face, type Ink, type PageModel, type Rect, type Region } from "../contract";
import { faceTokens, type Area } from "./face-print";
import { bottom, near, right } from "./rects";

const { frame: { gap: GAP, mark: MARK, heading: HEADING, instruction: INSTRUCTION, footer: FOOTER }, label: LABEL, cell: CELL, line: LINE, textHeight: TEXT_HEIGHT } = PRINT_RULES;

type Style = Pick<Extract<Ink, { kind: "text" }>, "size" | "weight" | "align">;
/** One part of the frame. A line has no style. */
interface Print { rect: Rect; style: Style | null }
/** A rectangle of the frame with all that it prints. */
interface Wanted { name: string; rect: Rect; prints: Print[] }

const same = (a: Rect, b: Rect): boolean => near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);
const round = (n: number) => Math.round(n * 100) / 100;
const at = ({ x, y, w, h }: Rect) => `(${round(x)}, ${round(y)}, ${round(w)} by ${round(h)})`;

function isPrint({ rect, style }: Print, ink: Ink): boolean {
  const isKind = style === null ? ink.kind === "fill" : ink.kind === "text" && ink.size === style.size && ink.weight === style.weight && ink.align === style.align;
  return isKind && same(ink.rect, rect);
}

/** What a rectangle of the frame does not print, and what it prints more. */
function regionProblems(region: Region, { name, rect, prints }: Wanted): string[] {
  const left = [...region.ink];
  const missing = prints.filter((wanted) => {
    const found = left.findIndex((ink) => isPrint(wanted, ink));
    if (found >= 0) left.splice(found, 1);
    return found < 0;
  });
  return [
    ...(same(region.rect, rect) ? [] : [`${name} is at ${at(region.rect)} and must be at ${at(rect)}`]),
    ...missing.map((p) => `${name} must print ${p.style === null ? "a line" : `a text of ${p.style.size} points and weight ${p.style.weight} at the ${p.style.align}`} in ${at(p.rect)}`),
    ...left.map((ink) => `${name} prints ${ink.kind === "text" ? `"${ink.text}"` : ink.kind === "flow" ? "flow text" : "a line"} that it does not have there`),
  ];
}

/** A text that fills its rectangle. */
const textIn = (name: string, rect: Rect, size: number, weight: number, align: Style["align"]): Wanted => ({ name, rect, prints: [{ rect, style: { size, weight, align } }] });

/** An L with its corner at the corner of the paper that it marks. */
function markAt(corner: string, live: Rect): Wanted {
  const [isBottom, isRight] = [corner.startsWith("b"), corner.endsWith("r")];
  const rect = { x: isRight ? right(live) - MARK.size : live.x, y: isBottom ? bottom(live) - MARK.size : live.y, w: MARK.size, h: MARK.size };
  const lines = [
    { ...rect, y: isBottom ? bottom(rect) - MARK.line : rect.y, h: MARK.line },
    { ...rect, x: isRight ? right(rect) - MARK.line : rect.x, w: MARK.line },
  ];
  return { name: `the scan mark "mark-${corner}"`, rect, prints: lines.map((line) => ({ rect: line, style: null })) };
}

/** What the frame of a page prints. `live` is the part of the page that may hold print. */
export function framePrintProblems(page: PageModel, live: Rect): string[] {
  const find = (role: Region["role"], name: string = role) => page.regions.find((r) => r.role === role && r.id.endsWith(`/${name}`));
  const beside = MARK.size + GAP;
  const [left, end] = [live.x + beside, right(live) - beside];
  const wanted: [Region | undefined, Wanted | null][] = ["tl", "tr", "br", "bl"].map((corner) => [find("scan-mark", `mark-${corner}`), markAt(corner, live)]);
  wanted.push([find("heading"), textIn("the heading", { x: left, y: live.y, w: end - left, h: HEADING.h }, HEADING.size, HEADING.weight, "left")]);
  wanted.push([find("instruction"), textIn("the instruction", { x: live.x, y: live.y + INSTRUCTION.top, w: live.w, h: INSTRUCTION.h }, INSTRUCTION.size, INSTRUCTION.weight, "left")]);
  // The footer stands between the QR code and the scan mark of the other corner.
  const qr = find("qr");
  const [from, to] = page.side === "front" ? [left, (qr?.rect.x ?? 0) - GAP] : [qr ? right(qr.rect) + GAP : 0, end];
  wanted.push([find("footer"), qr ? textIn("the footer", { x: from, y: bottom(live) - FOOTER.h, w: to - from, h: FOOTER.h }, FOOTER.size, FOOTER.weight, page.side === "front" ? "left" : "right") : null]);
  return wanted.flatMap(([region, print]) => (region && print ? regionProblems(region, print) : []));
}

/** The top of the line that a question starts on: its upper number, its line of text, its first term or its number inside. */
function lineTop(face: Face, question: Region, areas: ReadonlyMap<string, Area>): number | null {
  if (face.kind === "column") return question.rect.y;
  const tokens = faceTokens(face);
  const at = tokens.findIndex((t) => "blank" in t && areas.has(t.blank));
  const token = tokens[at];
  const area = token && "blank" in token ? areas.get(token.blank) : undefined;
  if (!area) return null;
  if (face.kind === "bracket") return bottom(area.reach) + LINE.height + LINE.gap;
  const middle = area.answer.y + area.answer.h / 2;
  return middle - TEXT_HEIGHT / 2 - (face.kind === "sequence" ? at * area.reach.h : 0);
}

/** The number of a question stands at the left end of its slot, on the line that the question starts on. */
export function labelProblems(face: Face, label: Region, slot: Region, question: Region, areas: ReadonlyMap<string, Area>): string[] {
  const y = lineTop(face, question, areas);
  if (y === null) return [];
  const rect = { x: slot.rect.x, y, w: face.kind === "column" ? CELL.w : LABEL.w, h: face.kind === "column" || face.kind === "bracket" ? CELL.h : TEXT_HEIGHT };
  return regionProblems(label, textIn("its label", rect, LABEL.size, LABEL.weight, "left"));
}
