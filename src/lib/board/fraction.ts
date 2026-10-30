// A fraction or mixed number on the board (#317): the numerator and denominator centred over a bar wider than both, and
// the whole number of a mixed number to the left, centred on the bar. Each part is a target. The stacked layout here
// also writes the labels of a number line, at a smaller size.
import type { GlyphSet, Point } from "@/lib/board/glyphs";
import { add, ceil, mul, rational, readNumber, sub, times, toNumber, type Rational } from "@/lib/board/rational";
import { glyphStrokes, isRefusal, missingGlyphs, refuse, type LocalStroke, type LocalTarget, type RefusalBody, type Representation } from "@/lib/board/representation";
import type { FractionCommand, FractionPart, Ink, Rect, Target } from "@/lib/board/types";

/** A number as the board writes it: a sign, a whole part (digits, or a decimal), and a stacked fraction part. */
export interface NumberParts {
  sign: "" | "+" | "−";
  whole: string | null;
  fraction: { numerator: string; denominator: string } | null;
}

/** Where each part of a written number goes, from its top-left corner, at a size. */
export interface NumberLayout {
  /** The width and height, exactly: what layout and room decisions use. */
  exact: { w: Rational; h: Rational };
  w: number;
  h: number;
  sign: Rect | null;
  whole: Rect | null;
  numerator: Rect | null;
  denominator: Rect | null;
  bar: [Point, Point] | null;
}

/** Character width and height, and the gaps, at size 1 (a fraction object), exactly. Labels use a smaller size. */
const CHAR_W = rational(4, 5);
const CHAR_H = rational(17, 20);
const GAP = rational(1, 5);
/** How far the bar reaches past the wider of the numerator and the denominator, each side. */
const BAR_OVERHANG = rational(1, 5);

/**
 * Lays out a written number at `size` (1 is a fraction object's digits). The width and height are exact; the boxes
 * inside are for drawing.
 */
export function layoutNumber(parts: NumberParts, size: Rational): NumberLayout {
  const stacked = parts.fraction !== null;
  const barChars = parts.fraction ? Math.max(parts.fraction.numerator.length, parts.fraction.denominator.length) : 0;
  const chars = parts.sign.length + (parts.whole?.length ?? 0) + barChars;
  const gaps = stacked && parts.whole !== null ? GAP : rational(0);
  const overhang = stacked ? times(BAR_OVERHANG, 2) : rational(0);
  const exact = {
    w: mul(size, add(add(times(CHAR_W, chars), gaps), overhang)),
    h: mul(size, stacked ? add(times(CHAR_H, 2), times(GAP, 3)) : CHAR_H),
  };
  const [cw, ch, gap] = [CHAR_W, CHAR_H, GAP].map((r) => toNumber(mul(size, r)));
  const h = toNumber(exact.h);
  const mid = h / 2;
  let x = 0;
  const box = (chars: number, y: number): Rect => ({ x, y, w: chars * cw, h: ch });
  const out: NumberLayout = { exact, w: toNumber(exact.w), h, sign: null, whole: null, numerator: null, denominator: null, bar: null };
  if (parts.sign) {
    out.sign = box(1, mid - ch / 2);
    x += cw;
  }
  if (parts.whole !== null) {
    out.whole = box(parts.whole.length, mid - ch / 2);
    x += out.whole.w + (stacked ? gap : 0);
  }
  if (parts.fraction) {
    const { numerator, denominator } = parts.fraction;
    const barW = barChars * cw + toNumber(mul(size, overhang));
    const left = x;
    const centred = (chars: number, y: number): Rect => ({ x: left + (barW - chars * cw) / 2, y, w: chars * cw, h: ch });
    out.numerator = centred(numerator.length, gap / 2);
    out.bar = [
      [left, mid],
      [left + barW, mid],
    ];
    out.denominator = centred(denominator.length, h - ch - gap / 2);
    x += barW;
  }
  return out;
}

/** The text of a written number, for summaries: "−1 2/3", "0.5". */
export function numberText(parts: NumberParts): string {
  const fraction = parts.fraction ? `${parts.fraction.numerator}/${parts.fraction.denominator}` : "";
  return parts.sign + [parts.whole, fraction].filter(Boolean).join(" ");
}

/** The characters a written number needs from the pen. */
export const numberChars = (parts: NumberParts) => parts.sign + (parts.whole ?? "") + (parts.fraction ? parts.fraction.numerator + parts.fraction.denominator : "");

/** Why the pen cannot write the characters, or null when it can. */
export function refuseMissing(glyphs: GlyphSet, chars: string): RefusalBody | null {
  const missing = missingGlyphs(glyphs, chars);
  return missing.length > 0 ? refuse("unsupported", `The board pen cannot write ${missing.join(" ")} yet.`) : null;
}

/** The strokes of a laid-out number placed at (dx, dy). The target of each part comes from `targetOf`. */
export function numberStrokes(
  ctx: { glyphs: GlyphSet },
  parts: NumberParts,
  layout: NumberLayout,
  at: { dx: number; dy: number },
  base: Omit<LocalStroke, "key" | "kind" | "glyph" | "pts" | "target">,
  targetOf: (part: FractionPart | "sign") => Target | null,
  keyPrefix: string,
): LocalStroke[] {
  const move = (r: Rect): Rect => ({ ...r, x: r.x + at.dx, y: r.y + at.dy });
  const out: LocalStroke[] = [];
  const text = (t: string, r: Rect | null, p: FractionPart | "sign", key: string) => {
    if (r) out.push(...glyphStrokes(ctx.glyphs, t, move(r), { ...base, target: targetOf(p) }, `${keyPrefix}/${key}`));
  };
  text(parts.sign, layout.sign, "sign", "sign");
  if (parts.whole !== null) text(parts.whole, layout.whole, "whole_number", "whole");
  if (parts.fraction && layout.bar) {
    text(parts.fraction.numerator, layout.numerator, "numerator", "num");
    const [[x0, y0], [x1, y1]] = layout.bar;
    out.push({ ...base, key: `${keyPrefix}/bar`, kind: "rule", target: targetOf("bar"), width: base.width * 0.9, pts: [[x0 + at.dx, y0 + at.dy], [x1 + at.dx, y1 + at.dy]] });
    text(parts.fraction.denominator, layout.denominator, "denominator", "den");
  }
  return out;
}

export interface FractionState {
  parts: NumberParts & { fraction: { numerator: string; denominator: string } };
  ink: Ink;
  seq: number;
}

const DIGIT_WIDTH = 0.07;

function layoutOf(state: FractionState) {
  const layout = layoutNumber(state.parts, rational(1));
  // Centred in whole cells, so the object's box sits on the grid.
  const size = { w: ceil(layout.exact.w), h: ceil(layout.exact.h) };
  const half = (cells: number, r: Rational) => toNumber(sub(rational(cells), r)) / 2;
  return { layout, size, dx: half(size.w, layout.exact.w), dy: half(size.h, layout.exact.h) };
}

export const fraction: Representation<FractionState, FractionCommand> = {
  op: "fraction",
  create(cmd, ctx) {
    const whole = cmd.whole ?? null;
    if (whole === "0") return refuse("not_allowed", `A mixed number has a whole number of at least 1: write ${cmd.numerator}/${cmd.denominator} as a fraction.`);
    const parts: FractionState["parts"] = { sign: "", whole, fraction: { numerator: cmd.numerator, denominator: cmd.denominator } };
    // The same checks as any number: a 0 denominator, a mixed number's fraction part between 0 and 1.
    const read = readNumber(numberText(parts));
    if (isRefusal(read)) return read;
    const cannot = refuseMissing(ctx.glyphs, numberChars(parts));
    if (cannot) return cannot;
    const state: FractionState = { parts, ink: cmd.ink ?? "blue", seq: ctx.seq };
    return { state, size: layoutOf(state).size };
  },
  targets(state, objectId) {
    const { layout, size, dx, dy } = layoutOf(state);
    const at = (r: Rect): Rect => ({ ...r, x: r.x + dx, y: r.y + dy });
    const { numerator, denominator } = state.parts.fraction;
    const out: LocalTarget[] = [
      { target: { objectId, part: "whole" }, label: objectId, writable: false, value: numberText(state.parts), rect: { x: 0, y: 0, ...size } },
      { target: { objectId, part: "numerator" }, label: `${objectId} numerator`, writable: false, value: numerator, rect: at(layout.numerator!) },
    ];
    const [[x0, y], [x1]] = layout.bar!;
    out.push({ target: { objectId, part: "bar" }, label: `${objectId} fraction bar`, writable: false, value: null, rect: at({ x: x0, y: y - 0.1, w: x1 - x0, h: 0.2 }) });
    out.push({ target: { objectId, part: "denominator" }, label: `${objectId} denominator`, writable: false, value: denominator, rect: at(layout.denominator!) });
    if (state.parts.whole !== null)
      out.push({ target: { objectId, part: "whole_number" }, label: `${objectId} whole number`, writable: false, value: state.parts.whole, rect: at(layout.whole!) });
    return out;
  },
  draw(state, objectId, ctx) {
    const { layout, dx, dy } = layoutOf(state);
    const base = { objectId, layer: "math" as const, ink: state.ink, width: DIGIT_WIDTH, seq: state.seq };
    return numberStrokes(ctx, state.parts, layout, { dx, dy }, base, (p) => (p === "sign" ? null : { objectId, part: p }), "frac");
  },
};
