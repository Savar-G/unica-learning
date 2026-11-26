// What a typesetter reports that draws exactly the model, for tests that need no Typst. Each text is a bar of one size.
import type { DrawnText, Ink, PageModel, Position, Rect } from "../contract";

/** The width and the height of each bar. */
export const BAR = 8;
const GAP = 4;
const NATURAL = { w: BAR, capitals: BAR, above: BAR, below: 0 };

type Line = Pick<DrawnText, "x" | "y" | "text" | "size" | "weight" | "start" | "end" | "natural" | "flow">;

/** The lines of an ink: one for a text, and one for each piece of a flow. */
export function linesOf(ink: Ink): Line[] {
  if (ink.kind !== "text" && ink.kind !== "flow") return [];
  const { rect, size, weight } = ink;
  const line = (text: string, x: number, y: number, corner: { x: number; y: number }): Line => ({ ...corner, text, size, weight, start: { x, y }, end: { x: x + BAR, y }, natural: { ...NATURAL }, flow: ink.kind === "flow" ? { space: GAP, rise: BAR, fall: 0 } : null });
  if (ink.kind === "text") {
    const x = { left: rect.x, center: rect.x + (rect.w - BAR) / 2, right: rect.x + rect.w - BAR }[ink.align];
    return [line(ink.text, x, rect.y + (rect.h + BAR) / 2, { x: rect.x, y: rect.y })];
  }
  const at = { x: rect.x, y: rect.y + BAR };
  return ink.tokens.flatMap(({ pieces }) => pieces.map((piece, i) => {
    if (i === 0 && at.x > rect.x) at.x += GAP;
    if (at.x + BAR > rect.x + rect.w) Object.assign(at, { x: rect.x, y: at.y + BAR + ink.leading });
    const one = line(piece, at.x, at.y, { x: at.x, y: at.y - BAR });
    at.x += BAR;
    return one;
  }));
}

export const barOf = ({ start }: Line): Rect => ({ x: start.x, y: start.y - BAR, w: BAR, h: BAR });

export const reportedTexts = (pages: readonly PageModel[]): DrawnText[] =>
  pages.flatMap((p, i) => p.regions.flatMap((r) => r.ink.flatMap(linesOf).map((line) => ({ sheet: i + 1, ...line }))));

export const reportedPositions = (pages: readonly PageModel[]): Position[] =>
  pages.flatMap((p, i) => p.regions.map((r) => ({ id: r.id, sheet: i + 1, rect: { ...r.rect } })));
