// Scan calibration (#455, S2b): reads a normalized photo of a printed page against that page's stored print contract.
// It finds the four L-shaped scan marks in the photo, maps the page's perspective from the contract's mark points, and
// cuts the straightened page and the answer regions out of the photo.
//
// Everything comes from the stored contract (workbook-print-contract.ts): the mark points, their order, the units and the
// region boxes. Nothing comes from today's template. A rectangle of four marks is accepted only when all of this holds, and
// a wrong crop is a wrong mark on a child's work, so anything unsure is refused:
// - it looks like the page image the contract fingerprints, cell by cell, in one way up (a shared template is not enough);
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
  /** The share of the page's dark printed cells that the photo holds in the same place. */
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
/** How closely a cell's grey must follow the printed cell, as a correlation, for it to count as this page's cell. */
const CELL_MATCH = 0.6;
/** A printed cell whose grey varies less than this (a standard deviation of 8 grey levels, squared) is one even shade. */
const FLAT_SPREAD = 64;
/**
 * The share of the page's printed cells that must match. Over 24 real pages from U4, U16 and U26, with the page at 50% to
 * 95% of the photo's height, upright, rotated 7 degrees and tilted (.design/experiments/r455/page-matrix.json): every right
 * page the upload accepted (184 of 184) passed, and 8803 of 8832 comparisons with another page were stopped by this alone.
 * The other 29 were one pair of pages that differ by a few digits: those can score as high as the right page, and only the
 * QR code tells them apart, so it is required. No real camera photo has been measured.
 */
const MIN_PAGE_FIT = 0.975;
const MIN_SIDE_RATIO = 0.45;
/** How much ink a cell needs to count: fewer pixels say nothing about which page it is. */
const CELL_MIN_INK = 10;
const MAX_RECTANGLES = 12;
const DARK_PRINT = 120;

interface PreparedPrinted { ink: Uint8Array; greySums: Uint32Array; width: number; height: number; source: { width: number; height: number }; qr: FoundQr | null; qrGrid: QrGrid | null }
interface PrintedInk extends Omit<PreparedPrinted, "qr"> { cells: { x: number; y: number }[] }
interface PreparedPhoto { greySums: Uint32Array; quads: MarkShape[][] }

// (What one image gives is the same each time. A book's pages compared against one photo read each image once.)
const printedCache = new WeakMap<Raster, PreparedPrinted>();
const photoCache = new WeakMap<Raster, PreparedPhoto>();

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
    if (boxMean(sums, printed.width, printed.height, x * 2, y * 2, x * 2 + 2, y * 2 + 2) >= 0.3) ink[y * width + x] = 1;
  }
  const prepared = { ink, greySums: summed(grey, printed.width, printed.height), width, height, source: { width: printed.width, height: printed.height }, qr: readQr(printed), qrGrid: null as QrGrid | null };
  if (prepared.qr) prepared.qrGrid = printedGrid(printed, prepared.qr);
  printedCache.set(printed, prepared);
  return prepared;
}

function preparedPhoto(photo: Raster): PreparedPhoto {
  const held = photoCache.get(photo);
  if (held) return held;
  const mask = inkMask(photo);
  const prepared = { greySums: summed(toGrey(photo), photo.width, photo.height), quads: markQuads(findShapes(mask, photo.width, photo.height), photo) };
  photoCache.set(photo, prepared);
  return prepared;
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The printed page's ink, and the cells that say which page it is: not where a child writes, and not the QR code. */
function printedInk(prepared: PreparedPrinted, skip: readonly Box[]): PrintedInk {
  const { ink, width, height } = prepared;
  const cells: PrintedInk["cells"] = [];
  for (let y = 0; y + FIT_CELL <= height; y += FIT_CELL) for (let x = 0; x + FIT_CELL <= width; x += FIT_CELL) {
    if (skip.some((b) => overlaps(b, { x: x * 2, y: y * 2, width: FIT_CELL * 2, height: FIT_CELL * 2 }))) continue;
    let n = 0;
    for (let j = 0; j < FIT_CELL; j++) for (let i = 0; i < FIT_CELL; i++) n += ink[(y + j) * width + x + i];
    if (n >= CELL_MIN_INK) cells.push({ x, y });
  }
  return { ...prepared, cells };
}

/** The mean inside a box of a summed table. At least one whole pixel, so a small box is never empty. */
function boxMean(sums: Uint32Array, w: number, h: number, x0f: number, y0f: number, x1f: number, y1f: number): number {
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(x0f))), x1 = Math.max(x0 + 1, Math.min(w, Math.ceil(x1f)));
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(y0f))), y1 = Math.max(y0 + 1, Math.min(h, Math.ceil(y1f)));
  return (sums[y1 * (w + 1) + x1] + sums[y0 * (w + 1) + x0] - sums[y0 * (w + 1) + x1] - sums[y1 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
}

/**
 * The share of the page's printed cells that the photo holds in the same place, through a map; 0 as soon as too few can.
 * Cell by cell, because pages of one template share a heading and a layout. In grey, with both images brought to the same
 * sharpness first, because a threshold on ink changes with how large the page is in the photo: a stroke one pixel wide comes
 * out thin or missing, and the same page would pass from close up and fail from further away. A correlation does not care
 * about shade or contrast.
 */
function pageFit(printed: PrintedInk, photoSums: Uint32Array, photo: { width: number; height: number }, t: Transform): number {
  const { width, height, cells, greySums, source } = printed;
  if (cells.length === 0) return 0;
  const pageWidth = width * 2, pageHeight = height * 2;
  const scale = (distance(applyTransform(t, { x: 0, y: 0 }), applyTransform(t, { x: pageWidth, y: 0 }))
    + distance(applyTransform(t, { x: 0, y: pageHeight }), applyTransform(t, { x: pageWidth, y: pageHeight }))) / (2 * pageWidth);
  // Each grid pixel covers at least one photo pixel, on both images: the sharpness of the coarser of the two.
  const halfPage = Math.max(1, 0.5 / Math.max(scale, 1e-6));
  const halfPhoto = Math.max(0.5, halfPage * scale);
  const a = new Float32Array(width * height), b = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const py = y * 2 + 1;
    for (let x = 0; x < width; x++) {
      const px = x * 2 + 1, w = t[6] * px + t[7] * py + t[8];
      const u = (t[0] * px + t[1] * py + t[2]) / w, v = (t[3] * px + t[4] * py + t[5]) / w;
      a[y * width + x] = boxMean(greySums, source.width, source.height, px - halfPage, py - halfPage, px + halfPage, py + halfPage);
      b[y * width + x] = boxMean(photoSums, photo.width, photo.height, u - halfPhoto, v - halfPhoto, u + halfPhoto, v + halfPhoto);
    }
  }
  const n = FIT_CELL * FIT_CELL;
  // A cell of one even shade (inside a solid bar) has no shape to follow, and a correlation says nothing about it: only
  // cells with a printed edge count.
  const shaped: { x: number; y: number; sumA: number; spreadA: number }[] = [];
  for (const c of cells) {
    let sumA = 0, sumAA = 0;
    for (let j = 0; j < FIT_CELL; j++) for (let i = 0; i < FIT_CELL; i++) { const v = a[(c.y + j) * width + c.x + i]; sumA += v; sumAA += v * v; }
    const spreadA = n * sumAA - sumA * sumA;
    if (spreadA >= n * n * FLAT_SPREAD) shaped.push({ ...c, sumA, spreadA });
  }
  if (shaped.length === 0) return 0;
  const allowedMisses = Math.floor(shaped.length * (1 - MIN_PAGE_FIT));
  let misses = 0;
  for (const { x, y, sumA, spreadA } of shaped) {
    let held = false;
    for (let dy = -FIT_SHIFT; dy <= FIT_SHIFT && !held; dy++) for (let dx = -FIT_SHIFT; dx <= FIT_SHIFT && !held; dx++) {
      if (y + dy < 0 || x + dx < 0 || y + dy + FIT_CELL > height || x + dx + FIT_CELL > width) continue;
      let sumB = 0, sumBB = 0, sumAB = 0;
      for (let j = 0; j < FIT_CELL; j++) for (let i = 0; i < FIT_CELL; i++) {
        const p = a[(y + j) * width + x + i], q = b[(y + dy + j) * width + x + dx + i];
        sumB += q; sumBB += q * q; sumAB += p * q;
      }
      const spreadB = n * sumBB - sumB * sumB;
      if (spreadB > 0 && (n * sumAB - sumA * sumB) >= CELL_MATCH * Math.sqrt(spreadA * spreadB)) held = true;
    }
    if (!held && ++misses > allowedMisses) return 0;
  }
  return 1 - misses / shaped.length;
}

// ---------- The page's QR code ----------

/** A read code: its link, its corners (top left, top right, bottom right, bottom left) and how many modules it is across. */
interface FoundQr { link: string; corners: Point[]; modules: number }

function readQr(r: Raster, inversionAttempts: "dontInvert" | "attemptBoth" = "dontInvert"): FoundQr | null {
  const grey = toGrey(r);
  const rgba = new Uint8ClampedArray(r.width * r.height * 4);
  for (let i = 0; i < grey.length; i++) { rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = grey[i]; rgba[4 * i + 3] = 255; }
  const found = jsQR(rgba, r.width, r.height, { inversionAttempts });
  return found && { link: found.data, corners: [found.location.topLeftCorner, found.location.topRightCorner, found.location.bottomRightCorner, found.location.bottomLeftCorner], modules: 17 + 4 * found.version };
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

/** Where the printed code's modules are: the centre of each column and each row, in page pixels, and a module's size. */
interface QrGrid { columns: number[]; rows: number[]; pitch: number }

/**
 * The printed code's module grid, from the printed page image. The code's box is its dark pixels' bounding box around
 * where the reader found it: the three finder patterns are its corners, so on a crisp printed page that box is the code
 * exactly. Inside it, each edge between two modules is where the printer put it: the pixel edge, near the even spacing,
 * where the most lines change between dark and light. A printer rounds each module to whole pixels its own way, and a
 * module two pixels wide is read in its middle only where the edges are measured, not assumed.
 */
function printedGrid(printed: Raster, qr: FoundQr): QrGrid | null {
  const grey = toGrey(printed), W = printed.width, n = qr.modules, b = boundsOf(qr.corners);
  const pad = 1.5 * Math.max(b.width, b.height) / n;
  const x0 = Math.max(0, Math.floor(b.x - pad)), y0 = Math.max(0, Math.floor(b.y - pad));
  const x1 = Math.min(W, Math.ceil(b.x + b.width + pad)), y1 = Math.min(printed.height, Math.ceil(b.y + b.height + pad));
  const dark = (x: number, y: number) => grey[y * W + x] < 128;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (!dark(x, y)) continue;
    left = Math.min(left, x); right = Math.max(right, x + 1); top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
  }
  if (!(right > left && bottom > top)) return null;
  const pitch = (right - left) / n;
  // (A box that is not the code's size or shape, as when other ink touches it, gives no grid.)
  if (Math.abs(pitch - b.width / n) > 0.5 * pitch || Math.abs((bottom - top) / n - pitch) > 0.25 * pitch) return null;
  const edges = (from: number, to: number, changes: (k: number) => number) => {
    const at = [from];
    for (let i = 1; i < n; i++) {
      const even = from + ((to - from) * i) / n;
      let best = Math.round(even), most = -1;
      for (let k = Math.ceil(even - pitch / 2); k <= Math.floor(even + pitch / 2); k++) {
        const c = changes(k);
        if (c > most || (c === most && Math.abs(k - even) < Math.abs(best - even))) { most = c; best = k; }
      }
      at.push(Math.max(best, at[at.length - 1] + 1));
    }
    at.push(to);
    return at.slice(0, -1).map((e, i) => (e + at[i + 1]) / 2);
  };
  const columnChanges = (k: number) => { let c = 0; for (let y = top; y < bottom; y++) if (dark(k - 1, y) !== dark(k, y)) c++; return c; };
  const rowChanges = (k: number) => { let c = 0; for (let x = left; x < right; x++) if (dark(x, k - 1) !== dark(x, k)) c++; return c; };
  return { columns: edges(left, right, columnChanges), rows: edges(top, bottom, rowChanges), pitch };
}

/** How far from where the page printed it the module read looks for the code, in modules, and in what steps. */
const QR_GRID_REACH = 1;
const QR_GRID_STEP = 1 / 3;
/** Pixels a module in the clean copy the module read makes, and modules of quiet zone around it. */
const QR_GRID_PIXELS = 4;
const QR_GRID_QUIET = 4;

/**
 * The photo's code read module by module, where the page printed it: each module's centre on the printed page, through
 * the map, gives one sample of the photo, and the samples make a clean code that the reader decodes. A small or blurred
 * code reads this way when a reader looking for it cannot find it, since the marks already say where every module is.
 * It reads only where the page printed the code (a module or less away), so a moved code reads as nothing, and another
 * page's code reads as that page's link.
 */
function gridQr(photo: Raster, t: Transform, printed: FoundQr, grid: QrGrid | null): FoundQr | null {
  const grey = toGrey(photo), W = photo.width, H = photo.height;
  // The photo's grey at a point, between its four nearest pixel centres.
  const sample = (p: Point) => {
    const fx = Math.max(0, Math.min(W - 1.001, p.x - 0.5)), fy = Math.max(0, Math.min(H - 1.001, p.y - 0.5));
    const x = Math.floor(fx), y = Math.floor(fy), ax = fx - x, ay = fy - y, at = y * W + x;
    return (grey[at] * (1 - ax) + grey[at + 1] * ax) * (1 - ay) + (grey[at + W] * (1 - ax) + grey[at + W + 1] * ax) * ay;
  };
  const [tl, tr, , bl] = printed.corners, n = printed.modules;
  const across = { x: (tr.x - tl.x) / n, y: (tr.y - tl.y) / n }, down = { x: (bl.x - tl.x) / n, y: (bl.y - tl.y) / n };
  // Each module's middle, moved by (dx, dy) modules: from the measured grid, or else evenly between the reader's corners.
  const centre = (i: number, j: number, dx: number, dy: number) => grid
    ? { x: grid.columns[i] + dx * grid.pitch, y: grid.rows[j] + dy * grid.pitch }
    : { x: tl.x + across.x * (i + 0.5 + dx) + down.x * (j + 0.5 + dy), y: tl.y + across.y * (i + 0.5 + dx) + down.y * (j + 0.5 + dy) };
  const side = (n + 2 * QR_GRID_QUIET) * QR_GRID_PIXELS;
  const offsets: { dx: number; dy: number }[] = [];
  const steps = Math.round(QR_GRID_REACH / QR_GRID_STEP);
  for (let j = -steps; j <= steps; j++) for (let i = -steps; i <= steps; i++) offsets.push({ dx: i * QR_GRID_STEP, dy: j * QR_GRID_STEP });
  offsets.sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
  for (const { dx, dy } of offsets) {
    const samples = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      samples[j * n + i] = sample(applyTransform(t, centre(i, j, dx, dy)));
    }
    // Dark and light from the code itself: halfway between its darker and lighter tenths.
    const sorted = Array.from(samples).sort((a, b) => a - b);
    const low = sorted[Math.floor(sorted.length * 0.1)], high = sorted[Math.floor(sorted.length * 0.9)];
    if (high - low < 16) continue;
    const cut = (low + high) / 2;
    const data = new Uint8Array(side * side).fill(255);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (samples[j * n + i] >= cut) continue;
      for (let y = 0; y < QR_GRID_PIXELS; y++) data.fill(0, ((QR_GRID_QUIET + j) * QR_GRID_PIXELS + y) * side + (QR_GRID_QUIET + i) * QR_GRID_PIXELS, ((QR_GRID_QUIET + j) * QR_GRID_PIXELS + y) * side + (QR_GRID_QUIET + i + 1) * QR_GRID_PIXELS);
    }
    const read = readQr({ width: side, height: side, channels: 1, data });
    if (read) return { link: read.link, modules: n, corners: printed.corners.map((c) => ({ x: c.x + across.x * dx + down.x * dy, y: c.y + across.y * dx + down.y * dy })) };
  }
  return null;
}

/**
 * Whether the photo holds this page's QR code, through a map, where the page printed it. The first read that finds a
 * code decides: its link must be this page's, and its corners where the page printed them.
 */
function qrBound(photo: Raster, t: Transform, printed: FoundQr, grid: QrGrid | null, page: { width: number; height: number }): boolean {
  const b = boundsOf(printed.corners), size = Math.max(b.width, b.height);
  const x = Math.max(0, b.x - QR_WINDOW * size), y = Math.max(0, b.y - QR_WINDOW * size);
  const window = { x, y, width: Math.min(page.width, b.x + b.width + QR_WINDOW * size) - x, height: Math.min(page.height, b.y + b.height + QR_WINDOW * size) - y };
  const inverse = invert(t);
  if (!inverse) return false;
  const decides = (found: FoundQr | null, toPage: (c: Point) => Point) => found
    && found.link === printed.link && found.corners.every((c, i) => distance(toPage(c), printed.corners[i]) <= QR_TOLERANCE * size);
  // First the photo's own pixels around the place, with the code's corners taken back through the map.
  const seenAt = boundsOf([{ x: window.x, y: window.y }, { x: window.x + window.width, y: window.y }, { x: window.x + window.width, y: window.y + window.height }, { x: window.x, y: window.y + window.height }].map((p) => applyTransform(t, p)));
  const x0 = Math.max(0, Math.floor(seenAt.x)), y0 = Math.max(0, Math.floor(seenAt.y));
  const x1 = Math.min(photo.width, Math.ceil(seenAt.x + seenAt.width)), y1 = Math.min(photo.height, Math.ceil(seenAt.y + seenAt.height));
  if (x1 > x0 && y1 > y0) {
    const own = readQr(photoBox(photo, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }));
    if (own) return !!decides(own, (c) => applyTransform(inverse, { x: x0 + c.x, y: y0 + c.y }));
  }
  // Then module by module where the page printed it: what a phone's small or soft code needs.
  const byModule = gridQr(photo, t, printed, grid);
  if (byModule) return !!decides(byModule, (c) => c);
  // Then a straightened copy, and last the whole photo, read as the upload reads it.
  const seen = readQr(warpBox(photo, t, window, { width: Math.round(window.width * QR_SCALE), height: Math.round(window.height * QR_SCALE) }));
  if (seen) return !!decides(seen, (c) => ({ x: window.x + c.x / QR_SCALE, y: window.y + c.y / QR_SCALE }));
  return !!decides(wholePhotoQr(photo), (c) => applyTransform(inverse, c));
}

const wholeQrCache = new WeakMap<Raster, FoundQr | null>();
function wholePhotoQr(photo: Raster): FoundQr | null {
  if (!wholeQrCache.has(photo)) wholeQrCache.set(photo, readQr(photo, "attemptBoth"));
  return wholeQrCache.get(photo)!;
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
  const { greySums, quads } = preparedPhoto(photo);
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
      return [{ turns, order, t, fit: pageFit(ink, greySums, photo, t) }];
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
  // Two ways up that both follow the page: the marks alone cannot say which is right.
  if (best.next !== null && best.next >= MIN_PAGE_FIT) return { status: "refused", reason: "orientation-unclear" };
  if (!qrBound(photo, best.t, printedQr, prepared.qrGrid, pageSize)) return { status: "refused", reason: "qr-mismatch" };
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
