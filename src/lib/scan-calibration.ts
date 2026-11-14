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
// A sheet that is not flat is aligned in sections (#912), and a page whose marks do not all show is placed by its QR code
// and its print; neither loosens any of the above (calibratePhoto).
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

// Version 2 includes mesh placement and cut-off answers. Version 1 readers must refuse new results because they ignore
// the cut-off list and could mark the straightened page's white border as a definite blank during a rolling deploy.
export const CALIBRATION_VERSION = 2;

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
   * A bent, curled or bowed sheet, as #914 stored it: quadratic coefficients over the page's position (`bendAt`). Only
   * calibrations stored before #912's mesh have one; it is still read, so their crops and preview stay the same.
   */
  bend?: Bend;
  /**
   * A bent, curled or held sheet (#912): where each part of the printed page sits from where `transform` alone puts it,
   * on a coarse mesh over the page, each part aligned to the printed page on its own (`meshAt`). Absent for a flat sheet.
   */
  mesh?: Mesh;
  /**
   * "qr": a corner mark was cut off by the photo's edge, so the page was placed from its QR code and its print, and the
   * marks still in the photo. `marks` then holds where the cut-off marks would be, outside the photo. Absent: four marks.
   */
  placedBy?: "qr";
  /** The marks that were outside the photo, for a page placed by its QR code. */
  missingMarks?: ScanMark[];
}

/** A sheet's bend: coefficients of 1, u, v, u², uv, v² for each direction, u and v from -0.5 to 0.5 across the page. */
export interface Bend { dx: number[]; dy: number[] }

/** Where a bent sheet puts a page point, in page image pixels, before the map. */
export function bendAt(bend: Bend, page: { width: number; height: number }, x: number, y: number): Point {
  const u = x / page.width - 0.5, v = y / page.height - 0.5, terms = [1, u, v, u * u, u * v, v * v];
  return { x: x + terms.reduce((sum, t, i) => sum + t * bend.dx[i], 0), y: y + terms.reduce((sum, t, i) => sum + t * bend.dy[i], 0) };
}

/**
 * A sheet's shape, part by part: the shift of the page at each node of a grid `step` page pixels apart, node (i, j) at
 * (i·step, j·step), row by row. Between nodes the shift is read bilinearly, so the page stays one continuous sheet.
 */
export interface Mesh { step: number; columns: number; rows: number; dx: number[]; dy: number[] }

/** Where a sheet with this mesh puts a page point, in page image pixels, before the map. */
export function meshAt(mesh: Mesh, x: number, y: number): Point {
  const fx = Math.max(0, Math.min(mesh.columns - 1.000001, x / mesh.step)), fy = Math.max(0, Math.min(mesh.rows - 1.000001, y / mesh.step));
  const i = Math.floor(fx), j = Math.floor(fy), ax = fx - i, ay = fy - j, at = j * mesh.columns + i, below = at + mesh.columns;
  const lerp = (v: readonly number[]) => (v[at] * (1 - ax) + v[at + 1] * ax) * (1 - ay) + (v[below] * (1 - ax) + v[below + 1] * ax) * ay;
  return { x: x + lerp(mesh.dx), y: y + lerp(mesh.dy) };
}

/** Where a calibration's sheet puts a page point before its map: its mesh, an older calibration's bend, or flat. */
export type SheetShape = (x: number, y: number) => Point;
export function sheetShape(c: { bend?: Bend; mesh?: Mesh }, page: { width: number; height: number }): SheetShape | undefined {
  if (c.mesh) { const mesh = c.mesh; return (x, y) => meshAt(mesh, x, y); }
  if (c.bend) { const bend = c.bend; return (x, y) => bendAt(bend, page, x, y); }
  return undefined;
}

/** A page point's place in the photo, through a calibration's sheet and map. */
export function photoPoint(c: Pick<Calibration, "transform" | "bend" | "mesh">, page: { width: number; height: number }, p: Point): Point {
  const shape = sheetShape(c, page);
  return applyTransform(c.transform, shape ? shape(p.x, p.y) : p);
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

/**
 * The projective map that sends `from` closest to `to` in least squares, over four or more points with weights: points
 * normalized first (Hartley), so a page's pixels and a photo's give a well-conditioned system. Null when degenerate.
 */
function fitTransform(from: readonly Point[], to: readonly Point[], weights?: readonly number[]): Transform | null {
  if (from.length < 4 || from.length !== to.length) return null;
  const norm = (ps: readonly Point[]) => {
    const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length, cy = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    const d = ps.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / ps.length || 1, k = Math.SQRT2 / d;
    return { k, cx, cy, at: (p: Point) => ({ x: (p.x - cx) * k, y: (p.y - cy) * k }) };
  };
  const nf = norm(from), nt = norm(to);
  const m = Array.from({ length: 8 }, () => new Array(9).fill(0));
  for (let n = 0; n < from.length; n++) {
    const { x, y } = nf.at(from[n]), { x: u, y: v } = nt.at(to[n]), w = weights?.[n] ?? 1;
    for (const [row, rhs] of [[[x, y, 1, 0, 0, 0, -u * x, -u * y], u], [[0, 0, 0, x, y, 1, -v * x, -v * y], v]] as [number[], number][]) {
      for (let i = 0; i < 8; i++) { for (let j = 0; j < 8; j++) m[i][j] += w * row[i] * row[j]; m[i][8] += w * row[i] * rhs; }
    }
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < 8; r++) if (r !== col) { const f = m[r][col] / m[col][col]; for (let c = col; c < 9; c++) m[r][c] -= f * m[col][c]; }
  }
  const h = m.map((row, i) => row[8] / row[i]);
  // Back from the normalized points: to⁻¹ · h · from.
  const H = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  const F = [nf.k, 0, -nf.k * nf.cx, 0, nf.k, -nf.k * nf.cy, 0, 0, 1];
  const Ti = [1 / nt.k, 0, nt.cx, 0, 1 / nt.k, nt.cy, 0, 0, 1];
  const mul = (a: number[], b: number[]) => Array.from({ length: 9 }, (_, i) => { const r = Math.floor(i / 3), c = i % 3; return a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]; });
  const out = mul(Ti, mul(H, F));
  if (Math.abs(out[8]) < 1e-12) return null;
  return out.map((v) => v / out[8]) as Transform;
}

/**
 * The similarity (turn, scale and move) or affine map that sends `from` closest to `to` in least squares: what a small part
 * of a page can say about the whole of it, where a projective map fitted to it would guess at the far side.
 */
function fitLinear(from: readonly Point[], to: readonly Point[], kind: "similarity" | "affine"): Transform | null {
  const k = kind === "similarity" ? 4 : 6;
  if (from.length < k / 2) return null;
  const m = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  const add = (row: number[], rhs: number) => { for (let i = 0; i < k; i++) { for (let j = 0; j < k; j++) m[i][j] += row[i] * row[j]; m[i][k] += row[i] * rhs; } };
  const cx = from.reduce((s, p) => s + p.x, 0) / from.length, cy = from.reduce((s, p) => s + p.y, 0) / from.length;
  for (let n = 0; n < from.length; n++) {
    const x = from[n].x - cx, y = from[n].y - cy;
    if (kind === "similarity") { add([x, -y, 1, 0], to[n].x); add([y, x, 0, 1], to[n].y); }
    else { add([x, y, 1, 0, 0, 0], to[n].x); add([0, 0, 0, x, y, 1], to[n].y); }
  }
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-9) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < k; r++) if (r !== col) { const f = m[r][col] / m[col][col]; for (let c = col; c <= k; c++) m[r][c] -= f * m[col][c]; }
  }
  const h = m.map((row, i) => row[k] / row[i]);
  const [a, b, c, d, e, f] = kind === "similarity" ? [h[0], -h[1], h[2], h[1], h[0], h[3]] : h;
  // (Back from the centred points.)
  return [a, b, c - a * cx - b * cy, d, e, f - d * cx - e * cy, 0, 0, 1];
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
/**
 * A bent, curled or held sheet (#912) is aligned part by part on a mesh: its nodes are this many grid pixels apart (64 page
 * image pixels), and each node's patch of print, a few cells across, is matched to the photo on its own.
 */
const MESH_STEP = 32;
/** A patch says where its part of the sheet sits only when it matches this well, as a correlation… */
const MESH_MATCH = 0.75;
/** …or, in the reads at the comparison's own grid, this well: where a sheet curls, its print is foreshortened in a patch. */
const MESH_FINE_MATCH = 0.6;
/**
 * The reads, coarse to fine, each on grids `scale` times coarser than the comparison's: a patch of `patch` pixels at that
 * scale, found within `reach` of where the reads before placed it, kept where it matches at least `match` and its
 * neighbours agree within `agree` grid pixels. Each way ends with two reads at the comparison's own grid. Two ways, tried
 * in turn, each held to the same comparison after it (pageFit):
 * - from very coarse, where repeated print (lines of text, rows of boxes) blurs into one shape and is not taken a line
 *   away; it reaches 53 grid pixels (106 page pixels);
 * - from a quarter, with a wide reach (45 grid pixels in all): a sheet held up in the hand curls too sharply near the
 *   hand for the very coarse read to follow.
 */
const MESH_READS = [
  [
    { scale: 8, patch: 8, reach: 5, agree: 8, match: MESH_MATCH },
    { scale: 4, patch: 12, reach: 2, agree: 6, match: MESH_MATCH },
    { scale: 1, patch: 32, reach: 3, agree: 2, match: MESH_FINE_MATCH },
    { scale: 1, patch: 24, reach: 2, agree: 2, match: MESH_FINE_MATCH },
    { scale: 1, patch: 16, reach: 2, agree: 2, match: MESH_FINE_MATCH },
  ],
  [
    { scale: 4, patch: 12, reach: 10, agree: 6, match: MESH_MATCH },
    { scale: 1, patch: 32, reach: 3, agree: 2, match: MESH_FINE_MATCH },
    { scale: 1, patch: 24, reach: 2, agree: 2, match: MESH_FINE_MATCH },
    { scale: 1, patch: 16, reach: 2, agree: 2, match: MESH_FINE_MATCH },
  ],
] as const;
/** Placing a page by its QR code reads at a quarter of the comparison's grid, a patch of this many pixels, this far. */
const MESH_COARSE = 4;
const MESH_COARSE_PATCH = 12;
const MESH_REACH = 10;
const MESH_AGREE_COARSE = 6;
/** A patch moves from where the reads before put it only for a place that matches this much better, as a correlation. */
const MESH_STAY = 0.06;
/** What each grid pixel of distance costs a patch's match, as a correlation: of two places alike, the nearer wins. */
const MESH_DISTANCE_COST = 0.002;
/**
 * And only when its neighbours agree: at least this many of the patches around it placed themselves, and it sits within
 * this many grid pixels of their median. One sheet bends smoothly; a patch that found some other print does not.
 */
const MESH_NEIGHBOURS = 2;
/** The share of the page's printed patches that must place themselves, in each read, before a mesh is fitted. */
const MESH_MIN_ANCHORS = 0.4;
/**
 * The share of the page's printed cells that must lie inside the photo for the comparison to say anything. Only a page
 * placed by its QR code can have cells outside: four marks in view hold the whole page.
 */
const MIN_VISIBLE = 0.6;
/** How much ink a cell needs to count: fewer pixels say nothing about which page it is. */
const CELL_MIN_INK = 10;
const MAX_RECTANGLES = 12;
const DARK_PRINT = 120;

interface PreparedPrinted { ink: Uint8Array; greySums: Uint32Array; width: number; height: number; source: { width: number; height: number }; qr: FoundQr | null; qrGrid: QrGrid | null }
interface PrintedInk extends Omit<PreparedPrinted, "qr"> { cells: { x: number; y: number }[] }
interface PreparedPhoto { greySums: Uint32Array; shapes: MarkShape[]; quads: MarkShape[][] }

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
  const shapes = findShapes(inkMask(photo), photo.width, photo.height);
  const prepared = { greySums: summed(toGrey(photo), photo.width, photo.height), shapes, quads: markQuads(shapes, photo) };
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
 * map (`b`), both brought to the sharpness of the coarser image. `shape`: where a bent sheet puts each page point first.
 */
function fitGrids(printed: Pick<PreparedPrinted, "width" | "height" | "greySums" | "source">, photoSums: Uint32Array, photo: { width: number; height: number }, t: Transform, shape?: SheetShape): { a: Float32Array; b: Float32Array } {
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
      const px = x * 2 + 1, at = shape ? shape(px, py) : { x: px, y: py }, w = t[6] * at.x + t[7] * at.y + t[8];
      const u = (t[0] * at.x + t[1] * at.y + t[2]) / w, v = (t[3] * at.x + t[4] * at.y + t[5]) / w;
      a[y * width + x] = boxMean(greySums, source.width, source.height, px - halfPage, py - halfPage, px + halfPage, py + halfPage);
      b[y * width + x] = boxMean(photoSums, photo.width, photo.height, u - halfPhoto, v - halfPhoto, u + halfPhoto, v + halfPhoto);
    }
  }
  return { a, b };
}

type ShapedCell = { x: number; y: number; sumA: number; spreadA: number };

/** The cells with a printed edge: a cell of one even shade (inside a solid bar) has no shape for a correlation to follow. */
function shapedCells(a: Float32Array, width: number, cells: readonly { x: number; y: number }[]): ShapedCell[] {
  const n = FIT_CELL * FIT_CELL, shaped: ShapedCell[] = [];
  for (const c of cells) {
    let sumA = 0, sumAA = 0;
    for (let j = 0; j < FIT_CELL; j++) for (let i = 0; i < FIT_CELL; i++) { const v = a[(c.y + j) * width + c.x + i]; sumA += v; sumAA += v * v; }
    const spreadA = n * sumAA - sumA * sumA;
    if (spreadA >= n * n * FLAT_SPREAD) shaped.push({ ...c, sumA, spreadA });
  }
  return shaped;
}

/** The best correlation of a cell with the photo's grid within FIT_SHIFT grid pixels of its place. */
function cellMatch(c: ShapedCell, a: Float32Array, b: Float32Array, width: number, height: number): number {
  const n = FIT_CELL * FIT_CELL;
  let best = -1;
  for (let dy = -FIT_SHIFT; dy <= FIT_SHIFT; dy++) for (let dx = -FIT_SHIFT; dx <= FIT_SHIFT; dx++) {
    if (c.y + dy < 0 || c.x + dx < 0 || c.y + dy + FIT_CELL > height || c.x + dx + FIT_CELL > width) continue;
    let sumB = 0, sumBB = 0, sumAB = 0;
    for (let j = 0; j < FIT_CELL; j++) for (let i = 0; i < FIT_CELL; i++) {
      const p = a[(c.y + j) * width + c.x + i], q = b[(c.y + dy + j) * width + c.x + dx + i];
      sumB += q; sumBB += q * q; sumAB += p * q;
    }
    const spreadB = n * sumBB - sumB * sumB;
    const r = spreadB > 0 ? (n * sumAB - c.sumA * sumB) / Math.sqrt(c.spreadA * spreadB) : -1;
    if (r > best) best = r;
  }
  return best;
}

/** How far inside the photo's edge, in photo pixels, a cell must be to be compared: its reach and its blur stay in the photo. */
const EDGE = 8;
/** The cells whose four corners the sheet and the map put inside the photo. */
function visibleCells<C extends { x: number; y: number }>(cells: readonly C[], photo: { width: number; height: number }, t: Transform, shape?: SheetShape): C[] {
  const inside = (gx: number, gy: number) => {
    const p = applyTransform(t, shape ? shape(gx * 2, gy * 2) : { x: gx * 2, y: gy * 2 });
    return p.x >= EDGE && p.y >= EDGE && p.x <= photo.width - EDGE && p.y <= photo.height - EDGE;
  };
  return cells.filter((c) => inside(c.x, c.y) && inside(c.x + FIT_CELL, c.y) && inside(c.x, c.y + FIT_CELL) && inside(c.x + FIT_CELL, c.y + FIT_CELL));
}

/**
 * The share of the page's printed cells that the photo holds in the same place, through a map; 0 as soon as too few can.
 * Cell by cell, because pages of one template share a heading and a layout. In grey, with both images brought to the same
 * sharpness first, because a threshold on ink changes with how large the page is in the photo: a stroke one pixel wide comes
 * out thin or missing, and the same page would pass from close up and fail from further away. A correlation does not care
 * about shade or contrast. Only the cells inside the photo count, and they must be most of the page's (MIN_VISIBLE).
 *
 * A sheet that is not flat (#912: bowed, curled, held up in the hand) misses cells where the four marks' map alone puts
 * them. Then its parts are aligned one by one (`sheetMesh`), and every cell is compared again at its aligned place with the
 * same small reach and the same MIN_PAGE_FIT. `found.mesh` gets that alignment when it passes.
 */
function pageFit(printed: PrintedInk, photoSums: Uint32Array, photo: { width: number; height: number }, t: Transform, atLeast = MIN_PAGE_FIT, found?: { mesh?: Mesh }, pins: readonly Pin[] = [], bent = true): number {
  const { width, height, cells } = printed;
  if (cells.length === 0) return 0;
  const { a, b } = fitGrids(printed, photoSums, photo, t);
  const shaped = shapedCells(a, width, cells);
  if (shaped.length === 0) return 0;
  const count = (inView: readonly ShapedCell[], grid: Float32Array) => {
    const allowed = Math.floor(inView.length * (1 - atLeast));
    let missed = 0;
    for (const c of inView) if (cellMatch(c, a, grid, width, height) < CELL_MATCH && ++missed > allowed) break;
    return { missed, allowed, fit: 1 - missed / inView.length };
  };
  const flatView = visibleCells(shaped, photo, t);
  let flatFit = 0;
  if (flatView.length >= shaped.length * MIN_VISIBLE) {
    const flat = count(flatView, b);
    // A flat sheet stays flat: its map alone places it, as before #912.
    if (flat.missed <= flat.allowed) return flat.fit;
    flatFit = flat.fit;
  }
  // (A comparison of two prints, or of a near twin, is flat: no sheet is bent there.)
  if (atLeast !== MIN_PAGE_FIT || !bent) return flatFit;
  let best = 0;
  for (const levels of MESH_READS) {
    const mesh = sheetMesh(printed, a, b, shaped, photoSums, photo, t, pins, levels);
    if (!mesh) continue;
    const shape: SheetShape = (x, y) => meshAt(mesh, x, y);
    const view = visibleCells(shaped, photo, t, shape);
    if (view.length < shaped.length * MIN_VISIBLE) continue;
    const fitted = count(view, fitGrids(printed, photoSums, photo, t, shape).b);
    if (fitted.missed <= fitted.allowed) { if (found) found.mesh = mesh; return fitted.fit; }
    best = Math.max(best, fitted.fit);
  }
  return Math.max(flatFit, best);
}

/** A grid averaged down by k in each direction. */
function shrink(g: Float32Array, w: number, h: number, k: number): { g: Float32Array; w: number; h: number } {
  const W = Math.floor(w / k), H = Math.floor(h / k), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += g[(y * k + j) * w + x * k + i];
    out[y * W + x] = s / (k * k);
  }
  return { g: out, w: W, h: H };
}

/**
 * A patch that placed itself: its node, its shift, and how much its print says in each direction (its structure tensor
 * [xx, xy, yy], scaled so its stronger direction is 1). A patch of one straight line says where it is across the line
 * only: along the line it matches anywhere.
 */
interface Anchor { i: number; j: number; dx: number; dy: number; s: [number, number, number] }

/**
 * Where each node's patch of print sits in the photo's grid: the shift, within `reach`, at which the patch correlates best
 * (to a fraction of a pixel), for patches that print something and match at least MESH_MATCH. `printed`: how many nodes'
 * patches print something. Patches at the page's edge are moved inside it.
 */
function matchPatches(a: Float32Array, b: Float32Array, w: number, h: number, nodes: readonly { i: number; j: number; x: number; y: number }[], size: number, reach: number, scale: number, match = MESH_MATCH): { anchors: Anchor[]; printed: number } {
  const W = w + 1, sums = new Float64Array(W * (h + 1)), squares = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0, rowSq = 0;
    for (let x = 0; x < w; x++) {
      const v = b[y * w + x];
      row += v; rowSq += v * v;
      sums[(y + 1) * W + x + 1] = sums[y * W + x + 1] + row; squares[(y + 1) * W + x + 1] = squares[y * W + x + 1] + rowSq;
    }
  }
  const box = (s: Float64Array, x: number, y: number) => s[(y + size) * W + x + size] - s[y * W + x + size] - s[(y + size) * W + x] + s[y * W + x];
  const n = size * size, anchors: Anchor[] = [];
  let printed = 0;
  const scores = new Float64Array((2 * reach + 1) * (2 * reach + 1));
  for (const node of nodes) {
    if (size > w || size > h) break;
    const x0 = Math.max(0, Math.min(w - size, Math.round(node.x - size / 2))), y0 = Math.max(0, Math.min(h - size, Math.round(node.y - size / 2)));
    let sumA = 0, sumAA = 0;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const v = a[(y0 + j) * w + x0 + i]; sumA += v; sumAA += v * v; }
    const spreadA = n * sumAA - sumA * sumA;
    if (spreadA < n * n * FLAT_SPREAD) continue;
    printed++;
    let best = -Infinity, bx = 0, by = 0;
    scores.fill(-Infinity);
    for (let sy = -reach; sy <= reach; sy++) for (let sx = -reach; sx <= reach; sx++) {
      const x = x0 + sx, y = y0 + sy;
      if (x < 0 || y < 0 || x + size > w || y + size > h) continue;
      const sumB = box(sums, x, y), spreadB = n * box(squares, x, y) - sumB * sumB;
      if (spreadB <= 0) continue;
      let sumAB = 0;
      for (let j = 0; j < size; j++) {
        const ra = (y0 + j) * w + x0, rb = (y + j) * w + x;
        for (let i = 0; i < size; i++) sumAB += a[ra + i] * b[rb + i];
      }
      const r = (n * sumAB - sumA * sumB) / Math.sqrt(spreadA * spreadB);
      scores[(sy + reach) * (2 * reach + 1) + sx + reach] = r;
      if (r > best) best = r;
    }
    if (best < match) continue;
    // Of places that match about as well, the nearer: print that repeats, as lines of text do, is not taken a line away.
    let chosen = -Infinity;
    for (let sy = -reach; sy <= reach; sy++) for (let sx = -reach; sx <= reach; sx++) {
      const v = scores[(sy + reach) * (2 * reach + 1) + sx + reach] - MESH_DISTANCE_COST * scale * Math.hypot(sx, sy);
      if (v > chosen) { chosen = v; bx = sx; by = sy; }
    }
    // A patch already where the reads before put it stays there unless another place is clearly better.
    if (scores[reach * (2 * reach + 1) + reach] >= best - MESH_STAY) { bx = 0; by = 0; }
    if (scores[(by + reach) * (2 * reach + 1) + bx + reach] < match) continue;
    // A fraction of a pixel, from the curve of the correlation around its best place.
    const at = (sx: number, sy: number) => Math.abs(sx) > reach || Math.abs(sy) > reach ? -Infinity : scores[(sy + reach) * (2 * reach + 1) + sx + reach];
    const part = (l: number, m: number, r: number) => (Number.isFinite(l) && Number.isFinite(r) && l - 2 * m + r < 0 ? Math.max(-0.5, Math.min(0.5, (l - r) / (2 * (l - 2 * m + r)))) : 0);
    const c = at(bx, by);
    let xx = 0, xy = 0, yy = 0;
    for (let j = 1; j < size - 1; j++) for (let i = 1; i < size - 1; i++) {
      const o = (y0 + j) * w + x0 + i, gx = a[o + 1] - a[o - 1], gy = a[o + w] - a[o - w];
      xx += gx * gx; xy += gx * gy; yy += gy * gy;
    }
    const strongest = (xx + yy) / 2 + Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy);
    if (!(strongest > 0)) continue;
    const s: [number, number, number] = [xx / strongest, xy / strongest, yy / strongest];
    anchors.push({ i: node.i, j: node.j, dx: bx + part(at(bx - 1, by), c, at(bx + 1, by)), dy: by + part(at(bx, by - 1), c, at(bx, by + 1)), s });
  }
  return { anchors, printed };
}

/** The anchors their neighbours agree with: one sheet bends smoothly, and a patch that found other print stands alone. */
function agreeing(anchors: readonly Anchor[], tolerance: number): Anchor[] {
  let kept = [...anchors];
  for (let round = 0; round < 2; round++) {
    const at = new Map(kept.map((k) => [`${k.i},${k.j}`, k]));
    const median = (v: number[]) => { const s = [...v].sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    kept = kept.filter((k) => {
      for (const reach of [1, 2]) {
        const near: Anchor[] = [];
        for (let dj = -reach; dj <= reach; dj++) for (let di = -reach; di <= reach; di++) {
          const o = (di || dj) ? at.get(`${k.i + di},${k.j + dj}`) : undefined;
          if (o) near.push(o);
        }
        if (near.length < MESH_NEIGHBOURS) continue;
        // Measured in the directions the patch's print says something about.
        const ex = k.dx - median(near.map((o) => o.dx)), ey = k.dy - median(near.map((o) => o.dy));
        return Math.sqrt(Math.max(0, k.s[0] * ex * ex + 2 * k.s[1] * ex * ey + k.s[2] * ey * ey)) <= tolerance;
      }
      return false;
    });
  }
  return kept;
}

/** A shift at every node: the anchors' own, and from the nearest anchors for a node without one. */
function filled(columns: number, rows: number, anchors: readonly Anchor[]): { dx: Float64Array; dy: Float64Array } {
  const dx = new Float64Array(columns * rows), dy = new Float64Array(columns * rows), known = new Uint8Array(columns * rows);
  for (const k of anchors) { const at = k.j * columns + k.i; dx[at] = k.dx; dy[at] = k.dy; known[at] = 1; }
  for (let left = columns * rows - anchors.length; left > 0;) {
    const now = known.slice();
    let added = 0;
    for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
      const at = j * columns + i;
      if (now[at]) continue;
      let sx = 0, sy = 0, n = 0;
      for (let b = Math.max(0, j - 1); b <= Math.min(rows - 1, j + 1); b++) for (let c = Math.max(0, i - 1); c <= Math.min(columns - 1, i + 1); c++) {
        if (now[b * columns + c]) { sx += dx[b * columns + c]; sy += dy[b * columns + c]; n++; }
      }
      if (n) { dx[at] = sx / n; dy[at] = sy / n; known[at] = 1; added++; }
    }
    if (!added) break;
    left -= added;
  }
  return { dx, dy };
}

/** A mark the sheet is pinned to: a page point (page image pixels) and where the photo shows it, as a shift from the map. */
interface Pin { x: number; y: number; dx: number; dy: number }
/** How much a mark in view counts on the mesh, against one patch's strongest direction. */
const MESH_PIN = 4;

/** How stiff the sheet is between nodes, against what each patch says: a sheet bends smoothly, and one patch cannot fold it. */
const MESH_STIFFNESS = 0.005;
/** How much a sheet resists bending between nodes, against what each patch says. */
const MESH_BENDING = 0.2;
const MESH_SWEEPS = 200;

/**
 * The smooth shift at every node that best follows the anchors, each in the directions its print says something about,
 * with the sheet's stiffness between neighbouring nodes. A node with no anchor follows its neighbours; a patch of one line
 * moves the sheet only across that line.
 */
function smoothField(columns: number, rows: number, anchors: readonly Anchor[]): { dx: Float64Array; dy: Float64Array } {
  const { dx, dy } = filled(columns, rows, anchors);
  const data = new Map(anchors.map((k) => [k.j * columns + k.i, k]));
  for (let sweep = 0; sweep < MESH_SWEEPS; sweep++) {
    for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
      const at = j * columns + i;
      let n = 0, sx = 0, sy = 0;
      for (const [b, c] of [[j - 1, i], [j + 1, i], [j, i - 1], [j, i + 1]]) {
        if (b < 0 || c < 0 || b >= rows || c >= columns) continue;
        sx += dx[b * columns + c]; sy += dy[b * columns + c]; n++;
      }
      let a11 = MESH_STIFFNESS * n, a12 = 0, a22 = MESH_STIFFNESS * n, r1 = MESH_STIFFNESS * sx, r2 = MESH_STIFFNESS * sy;
      // Bending: each run of three nodes in a row or a column that holds this node wants to stay straight, so a sheet's
      // curl carries on past the last patch that placed itself instead of flattening out.
      for (const [di, dj] of [[1, 0], [0, 1]]) for (const c of [-1, 0, 1]) {
        const ci = i + c * di, cj = j + c * dj;
        if (ci - di < 0 || cj - dj < 0 || ci + di >= columns || cj + dj >= rows) continue;
        const w = c === 0 ? -2 : 1;
        let ox = 0, oy = 0;
        for (const [m, wm] of [[-1, 1], [0, -2], [1, 1]] as const) {
          const at2 = (cj + m * dj) * columns + ci + m * di;
          if (at2 === at) continue;
          ox += wm * dx[at2]; oy += wm * dy[at2];
        }
        a11 += MESH_BENDING * w * w; a22 += MESH_BENDING * w * w; r1 -= MESH_BENDING * w * ox; r2 -= MESH_BENDING * w * oy;
      }
      const k = data.get(at);
      if (k) {
        a11 += k.s[0]; a12 += k.s[1]; a22 += k.s[2];
        r1 += k.s[0] * k.dx + k.s[1] * k.dy; r2 += k.s[1] * k.dx + k.s[2] * k.dy;
      }
      const det = a11 * a22 - a12 * a12;
      if (det <= 1e-12) continue;
      dx[at] = (a22 * r1 - a12 * r2) / det; dy[at] = (a11 * r2 - a12 * r1) / det;
    }
  }
  return { dx, dy };
}

/**
 * How a sheet that is not flat sits (#912), part by part: each node's patch of print is found in the photo, read by read
 * from coarse to fine (`levels`, one of MESH_READS), and kept only where it matches well and its neighbours agree. The
 * field between kept patches is smooth (smoothField) and pinned to the marks in view. Null when too few parts of the page
 * can place themselves, as on another page, which has no consistent set of places that holds this page's print.
 */
function sheetMesh(printed: PrintedInk, a: Float32Array, b: Float32Array, shaped: readonly ShapedCell[], photoSums: Uint32Array, photo: { width: number; height: number }, t: Transform, pins: readonly Pin[], levels: (typeof MESH_READS)[number]): Mesh | null {
  const { width, height } = printed;
  const columns = Math.ceil(width / MESH_STEP) + 1, rows = Math.ceil(height / MESH_STEP) + 1;
  // The marks in view hold the sheet's corners where they are: anchors that say as much as any patch, in every direction.
  const pinned = (residual: (at: number) => Point): Anchor[] => pins.map((p) => {
    const i = Math.max(0, Math.min(columns - 1, Math.round(p.x / 2 / MESH_STEP))), j = Math.max(0, Math.min(rows - 1, Math.round(p.y / 2 / MESH_STEP)));
    const r = residual(j * columns + i);
    return { i, j, dx: p.dx / 2 - r.x, dy: p.dy / 2 - r.y, s: [MESH_PIN, 0, MESH_PIN] };
  });
  // Every node: a patch of blank paper places nothing (matchPatches), while a pale answer box, which says nothing about which
  // page it is, still says where its part of the sheet is, and the answers are what the crops must hold.
  const nodes = (k: number) => {
    const out: { i: number; j: number; x: number; y: number }[] = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) out.push({ i, j, x: (i * MESH_STEP) / k, y: (j * MESH_STEP) / k });
    return out;
  };
  // In page pixels: the grid is half the page image.
  // (To a tenth of a page pixel: what is stored with the calibration.)
  const meshOf = (dx: Float64Array, dy: Float64Array): Mesh => ({ step: MESH_STEP * 2, columns, rows, dx: Array.from(dx, (v) => Math.round(v * 20) / 10), dy: Array.from(dy, (v) => Math.round(v * 20) / 10) });
  const dx = new Float64Array(columns * rows), dy = new Float64Array(columns * rows);
  for (const [n, level] of levels.entries()) {
    // Each read on the photo as the reads before it placed the sheet, at its own scale: a coarse one first, where repeated
    // print (lines of text, rows of boxes) blurs into one shape and cannot be taken a line away.
    const mesh = meshOf(dx, dy);
    const seen = n === 0 ? b : fitGrids(printed, photoSums, photo, t, (x, y) => meshAt(mesh, x, y)).b;
    const sa = level.scale === 1 ? { g: a, w: width, h: height } : shrink(a, width, height, level.scale);
    const sb = level.scale === 1 ? { g: seen, w: width, h: height } : shrink(seen, width, height, level.scale);
    const read = matchPatches(sa.g, sb.g, sa.w, sa.h, nodes(level.scale), level.patch, level.reach, level.scale, level.match);
    const kept = agreeing(read.anchors, level.agree / level.scale).map((k) => ({ ...k, dx: k.dx * level.scale, dy: k.dy * level.scale }));
    if (read.printed === 0 || kept.length < read.printed * MESH_MIN_ANCHORS) return null;
    const pinnedHere = pinned((at) => ({ x: dx[at], y: dy[at] }));
    const step = smoothField(columns, rows, [...kept.filter((k) => !pinnedHere.some((p) => p.i === k.i && p.j === k.j)), ...pinnedHere]);
    for (let k = 0; k < dx.length; k++) { dx[k] += step.dx[k]; dy[k] += step.dy[k]; }
  }
  return meshOf(dx, dy);
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
export function sheetChecker(o: { photo: Raster; printed: Raster; transform: Transform; writing?: readonly Box[]; sheet?: { bend?: Bend; mesh?: Mesh } }): (others: readonly Raster[]) => SheetCheck {
  const self = preparedPrinted(o.printed), { greySums } = preparedPhoto(o.photo);
  // A bent sheet is read where its calibration aligned it (#912), each part in its place.
  const shape = o.sheet ? sheetShape(o.sheet, self.source) : undefined;
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
      if (!grids) { const g = fitGrids(self, greySums, o.photo, o.transform, shape); grids = { ...g, contrast: contrastTiles(g.a, g.b, width, height) }; }
      const { a, b, contrast } = grids;
      const theirs = fitGrids(other, greySums, o.photo, o.transform, shape).a;
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
function qrBound(photo: Raster, sheetMap: Transform, printed: FoundQr, grid: QrGrid | null, page: { width: number; height: number }, mesh?: Mesh): boolean {
  const b = boundsOf(printed.corners), size = Math.max(b.width, b.height);
  const x = Math.max(0, b.x - QR_WINDOW * size), y = Math.max(0, b.y - QR_WINDOW * size);
  const window = { x, y, width: Math.min(page.width, b.x + b.width + QR_WINDOW * size) - x, height: Math.min(page.height, b.y + b.height + QR_WINDOW * size) - y };
  // On a bent sheet (#912), the map where the code is: the window's corners through the sheet's mesh. The code must still
  // be within the same tolerance of where the page printed it; the mesh comes from the print around it, not from the code.
  const corners = [{ x: window.x, y: window.y }, { x: window.x + window.width, y: window.y }, { x: window.x + window.width, y: window.y + window.height }, { x: window.x, y: window.y + window.height }];
  const t = mesh ? perspectiveTransform(corners, corners.map((p) => applyTransform(sheetMap, meshAt(mesh, p.x, p.y)))) ?? sheetMap : sheetMap;
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

/** The upload's zoomed windows (scan-photo-image.ts): half the photo's width and height, by where they start, lower first. */
const QR_ZOOM_WINDOWS = [[0, 0.5], [0.25, 0.5], [0.5, 0.5], [0, 0.25], [0.25, 0.25], [0.5, 0.25], [0, 0], [0.25, 0], [0.5, 0]] as const;
const photoQrCache = new WeakMap<Raster, FoundQr | null>();

/**
 * The photo's code wherever it is, in photo pixels, as the upload reads it: the whole photo, then its zoomed windows. Only
 * for a page whose corner marks do not place it: the code's corners then place the page (#912).
 */
function photoQr(photo: Raster): FoundQr | null {
  if (photoQrCache.has(photo)) return photoQrCache.get(photo)!;
  let found = wholePhotoQr(photo);
  const width = Math.floor(photo.width / 2), height = Math.floor(photo.height / 2);
  for (const [sx, sy] of found || width < 16 || height < 16 ? [] : QR_ZOOM_WINDOWS) {
    const x0 = Math.min(Math.round(sx * photo.width), photo.width - width), y0 = Math.min(Math.round(sy * photo.height), photo.height - height);
    const read = readQr(enlarged(photoBox(photo, { x: x0, y: y0, width, height }), QR_ZOOM), "attemptBoth");
    if (read) { found = { ...read, corners: read.corners.map((c) => ({ x: x0 + c.x / QR_ZOOM, y: y0 + c.y / QR_ZOOM })) }; break; }
  }
  photoQrCache.set(photo, found);
  return found;
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
 * Placing a page by its QR code (#912), for a photo whose four marks do not place it: the code's corners give a first map,
 * and the printed page then corrects it, from patches near the code outward, each round reading twice as far (in page
 * pixels from the code's middle) with the map the previous round fitted.
 */
const QR_PLACE_ROUNDS = [320, 640, 1280, Infinity];
/** Patches that must place themselves in each round of placing a page by its code. */
const QR_PLACE_MIN_PATCHES = 8;
/** A scan mark's arm, as a part of the page image's width: what tells a mark cut off by the photo's edge from one in view. */
const MARK_ARM = 0.022;
/** How near a mark in view must be to where the placed page puts it, in arms. */
const MARK_NEAR = 3;
/** How far a mark's arms may point from the page's edges where the placed sheet puts them: 30 degrees. */
const MARK_ALIGNMENT = Math.cos((30 * Math.PI) / 180);
/** How much more a mark found in view counts in the placement's map than one patch of print. */
const MARK_WEIGHT = 10;

interface QrPlacement { t: Transform; turns: 0 | 1 | 2 | 3; fit: number; mesh?: Mesh; marks: Point[]; missing: ScanMark[] }

/**
 * A page placed by its QR code and its print, when its four marks cannot place it: a mark cut off by the photo's edge, or
 * marks a curled sheet holds out of line. The code read anywhere in the photo must be this page's; every mark that the
 * placement puts inside the photo must be there, as a scan mark, and is used; and the page's print must follow, as with
 * four marks (pageFit, MIN_PAGE_FIT, the cells in view). The caller still requires the code where the page printed it.
 * Null when the page cannot be placed this way: the caller's refusal stands.
 */
function placedByQr(photo: Raster, printedQr: FoundQr, ink: PrintedInk, greySums: Uint32Array, shapes: readonly MarkShape[], stored: readonly Point[], page: { width: number; height: number }): QrPlacement | null {
  const code = photoQr(photo);
  if (!code || code.link !== printedQr.link) return null;
  // The code is small: its corners say where it is, how large and which way up, and only the print can say more.
  let t = fitLinear(printedQr.corners, code.corners, "similarity");
  if (!t) return null;
  const { width, height } = ink;
  const columns = Math.ceil(width / MESH_STEP) + 1, rows = Math.ceil(height / MESH_STEP) + 1;
  const middle = { x: printedQr.corners.reduce((s, c) => s + c.x, 0) / 4, y: printedQr.corners.reduce((s, c) => s + c.y, 0) / 4 };
  let pairs: { from: Point; to: Point }[] = [];
  for (const [round, reach] of QR_PLACE_ROUNDS.entries()) {
    // A part of the page fits a simpler map than the whole: a projective map only once the print around is all read.
    const fit = (from: Point[], to: Point[]) => round < 2 ? fitLinear(from, to, "similarity") : round < 3 ? fitLinear(from, to, "affine") : fitTransform(from, to);
    const { a, b } = fitGrids(ink, greySums, photo, t);
    const sa = shrink(a, width, height, MESH_COARSE), sb = shrink(b, width, height, MESH_COARSE);
    const nodes: { i: number; j: number; x: number; y: number }[] = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
      if (Math.hypot(i * MESH_STEP * 2 - middle.x, j * MESH_STEP * 2 - middle.y) <= reach) nodes.push({ i, j, x: (i * MESH_STEP) / MESH_COARSE, y: (j * MESH_STEP) / MESH_COARSE });
    }
    const kept = agreeing(matchPatches(sa.g, sb.g, sa.w, sa.h, nodes, MESH_COARSE_PATCH, MESH_REACH, MESH_COARSE).anchors, MESH_AGREE_COARSE / MESH_COARSE);
    if (kept.length < QR_PLACE_MIN_PATCHES) return null;
    const by = MESH_COARSE * 2;
    pairs = kept.map((k) => {
      const from = { x: k.i * MESH_STEP * 2, y: k.j * MESH_STEP * 2 };
      return { from, to: applyTransform(t!, { x: from.x + k.dx * by, y: from.y + k.dy * by }) };
    });
    let next = fit(pairs.map((p) => p.from), pairs.map((p) => p.to));
    if (!next) return null;
    // Once more without the patches the map leaves furthest out.
    const errors = pairs.map((p) => distance(applyTransform(next!, p.from), p.to)), cut = Math.max(4, 3 * [...errors].sort((x, y) => x - y)[errors.length >> 1]);
    const close = pairs.filter((_, k) => errors[k] <= cut);
    if (close.length >= QR_PLACE_MIN_PATCHES) { pairs = close; next = fit(pairs.map((p) => p.from), pairs.map((p) => p.to)) ?? next; }
    t = next;
  }
  // The print first: the page must follow, part by part, before any mark is looked for.
  const first: { mesh?: Mesh } = {};
  const firstFit = pageFit(ink, greySums, photo, t, MIN_PAGE_FIT, first);
  // Every mark the placed sheet puts inside the photo must be there, an L whose arms run along the page's edges from it;
  // a mark at or past the photo's edge is cut off.
  const at = (p: Point) => photoPointOf(t!, first.mesh, p);
  const scale = distance(at({ x: 0, y: page.height / 2 }), at({ x: page.width, y: page.height / 2 })) / page.width;
  const arm = MARK_ARM * page.width * scale;
  const found: { at: number; corner: Point }[] = [], missing: ScanMark[] = [];
  for (let k = 0; k < 4; k++) {
    const p = at(stored[k]);
    const inward = { x: stored[k].x < page.width / 2 ? 1 : -1, y: stored[k].y < page.height / 2 ? 1 : -1 };
    // The L points inward. A corner near an edge does not mean that either arm is cut off. Check the transformed L's
    // perimeter, including its stroke width, rather than a full arm-length band outside each side of the corner.
    const length = MARK_ARM * page.width, stroke = length / 5;
    const footprint = [[0, 0], [length, 0], [length, stroke], [stroke, stroke], [stroke, length], [0, length]];
    const inPhoto = footprint.every(([x, y], i) => {
      const next = footprint[(i + 1) % footprint.length];
      return Array.from({ length: 9 }, (_, step) => {
        const q = at({ x: stored[k].x + inward.x * (x + (next[0] - x) * step / 8),
          y: stored[k].y + inward.y * (y + (next[1] - y) * step / 8) });
        return q.x > 0 && q.y > 0 && q.x < photo.width - 1 && q.y < photo.height - 1;
      }).every(Boolean);
    });
    if (!inPhoto) { missing.push(SCAN_MARKS[k]); continue; }
    const arms = [unit(p, at({ x: stored[k].x + inward.x * 50, y: stored[k].y })), unit(p, at({ x: stored[k].x, y: stored[k].y + inward.y * 50 }))];
    let nearest: MarkShape | null = null;
    for (const s of shapes) {
      if (distance(s.corner, p) > MARK_NEAR * arm || (nearest && distance(s.corner, p) >= distance(nearest.corner, p))) continue;
      if (s.arm < 0.5 * arm || s.arm > 2 * arm) continue;
      const tips = s.tips.map((tip) => unit(s.corner, tip));
      if (arms.every((d) => tips.some((e) => dot(d, e) >= MARK_ALIGNMENT))) nearest = s;
    }
    if (!nearest) return null;
    found.push({ at: k, corner: nearest.corner });
  }
  let placed: Transform | null = t, sheet = first, fit = firstFit;
  if (!found.length && fit < MIN_PAGE_FIT) return null;
  if (found.length) {
    // The marks in view place the sheet's corners: fitted with the print, then the print compared again.
    placed = fitTransform([...pairs.map((p) => p.from), ...found.map((f) => stored[f.at])], [...pairs.map((p) => p.to), ...found.map((f) => f.corner)],
      [...pairs.map(() => 1), ...found.map(() => MARK_WEIGHT)]);
    if (!placed) return null;
    sheet = {};
    const back = invert(placed);
    if (!back) return null;
    const pins = found.map((f) => { const q = applyTransform(back, f.corner); return { ...stored[f.at], dx: q.x - stored[f.at].x, dy: q.y - stored[f.at].y }; });
    fit = pageFit(ink, greySums, photo, placed, MIN_PAGE_FIT, sheet, pins);
    if (fit < MIN_PAGE_FIT) return null;
  }
  // Which way up: the page's own rightward direction in the photo, in clockwise quarter turns.
  const right = { x: applyTransform(placed, { x: page.width, y: page.height / 2 }).x - applyTransform(placed, { x: 0, y: page.height / 2 }).x, y: applyTransform(placed, { x: page.width, y: page.height / 2 }).y - applyTransform(placed, { x: 0, y: page.height / 2 }).y };
  const turns = (((Math.round(Math.atan2(right.y, right.x) / (Math.PI / 2)) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  const marks = stored.map((s, k) => found.find((f) => f.at === k)?.corner ?? photoPointOf(placed, sheet.mesh, s));
  return { t: placed, turns, fit, ...(sheet.mesh ? { mesh: sheet.mesh } : {}), marks, missing };
}

const photoPointOf = (t: Transform, mesh: Mesh | undefined, p: Point) => applyTransform(t, mesh ? meshAt(mesh, p.x, p.y) : p);

/**
 * Finds the scan marks in a photo and maps it to the contract: the photo's own marks and the stored mark points only. A
 * photo with no contract, or of another revision (printContractForPhoto), gets none. `pageLink`: the page's own QR link.
 * `writing`: where a child writes on this page, which says nothing about which page it is. This says the sheet is this
 * page's by its marks, ink and code. Pages that differ by a few digits pass all three for each other, so the crop job then
 * asks sheetChecker about the child's other pages, a few at a time.
 *
 * A sheet that is not flat is aligned part by part (pageFit, #912). A photo whose four marks do not place the page, as when
 * the photo's edge cuts one off, is placed by its QR code and print instead (placedByQr), never by a mark that is in view
 * but missing: a covered mark still refuses.
 */
export function calibratePhoto(o: { photo: Raster; printed: Raster; contract: PhotoContract; pageLink: string; writing?: readonly Box[] }): CalibrationResult {
  if (o.contract.status !== "available") return { status: "unavailable", reason: o.contract.reason };
  const { contract, revision } = o.contract;
  const { photo, printed } = o;
  // The code the page image printed: where it sits comes from the image the contract fingerprints, never from a template.
  const prepared = preparedPrinted(printed);
  const printedQr = prepared.qr;
  if (!printedQr || printedQr.link !== o.pageLink) return { status: "refused", reason: "qr-mismatch" };
  const { greySums, quads, shapes } = preparedPhoto(photo);
  const ink = printedInk(prepared, [...(o.writing ?? []), boundsOf(printedQr.corners)]);
  const stored = SCAN_MARKS.map((m) => contract.marks.points[m]);
  const pageSize = contract.coordinates.image;
  let refusal: CalibrationRefusal = quads.length === 0 ? "marks-missing" : "marks-inconsistent";
  const followers: { order: MarkShape[]; t: Transform; turns: 0 | 1 | 2 | 3; fit: number; mesh?: Mesh; next: number | null }[] = [];
  // Flat first, every rectangle and way up; only when no rectangle follows the page flat is a bent sheet tried (#912). A
  // rectangle that is not the page's own marks must never pass by bending it, as when the real page passes flat.
  for (const bent of [false, true]) for (const quad of followers.length ? [] : quads) {
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
      const found: { mesh?: Mesh } = {};
      const fit = pageFit(ink, greySums, photo, t, MIN_PAGE_FIT, found, stored.map((p) => ({ ...p, dx: 0, dy: 0 })), bent);
      return [{ turns, order, t, fit, ...(found.mesh ? { mesh: found.mesh } : {}) }];
    }).sort((a, b) => b.fit - a.fit);
    if (ways.length === 0) continue;
    const best = ways[0];
    if (best.fit < MIN_PAGE_FIT) { refusal = "page-mismatch"; continue; }
    followers.push({ ...best, next: ways[1]?.fit ?? null });
  }
  // Two sheets in one photo: which one was meant cannot be known, whichever shows its code.
  if (followers.length > 1) return { status: "refused", reason: "ambiguous-page" };
  const calibration = (c: { t: Transform; turns: 0 | 1 | 2 | 3; fit: number; mesh?: Mesh; marks: Point[] }, more: Partial<Calibration> = {}): CalibrationResult => {
    if (!qrBound(photo, c.t, printedQr, prepared.qrGrid, pageSize, c.mesh)) return { status: "refused", reason: "qr-mismatch" };
    return {
      status: "calibrated",
      calibration: {
        version: CALIBRATION_VERSION, revision, photo: { width: photo.width, height: photo.height },
        marks: Object.fromEntries(SCAN_MARKS.map((m, i) => [m, c.marks[i]])) as Record<ScanMark, Point>,
        transform: c.t, quarterTurns: c.turns, pageFit: Math.round(c.fit * 1000) / 1000,
        ...(c.mesh ? { mesh: c.mesh } : {}), ...more,
      },
    };
  };
  // Placed by its code only when four marks did not line up as a page: a page whose marks did, but whose print does not
  // follow, is another page.
  if (followers.length === 0 && (refusal === "marks-missing" || refusal === "marks-inconsistent")) {
    const placed = placedByQr(photo, printedQr, ink, greySums, shapes, stored, pageSize);
    return placed ? calibration(placed, { placedBy: "qr", missingMarks: placed.missing }) : { status: "refused", reason: refusal };
  }
  if (followers.length === 0) return { status: "refused", reason: refusal };
  const [best] = followers;
  // Two ways up that both follow the page: the marks alone cannot say which is right.
  if (best.next !== null && best.next >= MIN_PAGE_FIT) return { status: "refused", reason: "orientation-unclear" };
  return calibration({ ...best, marks: best.order.map((m) => m.corner) });
}

/** A stored calibration, only for a photo of its own revision. Version 1 keeps the earlier complete-page format. */
export const calibrationForPhoto = (c: Calibration, photo: { printedRevision: string | null }): Calibration | null =>
  (c.revision === photo.printedRevision && (c.version === 1 || c.version === CALIBRATION_VERSION) ? c : null);

// ---------- Cutting the page ----------

/** A box of the page image, cut from the photo through the map, at `out` pixels. Pixels off the photo are white. */
export function warpBox(photo: Raster, t: Transform, box: Box, out: { width: number; height: number }, shape?: SheetShape): Raster {
  const { channels, width: w, height: h, data } = photo;
  const result = new Uint8Array(out.width * out.height * channels);
  const sx = box.width / out.width, sy = box.height / out.height;
  for (let oy = 0; oy < out.height; oy++) {
    const by = box.y + (oy + 0.5) * sy;
    for (let ox = 0; ox < out.width; ox++) {
      const bx = box.x + (ox + 0.5) * sx;
      const { x: px, y: py } = shape ? shape(bx, by) : { x: bx, y: by };
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
  return warpBox(photo, c.transform, { x: 0, y: 0, width, height }, { width, height }, sheetShape(c, { width, height }));
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
  const page = { width: iw, height: ih };
  const a = photoPoint(c, page, { x: x0, y: y0 }), b = photoPoint(c, page, { x: x1, y: y0 }), d = photoPoint(c, page, { x: x0, y: y1 });
  const scale = Math.min(CROP_MAX_SCALE, Math.max(1, Math.max(distance(a, b) / cut.width, distance(a, d) / cut.height)));
  const fit = Math.min(1, CROP_MAX_SIDE / (Math.max(cut.width, cut.height) * scale));
  return warpBox(photo, c.transform, cut, { width: Math.max(1, Math.round(cut.width * scale * fit)), height: Math.max(1, Math.round(cut.height * scale * fit)) }, sheetShape(c, page));
}

/**
 * Whether the photo holds all of what a crop of `box` shows (cropBox's cut, through the calibration's sheet and map), with
 * a pixel to spare. A crop of a box the photo's edge cuts would show white paper where the answer was cut off (#912): such
 * a question is not cropped and not marked from the photo.
 */
export function cropInPhoto(c: Pick<Calibration, "transform" | "bend" | "mesh" | "photo">, contract: PagePrintContract, box: Box): boolean {
  const margin = Math.min(CROP_MARGIN_LIMIT, CROP_MARGIN * Math.min(box.width, box.height));
  const page = contract.coordinates.image;
  const x0 = Math.max(0, box.x - margin), y0 = Math.max(0, box.y - margin);
  const x1 = Math.min(page.width, box.x + box.width + margin), y1 = Math.min(page.height, box.y + box.height + margin);
  const steps = 8;
  for (let k = 0; k <= steps; k++) {
    const u = x0 + ((x1 - x0) * k) / steps, v = y0 + ((y1 - y0) * k) / steps;
    for (const p of [{ x: u, y: y0 }, { x: u, y: y1 }, { x: x0, y: v }, { x: x1, y: v }]) {
      const q = photoPoint(c, page, p);
      if (!(q.x >= 1 && q.y >= 1 && q.x <= c.photo.width - 2 && q.y <= c.photo.height - 2)) return false;
    }
  }
  return true;
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
