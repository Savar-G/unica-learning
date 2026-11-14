// Scan calibration (#455, S2b): reads a normalized photo of a printed page against that page's stored print contract.
// It finds the four L-shaped scan marks in the photo, maps the page's perspective from the contract's mark points, and
// cuts the straightened page and the answer regions out of the photo.
//
// Everything comes from the stored contract (workbook-print-contract.ts): the mark points, their order, the units and the
// region boxes. Nothing comes from today's template. A rectangle of four marks is accepted only when all of this holds, and
// a wrong crop is a wrong mark on a child's work, so anything unsure is refused:
// - it looks like the page image the contract fingerprints, cell by cell, in one way up (a shared template is not enough);
// - it is the only rectangle in the photo that does (two sheets in one photo are refused, whichever holds the code);
// - inside it, where that page image printed its QR code, the photo's QR code reads as this page's own link;
// - nowhere on it does another printed page of the child's books explain the photo clearly better (#456): wherever this
//   page and a near-twin page print differently, the photo must hold this page's print. Pages that differ by a few digits
//   pass the comparison above, so a code pasted on such a page, or such a page lying over this one, is found here.
//
// Pure TypeScript: no Next.js, React, network, database or clock. The caller decodes and encodes images.
import jsQR from "jsqr";
import type { QuestionPackage } from "@/lib/question-package";
import { markingRegions } from "@/lib/scan-marking-regions";
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
  /**
   * A bent, curled or bowed sheet (#912): where the printed page sits from where `transform` alone puts it, in page image
   * pixels, as quadratic coefficients over the page's position (`bendAt`). Absent for a flat sheet.
   */
  bend?: Bend;
}

/** A sheet's bend: coefficients of 1, u, v, u², uv, v² for each direction, u and v from -0.5 to 0.5 across the page. */
export interface Bend { dx: number[]; dy: number[] }

/** Where a bent sheet puts a page point, in page image pixels, before the map. */
export function bendAt(bend: Bend, page: { width: number; height: number }, x: number, y: number): Point {
  const u = x / page.width - 0.5, v = y / page.height - 0.5, terms = [1, u, v, u * u, u * v, v * v];
  return { x: x + terms.reduce((sum, t, i) => sum + t * bend.dx[i], 0), y: y + terms.reduce((sum, t, i) => sum + t * bend.dy[i], 0) };
}

/**
 * Why a photo has no calibration:
 * - marks-missing: the photo does not hold four shapes that line up as the page's scan marks;
 * - marks-inconsistent: they line up, but their arms do not fit the contract's rectangle once mapped;
 * - page-mismatch: the photo's ink does not follow the printed page's ink in any way up;
 * - ambiguous-page: more than one rectangle in the photo follows it, as with two copies of a page;
 * - orientation-unclear: two ways up fit about equally well;
 * - qr-mismatch: where the page printed its QR code, the photo's code is missing, moved, or another page's;
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
/** A bent sheet (#912): how far, in grid pixels, the middle of the page may sit from where the four marks put it. */
const BEND_REACH = 10;
/** A cell that matches this well within BEND_REACH says where the sheet's bend puts that part of the page. */
const BEND_ANCHOR = 0.8;
/** The share of the page's cells that must say where the bend is before a bend is fitted. */
const BEND_MIN_ANCHORS = 0.5;
/** A map that misses more than this share of cells is not a bent sheet of this page: no bend is tried. */
const BEND_MAX_MISSES = 0.6;
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
  const prepared = printedPixels(printed);
  prepared.qr = readQr(printed);
  if (prepared.qr) prepared.qrGrid = printedGrid(printed, prepared.qr);
  printedCache.set(printed, prepared);
  return prepared;
}

function printedPixels(printed: Raster): PreparedPrinted {
  // Only dark print: a pale panel's edge or a faint rule does not survive every photo, and says little about which page it is.
  const mask = inkMask(printed), grey = toGrey(printed);
  for (let i = 0; i < mask.length; i++) if (grey[i] >= DARK_PRINT) mask[i] = 0;
  const sums = summed(mask, printed.width, printed.height);
  const width = Math.floor(printed.width / 2), height = Math.floor(printed.height / 2);
  const ink = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (boxMean(sums, printed.width, printed.height, x * 2, y * 2, x * 2 + 2, y * 2 + 2) >= 0.3) ink[y * width + x] = 1;
  }
  return { ink, greySums: summed(grey, printed.width, printed.height), width, height, source: { width: printed.width, height: printed.height }, qr: null, qrGrid: null };
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
 * The grids the comparison reads, at half the page image's pixels: the printed grey (`a`) and the photo's grey through the
 * map (`b`), both brought to the sharpness of the coarser image.
 */
function fitGrids(printed: Pick<PreparedPrinted, "width" | "height" | "greySums" | "source">, photoSums: Uint32Array, photo: { width: number; height: number }, t: Transform): { a: Float32Array; b: Float32Array } {
  const { width, height, greySums, source } = printed;
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
  return { a, b };
}

/**
 * The share of the page's printed cells that the photo holds in the same place, through a map; 0 as soon as too few can.
 * Cell by cell, because pages of one template share a heading and a layout. In grey, with both images brought to the same
 * sharpness first, because a threshold on ink changes with how large the page is in the photo: a stroke one pixel wide comes
 * out thin or missing, and the same page would pass from close up and fail from further away. A correlation does not care
 * about shade or contrast.
 */
function pageFit(printed: PrintedInk, photoSums: Uint32Array, photo: { width: number; height: number }, t: Transform, atLeast = MIN_PAGE_FIT, found?: { bend?: Bend }): number {
  const { width, cells } = printed;
  if (cells.length === 0) return 0;
  const { a, b } = fitGrids(printed, photoSums, photo, t);
  const height = printed.height;
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
  /** The best correlation of a cell with the photo around (ox, oy), within `reach` grid pixels, and where it was found. */
  const bestNear = (c: typeof shaped[number], ox: number, oy: number, reach: number) => {
    let best = -1, bx = 0, by = 0;
    for (let dy = oy - reach; dy <= oy + reach; dy++) for (let dx = ox - reach; dx <= ox + reach; dx++) {
      if (c.y + dy < 0 || c.x + dx < 0 || c.y + dy + FIT_CELL > height || c.x + dx + FIT_CELL > width) continue;
      let sumB = 0, sumBB = 0, sumAB = 0;
      for (let j = 0; j < FIT_CELL; j++) for (let i = 0; i < FIT_CELL; i++) {
        const p = a[(c.y + j) * width + c.x + i], q = b[(c.y + dy + j) * width + c.x + dx + i];
        sumB += q; sumBB += q * q; sumAB += p * q;
      }
      const spreadB = n * sumBB - sumB * sumB;
      const r = spreadB > 0 ? (n * sumAB - c.sumA * sumB) / Math.sqrt(c.spreadA * spreadB) : -1;
      if (r > best) { best = r; bx = dx; by = dy; }
    }
    return { r: best, dx: bx, dy: by };
  };
  const allowedMisses = Math.floor(shaped.length * (1 - atLeast));
  const missed: typeof shaped = [];
  for (const c of shaped) {
    if (bestNear(c, 0, 0, FIT_SHIFT).r >= CELL_MATCH) continue;
    missed.push(c);
    // Far from this page in this map: no bend of the sheet makes it fit (#912), so stop early as before.
    if (missed.length > allowedMisses && (atLeast !== MIN_PAGE_FIT || missed.length > shaped.length * BEND_MAX_MISSES)) return 0;
  }
  if (missed.length <= allowedMisses) return 1 - missed.length / shaped.length;
  return bentPageFit(shaped, missed.length, bestNear, width, height, allowedMisses, found);
}

/**
 * The fit of a page whose sheet is bent, curled or bowed (#912): its four marks place the corners, but the middle of the
 * printed page sits a few grid pixels away from where a flat sheet would put it. The cells that match well far from their
 * flat place give a smooth bend (a quadratic in the page's position, for each direction); every cell is then compared
 * again at its bent place with the usual small reach. A different page has no smooth bend that holds its print, so it
 * still fails, and the QR code stays required.
 */
function bentPageFit<C extends { x: number; y: number }>(shaped: readonly C[], flatMisses: number,
  bestNear: (c: C, ox: number, oy: number, reach: number) => { r: number; dx: number; dy: number }, width: number, height: number, allowedMisses: number,
  found?: { bend?: Bend }): number {
  const anchors: { u: number; v: number; dx: number; dy: number }[] = [];
  for (const c of shaped) {
    const f = bestNear(c, 0, 0, BEND_REACH);
    if (f.r >= BEND_ANCHOR) anchors.push({ u: (c.x + FIT_CELL / 2) / width - 0.5, v: (c.y + FIT_CELL / 2) / height - 0.5, dx: f.dx, dy: f.dy });
  }
  if (anchors.length < shaped.length * BEND_MIN_ANCHORS) return 1 - flatMisses / shaped.length;
  const fx = smoothFit(anchors, (a) => a.dx), fy = smoothFit(anchors, (a) => a.dy);
  if (!fx || !fy) return 1 - flatMisses / shaped.length;
  const bend = { dx: (u: number, v: number) => fx.at(u, v), dy: (u: number, v: number) => fy.at(u, v) };
  let misses = 0;
  for (const c of shaped) {
    const u = (c.x + FIT_CELL / 2) / width - 0.5, v = (c.y + FIT_CELL / 2) / height - 0.5;
    const ox = Math.round(bend.dx(u, v)), oy = Math.round(bend.dy(u, v));
    if (Math.abs(ox) > BEND_REACH || Math.abs(oy) > BEND_REACH || bestNear(c, ox, oy, FIT_SHIFT).r < CELL_MATCH) misses++;
    if (misses > allowedMisses) return 1 - Math.min(flatMisses, misses) / shaped.length;
  }
  // In page image pixels: the grid is half the page image, and u, v are the same share of the page on both.
  if (found) found.bend = { dx: fx.weights.map((w) => w * 2), dy: fy.weights.map((w) => w * 2) };
  return 1 - misses / shaped.length;
}

/** A least-squares quadratic surface in (u, v) through the anchors' values, refit once without its worst outliers. */
function smoothFit<T extends { u: number; v: number }>(points: readonly T[], value: (p: T) => number): { weights: number[]; at: (u: number, v: number) => number } | null {
  const terms = (u: number, v: number) => [1, u, v, u * u, u * v, v * v];
  const solve = (ps: readonly T[]) => {
    const k = 6, m = Array.from({ length: k }, () => new Array(k + 1).fill(0));
    for (const p of ps) {
      const t = terms(p.u, p.v), y = value(p);
      for (let i = 0; i < k; i++) { for (let j = 0; j < k; j++) m[i][j] += t[i] * t[j]; m[i][k] += t[i] * y; }
    }
    for (let i = 0; i < k; i++) m[i][i] += 1e-6;
    for (let col = 0; col < k; col++) {
      let pivot = col;
      for (let r = col + 1; r < k; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
      if (Math.abs(m[pivot][col]) < 1e-12) return null;
      [m[col], m[pivot]] = [m[pivot], m[col]];
      for (let r = 0; r < k; r++) if (r !== col) { const f = m[r][col] / m[col][col]; for (let c = col; c <= k; c++) m[r][c] -= f * m[col][c]; }
    }
    const weights = m.map((row, i) => row[k] / row[i]);
    return { weights, at: (u: number, v: number) => terms(u, v).reduce((sum, t, i) => sum + t * weights[i], 0) };
  };
  if (points.length < 12) return null;
  const first = solve(points);
  if (!first) return null;
  const kept = points.filter((p) => Math.abs(value(p) - first.at(p.u, p.v)) <= FIT_SHIFT);
  return kept.length >= 12 ? solve(kept) : first;
}

// ---------- One sheet, this page ----------

/** A map that leaves a page image's pixels where they are: for comparing two prints with each other. */
const SAME_PLACE: Transform = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/**
 * How much of a page's print another page must also hold, compared print against print as a photo is compared, to be its
 * near twin: a page whose photo the ink comparison could take for this one, and so a page only the sheet check can tell
 * from it. Well below MIN_PAGE_FIT, as a sheet that only partly lies over this page fits this page better than its own print
 * does. Over 192 pairs of real pages, the only pair a photo ever passed the ink comparison for fit 0.96 or more, the next
 * pairs 0.75 to 0.93, and every other pair 0.55 or less. From the print alone, so glare on a photo cannot take a page out of
 * the comparison.
 */
const NEAR_TWIN_FIT = 0.75;
/** A cell whose two prints differ by less than this after the comparison's shifts, per pixel in grey levels squared, does not tell them apart: a sliver of a stroke. */
const SPOT_APART = 800;
/**
 * How much the two prints must differ in a spot at the photo's own contrast there, per pixel in grey levels squared, for the
 * photo to be able to say which it holds. A standard deviation of 8 grey levels: about what a photo's noise and JPEG give.
 */
const READABLE = 64;
/**
 * Where the photo sits between the two prints in a spot: (its error from this page − its error from the other) / how far
 * apart the prints are there, at the contrast read around the spot. About -1 when it holds this page's print, about +1 when
 * it holds the other's, and near 0 when it holds neither clearly. This page must win by this much. Scores of a right
 * page's spots and of a near twin's mirror each other (.design/experiments/r456/spot-scores.txt).
 */
const SHEET_MARGIN = 0.12;
/**
 * The score at which a spot holds the other page's print. No right page's spot passed 0.23 in the matrix, and 90% of a near
 * twin's spots reach this (.design/experiments/r456/spot-scores.txt).
 */
const OTHER_PRINT = 0.4;
/**
 * A digit can look like its twin at a photo's resolution, whichever page is right. The share of a twin's spots that may stay
 * unclear (readable, but no margin either way) while all the others hold this page's print.
 */
const MAX_UNCLEAR = 0.2;
/** A print explains a spot at the contrast read around it or a little less: a thin stroke blurs paler than its surroundings. */
const LEAST_CONTRAST = 0.6;
/**
 * How much of the contrast around a spot the photo must keep on this page's own print there, for the spot to show it. A
 * right page's spots kept 0.73 or more, and a glared one 0.10 (.design/experiments/r456/spot-scores.txt). Without this, an even patch of glare
 * looks more like whichever page prints less ink.
 */
const MIN_SHOWN = 0.5;
/** The light's contrast is read over tiles of this many grid pixels, each with its own small shift. */
const CONTRAST_TILE = FIT_CELL * 4;

/**
 * Why a photo is not all this page:
 * - another-page: at a spot where a near-twin page prints differently, the photo holds the twin's print;
 * - faint: such a spot is too bright, faint, covered or small in the photo to say that it holds this page's print.
 */
export type SheetRefusal = "another-page" | "faint";

export interface SheetCheck {
  verdict: "this-page" | SheetRefusal;
  /** The near twins compared, and the spots where a twin prints differently from this page. */
  twins: number;
  spots: number;
  /** Over the spots that could be read: the score nearest the other page, from about -1 to about +1. */
  closest: number;
  /** Spots too faint, glared, covered or small to decide. */
  faint: number;
  /** Spots that could be read and show neither page by a margin. */
  unclear: number;
}

/** The photo's contrast against the print over each tile: how much of the print's grey range the photo keeps there. */
function contrastTiles(a: Float32Array, b: Float32Array, width: number, height: number) {
  const cols = Math.ceil(width / CONTRAST_TILE), rows = Math.ceil(height / CONTRAST_TILE);
  const shared = new Float64Array(cols * rows), spread = new Float64Array(cols * rows);
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x0 = col * CONTRAST_TILE, y0 = row * CONTRAST_TILE, x1 = Math.min(width, x0 + CONTRAST_TILE), y1 = Math.min(height, y0 + CONTRAST_TILE), n = (x1 - x0) * (y1 - y0);
    let sumA = 0, sumAA = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const v = a[y * width + x]; sumA += v; sumAA += v * v; }
    spread[row * cols + col] = sumAA - (sumA * sumA) / n;
    if (spread[row * cols + col] <= 0) continue;
    let best = 0;
    for (let dy = -FIT_SHIFT; dy <= FIT_SHIFT; dy++) for (let dx = -FIT_SHIFT; dx <= FIT_SHIFT; dx++) {
      if (y0 + dy < 0 || x0 + dx < 0 || y1 + dy > height || x1 + dx > width) continue;
      let sumB = 0, sumAB = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const q = b[(y + dy) * width + x + dx]; sumB += q; sumAB += a[y * width + x] * q; }
      best = Math.max(best, sumAB - (sumA * sumB) / n);
    }
    shared[row * cols + col] = best;
  }
  const page = { shared: shared.reduce((s, v) => s + v, 0), spread: spread.reduce((s, v) => s + v, 0) };
  /** The contrast around a grid point: the nearest tiles that hold print, or the whole page's. */
  return (x: number, y: number): number => {
    const col = Math.floor(x / CONTRAST_TILE), row = Math.floor(y / CONTRAST_TILE);
    for (const reach of [1, 2]) {
      let s = 0, v = 0, pixels = 0;
      for (let r = Math.max(0, row - reach); r <= Math.min(rows - 1, row + reach); r++) for (let c = Math.max(0, col - reach); c <= Math.min(cols - 1, col + reach); c++) { s += shared[r * cols + c]; v += spread[r * cols + c]; pixels += CONTRAST_TILE * CONTRAST_TILE; }
      if (v >= pixels * FLAT_SPREAD) return Math.min(1.5, Math.max(0, s / v));
    }
    return page.spread > 0 ? Math.min(1.5, Math.max(0, page.shared / page.spread)) : 0;
  };
}

/** How far apart two prints are in a cell, in the sum of squares over its pixels, after the shift that brings them closest. */
function cellApart(p: Float32Array, q: Float32Array, width: number, height: number, x: number, y: number): number {
  const n = FIT_CELL * FIT_CELL;
  let best = Infinity;
  for (let dy = -FIT_SHIFT; dy <= FIT_SHIFT; dy++) for (let dx = -FIT_SHIFT; dx <= FIT_SHIFT; dx++) {
    if (y + dy < 0 || x + dx < 0 || y + dy + FIT_CELL > height || x + dx + FIT_CELL > width) continue;
    let sum = 0, squares = 0;
    for (let j = 0; j < FIT_CELL; j++) for (let i = 0; i < FIT_CELL; i++) { const d = p[(y + j) * width + x + i] - q[(y + dy + j) * width + x + dx + i]; sum += d; squares += d * d; }
    best = Math.min(best, squares - (sum * sum) / n);
  }
  return best;
}

/** Groups touching cells into spots: a digit or a word, read as one. */
function spotsOf(cells: readonly { x: number; y: number; apart: number }[]) {
  const at = new Map(cells.map((c) => [`${c.x},${c.y}`, c]));
  const out: { x: number; y: number; apart: number }[][] = [];
  for (const start of cells) {
    if (!at.delete(`${start.x},${start.y}`)) continue;
    const spot = [start], stack = [start];
    while (stack.length) {
      const c = stack.pop()!;
      for (const dy of [-FIT_CELL, 0, FIT_CELL]) for (const dx of [-FIT_CELL, 0, FIT_CELL]) {
        const key = `${c.x + dx},${c.y + dy}`, next = at.get(key);
        if (next) { at.delete(key); spot.push(next); stack.push(next); }
      }
    }
    out.push(spot);
  }
  return out;
}

/** The contrast the photo itself shows in a spot against one print: 0 where the spot holds none of that print. */
function spotContrast(spot: readonly { x: number; y: number }[], p: Float32Array, b: Float32Array, width: number, height: number): number {
  const n = FIT_CELL * FIT_CELL;
  let best = 0;
  for (let dy = -FIT_SHIFT; dy <= FIT_SHIFT; dy++) for (let dx = -FIT_SHIFT; dx <= FIT_SHIFT; dx++) {
    if (spot.some((c) => c.y + dy < 0 || c.x + dx < 0 || c.y + dy + FIT_CELL > height || c.x + dx + FIT_CELL > width)) continue;
    let bp = 0, pp = 0;
    for (const c of spot) {
      let sb = 0, sp = 0, sbp = 0, spp = 0;
      for (let j = 0; j < FIT_CELL; j++) for (let i = 0; i < FIT_CELL; i++) {
        const u = p[(c.y + j) * width + c.x + i], v = b[(c.y + dy + j) * width + c.x + dx + i];
        sb += v; sp += u; sbp += v * u; spp += u * u;
      }
      bp += sbp - (sb * sp) / n; pp += spp - (sp * sp) / n;
    }
    if (pp > 0) best = Math.max(best, bp / pp);
  }
  return Math.min(1.5, best);
}

/** Whether a print has any shape in a spot, as opposed to white paper. */
function spotPrints(spot: readonly { x: number; y: number }[], p: Float32Array, width: number): boolean {
  const n = FIT_CELL * FIT_CELL;
  let spread = 0;
  for (const c of spot) {
    let sum = 0, squares = 0;
    for (let j = 0; j < FIT_CELL; j++) for (let i = 0; i < FIT_CELL; i++) { const v = p[(c.y + j) * width + c.x + i]; sum += v; squares += v * v; }
    spread += squares - (sum * sum) / n;
  }
  return spread >= spot.length * n * SPOT_APART;
}

/** A spot's score: where the photo sits between the two prints, at a contrast known from around it, under one shift each. */
function spotScore(spot: readonly { x: number; y: number; apart: number }[], p: Float32Array, q: Float32Array, b: Float32Array, width: number, height: number, contrast: number): number {
  const n = FIT_CELL * FIT_CELL;
  let mine = Infinity, theirs = Infinity;
  for (let dy = -FIT_SHIFT; dy <= FIT_SHIFT; dy++) for (let dx = -FIT_SHIFT; dx <= FIT_SHIFT; dx++) {
    if (spot.some((c) => c.y + dy < 0 || c.x + dx < 0 || c.y + dy + FIT_CELL > height || c.x + dx + FIT_CELL > width)) continue;
    let bb = 0, bp = 0, pp = 0, bq = 0, qq = 0;
    for (const c of spot) {
      let sb = 0, sp = 0, sq = 0, sbb = 0, sbp = 0, spp = 0, sbq = 0, sqq = 0;
      for (let j = 0; j < FIT_CELL; j++) for (let i = 0; i < FIT_CELL; i++) {
        const at = (c.y + j) * width + c.x + i, v = b[(c.y + dy + j) * width + c.x + dx + i], u = p[at], w = q[at];
        sb += v; sp += u; sq += w; sbb += v * v; sbp += v * u; spp += u * u; sbq += v * w; sqq += w * w;
      }
      bb += sbb - (sb * sb) / n; bp += sbp - (sb * sp) / n; pp += spp - (sp * sp) / n; bq += sbq - (sb * sq) / n; qq += sqq - (sq * sq) / n;
    }
    const fit = (cross: number, own: number) => { const g = Math.min(contrast, Math.max(contrast * LEAST_CONTRAST, own > 0 ? cross / own : 0)); return bb - 2 * g * cross + g * g * own; };
    mine = Math.min(mine, fit(bp, pp)); theirs = Math.min(theirs, fit(bq, qq));
  }
  const apart = spot.reduce((s, c) => s + c.apart, 0) * contrast * contrast;
  return apart > 0 ? (mine - theirs) / apart : 0;
}

/**
 * Whether the photo is all this page, a few of `others` at a time (printed page images of the same size): fail closed on
 * evidence. A near twin is another page that holds this page's print, as pages that differ by a few digits do. Wherever a
 * twin prints differently from this page (outside the QR code, which a sticker can carry, and outside where a child
 * writes), the photo must hold this page's print, by a margin, with enough contrast there to tell the two apart. Missing
 * evidence refuses, so glare cannot pass a sheet. A twin with no such spot prints the same as this page apart from its code,
 * and cannot be told from it.
 */
export function sheetChecker(o: { photo: Raster; printed: Raster; transform: Transform; writing?: readonly Box[] }): (others: readonly Raster[]) => SheetCheck {
  const self = preparedPrinted(o.printed), { greySums } = preparedPhoto(o.photo);
  const { width, height } = self;
  const qr = self.qr ? [boundsOf(self.qr.corners)] : [];
  const skip = [...(o.writing ?? []), ...qr];
  const inked = printedInk(self, skip);
  let grids: { a: Float32Array; b: Float32Array; contrast: (x: number, y: number) => number } | null = null;
  return (others) => {
    let tooUnclear = false;
    const out: SheetCheck = { verdict: "this-page", twins: 0, spots: 0, closest: -Infinity, faint: 0, unclear: 0 };
    for (const raster of others) {
      if (raster === o.printed || raster.width !== o.printed.width || raster.height !== o.printed.height) continue;
      // (Another page's code says nothing here, reading one is slow, and nothing of this page is kept once its batch is done.)
      const other = printedCache.get(raster) ?? printedPixels(raster);
      if (pageFit(inked, other.greySums, other.source, SAME_PLACE, NEAR_TWIN_FIT) < NEAR_TWIN_FIT) continue;
      out.twins++;
      if (!grids) { const g = fitGrids(self, greySums, o.photo, o.transform); grids = { ...g, contrast: contrastTiles(g.a, g.b, width, height) }; }
      const { a, b, contrast } = grids;
      const theirs = fitGrids(other, greySums, o.photo, o.transform).a;
      const cells: { x: number; y: number; apart: number }[] = [];
      for (let y = 0; y + FIT_CELL <= height; y += FIT_CELL) for (let x = 0; x + FIT_CELL <= width; x += FIT_CELL) {
        if (skip.some((s) => overlaps(s, { x: x * 2, y: y * 2, width: FIT_CELL * 2, height: FIT_CELL * 2 }))) continue;
        let differ = 0;
        for (let j = 0; j < FIT_CELL; j++) for (let i = 0; i < FIT_CELL; i++) differ += self.ink[(y + j) * width + x + i] ^ other.ink[(y + j) * width + x + i];
        if (differ < CELL_MIN_INK) continue;
        const apart = Math.max(cellApart(a, theirs, width, height, x, y), cellApart(theirs, a, width, height, x, y));
        if (apart >= SPOT_APART * FIT_CELL * FIT_CELL) cells.push({ x, y, apart });
      }
      const spots = spotsOf(cells);
      let unclear = 0;
      for (const spot of spots) {
        const n = spot.length, mid = spot[Math.floor(n / 2)];
        const own = spotContrast(spot, a, b, width, height), gain = Math.max(contrast(mid.x + FIT_CELL / 2, mid.y + FIT_CELL / 2), own, spotContrast(spot, theirs, b, width, height));
        const seen = (gain * gain * spot.reduce((s, c) => s + c.apart, 0)) / (n * FIT_CELL * FIT_CELL);
        if (seen < READABLE) { out.faint++; continue; }
        const score = spotScore(spot, a, theirs, b, width, height, gain);
        out.closest = Math.max(out.closest, score);
        if (score >= OTHER_PRINT) continue;
        // This page's print not to be seen though it prints there: an even patch of glare looks like whichever page prints less.
        if (spotPrints(spot, a, width) && own < MIN_SHOWN * gain) out.faint++;
        else if (score > -SHEET_MARGIN) unclear++;
      }
      out.spots += spots.length;
      out.unclear += unclear;
      if (unclear > MAX_UNCLEAR * spots.length) tooUnclear = true;
    }
    if (out.closest >= OTHER_PRINT) out.verdict = "another-page";
    else if (out.faint > 0 || tooUnclear) out.verdict = "faint";
    return out;
  };
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

/** How much the zoomed read of the photo's own pixels enlarges them: the upload's zoom (scan-photo-image.ts). */
const QR_ZOOM = 2;

/** A lanczos (a = 3) weight: the kernel sharp enlarges with. */
const lanczos = (x: number) => {
  if (x === 0) return 1;
  if (Math.abs(x) >= 3) return 0;
  const p = Math.PI * x;
  return (3 * Math.sin(p) * Math.sin(p / 3)) / (p * p);
};

/** A one-channel raster enlarged `k` times with a lanczos kernel, as the upload's zoomed read enlarges its crops. */
function enlarged(r: Raster, k: number): Raster {
  const taps = (size: number) => Array.from({ length: size * k }, (_, o) => {
    const s = (o + 0.5) / k - 0.5, base = Math.floor(s);
    const at: number[] = [], weights: number[] = [];
    for (let i = base - 2; i <= base + 3; i++) { at.push(Math.max(0, Math.min(size - 1, i))); weights.push(lanczos(s - i)); }
    const sum = weights.reduce((a, b) => a + b, 0);
    return { at, weights: weights.map((w) => w / sum) };
  });
  const across = taps(r.width), down = taps(r.height), W = r.width * k, H = r.height * k;
  const rows = new Float32Array(W * r.height);
  for (let y = 0; y < r.height; y++) for (let x = 0; x < W; x++) {
    const { at, weights } = across[x];
    let v = 0;
    for (let i = 0; i < at.length; i++) v += r.data[y * r.width + at[i]] * weights[i];
    rows[y * W + x] = v;
  }
  const data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const { at, weights } = down[y];
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let i = 0; i < at.length; i++) v += rows[at[i] * W + x] * weights[i];
      data[y * W + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return { width: W, height: H, channels: 1, data };
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
    const box = photoBox(photo, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    const own = readQr(box);
    if (own) return !!decides(own, (c) => applyTransform(inverse, { x: x0 + c.x, y: y0 + c.y }));
    // The same pixels enlarged as the upload's zoomed read enlarges them, so a code the upload read in a zoomed crop
    // reads here too.
    const zoomed = readQr(enlarged(box, QR_ZOOM));
    if (zoomed) return !!decides(zoomed, (c) => applyTransform(inverse, { x: x0 + c.x / QR_ZOOM, y: y0 + c.y / QR_ZOOM }));
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
 * `writing`: where a child writes on this page, which says nothing about which page it is. This says the sheet is this
 * page's by its marks, ink and code. Pages that differ by a few digits pass all three for each other, so the crop job then
 * asks sheetChecker about the child's other pages, a few at a time.
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
  const followers: { order: MarkShape[]; t: Transform; turns: 0 | 1 | 2 | 3; fit: number; bend?: Bend; next: number | null }[] = [];
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
      const found: { bend?: Bend } = {};
      const fit = pageFit(ink, greySums, photo, t, MIN_PAGE_FIT, found);
      return [{ turns, order, t, fit, ...(found.bend ? { bend: found.bend } : {}) }];
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
      ...(best.bend ? { bend: best.bend } : {}),
    },
  };
}

/** A stored calibration, only for a photo of its own revision. */
export const calibrationForPhoto = (c: Calibration, photo: { printedRevision: string | null }): Calibration | null =>
  (c.revision === photo.printedRevision && c.version === CALIBRATION_VERSION ? c : null);

// ---------- Cutting the page ----------

/** A box of the page image, cut from the photo through the map, at `out` pixels. Pixels off the photo are white. */
export function warpBox(photo: Raster, t: Transform, box: Box, out: { width: number; height: number }, bent?: { bend: Bend; page: { width: number; height: number } }): Raster {
  const { channels, width: w, height: h, data } = photo;
  const result = new Uint8Array(out.width * out.height * channels);
  const sx = box.width / out.width, sy = box.height / out.height;
  for (let oy = 0; oy < out.height; oy++) {
    const by = box.y + (oy + 0.5) * sy;
    for (let ox = 0; ox < out.width; ox++) {
      const bx = box.x + (ox + 0.5) * sx;
      const { x: px, y: py } = bent ? bendAt(bent.bend, bent.page, bx, by) : { x: bx, y: by };
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
  return warpBox(photo, c.transform, { x: 0, y: 0, width, height }, { width, height }, c.bend ? { bend: c.bend, page: { width, height } } : undefined);
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
  return warpBox(photo, c.transform, cut, { width: Math.max(1, Math.round(cut.width * scale * fit)), height: Math.max(1, Math.round(cut.height * scale * fit)) },
    c.bend ? { bend: c.bend, page: { width: iw, height: ih } } : undefined);
}

// ---------- What can be cropped today ----------

export interface CropItem {
  /** The question's printed number: the crop's number. */
  number: number;
  /** The item and the region of it: a region names a part of an item, not an attempt. */
  itemId: string;
  regionId: string;
  /** Present for a crop that covers several scored regions of the same item. */
  regionIds?: string[];
  box: Box;
}

export interface CropQuestion {
  number: number;
  package: QuestionPackage | null;
  regions: readonly PrintedRegion[] | null;
}

/** The page's numbered crops, in printed order, and the questions this slice cannot crop. */
export function cropPlan(questions: readonly CropQuestion[]): { crops: CropItem[]; notSupported: number[] } {
  const crops: CropItem[] = [], notSupported: number[] = [];
  for (const q of [...questions].sort((a, b) => a.number - b.number)) {
    const regions = markingRegions(q);
    if (!regions.length) { notSupported.push(q.number); continue; }
    const x = Math.min(...regions.map(r => r.box.x)), y = Math.min(...regions.map(r => r.box.y));
    const right = Math.max(...regions.map(r => r.box.x + r.box.width)), bottom = Math.max(...regions.map(r => r.box.y + r.box.height));
    crops.push({ number: q.number, itemId: q.package!.id, regionId: regions[0].id,
      ...(regions.length > 1 ? { regionIds: regions.map(r => r.id) } : {}), box: { x, y, width: right - x, height: bottom - y } });
  }
  return { crops, notSupported };
}
