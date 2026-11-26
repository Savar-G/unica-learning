// What the frame of a page must print: the lines of each scan mark, the heading, the instruction, the footer and the number
// of each question, at its place, in its size and weight. The places follow from the paper, the print rules, the QR code
// and the print of the question (face-print.ts), never from a template. The words are for the rules of the page.
import { CAPTURE_KINDS, PRINT_RULES, type Face, type Ink, type PageModel, type Rect, type Region } from "../contract";
import { faceTokens, type Area } from "./face-print";
import { bottom, near, right } from "./rects";

const { frame: { gap: GAP, mark: MARK, heading: HEADING, instruction: INSTRUCTION, footer: FOOTER }, label: LABEL, cell: CELL, line: LINE, textHeight: TEXT_HEIGHT, figure: FIGURE } = PRINT_RULES;

type Style = Pick<Extract<Ink, { kind: "text" }>, "size" | "weight" | "align">;
/** One part of the frame. A line has no style, and an outline is a line round its rectangle with this width. */
interface Print { rect: Rect; style: Style | null; outline?: number; text?: string }
/** A rectangle of the frame with all that it prints. */
interface Wanted { name: string; rect: Rect; prints: Print[] }

const same = (a: Rect, b: Rect): boolean => near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);
const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((one, i) => one === b[i]);
const round = (n: number) => Math.round(n * 100) / 100;
const at = ({ x, y, w, h }: Rect) => `(${round(x)}, ${round(y)}, ${round(w)} by ${round(h)})`;

function isPrint({ rect, style, outline, text }: Print, ink: Ink): boolean {
  const isLine = outline === undefined ? ink.kind === "fill" : ink.kind === "outline" && near(ink.width, outline);
  const isKind = style === null ? isLine : ink.kind === "text" && ink.size === style.size && ink.weight === style.weight && ink.align === style.align && (text === undefined || ink.text === text);
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
    ...missing.map((p) => `${name} must print ${p.style !== null ? `a text of ${p.style.size} points and weight ${p.style.weight} at the ${p.style.align}` : p.outline === undefined ? "a line" : "an outline"} in ${at(p.rect)}${p.text === undefined ? "" : ` saying "${p.text}"`}`),
    ...left.map((ink) => `${name} prints ${ink.kind === "text" ? `"${ink.text}"` : ink.kind === "flow" ? "flow text" : ink.kind === "outline" ? "an outline" : "a line"} that it does not have there`),
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
  if (face.kind === "fields") return area.reach.y - TEXT_HEIGHT;
  // A figure starts with its bars, which stand above the bracket and the line of its area.
  if (face.kind === "figure") return area.answer.y - 2 * FIGURE.gap - FIGURE.tick - FIGURE.bar + (FIGURE.bar - TEXT_HEIGHT) / 2;
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

const TIME_LOG = PRINT_RULES.timeLog;
const show = (rect: Rect) => at(rect);

/**
 * The time log of the first page of a day: a band above the footer, from its left end, with a label and an outlined box for
 * each field in reading order, and clear space round each box. The places follow from the live part of the page and the
 * print rules. A back page has none, and a page has one at most. `live` is the part of the page that may hold print. No
 * other ink stands in the clear space of a box: the time log prints exactly its labels and boxes, no region may overlap
 * it (`checkPage`), and the image check holds each box and its clear space blank but for the border of the box.
 */
export function timeLogProblems(page: PageModel, live: Rect): string[] {
  const problems: string[] = [];
  const regions = page.regions.filter((r) => r.role === "capture");
  if (page.side === "back" && (page.captures.length > 0 || regions.length > 0)) return ["a back page has no time log"];
  if (page.captures.length > 1) problems.push(`the page has ${page.captures.length} captures and may have one time log`);
  for (const region of regions) if (!page.captures.some((c) => c.id === region.id)) problems.push(`${region.id.slice(page.id.length + 1)} prints a capture that the page does not have`);
  const left = live.x + MARK.size + GAP;
  const reach = { w: TIME_LOG.box.w + 2 * TIME_LOG.reach, h: TIME_LOG.box.h + 2 * TIME_LOG.reach };
  const pitch = TIME_LOG.label.w + TIME_LOG.labelGap + reach.w + TIME_LOG.gap;
  const band = { x: left, y: TIME_LOG.top, w: TIME_LOG.fields.length * pitch - TIME_LOG.gap, h: TIME_LOG.h };
  for (const capture of page.captures) {
    const tell = (problem: string) => problems.push(`the time log ${problem}`);
    if (!(CAPTURE_KINDS as readonly string[]).includes(capture.kind) || capture.kind !== "time-log") tell(`has the kind "${capture.kind}"`);
    if (capture.id !== `${page.id}/time-log`) tell(`is named "${capture.id}" and must be named "${page.id}/time-log"`);
    if (!same(capture.rect, band)) tell(`is at ${show(capture.rect)} and must be at ${show(band)}`);
    const names = capture.fields.map((f) => f.name);
    if (!sameList(names, TIME_LOG.fields)) tell(`has the fields ${names.join(", ") || "none"} and must have ${TIME_LOG.fields.join(", ")}, in this order`);
    const prints: Wanted["prints"] = [];
    TIME_LOG.fields.forEach((name, i) => {
      const x = left + i * pitch;
      const around = { x: x + TIME_LOG.label.w + TIME_LOG.labelGap, y: TIME_LOG.top + (TIME_LOG.h - reach.h) / 2, ...reach };
      const box = { x: around.x + TIME_LOG.reach, y: around.y + TIME_LOG.reach, w: TIME_LOG.box.w, h: TIME_LOG.box.h };
      const field = capture.fields[i];
      if (field && !same(field.rect, box)) tell(`has the box "${name}" at ${show(field.rect)} and it must be at ${show(box)}`);
      if (field && !same(field.reach, around)) tell(`has the clear space of "${name}" at ${show(field.reach)} and it must be at ${show(around)}`);
      prints.push({ rect: { x, y: box.y, w: TIME_LOG.label.w, h: TIME_LOG.box.h }, style: { size: TIME_LOG.label.size, weight: TIME_LOG.label.weight, align: "right" }, text: TIME_LOG.labels[i] });
      prints.push({ rect: box, style: null, outline: TIME_LOG.box.outline });
    });
    const region = regions.find((r) => r.id === capture.id);
    if (!region) {
      tell("has no rectangle that prints it");
      continue;
    }
    problems.push(...regionProblems(region, { name: "the time log", rect: band, prints }));
    const words = region.ink.flatMap((i) => (i.kind === "text" ? [i.text] : []));
    if (!sameList(words, TIME_LOG.labels)) tell(`prints ${words.map((w) => `"${w}"`).join(", ") || "no text"} and must print ${TIME_LOG.labels.map((w) => `"${w}"`).join(", ")}`);
  }
  return problems;
}
