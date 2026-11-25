// A book proves its own pages: what the page model says is read back from each finished page image. The image is made
// apart from the report of the typesetter, so text that is reported and not printed is found here.
import { IMAGE_PIXELS_PER_INCH, PRINT_RULES, type Ink, type PageModel, type Rect, type Region } from "../contract";
import { flatGrey, inner, outer, strayInk, type Box } from "./blank";
import { readQr, strayQrTexts } from "./find-qr";
import { readPageImage, type PageImage } from "./page-image";
import { regionName } from "./page-rules";
import { bottom, right } from "./rects";

const SCALE = IMAGE_PIXELS_PER_INCH / 72;
/** How far the corners of a QR code may be from their place: about one square. */
const QR_CORNER_ROOM = 4;

type Tell = (problem: string) => void;

/** The grey of each colour of the model, as the image has it. */
const GREYS: Readonly<Record<string, number>> = { black: 0 };
const PAPER_WHITE = 255;

/** Each letter and each thin line has a pixel that is at least this dark, so that grey in place of black is found. */
const SOLID = 72;

function hasInk({ width, height, low }: PageImage, box: Box): boolean {
  for (let y = Math.max(0, box.top); y < Math.min(height, box.bottom); y++) for (let x = Math.max(0, box.left); x < Math.min(width, box.right); x++) if (low[y * width + x] < SOLID) return true;
  return false;
}

/** Whether a fill is drawn in all of its area and in its colour: a part of it, or a neighbour that shares a corner, is not enough. */
function isFilled({ width, low }: PageImage, box: Box, grey: number): boolean {
  for (let y = box.top; y < box.bottom; y++) for (let x = box.left; x < box.right; x++) if (low[y * width + x] !== grey) return false;
  return box.right > box.left && box.bottom > box.top;
}

/** Whether a thin line has ink at each pixel of its length. It can be thinner than a pixel is wide. */
function isWholeLine(image: PageImage, box: Box): boolean {
  if (box.right - box.left > box.bottom - box.top) {
    for (let x = box.left; x < box.right; x++) if (!hasInk(image, { ...box, left: x, right: x + 1 })) return false;
  } else {
    for (let y = box.top; y < box.bottom; y++) if (!hasInk(image, { ...box, top: y, bottom: y + 1 })) return false;
  }
  return true;
}

/** The middle of each side of an outline: at its ends the other sides have ink. */
function sidesOf({ x, y, w, h }: Rect, line: number): Rect[] {
  return [
    { x: x + w / 4, y: y - line / 2, w: w / 2, h: line },
    { x: x + w / 4, y: y + h - line / 2, w: w / 2, h: line },
    { x: x - line / 2, y: y + h / 4, w: line, h: h / 2 },
    { x: x + w - line / 2, y: y + h / 4, w: line, h: h / 2 },
  ];
}

function isDrawn(image: PageImage, ink: Ink): boolean {
  if (ink.kind === "outline") return sidesOf(ink.rect, ink.width).every((side) => isWholeLine(image, outer(side)));
  return ink.kind === "fill" ? isFilled(image, inner(ink.rect), GREYS[ink.color]) : hasInk(image, inner(ink.rect));
}

function checkInk(image: PageImage, region: Region, tell: Tell): void {
  // The outline shows where an answer goes, so it is looked for whatever the model says of its ink.
  if (region.role === "answer" && !isDrawn(image, { kind: "outline", rect: region.rect, color: "black", width: PRINT_RULES.answer.outline })) tell(`the image has no outline of ${regionName(region)}`);
  for (const ink of region.ink) {
    if (isDrawn(image, ink)) continue;
    if (ink.kind === "text") tell(`${regionName(region)} must print "${ink.text}" and the image has no ink there`);
    else tell(`the image has no ink for a part of ${regionName(region)}`);
  }
}

function fills(box: Box, ink: readonly Ink[]): boolean {
  const rects = ink.map((i) => i.rect);
  const wanted = [Math.min(...rects.map((r) => r.x)), Math.min(...rects.map((r) => r.y)), Math.max(...rects.map(right)), Math.max(...rects.map(bottom))];
  return [box.left, box.top, box.right, box.bottom].every((at, i) => Math.abs(at - wanted[i] * SCALE) <= QR_CORNER_ROOM);
}

function checkQr(image: PageImage, page: PageModel, tell: Tell): void {
  const region = page.regions.find((r) => r.role === "qr");
  if (!region) return tell("there is no place for a QR code");
  const box = outer(region.rect);
  const found = readQr(image, box);
  if (!found) tell("the image has no QR code that can be read in its box");
  else if (found.text !== page.qr) tell(`the QR code reads "${found.text}" and must read "${page.qr}"`);
  else if (!fills(found.box, region.ink)) tell("the QR code does not fill its box");
  for (const text of strayQrTexts(image, box)) tell(`the image has a second QR code, which reads "${text}"`);
}

const points = (at: { x: number; y: number }) => `(${Math.round(at.x)}, ${Math.round(at.y)})`;

/** Ink that the model does not have, and colours that it does not use. */
function checkBlank(image: PageImage, page: PageModel, tell: Tell): void {
  if (image.colour) tell(`the image has a colour that is not a grey, at ${points({ x: image.colour.x / SCALE, y: image.colour.y / SCALE })}`);
  const grey = flatGrey(image, [...Object.values(GREYS), PAPER_WHITE]);
  if (grey) tell(`the image has the grey ${grey.grey}, which the model does not use, at ${points(grey)}`);
  for (const { place, ...at } of strayInk(page, image)) tell(`the image has ink that the model does not have, at ${points(at)} in ${place}`);
}

function checkImage(page: PageModel, png: Uint8Array, tell: Tell): void {
  const image = readPageImage(png);
  if (typeof image === "string") return tell(image);
  const [width, height] = [Math.round(page.size.w * SCALE), Math.round(page.size.h * SCALE)];
  if (image.width !== width || image.height !== height) return tell(`the page image is ${image.width} by ${image.height} pixels and must be ${width} by ${height}`);
  checkQr(image, page, tell);
  for (const region of page.regions) checkInk(image, region, tell);
  checkBlank(image, page, tell);
}

/** What the page images do not prove, in plain words. `images` has one image a page, in page order. */
export function checkImages(pages: readonly PageModel[], images: readonly Uint8Array[]): string[] {
  const problems = new Set<string>();
  pages.forEach((page, i) => checkImage(page, images[i], (problem) => problems.add(`Page ${page.page}: ${problem}.`)));
  return [...problems];
}
