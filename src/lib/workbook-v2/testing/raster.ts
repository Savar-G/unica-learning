// Draws a page model as a page image, for tests that need no Typst. A text is a black bar on its line.
import { crc32, deflateSync } from "node:zlib";
import { IMAGE_PIXELS_PER_INCH, type Ink, type PageModel, type Rect } from "../contract";
import { barOf, linesOf } from "./fake-typesetter";

const pixels = (points: number) => Math.round((points * IMAGE_PIXELS_PER_INCH) / 72);

export interface Canvas { width: number; height: number; grey: Uint8Array }

export function blankPage(size: { w: number; h: number }): Canvas {
  const [width, height] = [pixels(size.w), pixels(size.h)];
  return { width, height, grey: new Uint8Array(width * height).fill(255) };
}

export function paint({ width, grey }: Canvas, r: Rect, value = 0): void {
  for (let y = pixels(r.y); y < pixels(r.y + r.h); y++) grey.fill(value, y * width + pixels(r.x), y * width + pixels(r.x + r.w));
}

const outlineSides = ({ x, y, w, h }: Rect, line: number): Rect[] => [
  { x, y: y - line / 2, w, h: line }, { x, y: y + h - line / 2, w, h: line },
  { x: x - line / 2, y, w: line, h }, { x: x + w - line / 2, y, w: line, h },
];

/** Paints a rectangle as a typesetter does: a pixel that is covered in part gets a part of the colour. */
export function paintSmooth({ width, height, grey }: Canvas, r: Rect, value = 0): void {
  const scale = IMAGE_PIXELS_PER_INCH / 72;
  const [left, top, right, bottom] = [r.x * scale, r.y * scale, (r.x + r.w) * scale, (r.y + r.h) * scale];
  for (let y = Math.max(0, Math.floor(top)); y < Math.min(height, Math.ceil(bottom)); y++) {
    for (let x = Math.max(0, Math.floor(left)); x < Math.min(width, Math.ceil(right)); x++) {
      const covered = (Math.min(x + 1, right) - Math.max(x, left)) * (Math.min(y + 1, bottom) - Math.max(y, top));
      grey[y * width + x] = Math.round(grey[y * width + x] * (1 - covered) + value * covered);
    }
  }
}

export function paintInk(canvas: Canvas, ink: Ink): void {
  if (ink.kind === "fill") paint(canvas, ink.rect);
  else if (ink.kind !== "outline") for (const line of linesOf(ink)) paint(canvas, barOf(line));
  else for (const line of outlineSides(ink.rect, ink.width)) paint(canvas, line);
}

export function drawPage(page: PageModel): Canvas {
  const canvas = blankPage(page.size);
  for (const region of page.regions) for (const ink of region.ink) paintInk(canvas, ink);
  return canvas;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** A PNG file of 8 bits a part. `lines` holds the filter number and the bytes of each line; `colours` is the colour type. */
export function pngFile(width: number, height: number, colours: number, lines: Uint8Array): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colours;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(lines, { level: 1 })), chunk("IEND", new Uint8Array())]);
}

/** `filter` is the number that PNG puts before each line; the lines themselves are not filtered. */
export function toPng({ width, height, grey }: Canvas, filter = 0): Uint8Array {
  const lines = Buffer.alloc((width + 1) * height, filter);
  for (let y = 0; y < height; y++) lines.set(grey.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  return pngFile(width, height, 0, lines);
}

/** The canvas as a file of red, green and blue, with other colours at some pixels. */
export function toColourPng({ width, height, grey }: Canvas, colours: readonly { x: number; y: number; colour: readonly [number, number, number] }[]): Uint8Array {
  const lines = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) lines.fill(grey[y * width + x], y * (width * 3 + 1) + 1 + x * 3, y * (width * 3 + 1) + 4 + x * 3);
  for (const { x, y, colour } of colours) lines.set(colour, y * (width * 3 + 1) + 1 + x * 3);
  return pngFile(width, height, 2, lines);
}

export const pagePng = (page: PageModel): Uint8Array => toPng(drawPage(page));
