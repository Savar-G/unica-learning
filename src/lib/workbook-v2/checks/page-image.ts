// Reads the pixels of a page image: a PNG file with 8 bits for each part of a colour, as the typesetter writes it.
// Any other PNG is refused. No file and no setting is read: the same bytes always give the same pixels.
import { inflateSync } from "node:zlib";

export interface PageImage {
  width: number;
  height: number;
  /** The lowest part of the colour of each pixel on white paper, line by line: 0 is black, red or any full colour, and 255 is paper white. */
  low: Uint8Array;
  /** The first pixel that is not a grey. */
  colour: { x: number; y: number } | null;
}

const CANNOT_READ = "the page image cannot be read";
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
/** The parts of one pixel for each colour type: grey, colour, colour with a see-through part. */
const PARTS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 6: 4 };
const MAX_PIXELS = 64_000_000;

interface Header { width: number; height: number; parts: number }
interface Chunk { type: string; data: Uint8Array }

/** The chunks of the file, or null when it does not end in an end chunk. */
function chunksOf(png: Uint8Array): Chunk[] | null {
  if (SIGNATURE.some((byte, i) => png[i] !== byte)) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Chunk[] = [];
  for (let at = SIGNATURE.length; at + 12 <= png.length;) {
    const end = at + 8 + view.getUint32(at);
    if (end + 4 > png.length) return null;
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    chunks.push({ type, data: png.subarray(at + 8, end) });
    if (type === "IEND") return chunks;
    at = end + 4;
  }
  return null;
}

function readHeader({ type, data }: Chunk): Header | null {
  if (type !== "IHDR" || data.length !== 13) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const [width, height] = [view.getUint32(0), view.getUint32(4)];
  const [bits, colours, packing, filtering, lineOrder] = data.subarray(8);
  const parts = PARTS[colours];
  if (bits !== 8 || parts === undefined || packing !== 0 || filtering !== 0 || lineOrder !== 0) return null;
  return width > 0 && height > 0 && width * height <= MAX_PIXELS ? { width, height, parts } : null;
}

function unpack(chunks: readonly Chunk[], size: number): Uint8Array | null {
  const parts = chunks.filter((c) => c.type === "IDAT").map((c) => c.data);
  const packed = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const part of parts) {
    packed.set(part, at);
    at += part.length;
  }
  try {
    const bytes = inflateSync(packed, { maxOutputLength: size });
    return bytes.length === size ? bytes : null;
  } catch {
    return null;
  }
}

function paeth(left: number, above: number, corner: number): number {
  const a = Math.abs(above - corner);
  const b = Math.abs(left - corner);
  const c = Math.abs(left + above - 2 * corner);
  return a <= b && a <= c ? left : b <= c ? above : corner;
}

/**
 * Each line holds its filter and then the difference of each byte from its neighbours. False: an unknown filter. Above the
 * first line and left of the first pixel there is nothing, which counts as 0. Each filter has a loop of its own, because a
 * book has a billion of these bytes.
 */
function unfilter(lines: Uint8Array, { height, parts }: Header, stride: number): boolean {
  const up = stride + 1;
  const bytes = Buffer.from(lines.buffer, lines.byteOffset, lines.length);
  const nothing = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const start = y * up + 1;
    const first = start + parts;
    const end = start + stride;
    const filter = lines[start - 1];
    if (filter > 4) return false;
    // Most lines of a page are the line above, with no difference.
    if (filter === 2 && y > 0 && bytes.compare(nothing, 0, stride, start, end) === 0) lines.copyWithin(start, start - up, end - up);
    else if (filter === 1 || (filter === 4 && y === 0)) for (let i = first; i < end; i++) lines[i] += lines[i - parts];
    else if (filter === 2 && y > 0) for (let i = start; i < end; i++) lines[i] += lines[i - up];
    else if (filter === 3 && y === 0) for (let i = first; i < end; i++) lines[i] += lines[i - parts] >> 1;
    else if (filter === 3) {
      for (let i = start; i < first; i++) lines[i] += lines[i - up] >> 1;
      for (let i = first; i < end; i++) lines[i] += (lines[i - parts] + lines[i - up]) >> 1;
    } else if (filter === 4) {
      for (let i = start; i < first; i++) lines[i] += lines[i - up];
      for (let i = first; i < end; i++) lines[i] += paeth(lines[i - parts], lines[i - up], lines[i - up - parts]);
    }
  }
  return true;
}

/** A part of a colour as it prints on white paper. */
const onPaper = (part: number, cover: number): number => (cover === 255 ? part : 255 - ((255 - part) * cover) / 255);

/** Whether a line is made of the same pixels as the line above it: most lines of a page are white. */
const isSameAsAbove = (lines: Buffer, start: number, stride: number): boolean => lines.compare(lines, start - stride - 1, start - 1, start, start + stride) === 0;

/** Every byte of the pixels of a PNG, line by line with no filter byte, and the parts of one pixel: 1 grey, 3 colour, 4 colour with a see-through part. */
export interface PngPixels { width: number; height: number; parts: number; pixels: Uint8Array }

/** The pixels of a PNG as they are stored, for a comparison of two images that does not depend on how each was packed. */
export function readPngPixels(png: Uint8Array): PngPixels | string {
  const chunks = chunksOf(png);
  const header = chunks && readHeader(chunks[0]);
  if (!chunks || !header) return CANNOT_READ;
  const { width, height, parts } = header;
  const stride = width * parts;
  const lines = unpack(chunks, (stride + 1) * height);
  if (!lines || !unfilter(lines, header, stride)) return CANNOT_READ;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) pixels.set(lines.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride);
  return { width, height, parts, pixels };
}

export function readPageImage(png: Uint8Array): PageImage | string {
  const chunks = chunksOf(png);
  const header = chunks && readHeader(chunks[0]);
  if (!chunks || !header) return CANNOT_READ;
  const { width, height, parts } = header;
  const stride = width * parts;
  const lines = unpack(chunks, (stride + 1) * height);
  if (!lines || !unfilter(lines, header, stride)) return CANNOT_READ;
  const low = new Uint8Array(width * height);
  const bytes = Buffer.from(lines.buffer, lines.byteOffset, lines.length);
  let colour: PageImage["colour"] = null;
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1) + 1;
    const to = y * width;
    if (parts === 1) low.set(lines.subarray(start, start + stride), to);
    else if (y > 0 && isSameAsAbove(bytes, start, stride)) low.copyWithin(to, to - width, to);
    else for (let x = 0, at = start; x < width; x++, at += parts) {
      const [red, green, blue] = [lines[at], lines[at + 1], lines[at + 2]];
      const cover = parts === 4 ? lines[at + 3] : 255;
      if (cover > 0 && (red !== green || green !== blue)) colour ??= { x, y };
      low[to + x] = onPaper(Math.min(red, green, blue), cover);
    }
  }
  return { width, height, low, colour };
}
