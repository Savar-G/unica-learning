// Synthetic scan pages for tests and test scripts only: a page drawn from a contract's own geometry, answers "written" as
// seven-segment digits, and a "photo" of it through a perspective map. This ink proves geometry. It says nothing about
// reading real handwriting. Never used for a family.
import QRCode from "qrcode";
import sharp from "sharp";
import { applyTransform, perspectiveTransform, type Raster } from "@/lib/scan-calibration";
import type { Box, Point, ScanMark } from "@/lib/workbook-print-contract";

export const blankPage = (width: number, height: number): Raster => ({ width, height, channels: 1, data: new Uint8Array(width * height).fill(248) });

export function fillBox(r: Raster, x: number, y: number, w: number, h: number, value = 25) {
  for (let py = Math.max(0, Math.round(y)); py < Math.min(r.height, Math.round(y + h)); py++) {
    for (let px = Math.max(0, Math.round(x)); px < Math.min(r.width, Math.round(x + w)); px++) r.data[py * r.width + px] = value;
  }
}

/** A scan mark with its outer corner at `p`. */
export function drawMark(r: Raster, m: ScanMark, p: Point, arm = 28, stroke = 5) {
  const left = m === "tl" || m === "bl", top = m === "tl" || m === "tr";
  fillBox(r, left ? p.x : p.x - arm, top ? p.y : p.y - stroke, arm, stroke);
  fillBox(r, left ? p.x : p.x - stroke, top ? p.y : p.y - arm, stroke, arm);
}

/** Printed content that differs in each way up: heading blocks, lines of text and a code block low on the right. */
export function drawPrintedContent(r: Raster) {
  const w = r.width, h = r.height;
  fillBox(r, w * 0.07, h * 0.055, w * 0.49, h * 0.036);
  fillBox(r, w * 0.07, h * 0.11, w * 0.28, h * 0.012);
  for (let line = 0; line < 12; line++) for (let word = 0; word < 6; word++) fillBox(r, w * 0.07 + word * w * 0.094, h * 0.145 + line * h * 0.02, w * 0.075, h * 0.0067);
  fillBox(r, w * 0.815, h * 0.885, w * 0.118, w * 0.118, 40);
  for (let i = 0; i < 12; i++) fillBox(r, w * 0.07 + i * w * 0.031, h * 0.957, w * 0.02, h * 0.0073);
}

/**
 * Printed content as real text sets it: lines of words of uneven length, so no part of the page repeats another a word
 * or a line away. `seed` picks the words. Heading blocks, then the lines, then a code block low on the right.
 */
export function drawTextContent(r: Raster, seed = 7) {
  const w = r.width, h = r.height;
  let s = seed;
  const next = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  fillBox(r, w * 0.07, h * 0.055, w * 0.49, h * 0.036);
  fillBox(r, w * 0.07, h * 0.11, w * 0.28, h * 0.012);
  for (let line = 0; line < 14; line++) {
    for (let x = w * 0.07 + next() * w * 0.03; x < w * 0.86;) {
      const word = w * (0.02 + next() * 0.07);
      fillBox(r, x, h * 0.145 + line * h * 0.02 + next() * 2, Math.min(word, w * 0.88 - x), h * (0.005 + next() * 0.004));
      x += word + w * (0.012 + next() * 0.015);
    }
  }
  fillBox(r, w * 0.815, h * 0.885, w * 0.118, w * 0.118, 40);
  for (let i = 0; i < 12; i++) fillBox(r, w * 0.07 + i * w * 0.031, h * 0.957, w * 0.02 + next() * w * 0.01, h * 0.0073);
}

export function drawBoxOutline(r: Raster, b: Box) {
  fillBox(r, b.x, b.y, b.width, 2, 150); fillBox(r, b.x, b.y + b.height - 2, b.width, 2, 150);
  fillBox(r, b.x, b.y, 2, b.height, 150); fillBox(r, b.x + b.width - 2, b.y, 2, b.height, 150);
}

/** A real QR code of `text`, as a page prints it. */
export function drawQr(r: Raster, b: Box, text: string) {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
  fillBox(r, b.x, b.y, b.width, b.height, 252);
  const cell = b.width / (size + 8);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (data[y * size + x]) fillBox(r, b.x + (x + 4) * cell, b.y + (y + 4) * cell, cell, cell, 15);
  }
}

export const DIGIT_SEGMENTS = ["abcdef", "bc", "abdeg", "abcdg", "bcfg", "acdfg", "acdefg", "abc", "abcdefg", "abcdfg"];

/** Where each segment sits, as a box in parts of the digit's box. */
const SEGMENT: Record<string, [number, number, number, number]> = {
  a: [0.25, 0.1, 0.5, 0.08], b: [0.72, 0.15, 0.08, 0.32], c: [0.72, 0.53, 0.08, 0.32], d: [0.25, 0.82, 0.5, 0.08],
  e: [0.2, 0.53, 0.08, 0.32], f: [0.2, 0.15, 0.08, 0.32], g: [0.25, 0.46, 0.5, 0.08],
};

export function drawDigit(r: Raster, b: Box, digit: number, ink = 30) {
  for (const s of DIGIT_SEGMENTS[digit]) {
    const [x, y, w, h] = SEGMENT[s];
    fillBox(r, b.x + x * b.width, b.y + y * b.height, w * b.width, h * b.height, ink);
  }
}

/** A "photo": the page seen through a map onto `corners`, on a darker surface, with shade across it. */
export function photographed(source: Raster, size: { width: number; height: number }, corners: Point[], o: { background?: number; shade?: number; onto?: Raster } = {}): Raster {
  const W = source.width, H = source.height;
  const out = o.onto ? o.onto.data : new Uint8Array(size.width * size.height).fill(o.background ?? 96);
  const t = perspectiveTransform(corners, [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }])!;
  for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) {
    const p = applyTransform(t, { x: x + 0.5, y: y + 0.5 });
    if (p.x < 0 || p.y < 0 || p.x >= W - 1 || p.y >= H - 1) continue;
    const x0 = Math.floor(p.x), y0 = Math.floor(p.y), fx = p.x - x0, fy = p.y - y0;
    const v = (source.data[y0 * W + x0] * (1 - fx) + source.data[y0 * W + x0 + 1] * fx) * (1 - fy)
      + (source.data[(y0 + 1) * W + x0] * (1 - fx) + source.data[(y0 + 1) * W + x0 + 1] * fx) * fy;
    out[y * size.width + x] = v * (1 - (o.shade ?? 0) * (x / size.width));
  }
  return { width: size.width, height: size.height, channels: 1, data: out };
}

export const rasterSharp = (r: Raster) => sharp(Buffer.from(r.data), { raw: { width: r.width, height: r.height, channels: r.channels } });

/** A raster as stored JPEG bytes, slightly soft as a phone photo is. */
export const photoJpeg = (r: Raster) => rasterSharp(r).blur(0.6).jpeg({ quality: 82 }).toBuffer();
export const pagePng = (r: Raster) => rasterSharp(r).png().toBuffer();

export async function greyRaster(bytes: Uint8Array): Promise<Raster> {
  const { data, info } = await sharp(bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: 1, data: new Uint8Array(data) };
}

/** Which digit is in `box`, of a crop that shows `cut`: by the darkness of each segment's place. Null when none reads. */
export function readDigit(crop: Raster, cut: Box, box: Box): number | null {
  const sx = crop.width / cut.width, sy = crop.height / cut.height;
  const lit = new Set<string>();
  for (const [name, [x, y, w, h]] of Object.entries(SEGMENT)) {
    let sum = 0, n = 0;
    for (let cy = y + h * 0.25; cy < y + h * 0.8; cy += h * 0.1) for (let cx = x + w * 0.25; cx < x + w * 0.8; cx += w * 0.1) {
      const px = Math.round((box.x + cx * box.width - cut.x) * sx), py = Math.round((box.y + cy * box.height - cut.y) * sy);
      if (px < 0 || py < 0 || px >= crop.width || py >= crop.height) continue;
      sum += crop.data[py * crop.width + px]; n++;
    }
    if (n && sum / n < 110) lit.add(name);
  }
  const key = [...lit].sort().join("");
  const found = DIGIT_SEGMENTS.findIndex((s) => [...s].sort().join("") === key);
  return found < 0 ? null : found;
}

/** The part of the page a crop of `box` shows: cropBox's margin rule, for a box well inside the page. */
export function cropCut(box: Box): Box {
  const margin = Math.min(10, 0.1 * Math.min(box.width, box.height));
  return { x: box.x - margin, y: box.y - margin, width: box.width + 2 * margin, height: box.height + 2 * margin };
}

/** The corners of an upright page on a photo, centred, `margin` from the top and bottom. */
export function uprightCorners(size: { width: number; height: number }, page: { width: number; height: number }, margin: number, centre = { x: size.width / 2, y: size.height / 2 }): Point[] {
  const h = size.height - 2 * margin, w = (h * page.width) / page.height;
  return [
    { x: centre.x - w / 2, y: centre.y - h / 2 }, { x: centre.x + w / 2, y: centre.y - h / 2 },
    { x: centre.x + w / 2, y: centre.y + h / 2 }, { x: centre.x - w / 2, y: centre.y + h / 2 },
  ];
}

export function rotatedCorners(corners: Point[], degrees: number, about: Point): Point[] {
  const a = (degrees * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return corners.map((p) => ({ x: about.x + (p.x - about.x) * c - (p.y - about.y) * s, y: about.y + (p.x - about.x) * s + (p.y - about.y) * c }));
}

/**
 * A sheet held up in the hand (#912): near one edge the paper curls toward the camera, so the print there moves inward
 * and down by up to `amount` photo pixels, most at the middle of that edge and fading over `reach` of the photo's width.
 * The corners stay where they are. `edge`: which side the hand holds.
 */
export function curled(r: Raster, amount: number, o: { edge?: "left" | "right"; reach?: number } = {}): Raster {
  const out = new Uint8Array(r.width * r.height * r.channels);
  const reach = (o.reach ?? 0.25) * r.width, right = o.edge === "right";
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
    const from = right ? r.width - 1 - x : x, fade = Math.exp(-from / reach), along = Math.sin((Math.PI * y) / r.height);
    // A curl rolls the paper: the print moves toward the held edge and a little along it, more as the paper bends away.
    const sx = x + (right ? 1 : -1) * amount * fade * along, sy = y - 0.4 * amount * fade * Math.sin((2 * Math.PI * y) / r.height);
    const x0 = Math.max(0, Math.min(r.width - 2, Math.floor(sx))), y0 = Math.max(0, Math.min(r.height - 2, Math.floor(sy)));
    const fx = Math.max(0, Math.min(1, sx - x0)), fy = Math.max(0, Math.min(1, sy - y0));
    for (let c = 0; c < r.channels; c++) {
      const at = (yy: number, xx: number) => r.data[(yy * r.width + xx) * r.channels + c];
      out[(y * r.width + x) * r.channels + c] = Math.round((at(y0, x0) * (1 - fx) + at(y0, x0 + 1) * fx) * (1 - fy) + (at(y0 + 1, x0) * (1 - fx) + at(y0 + 1, x0 + 1) * fx) * fy);
    }
  }
  return { ...r, data: out };
}

/**
 * A phone's or an arm's shadow: every pixel to the right of the line from `from` to `to` (walking from one to the other)
 * is `darkness` darker (0.5 keeps half its light), with an edge that softens over `soft` pixels.
 */
export function shadowed(r: Raster, from: Point, to: Point, darkness: number, soft = 6): Raster {
  const out = new Uint8Array(r.data);
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1, nx = -(to.y - from.y) / len, ny = (to.x - from.x) / len;
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
    const k = Math.max(0, Math.min(1, 0.5 + ((x - from.x) * nx + (y - from.y) * ny) / soft));
    if (k === 0) continue;
    for (let c = 0; c < r.channels; c++) { const at = (y * r.width + x) * r.channels + c; out[at] = Math.round(out[at] * (1 - darkness * k)); }
  }
  return { ...r, data: out };
}

/** The part of a raster inside a box: a photo whose frame cuts the page. */
export function cutOut(r: Raster, b: Box): Raster {
  const out = new Uint8Array(b.width * b.height * r.channels);
  for (let y = 0; y < b.height; y++) out.set(r.data.subarray(((b.y + y) * r.width + b.x) * r.channels, ((b.y + y) * r.width + b.x + b.width) * r.channels), y * b.width * r.channels);
  return { width: b.width, height: b.height, channels: r.channels, data: out };
}
