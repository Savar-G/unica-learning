// Draws a page model as a page image, for tests that need no Typst. A text is a black bar in its rectangle.
import { crc32, deflateSync } from "node:zlib";
import { IMAGE_PIXELS_PER_INCH, type Ink, type PageModel, type Rect } from "../contract";

const pixels = (points: number) => Math.round((points * IMAGE_PIXELS_PER_INCH) / 72);

export interface Canvas { width: number; height: number; grey: Uint8Array }

export function blankPage(size: { w: number; h: number }): Canvas {
  const [width, height] = [pixels(size.w), pixels(size.h)];
  return { width, height, grey: new Uint8Array(width * height).fill(255) };
}

export function paint({ width, grey }: Canvas, r: Rect, value = 0): void {
  for (let y = pixels(r.y); y < pixels(r.y + r.h); y++) grey.fill(value, y * width + pixels(r.x), y * width + pixels(r.x + r.w));
}

export function paintInk(canvas: Canvas, ink: Ink): void {
  const { x, y, w, h } = ink.rect;
  if (ink.kind === "fill") paint(canvas, ink.rect);
  else if (ink.kind === "text") paint(canvas, { x: x + w / 2 - 4, y: y + h / 2 - 4, w: 8, h: 8 });
  else for (const line of [{ x, y: y - 0.5, w, h: 1 }, { x, y: y + h - 0.5, w, h: 1 }, { x: x - 0.5, y, w: 1, h }, { x: x + w - 0.5, y, w: 1, h }]) paint(canvas, line);
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

export const pagePng = (page: PageModel): Uint8Array => toPng(drawPage(page));
