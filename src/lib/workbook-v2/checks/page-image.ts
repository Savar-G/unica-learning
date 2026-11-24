// Reads the pixels of a page image: a PNG file with 8 bits for each part of a colour, as the typesetter writes it.
// Any other PNG is refused. No file and no setting is read: the same bytes always give the same pixels.
import { inflateSync } from "node:zlib";

export interface PageImage {
  width: number;
  height: number;
  /** One number for each pixel, line by line: 0 is black and 255 is paper white. */
  grey: Uint8Array;
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
 * Each line holds its filter and then the difference of each byte from its neighbours. False: an unknown filter. Each
 * filter has a loop of its own, because a book has a billion of these bytes.
 */
function unfilter(lines: Uint8Array, { height, parts }: Header, stride: number): boolean {
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1) + 1;
    const end = start + stride;
    const up = stride + 1;
    const filter = lines[start - 1];
    if (filter > 4) return false;
    // Above the first line and left of the first pixel there is nothing, which counts as 0.
    const above = (i: number) => (y === 0 ? 0 : lines[i - up]);
    const left = (i: number) => (i < start + parts ? 0 : lines[i - parts]);
    if (filter === 1) for (let i = start + parts; i < end; i++) lines[i] += lines[i - parts];
    else if (filter === 2 && y > 0) for (let i = start; i < end; i++) lines[i] += lines[i - up];
    else if (filter === 3) for (let i = start; i < end; i++) lines[i] += (left(i) + above(i)) >> 1;
    else if (filter === 4) for (let i = start; i < end; i++) lines[i] += paeth(left(i), above(i), i < start + parts ? 0 : above(i - parts));
  }
  return true;
}

/** How light a pixel prints on white paper. */
function lightness(lines: Uint8Array, at: number, parts: number): number {
  const red = lines[at];
  if (parts === 1) return red;
  const green = lines[at + 1];
  const blue = lines[at + 2];
  const light = red === green && red === blue ? red : (red * 299 + green * 587 + blue * 114) / 1000;
  return parts === 3 || lines[at + 3] === 255 ? light : 255 - ((255 - light) * lines[at + 3]) / 255;
}

export function readPageImage(png: Uint8Array): PageImage | string {
  const chunks = chunksOf(png);
  const header = chunks && readHeader(chunks[0]);
  if (!chunks || !header) return CANNOT_READ;
  const { width, height, parts } = header;
  const stride = width * parts;
  const lines = unpack(chunks, (stride + 1) * height);
  if (!lines || !unfilter(lines, header, stride)) return CANNOT_READ;
  const grey = new Uint8Array(width * height);
  for (let y = 0, to = 0; y < height; y++) {
    for (let x = 0, from = y * (stride + 1) + 1; x < width; x++, from += parts) grey[to++] = lightness(lines, from, parts);
  }
  return { width, height, grey };
}
