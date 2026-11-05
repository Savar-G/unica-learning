// Scan calibration (#455, S2b): reads a normalized photo of a printed page against that page's stored print contract.
// It finds the four L-shaped scan marks in the photo, maps the page's perspective from the contract's mark points, and
// cuts the straightened page and the answer regions out of the photo.
//
// Everything comes from the stored contract (workbook-print-contract.ts): the mark points, their order, the units and the
// region boxes. Nothing comes from today's template. A rectangle of four marks is accepted only when all of this holds, and
// a wrong crop is a wrong mark on a child's work, so anything unsure is refused:
// - its ink follows the page image the contract fingerprints, cell by cell, in one way up (a shared template is not enough);
// - it is the only rectangle in the photo that does (two sheets in one photo are refused, whichever holds the code);
// - inside it, where that page image printed its QR code, the photo's QR code reads as this page's own link.
//
// Pure TypeScript: no Next.js, React, network, database or clock. The caller decodes and encodes images.
import jsQR from "jsqr";
import { packageItem, type QuestionPackage } from "@/lib/question-package";
import {
  SCAN_MARKS,
  type Box,
  type PagePrintContract,
  type PhotoContract,
  type Point,
  type PrintedRegion,
  type ScanMark,
} from "@/lib/workbook-print-contract";

export const CALIBRATION_VERSION = 1;

/** Interleaved 8-bit pixels: 1 channel (grey) or 3 (RGB). Row 0 is the top. */
export interface Raster {
  width: number;
  height: number;
  channels: 1 | 3;
  data: Uint8Array;
}

/** A 3 by 3 projective map, row by row, with the last value 1: page image pixels to photo pixels. */
export type Transform = [number, number, number, number, number, number, number, number, number];

export interface Calibration {
  version: number;
  /** The printed revision this calibration belongs to. Another revision's contract never uses it. */
  revision: string;
  photo: { width: number; height: number };
  /** Each scan mark's outer corner in the photo, in the contract's correspondence order. */
  marks: Record<ScanMark, Point>;
  transform: Transform;
  /** How many clockwise quarter turns the page is from upright in the photo. */
  quarterTurns: 0 | 1 | 2 | 3;
  /** The share of the page's printed cells whose ink the photo holds. */
  pageFit: number;
}

/**
 * Why a photo has no calibration:
 * - marks-missing: the photo does not hold four shapes that line up as the page's scan marks;
 * - marks-inconsistent: they line up, but their arms do not fit the contract's rectangle once mapped;
 * - page-mismatch: the photo's ink does not follow the printed page's ink in any way up;
 * - ambiguous-page: more than one rectangle in the photo follows it, as with two copies of a page;
 * - orientation-unclear: two ways up fit about equally well;
 * - qr-mismatch: where the page printed its QR code, the photo's code is missing, moved, or another page's.
 */
export type CalibrationRefusal = "marks-missing" | "marks-inconsistent" | "page-mismatch" | "ambiguous-page" | "orientation-unclear" | "qr-mismatch";

export type CalibrationResult =
  | { status: "calibrated"; calibration: Calibration }
  | { status: "refused"; reason: CalibrationRefusal }
  | { status: "unavailable"; reason: "no-contract" | "other-revision" };

// ---------- Geometry ----------

/** The projective map that sends each `from` point to its `to` point, or null for a degenerate set of points. */
export function perspectiveTransform(from: readonly Point[], to: readonly Point[]): Transform | null {
  if (from.length !== 4 || to.length !== 4) return null;
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: u, y: v } = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      if (f !== 0) for (let c = col; c < 9; c++) a[r][c] -= f * a[col][c];
    }
  }
  const h = a.map((row, i) => row[8] / row[i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyTransform(t: Transform, p: Point): Point {
  const w = t[6] * p.x + t[7] * p.y + t[8];
  return { x: (t[0] * p.x + t[1] * p.y + t[2]) / w, y: (t[3] * p.x + t[4] * p.y + t[5]) / w };
}

function invert(t: Transform): Transform | null {
  const [a, b, c, d, e, f, g, h, i] = t;
  const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e;
  const D = f * g - d * i, E = a * i - c * g, F = c * d - a * f;
  const G = d * h - e * g, H = b * g - a * h, I = a * e - b * d;
  // (The adjugate: applyTransform divides by the last row, so the determinant's scale does not matter.)
  if (Math.abs(a * A + b * D + c * G) < 1e-12) return null;
  return [A, B, C, D, E, F, G, H, I];
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (a: Point, b: Point): Point => { const d = distance(a, b) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

// ---------- Finding ink ----------

function toGrey(r: Raster): Uint8Array {
  if (r.channels === 1) return r.data;
  const out = new Uint8Array(r.width * r.height);
  for (let i = 0, j = 0; i < out.length; i++, j += 3) out[i] = (77 * r.data[j] + 150 * r.data[j + 1] + 29 * r.data[j + 2]) >> 8;
  return out;
}

/** How far below its surroundings a pixel must be to count as ink. Local, so shade across a page does not matter. */
const INK_RATIO = 0.72;

/** Ink as 1 and paper as 0, against each pixel's own surroundings. */
function inkMask(r: Raster): Uint8Array {
  const { width: w, height: h } = r;
  const grey = toGrey(r);
  const sums = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += grey[y * w + x];
      sums[(y + 1) * (w + 1) + x + 1] = sums[y * (w + 1) + x + 1] + row;
    }
  }
  const radius = Math.max(8, Math.round(Math.max(w, h) / 56));
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1);
      const total = sums[y1 * (w + 1) + x1] - sums[y0 * (w + 1) + x1] - sums[y1 * (w + 1) + x0] + sums[y0 * (w + 1) + x0];
      const mean = total / ((x1 - x0) * (y1 - y0));
      if (grey[y * w + x] < mean * INK_RATIO) mask[y * w + x] = 1;
    }
  }
  return mask;
}

/** A summed table of a mask: the ink inside any box in constant time. */
function summed(mask: Uint8Array, w: number, h: number): Uint32Array {
  const sums = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += mask[y * w + x];
      sums[(y + 1) * (w + 1) + x + 1] = sums[y * (w + 1) + x + 1] + row;
    }
  }
  return sums;
}

interface MarkShape {
  /** The outer corner of the L. */
  corner: Point;
  /** The two arm tips on the L's outer edges. */
  tips: [Point, Point];
  arm: number;
}

const DIRECTIONS = Array.from({ length: 16 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 8), y: Math.sin((i * Math.PI) / 8) }));

/** The L a set of connected pixels makes, whatever its rotation, or null when it makes none. */
function readShape(xs: Int32Array, ys: Int32Array, n: number): MarkShape | null {
  // The arm tips are the farthest pair among the extreme pixels; the outer corner is farthest from the line between them.
  const extremes: Point[] = [];
  for (const d of DIRECTIONS) {
    let best = -Infinity, at = 0;
    for (let i = 0; i < n; i++) {
      const v = xs[i] * d.x + ys[i] * d.y;
      if (v > best) { best = v; at = i; }
    }
    extremes.push({ x: xs[at], y: ys[at] });
  }
  let a = extremes[0], b = extremes[0], span = -1;
  for (const p of extremes) for (const q of extremes) {
    const d = distance(p, q);
    if (d > span) { span = d; a = p; b = q; }
  }
  if (span < 4) return null;
  const across = unit(a, b);
  const normal = { x: -across.y, y: across.x };
  let far = -1, corner = a;
  for (let i = 0; i < n; i++) {
    const v = Math.abs((xs[i] - a.x) * normal.x + (ys[i] - a.y) * normal.y);
    if (v > far) { far = v; corner = { x: xs[i], y: ys[i] }; }
  }
  if (far < 0.28 * span) return null;
  const lenA = distance(corner, a), lenB = distance(corner, b);
  if (Math.min(lenA, lenB) / Math.max(lenA, lenB) < 0.6) return null;
  const da = unit(corner, a), db = unit(corner, b);
  if (Math.abs(dot(da, db)) > 0.6) return null;
  const stroke = n / (lenA + lenB);
  if (stroke / Math.max(lenA, lenB) > 0.45) return null;
  // Every pixel lies along an arm, and each arm is ink along its whole length.
  const reach = 1.35 * stroke + 1;
  const bins = 10;
  const seenA = new Uint8Array(bins), seenB = new Uint8Array(bins);
  let along = 0;
  for (let i = 0; i < n; i++) {
    const px = xs[i] - corner.x, py = ys[i] - corner.y;
    const sa = px * da.x + py * da.y, sb = px * db.x + py * db.y;
    const onA = sa >= -1.5 && sa <= lenA + 1.5 && Math.abs(px * da.y - py * da.x) <= reach;
    const onB = sb >= -1.5 && sb <= lenB + 1.5 && Math.abs(px * db.y - py * db.x) <= reach;
    if (onA || onB) along++;
    if (onA) seenA[Math.min(bins - 1, Math.max(0, Math.floor((sa / lenA) * bins)))] = 1;
    if (onB) seenB[Math.min(bins - 1, Math.max(0, Math.floor((sb / lenB) * bins)))] = 1;
  }
  if (along / n < 0.96 || seenA.includes(0) || seenB.includes(0)) return null;
  return { corner, tips: [a, b], arm: (lenA + lenB) / 2 };
}

/** The L shapes in a mask: connected ink of a plausible size. */
function findShapes(mask: Uint8Array, w: number, h: number): MarkShape[] {
  const largest = Math.max(w, h);
  const minArm = Math.max(5, largest * 0.003), maxArm = largest * 0.1;
  const maxPixels = Math.ceil(2 * maxArm * maxArm * 0.45);
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const xs = new Int32Array(maxPixels + 1), ys = new Int32Array(maxPixels + 1);
  const shapes: MarkShape[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0, n = 0, minX = w, maxX = 0, minY = h, maxY = 0;
    stack[top++] = start; seen[start] = 1;
    while (top > 0) {
      const at = stack[--top];
      const x = at % w, y = (at - x) / w;
      if (n <= maxPixels) { xs[n] = x; ys[n] = y; }
      n++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const next = ny * w + nx;
        if (mask[next] && !seen[next]) { seen[next] = 1; stack[top++] = next; }
      }
    }
    const long = Math.max(maxX - minX, maxY - minY) + 1;
    if (long < minArm || long > maxArm * 1.5 || n > maxPixels || n < 8) continue;
    if (n / ((maxX - minX + 1) * (maxY - minY + 1)) > 0.7) continue;
    const shape = readShape(xs, ys, n);
    if (shape && shape.arm >= minArm) shapes.push(shape);
  }
  return shapes;
}

// ---------- Choosing the four marks ----------

/** How far an arm may point from the next mark, in cosine: 15 degrees. A straight printed line stays straight in a photo. */
const ARM_ALIGNMENT = Math.cos((15 * Math.PI) / 180);
const MAX_SHAPES = 80;

/** Four marks in clockwise order, largest first. Each mark's two arms point along the quad's two sides at that mark. */
function markQuads(shapes: readonly MarkShape[], size: { width: number; height: number }): MarkShape[][] {
  const centre = { x: size.width / 2, y: size.height / 2 };
  const kept = [...shapes].sort((a, b) => distance(b.corner, centre) - distance(a.corner, centre)).slice(0, MAX_SHAPES);
  // links[i][arm]: the marks that arm of mark i points at, each with its own arm that points back.
  const links = kept.map(() => [[], []] as { to: number; arm: number }[][]);
  for (let i = 0; i < kept.length; i++) for (let j = 0; j < kept.length; j++) {
    if (i === j) continue;
    const a = kept[i], b = kept[j];
    if (distance(a.corner, b.corner) < 3 * Math.max(a.arm, b.arm)) continue;
    const there = unit(a.corner, b.corner), back = { x: -there.x, y: -there.y };
    for (const armA of [0, 1]) for (const armB of [0, 1]) {
      if (dot(unit(a.corner, a.tips[armA]), there) >= ARM_ALIGNMENT && dot(unit(b.corner, b.tips[armB]), back) >= ARM_ALIGNMENT) links[i][armA].push({ to: j, arm: armB });
    }
  }
  const found = new Map<string, MarkShape[]>();
  for (let a = 0; a < kept.length; a++) for (const ab of links[a][0]) {
    for (const bc of links[ab.to][1 - ab.arm]) {
      if (bc.to === a) continue;
      for (const cd of links[bc.to][1 - bc.arm]) {
        if (cd.to === a || cd.to === ab.to) continue;
        if (!links[cd.to][1 - cd.arm].some((da) => da.to === a) || !links[a][1].some((ad) => ad.to === cd.to)) continue;
        const key = [a, ab.to, bc.to, cd.to].sort((x, y) => x - y).join(",");
        if (!found.has(key)) found.set(key, [kept[a], kept[ab.to], kept[bc.to], kept[cd.to]]);
      }
    }
  }
  const area = (q: MarkShape[]) => q.reduce((sum, m, i) => {
    const n = q[(i + 1) % 4].corner;
    return sum + (m.corner.x * n.y - n.x * m.corner.y);
  }, 0) / 2;
  // Clockwise, starting from the mark nearest the photo's top left, so a quarter turn means what it says.
  const clockwise = (q: MarkShape[]) => {
    const round = area(q) < 0 ? [...q].reverse() : q;
    const first = round.reduce((best, m, i) => (m.corner.x + m.corner.y < round[best].corner.x + round[best].corner.y ? i : best), 0);
    return round.map((_, i) => round[(first + i) % 4]);
  };
  return [...found.values()].map(clockwise).sort((a, b) => area(b) - area(a)).slice(0, MAX_RECTANGLES);
}

// ---------- Which way up, and is this the page ----------

/** The comparison's grid: half the page image's pixels, in cells of this many, about one printed word wide. */
const FIT_CELL = 16;
/** How far the comparison looks for each cell's ink, in the grid's pixels: what a page's curl and the map's error can move it. */
const FIT_SHIFT = 2;
/** How much of a cell's ink must agree, both ways, for it to count as this page's cell. */
const CELL_MATCH = 0.75;
/**
 * The share of the page's dark printed cells that must match. Over 36 real pages at 2 angles
 * (.design/experiments/r455/page-matrix.json) this stopped 2510 of 2520 comparisons with another page by itself, and let
 * 71 of 72 right pages through. Pages that differ by a few digits can score as high as the right page: the QR code stopped
 * the other 10. No real camera photo has been measured. Refusing is the safe side.
 */
const MIN_PAGE_FIT = 0.985;
const MIN_FIT_MARGIN = 0.08;
const MIN_SIDE_RATIO = 0.45;
/** How much ink a cell needs to count: fewer pixels say nothing about which page it is. */
const CELL_MIN_INK = 10;
const MAX_RECTANGLES = 12;
const DARK_PRINT = 120;

interface PreparedPrinted { ink: Uint8Array; near: Uint8Array; width: number; height: number; qr: FoundQr | null }
interface PrintedInk extends Omit<PreparedPrinted, "qr"> { cells: { x: number; y: number }[] }
interface PreparedPhoto { sums: Uint32Array; quads: MarkShape[][] }

// (What one image gives is the same each time. A book's pages compared against one photo read each image once.)
const printedCache = new WeakMap<Raster, PreparedPrinted>();
const photoCache = new WeakMap<Raster, PreparedPhoto>();

/** Ink and each pixel beside it: agreement should not hang on how thick a blurred stroke came out. */
function thickened(ink: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(ink.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!ink[y * width + x]) continue;
    for (let j = Math.max(0, y - 1); j <= Math.min(height - 1, y + 1); j++) for (let i = Math.max(0, x - 1); i <= Math.min(width - 1, x + 1); i++) out[j * width + i] = 1;
  }
  return out;
}

function preparedPrinted(printed: Raster): PreparedPrinted {
  const held = printedCache.get(printed);
  if (held) return held;
  // Only dark print: a pale panel's edge or a faint rule does not survive every photo, and says little about which page it is.
  const mask = inkMask(printed), grey = toGrey(printed);
  for (let i = 0; i < mask.length; i++) if (grey[i] >= DARK_PRINT) mask[i] = 0;
  const sums = summed(mask, printed.width, printed.height);
  const width = Math.floor(printed.width / 2), height = Math.floor(printed.height / 2);
  const ink = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (boxInk(sums, printed.width, printed.height, x * 2, y * 2, x * 2 + 2, y * 2 + 2) >= 0.3) ink[y * width + x] = 1;
  }
  const prepared = { ink, near: thickened(ink, width, height), width, height, qr: readQr(printed) };
  printedCache.set(printed, prepared);
  return prepared;
}

function preparedPhoto(photo: Raster): PreparedPhoto {
  const held = photoCache.get(photo);
  if (held) return held;
  const mask = inkMask(photo);
  const prepared = { sums: summed(mask, photo.width, photo.height), quads: markQuads(findShapes(mask, photo.width, photo.height), photo) };
  photoCache.set(photo, prepared);
  return prepared;
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The printed page's ink, and the cells that say which page it is: not where a child writes, and not the QR code. */
function printedInk(prepared: PreparedPrinted, skip: readonly Box[]): PrintedInk {
  const { ink, near, width, height } = prepared;
  const cells: PrintedInk["cells"] = [];
  for (let y = 0; y + FIT_CELL <= height; y += FIT_CELL) for (let x = 0; x + FIT_CELL <= width; x += FIT_CELL) {
    if (skip.some((b) => overlaps(b, { x: x * 2, y: y * 2, width: FIT_CELL * 2, height: FIT_CELL * 2 }))) continue;
    let n = 0;
    for (let j = 0; j < FIT_CELL; j++) for (let i = 0; i < FIT_CELL; i++) n += ink[(y + j) * width + x + i];
    if (n >= CELL_MIN_INK) cells.push({ x, y });
  }
  return { ink, near, width, height, cells };
}

function boxInk(sums: Uint32Array, w: number, h: number, x0f: number, y0f: number, x1f: number, y1f: number): number {
  const x0 = Math.max(0, Math.min(w, Math.round(x0f))), x1 = Math.max(0, Math.min(w, Math.round(x1f)));
  const y0 = Math.max(0, Math.min(h, Math.round(y0f))), y1 = Math.max(0, Math.min(h, Math.round(y1f)));
  if (x1 <= x0 || y1 <= y0) return 0;
  const total = sums[y1 * (w + 1) + x1] + sums[y0 * (w + 1) + x0] - sums[y0 * (w + 1) + x1] - sums[y1 * (w + 1) + x0];
  return total / ((x1 - x0) * (y1 - y0));
}

/**
 * The share of the page's printed cells whose ink the photo holds in the same place, through a map. Cell by cell, because
 * pages of one template share a heading and a layout and differ in small places: one number can be the whole difference.
 */
function pageFit(printed: PrintedInk, sums: Uint32Array, photo: { width: number; height: number }, t: Transform): number {
  const { width, height, ink, near, cells } = printed;
  if (cells.length === 0) return 0;
  const pageWidth = width * 2, pageHeight = height * 2;
  const half = (distance(applyTransform(t, { x: 0, y: 0 }), applyTransform(t, { x: pageWidth, y: 0 }))
    + distance(applyTransform(t, { x: 0, y: pageHeight }), applyTransform(t, { x: pageWidth, y: pageHeight }))) / (2 * width) / 2;
  const seen = new Uint8Array(width * height);
  const reach = Math.max(0.75, half);
  for (let y = 0; y < height; y++) {
    const py = y * 2 + 1;
    for (let x = 0; x < width; x++) {
      const px = x * 2 + 1, w = t[6] * px + t[7] * py + t[8];
      const u = (t[0] * px + t[1] * py + t[2]) / w, v = (t[3] * px + t[4] * py + t[5]) / w;
      if (boxInk(sums, photo.width, photo.height, u - reach, v - reach, u + reach, v + reach) >= 0.3) seen[y * width + x] = 1;
    }
  }
  const seenNear = thickened(seen, width, height);
  let matched = 0;
  for (const c of cells) {
    let best = 0;
    for (let dy = -FIT_SHIFT; dy <= FIT_SHIFT && best < CELL_MATCH; dy++) for (let dx = -FIT_SHIFT; dx <= FIT_SHIFT && best < CELL_MATCH; dx++) {
      // The printed ink the photo holds, and the photo's ink the page printed: each with a pixel's grace, and both must agree.
      let printedInk = 0, photoInk = 0, printedHeld = 0, photoHeld = 0;
      for (let j = 0; j < FIT_CELL; j++) for (let i = 0; i < FIT_CELL; i++) {
        const py = c.y + j, px = c.x + i, sy = py + dy, sx = px + dx;
        const inside = sy >= 0 && sx >= 0 && sy < height && sx < width;
        const at = py * width + px, shifted = sy * width + sx;
        if (ink[at]) { printedInk++; if (inside && seenNear[shifted]) printedHeld++; }
        if (inside && seen[shifted]) { photoInk++; if (near[at]) photoHeld++; }
      }
      const agreement = Math.min(printedHeld / Math.max(1, printedInk), photoHeld / Math.max(1, photoInk));
      if (agreement > best) best = agreement;
    }
    if (best >= CELL_MATCH) matched++;
  }
  return matched / cells.length;
}

// ---------- The page's QR code ----------

interface FoundQr { link: string; corners: Point[] }

function readQr(r: Raster): FoundQr | null {
  const grey = toGrey(r);
  const rgba = new Uint8ClampedArray(r.width * r.height * 4);
  for (let i = 0; i < grey.length; i++) { rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = grey[i]; rgba[4 * i + 3] = 255; }
  const found = jsQR(rgba, r.width, r.height, { inversionAttempts: "dontInvert" });
  return found && { link: found.data, corners: [found.location.topLeftCorner, found.location.topRightCorner, found.location.bottomRightCorner, found.location.bottomLeftCorner] };
}

const boundsOf = (points: readonly Point[]): Box => {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};

/** How much page around the printed code to read, as parts of its size: its quiet zone and the map's error. */
const QR_WINDOW = 0.4;
/** How far a read code's corners may be from where the page printed them, as a part of its size. */
const QR_TOLERANCE = 0.2;
const QR_SCALE = 3;

/** The photo's own pixels in a box: a QR reader copes better with these than with a resampled copy. */
function photoBox(photo: Raster, b: Box): Raster {
  const grey = toGrey(photo);
  const data = new Uint8Array(b.width * b.height);
  for (let y = 0; y < b.height; y++) data.set(grey.subarray((b.y + y) * photo.width + b.x, (b.y + y) * photo.width + b.x + b.width), y * b.width);
  return { width: b.width, height: b.height, channels: 1, data };
}

/** Whether the photo holds this page's QR code, through a map, where the page printed it. */
function qrBound(photo: Raster, t: Transform, printed: FoundQr, page: { width: number; height: number }): boolean {
  const b = boundsOf(printed.corners), size = Math.max(b.width, b.height);
  const x = Math.max(0, b.x - QR_WINDOW * size), y = Math.max(0, b.y - QR_WINDOW * size);
  const window = { x, y, width: Math.min(page.width, b.x + b.width + QR_WINDOW * size) - x, height: Math.min(page.height, b.y + b.height + QR_WINDOW * size) - y };
  const inPlace = (corners: readonly Point[]) => corners.every((c, i) => distance(c, printed.corners[i]) <= QR_TOLERANCE * size);
  // First the photo's own pixels around the place, with the code's corners taken back through the map; then a straightened copy.
  const inverse = invert(t);
  const seenAt = boundsOf([{ x: window.x, y: window.y }, { x: window.x + window.width, y: window.y }, { x: window.x + window.width, y: window.y + window.height }, { x: window.x, y: window.y + window.height }].map((p) => applyTransform(t, p)));
  const x0 = Math.max(0, Math.floor(seenAt.x)), y0 = Math.max(0, Math.floor(seenAt.y));
  const x1 = Math.min(photo.width, Math.ceil(seenAt.x + seenAt.width)), y1 = Math.min(photo.height, Math.ceil(seenAt.y + seenAt.height));
  if (inverse && x1 > x0 && y1 > y0) {
    const own = readQr(photoBox(photo, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }));
    if (own) return own.link === printed.link && inPlace(own.corners.map((c) => applyTransform(inverse, { x: x0 + c.x, y: y0 + c.y })));
  }
  const seen = readQr(warpBox(photo, t, window, { width: Math.round(window.width * QR_SCALE), height: Math.round(window.height * QR_SCALE) }));
  return !!seen && seen.link === printed.link && inPlace(seen.corners.map((c) => ({ x: window.x + c.x / QR_SCALE, y: window.y + c.y / QR_SCALE })));
}

/** Whether the arms of the marks fit the contract's rectangle: along its sides, and of one length. */
function armsFit(marks: readonly MarkShape[], t: Transform): boolean {
  const inverse = invert(t);
  if (!inverse) return false;
  const lengths: number[] = [];
  for (const m of marks) {
    const corner = applyTransform(inverse, m.corner);
    for (const tip of m.tips) {
      const end = applyTransform(inverse, tip);
      const length = distance(corner, end);
      if (Math.min(Math.abs(end.x - corner.x), Math.abs(end.y - corner.y)) > 0.2 * length) return false;
      lengths.push(length);
    }
  }
  return Math.min(...lengths) / Math.max(...lengths) >= 0.5;
}

/**
 * Finds the scan marks in a photo and maps it to the contract: the photo's own marks and the stored mark points only. A
 * photo with no contract, or of another revision (printContractForPhoto), gets none. `pageLink`: the page's own QR link.
 * `writing`: where a child writes on this page, which says nothing about which page it is.
 */
export function calibratePhoto(o: { photo: Raster; printed: Raster; contract: PhotoContract; pageLink: string; writing?: readonly Box[] }): CalibrationResult {
  if (o.contract.status !== "available") return { status: "unavailable", reason: o.contract.reason };
  const { contract, revision } = o.contract;
  const { photo, printed } = o;
  // The code the page image printed: where it sits comes from the image the contract fingerprints, never from a template.
  const prepared = preparedPrinted(printed);
  const printedQr = prepared.qr;
  if (!printedQr || printedQr.link !== o.pageLink) return { status: "refused", reason: "qr-mismatch" };
  const { sums, quads } = preparedPhoto(photo);
  if (quads.length === 0) return { status: "refused", reason: "marks-missing" };
  const ink = printedInk(prepared, [...(o.writing ?? []), boundsOf(printedQr.corners)]);
  const stored = SCAN_MARKS.map((m) => contract.marks.points[m]);
  const pageSize = contract.coordinates.image;
  let refusal: CalibrationRefusal = "marks-inconsistent";
  const followers: { order: MarkShape[]; t: Transform; turns: 0 | 1 | 2 | 3; fit: number; next: number | null }[] = [];
  for (const quad of quads) {
    const sides = quad.map((m, i) => distance(m.corner, quad[(i + 1) % 4].corner));
    if (Math.min(sides[0], sides[2]) / Math.max(sides[0], sides[2]) < MIN_SIDE_RATIO || Math.min(sides[1], sides[3]) / Math.max(sides[1], sides[3]) < MIN_SIDE_RATIO) continue;
    // Each way up: the contract's marks in their order onto the photo's marks, starting from another corner.
    const across = (sides[0] + sides[2]) / (sides[1] + sides[3]);
    const printedAcross = distance(stored[0], stored[1]) / distance(stored[1], stored[2]);
    const ways = ([0, 1, 2, 3] as const).flatMap((turns) => {
      // (A way up whose shape is the page's other way round is not worth comparing.)
      const shape = turns % 2 === 0 ? across : 1 / across;
      if (Math.abs(Math.log(shape / printedAcross)) > Math.abs(Math.log(printedAcross))) return [];
      const order = stored.map((_, i) => quad[(i + turns) % 4]);
      const t = perspectiveTransform(stored, order.map((m) => m.corner));
      if (!t || !armsFit(order, t)) return [];
      return [{ turns, order, t, fit: pageFit(ink, sums, photo, t) }];
    }).sort((a, b) => b.fit - a.fit);
    if (ways.length === 0) continue;
    const best = ways[0];
    if (best.fit < MIN_PAGE_FIT) { refusal = "page-mismatch"; continue; }
    followers.push({ ...best, next: ways[1]?.fit ?? null });
  }
  if (followers.length === 0) return { status: "refused", reason: refusal };
  // Two sheets in one photo: which one was meant cannot be known, whichever shows its code.
  if (followers.length > 1) return { status: "refused", reason: "ambiguous-page" };
  const [best] = followers;
  if (best.next !== null && best.fit - best.next < MIN_FIT_MARGIN) return { status: "refused", reason: "orientation-unclear" };
  if (!qrBound(photo, best.t, printedQr, pageSize)) return { status: "refused", reason: "qr-mismatch" };
  return {
    status: "calibrated",
    calibration: {
      version: CALIBRATION_VERSION, revision, photo: { width: photo.width, height: photo.height },
      marks: Object.fromEntries(SCAN_MARKS.map((m, i) => [m, best.order[i].corner])) as Record<ScanMark, Point>,
      transform: best.t, quarterTurns: best.turns, pageFit: Math.round(best.fit * 1000) / 1000,
    },
  };
}

/** A stored calibration, only for a photo of its own revision. */
export const calibrationForPhoto = (c: Calibration, photo: { printedRevision: string | null }): Calibration | null =>
  (c.revision === photo.printedRevision && c.version === CALIBRATION_VERSION ? c : null);

// ---------- Cutting the page ----------

/** A box of the page image, cut from the photo through the map, at `out` pixels. Pixels off the photo are white. */
export function warpBox(photo: Raster, t: Transform, box: Box, out: { width: number; height: number }): Raster {
  const { channels, width: w, height: h, data } = photo;
  const result = new Uint8Array(out.width * out.height * channels);
  const sx = box.width / out.width, sy = box.height / out.height;
  for (let oy = 0; oy < out.height; oy++) {
    const py = box.y + (oy + 0.5) * sy;
    for (let ox = 0; ox < out.width; ox++) {
      const px = box.x + (ox + 0.5) * sx;
      const d = t[6] * px + t[7] * py + t[8];
      const u = (t[0] * px + t[1] * py + t[2]) / d - 0.5;
      const v = (t[3] * px + t[4] * py + t[5]) / d - 0.5;
      const at = (oy * out.width + ox) * channels;
      if (u < 0 || v < 0 || u >= w - 1 || v >= h - 1) {
        result.fill(255, at, at + channels);
        continue;
      }
      const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
      const i = (y0 * w + x0) * channels;
      for (let c = 0; c < channels; c++) {
        const top = data[i + c] * (1 - fx) + data[i + channels + c] * fx;
        const bottom = data[i + w * channels + c] * (1 - fx) + data[i + w * channels + channels + c] * fx;
        result[at + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return { width: out.width, height: out.height, channels, data: result };
}

/** The whole page, straightened, at the size the contract says it printed. */
export function straightenedPage(photo: Raster, c: Calibration, contract: PagePrintContract): Raster {
  const { width, height } = contract.coordinates.image;
  return warpBox(photo, c.transform, { x: 0, y: 0, width, height }, { width, height });
}

/** How much space a crop keeps around its box, as a part of the box's shorter side, with a limit in image pixels. */
const CROP_MARGIN = 0.1;
const CROP_MARGIN_LIMIT = 10;
const CROP_MAX_SCALE = 2.5;
const CROP_MAX_SIDE = 1600;

/** One answer region cut from the photo. */
export function cropBox(photo: Raster, c: Calibration, contract: PagePrintContract, box: Box): Raster {
  const margin = Math.min(CROP_MARGIN_LIMIT, CROP_MARGIN * Math.min(box.width, box.height));
  const { width: iw, height: ih } = contract.coordinates.image;
  const x0 = Math.max(0, box.x - margin), y0 = Math.max(0, box.y - margin);
  const x1 = Math.min(iw, box.x + box.width + margin), y1 = Math.min(ih, box.y + box.height + margin);
  const cut = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  // As many pixels as the photo really has there, without blowing up a small photo or shrinking a large one.
  const a = applyTransform(c.transform, { x: x0, y: y0 }), b = applyTransform(c.transform, { x: x1, y: y0 }), d = applyTransform(c.transform, { x: x0, y: y1 });
  const scale = Math.min(CROP_MAX_SCALE, Math.max(1, Math.max(distance(a, b) / cut.width, distance(a, d) / cut.height)));
  const fit = Math.min(1, CROP_MAX_SIDE / (Math.max(cut.width, cut.height) * scale));
  return warpBox(photo, c.transform, cut, { width: Math.max(1, Math.round(cut.width * scale * fit)), height: Math.max(1, Math.round(cut.height * scale * fit)) });
}

// ---------- What can be cropped today ----------

export interface CropItem {
  /** The question's printed number: the crop's number. */
  number: number;
  /** The item and the region of it: a region names a part of an item, not an attempt. */
  itemId: string;
  regionId: string;
  box: Box;
}

export interface CropQuestion {
  number: number;
  package: QuestionPackage | null;
  regions: readonly PrintedRegion[] | null;
}

/** The one answer box of a single-box whole-number item, or null. Other formats wait for their own slice. */
function singleWholeNumberBox(q: CropQuestion): (PrintedRegion & { box: Box }) | null {
  if (!q.package || !q.regions || (!q.package.item && !q.package.answer)) return null;
  const item = packageItem(q.package);
  if (item.format !== "write-number" || !item.scorable || item.regions.length !== 1) return null;
  const [only] = item.regions;
  if (only.kind !== "box" || only.answer?.type !== "number" || !Number.isInteger(only.answer.value)) return null;
  const printed = q.regions.find((r) => r.id === only.id);
  return printed?.box ? { ...printed, box: printed.box } : null;
}

/** The page's numbered crops, in printed order, and the questions this slice cannot crop. */
export function cropPlan(questions: readonly CropQuestion[]): { crops: CropItem[]; notSupported: number[] } {
  const crops: CropItem[] = [], notSupported: number[] = [];
  for (const q of [...questions].sort((a, b) => a.number - b.number)) {
    const region = singleWholeNumberBox(q);
    if (region) crops.push({ number: q.number, itemId: q.package!.id, regionId: region.id, box: region.box });
    else notSupported.push(q.number);
  }
  return { crops, notSupported };
}
