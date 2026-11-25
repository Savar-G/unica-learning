// Layers 2 and 3 of the fit checks: a page image has ink only where the model prints it, and only in the greys of the model.
// It knows no face, part or template: the model says where ink may be, and the paper and the print rules say where not.
import { IMAGE_PIXELS_PER_INCH, PRINT_RULES, type Ink, type PageModel, type Rect, type Region } from "../contract";
import type { PageImage } from "./page-image";
import { regionName } from "./page-rules";
import { inside } from "./rects";

const SCALE = IMAGE_PIXELS_PER_INCH / 72;
/** A pixel with a part of its colour below this is ink, also a light grey or a light colour. */
const INK = 245;
const WHITE = 255;
/** The middle of a letter can come out this much lighter than its colour. */
const GREY_ROOM = 2;
/** An edge in whole pixels is a sum of decimals, so it can differ in the last digits. */
const ROUNDING = 1e-6;

/** A part of an image in whole pixels: the right and bottom ends are outside it. */
export interface Box { left: number; top: number; right: number; bottom: number }

/** Every pixel that the rectangle touches. A pixel at the edge of ink holds a part of it. */
export const outer = ({ x, y, w, h }: Rect): Box => ({ left: Math.floor(x * SCALE + ROUNDING), top: Math.floor(y * SCALE + ROUNDING), right: Math.ceil((x + w) * SCALE - ROUNDING), bottom: Math.ceil((y + h) * SCALE - ROUNDING) });
/** The pixels that are in the rectangle with all of their area, so that ink of a neighbour does not count. */
export const inner = ({ x, y, w, h }: Rect): Box => ({ left: Math.ceil(x * SCALE - ROUNDING), top: Math.ceil(y * SCALE - ROUNDING), right: Math.floor((x + w) * SCALE + ROUNDING), bottom: Math.floor((y + h) * SCALE + ROUNDING) });

/** The pixels whose middle is in the rectangle. */
const middles = ({ x, y, w, h }: Rect): Box => ({ left: Math.ceil(x * SCALE - 0.5), top: Math.ceil(y * SCALE - 0.5), right: Math.ceil((x + w) * SCALE - 0.5), bottom: Math.ceil((y + h) * SCALE - 0.5) });

const inImage = ({ left, top, right, bottom }: Box, { width, height }: PageImage): Box => ({ left: Math.max(0, left), top: Math.max(0, top), right: Math.min(width, right), bottom: Math.min(height, bottom) });

/** Where ink may be, and the part of the page that a problem names. */
export interface Stray { place: string; x: number; y: number }

/** The four lines of an outline, with their corners. */
function outlineLines({ x, y, w, h }: Rect, line: number): Rect[] {
  const [left, top, width, height] = [x - line / 2, y - line / 2, w + line, h + line];
  return [{ x: left, y: top, w: width, h: line }, { x: left, y: y + h - line / 2, w: width, h: line }, { x: left, y: top, w: line, h: height }, { x: x + w - line / 2, y: top, w: line, h: height }];
}

const inkRects = (ink: Ink): Rect[] => (ink.kind === "outline" ? outlineLines(ink.rect, ink.width) : [ink.rect]);

interface Zone { name: string; rect: Rect; region: Region | null }

const ZONE_ROLES: readonly Region["role"][] = ["answer", "reach", "work", "qr"];

/** The parts of a page that a child writes in, that a binding hides or that a scan needs white. */
function zonesOf(page: PageModel): Zone[] {
  const { w, h } = page.size;
  const { spineZone: spine, outerMargin: margin } = PRINT_RULES;
  const front = page.side === "front";
  const edge = (name: string, rect: Rect): Zone => ({ name, rect, region: null });
  const own = ZONE_ROLES.flatMap((role) => page.regions.filter((r) => r.role === role));
  return [
    ...own.map((region) => ({ name: regionName(region), rect: region.rect, region })),
    edge("the spine zone", { x: front ? 0 : w - spine, y: 0, w: spine, h }),
    edge("the margin", { x: front ? w - margin : 0, y: 0, w: margin, h }),
    edge("the margin", { x: 0, y: 0, w, h: margin }),
    edge("the margin", { x: 0, y: h - margin, w, h: margin }),
  ];
}

/** The next pixel that is not white, or -1. Most of a page is white, so it looks at four pixels at a time. The list starts its buffer. */
function nextOff(low: Uint8Array, from: number): number {
  const fours = new Uint32Array(low.buffer, 0, low.length >> 2);
  for (let at = from; at < low.length; at++) {
    if ((at & 3) === 0) {
      let four = at >> 2;
      while (four < fours.length && fours[four] === 0xffffffff) four++;
      at = four << 2;
    }
    if (at < low.length && low[at] !== WHITE) return at;
  }
  return -1;
}

/** The pixels of an image that is cleared piece by piece until only ink with no right to be there is left. */
class Remains {
  readonly low: Uint8Array;
  constructor(private readonly image: PageImage) {
    this.low = image.low.slice();
  }

  clear(box: Box): void {
    const { left, top, right, bottom } = inImage(box, this.image);
    for (let y = top; y < bottom && left < right; y++) this.low.fill(WHITE, y * this.image.width + left, y * this.image.width + right);
  }

  restore(box: Box): void {
    const { width, low } = this.image;
    const { left, top, right, bottom } = inImage(box, this.image);
    for (let y = top; y < bottom && left < right; y++) this.low.set(low.subarray(y * width + left, y * width + right), y * width + left);
  }

  /** The next pixel of ink from a place of the list, or -1. */
  nextInk(from: number): number {
    for (let at = nextOff(this.low, from); at >= 0; at = nextOff(this.low, at + 1)) if (this.low[at] < INK) return at;
    return -1;
  }

  /** Clears a part of the image and gives its first pixel of ink, or -1. */
  takeInk(box: Box): number {
    const { left, top, right, bottom } = inImage(box, this.image);
    let first = -1;
    for (let y = top; y < bottom && left < right && first < 0; y++) {
      const at = this.nextInk(y * this.image.width + left);
      // The next ink of the page: in this line of the part, or at the earliest in the line that it is in.
      if (at < 0) break;
      const line = Math.floor(at / this.image.width);
      const x = at % this.image.width;
      if (line === y && x < right) first = at;
      else if (line > y) y = line - (x < right ? 1 : 0);
    }
    if (first >= 0) this.clear(box);
    return first;
  }

  pointOf(at: number): { x: number; y: number } {
    return { x: (at % this.image.width) / SCALE, y: Math.floor(at / this.image.width) / SCALE };
  }
}

/** Each part of the page that has ink that the model does not have, one time, from the top. */
export function strayInk(page: PageModel, image: PageImage): Stray[] {
  const left = new Remains(image);
  const clearInk = (inks: readonly Ink[]) => inks.flatMap(inkRects).forEach((rect) => left.clear(outer(rect)));
  clearInk(page.regions.flatMap((r) => r.ink));
  const zones = zonesOf(page);
  for (const { rect } of zones) left.restore(inner(rect));
  // A zone holds only its own print: the border of an answer area and the squares of a QR code.
  for (const region of page.regions) if (region.role === "answer" || region.role === "qr") clearInk(region.role === "qr" ? region.ink : region.ink.filter((i) => i.kind === "outline"));

  const places: Zone[] = [
    ...zones,
    ...page.regions.filter((r) => r.role !== "slot"), ...page.regions.filter((r) => r.role === "slot"),
  ].map((p) => ("name" in p ? p : { name: regionName(p), rect: p.rect, region: p }));
  const found: Stray[] = [];
  // A pixel belongs to the first place that holds its middle, so a place never takes the ink of one that lies in it.
  for (const { name, rect } of places) {
    if (left.nextInk(0) < 0) break;
    const at = left.takeInk(middles(rect));
    if (at >= 0 && !found.some((s) => s.place === name)) found.push({ place: name, ...left.pointOf(at) });
  }
  const rest = left.nextInk(0);
  if (rest >= 0) found.push({ place: "no rectangle of the page", ...left.pointOf(rest) });
  return found.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The first ink outside one rectangle, for an item that is drawn alone. */
export function inkOutside(image: PageImage, rect: Rect): { x: number; y: number } | null {
  const left = new Remains(image);
  left.clear(outer(rect));
  const at = left.nextInk(0);
  return at < 0 ? null : left.pointOf(at);
}

/**
 * The first area of a grey that is not near one in the list: three by three pixels of one value. The soft edge of black ink is never
 * that large, because an edge that is three pixels deep has black or white in its middle.
 */
export function flatGrey({ width, height, low: given }: PageImage, greys: readonly number[]): { x: number; y: number; grey: number } | null {
  const isGood = new Uint8Array(256);
  for (const grey of greys) isGood.fill(1, Math.max(0, grey - GREY_ROOM), grey + GREY_ROOM + 1);
  const low = given.byteOffset === 0 ? given : given.slice();
  const last = (height - 2) * width;
  for (let at = nextOff(low, 0); at >= 0 && at < last; at = low[at + 1] === WHITE ? nextOff(low, at + 2) : at + 1) {
    const grey = low[at];
    if (isGood[grey] || low[at + 1] !== grey || low[at + 2] !== grey || at % width > width - 3) continue;
    let flat = true;
    for (const row of [at + width, at + 2 * width]) flat &&= low[row] === grey && low[row + 1] === grey && low[row + 2] === grey;
    if (flat) return { x: (at % width) / SCALE, y: Math.floor(at / width) / SCALE, grey };
  }
  return null;
}
