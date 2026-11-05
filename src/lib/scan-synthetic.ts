// Synthetic scan pages for tests and test scripts only: a page drawn from a contract's own geometry, answers "written" as
// seven-segment digits, and a "photo" of it through a perspective map. This ink proves geometry. It says nothing about
// reading real handwriting. Never used for a family.
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

export function drawBoxOutline(r: Raster, b: Box) {
  fillBox(r, b.x, b.y, b.width, 2, 150); fillBox(r, b.x, b.y + b.height - 2, b.width, 2, 150);
  fillBox(r, b.x, b.y, 2, b.height, 150); fillBox(r, b.x + b.width - 2, b.y, 2, b.height, 150);
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
export function photographed(source: Raster, size: { width: number; height: number }, corners: Point[], o: { background?: number; shade?: number } = {}): Raster {
  const W = source.width, H = source.height;
  const out = new Uint8Array(size.width * size.height).fill(o.background ?? 96);
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
