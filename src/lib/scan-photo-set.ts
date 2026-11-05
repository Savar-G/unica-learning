// The synthetic photo set for the marking evaluation (#537, audit section 4 of
// .design/research/marking-audit-2026-11-04.md). It takes a printed page image of a seeded fake book with the page's
// print contract (#536: its scan marks and each question's answer regions), writes synthetic handwriting into known
// answer regions (right, wrong, blank, crossed out, messy) with a single-line stroke font, then makes it look like a
// phone photo (rotation, perspective, shadow, blur, low light, cut off, wrong page). Each photo has a truth file: the
// item IDs, the text written and the expected mark. The labels come from the code that drew the ink, so they are exact.
//
// What this does not prove: the handwriting is drawn by code from one stroke font with seeded jitter. It is not a
// child's handwriting, and a model that reads it well may still read real children's writing badly. Use it for
// workflow checks and for comparing models on identical photos, never as evidence of accuracy on real children.
//
// No child data: the pages come from fake books (made-up sample profiles), and no AI or database is used here.
// Pure TypeScript: no Next.js, React, network, database, clock or Math.random. The same input and seed give the same
// bytes. The command line tool is scripts/scan-photo-set.ts.
import { packageItem, type QuestionPackage } from "@/lib/question-package";
import { SCAN_MARKS, type Box, type Point, type PrintedRegion, type ScanMark } from "@/lib/workbook-print-contract";

export const PHOTO_TRUTH_VERSION = 1;

/** What a truth file says about where it came from, word for word in every file. */
export const SYNTHETIC_NOTE = "Synthetic handwriting drawn by code on a fake book page. It does not prove accuracy on real child handwriting.";

// ---------- Seeded randomness ----------

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Random {
  next(): number;
  range(lo: number, hi: number): number;
  int(lo: number, hi: number): number;
  pick<T>(xs: readonly T[]): T;
  normal(): number;
  shuffle<T>(xs: readonly T[]): T[];
}

/** A seeded random source (mulberry32): the same seed always gives the same numbers. */
export function seededRandom(seed: string): Random {
  let a = hashSeed(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r: Random = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    normal: () => {
      const u = Math.max(next(), 1e-9);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    },
    shuffle: (xs) => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
  return r;
}

/** Per-pixel noise in [0, 1) from a position and a seed, with no state. */
function pixelNoise(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------- Images ----------

/** A raw image: rows of RGB or RGBA bytes, top left first. */
export interface RawImage {
  width: number;
  height: number;
  channels: 3 | 4;
  data: Uint8Array;
}

const rgbCopy = (img: RawImage): RawImage => {
  const data = new Uint8Array(img.width * img.height * 3);
  for (let i = 0, j = 0; i < img.width * img.height; i++, j += img.channels) {
    data[i * 3] = img.data[j];
    data[i * 3 + 1] = img.data[j + 1];
    data[i * 3 + 2] = img.data[j + 2];
  }
  return { width: img.width, height: img.height, channels: 3, data };
};

// ---------- The page's questions ----------

/** One region of a question as the photo set reads it: a whole-number box is the only kind it writes in. */
export interface PageRegion {
  id: string;
  kind: string;
  /** Where it printed, in page image pixels; null when the page did not measure it. */
  box: Box | null;
  /** The answer key of a box that holds a whole number; null otherwise. */
  answer: number | null;
}

export interface PageQuestion {
  number: number;
  packageId: string;
  format: string;
  regions: PageRegion[];
}

/** A printed page: its image and its print contract's marks and regions, in the same image pixels. */
export interface PhotoPage {
  level: string;
  workbookId: string;
  page: number;
  /** The printed page ID (D-187), or null. */
  label: string | null;
  day: number | null;
  pageOfDay: number | null;
  /** SHA-256 of the page image the photo was made from. */
  imageSha256: string;
  image: RawImage;
  marks: Record<ScanMark, Point>;
  questions: PageQuestion[];
}

const wholeNumber = (v: unknown): number | null =>
  v && typeof v === "object" && (v as { type?: unknown }).type === "number" && Number.isInteger((v as { value?: unknown }).value)
    ? (v as { value: number }).value : null;

/** A page's questions from their packages and printed regions (`regions` by question number). */
export function pageQuestions(questions: readonly { number: number; package: QuestionPackage }[], regions: ReadonlyMap<number, readonly PrintedRegion[]>): PageQuestion[] {
  return questions.map((q) => {
    const item = packageItem(q.package);
    const printed = regions.get(q.number) ?? [];
    return {
      number: q.number, packageId: q.package.id, format: item.format,
      regions: item.regions.map((r) => ({
        id: r.id, kind: r.kind, box: printed.find((p) => p.id === r.id)?.box ?? null,
        answer: r.kind === "box" ? wholeNumber(r.answer) : null,
      })),
    };
  });
}

/**
 * The question the set writes an answer in: a write-number item whose one box holds a whole number and printed. The
 * marking slice (S4) marks only this format; every other question stays as printed.
 */
export function writableBox(q: PageQuestion): PageRegion | null {
  if (q.format !== "write-number") return null;
  const boxes = q.regions.filter((r) => r.kind === "box");
  return boxes.length === 1 && boxes[0].answer !== null && boxes[0].box ? boxes[0] : null;
}

/** Whether a page has enough to write on: at least `min` writable questions. */
export const writablePage = (questions: readonly PageQuestion[], min = 2) => questions.filter((q) => writableBox(q)).length >= min;

// ---------- Cases and effects ----------

export const ANSWER_CASES = ["right", "wrong", "blank", "crossed-out-right", "crossed-out-wrong", "messy-right", "messy-wrong"] as const;
export type AnswerCase = (typeof ANSWER_CASES)[number];

/** How often each case comes, out of 20: most answers are right, as on a real page. */
const CASE_DECK: AnswerCase[] = [
  ...Array<AnswerCase>(7).fill("right"), ...Array<AnswerCase>(4).fill("wrong"), ...Array<AnswerCase>(2).fill("blank"),
  ...Array<AnswerCase>(2).fill("crossed-out-right"), "crossed-out-wrong", ...Array<AnswerCase>(2).fill("messy-right"),
  ...Array<AnswerCase>(2).fill("messy-wrong"),
];

/**
 * The camera effect a photo is built around. Every photo also gets a small rotation, a little perspective, uneven light,
 * slight blur, sensor noise and JPEG compression.
 */
export const PHOTO_EFFECTS = ["plain", "rotation", "perspective", "shadow", "blur", "low-light", "cut-off", "wrong-page"] as const;
export type PhotoEffect = (typeof PHOTO_EFFECTS)[number];

export type ExpectedMark = "right" | "wrong" | "blank" | "not-visible" | "not-marked";

/** What the marking should do with the whole photo. */
export type ExpectedPhoto = "mark" | "cut-off" | "wrong-page";

/** One piece of text written in or near a box. */
export interface WrittenText {
  text: string;
  crossedOut: boolean;
  /** Where the child put it: in the box, or beside it (a correction with no room left). */
  placement: "in-box" | "right-of-box" | "left-of-box" | "above-box" | "below-box";
  /** Each character as drawn, in page image pixels. */
  glyphs: { char: string; box: Box }[];
  /** All of its ink (the cross-out lines too), in page image pixels. */
  inkBox: Box;
  /** The ink box's four corners in the photo, clockwise from the top left; null before the photo is taken. */
  photoQuad: Point[] | null;
}

export interface TruthRegion {
  id: string;
  kind: string;
  /** In page image pixels, as the print contract has it. */
  box: Box | null;
  /** Its four corners in the photo, clockwise from the top left; null when it did not print. */
  photoQuad: Point[] | null;
  /** How much of it is inside the photo. */
  visible: "full" | "partial" | "none" | null;
}

export interface TruthQuestion {
  number: number;
  packageId: string;
  format: string;
  /** "write": the set wrote in its box; "not-drawn": a format or answer the set leaves as printed. */
  scope: "write" | "not-drawn";
  /** The answer key of the box the set wrote in. */
  answer: string | null;
  answerRegion: string | null;
  case: AnswerCase | null;
  /** In the order written: a crossed-out answer first. */
  written: WrittenText[];
  /** The answer that counts: the last text not crossed out, or null when the box is blank. */
  finalText: string | null;
  expectedMark: ExpectedMark;
  regions: TruthRegion[];
}

export interface PhotoTruth {
  version: number;
  id: string;
  synthetic: true;
  note: string;
  seed: string;
  level: string;
  /** The page the photo shows. */
  source: { workbookId: string; page: number; label: string | null; day: number | null; pageOfDay: number | null; imageSha256: string };
  /** The page the photo is sent as: another page for a wrong-page photo. */
  submittedAs: { page: number; label: string | null };
  effect: PhotoEffect;
  expectedPhoto: ExpectedPhoto;
  photo: {
    width: number;
    height: number;
    /** The page's corners in the photo, clockwise from the top left. */
    pageCorners: Point[];
    marks: Record<ScanMark, Point & { visible: boolean }>;
    camera: { rotationDeg: number; keystone: number; blurSigma: number; light: number; shadow: number; noise: number };
  };
  questions: TruthQuestion[];
  /** Numbers written in work spaces: never an answer. */
  decoys: { question: number; region: string; text: string; inkBox: Box }[];
  /** Counts for a reader. */
  counts: Record<ExpectedMark, number>;
}

// ---------- The stroke font ----------

type Stroke = { points: [number, number][]; sharp?: boolean };

/** Digits as a child writes them: single-line strokes in a box 0.6 wide and 1 high, y down, 1 the baseline. */
const FONT: Record<string, Stroke[]> = {
  "0": [{ points: Array.from({ length: 15 }, (_, i): [number, number] => {
    const t = (i / 14) * 2 * Math.PI - Math.PI / 2 - 0.25;
    return [0.3 + 0.27 * Math.cos(t), 0.5 + 0.49 * Math.sin(t)];
  }) }],
  "1": [{ points: [[0.1, 0.24], [0.33, 0.0], [0.33, 1.0]], sharp: true }],
  "2": [{ points: [[0.05, 0.24], [0.16, 0.05], [0.33, 0.0], [0.5, 0.08], [0.55, 0.26], [0.44, 0.5], [0.05, 1.0], [0.6, 0.99]] }],
  "3": [{ points: [[0.06, 0.12], [0.26, 0.0], [0.47, 0.06], [0.52, 0.24], [0.27, 0.46], [0.52, 0.6], [0.56, 0.82], [0.4, 0.98], [0.18, 1.0], [0.02, 0.88]] }],
  "4": [{ points: [[0.44, 1.0], [0.44, 0.0], [0.02, 0.66], [0.6, 0.66]], sharp: true }],
  "5": [
    { points: [[0.12, 0.0], [0.08, 0.43], [0.3, 0.36], [0.5, 0.45], [0.57, 0.68], [0.47, 0.92], [0.25, 1.0], [0.03, 0.9]] },
    { points: [[0.12, 0.0], [0.54, 0.0]], sharp: true },
  ],
  "6": [{ points: [[0.48, 0.04], [0.3, 0.0], [0.12, 0.2], [0.04, 0.55], [0.08, 0.86], [0.28, 1.0], [0.5, 0.9], [0.56, 0.68], [0.42, 0.52], [0.22, 0.52], [0.06, 0.66]] }],
  "7": [{ points: [[0.02, 0.02], [0.58, 0.0], [0.2, 1.0]], sharp: true }],
  "8": [{ points: [[0.3, 0.48], [0.09, 0.32], [0.1, 0.1], [0.3, 0.0], [0.5, 0.1], [0.52, 0.3], [0.3, 0.48], [0.06, 0.68], [0.08, 0.9], [0.3, 1.0], [0.52, 0.9], [0.55, 0.68], [0.3, 0.48]] }],
  "9": [{ points: [[0.53, 0.22], [0.42, 0.03], [0.22, 0.01], [0.07, 0.17], [0.1, 0.4], [0.3, 0.48], [0.5, 0.38], [0.55, 0.2], [0.53, 0.6], [0.47, 1.0]] }],
  "-": [{ points: [[0.08, 0.55], [0.5, 0.55]], sharp: true }],
};

/** The characters the stroke font can write. */
export const FONT_CHARS = Object.keys(FONT);

/** A smooth path through points (Catmull-Rom, 6 steps a span). */
function smooth(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  const out: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < 6; s++) {
      const t = s / 6, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** One writer: how a made-up child holds the pencil for one photo. */
interface Writer {
  slant: number;
  height: number;
  width: number;
  jitter: number;
  spacing: number;
  ink: [number, number, number];
  opacity: number;
  pencil: boolean;
}

function writerFor(r: Random): Writer {
  const pencil = r.next() < 0.7;
  return {
    slant: r.range(-0.08, 0.28), height: r.range(0.5, 0.72), width: r.range(2.4, 3.8), jitter: r.range(0.012, 0.026),
    spacing: r.range(0.12, 0.3), pencil,
    ink: pencil ? [r.int(55, 80), r.int(55, 80), r.int(62, 88)] : r.pick([[28, 40, 120], [25, 25, 30]] as [number, number, number][]),
    opacity: pencil ? r.range(0.72, 0.9) : r.range(0.88, 0.97),
  };
}

interface InkPath { points: [number, number][]; width: number }

/** Lays out text at a glyph height, its left edge at x and baseline at y (page pixels), in one writer's hand. */
function layoutText(text: string, at: { x: number; baseline: number; height: number }, w: Writer, r: Random, messy: boolean) {
  const paths: InkPath[] = [];
  const glyphs: WrittenText["glyphs"] = [];
  let x = at.x;
  // The right edge of the last glyph's ink: the next glyph starts clear of it, so no digit runs into the next one and
  // every answer the truth names can be read, messy or not.
  let lastRight = -Infinity;
  for (const ch of text) {
    const strokes = FONT[ch];
    if (!strokes) throw new Error(`the stroke font has no ${ch}`);
    const h = at.height * (messy ? r.range(0.85, 1.2) : r.range(0.94, 1.06));
    const slant = w.slant + (messy ? r.normal() * 0.12 : r.normal() * 0.03);
    const tilt = messy ? r.normal() * 0.12 : r.normal() * 0.025;
    const jitter = w.jitter * (messy ? 2.6 : 1);
    const lift = (messy ? r.normal() * 0.12 : r.normal() * 0.03) * h;
    const base = at.baseline + lift;
    const cos = Math.cos(tilt), sin = Math.sin(tilt);
    const mine: InkPath[] = strokes.map((s) => {
      const raw = s.points.map(([px, py]): [number, number] => [px + r.normal() * jitter, py + r.normal() * jitter]);
      const points = (s.sharp ? raw : smooth(raw)).map(([px, py]): [number, number] => {
        const lx = (px + slant * (1 - py)) * h, ly = (py - 1) * h;
        return [x + lx * cos - ly * sin, base + lx * sin + ly * cos];
      });
      return { points, width: w.width * (messy ? r.range(0.9, 1.35) : r.range(0.95, 1.05)) };
    });
    const left = Math.min(...mine.flatMap((p) => p.points.map((q) => q[0] - p.width / 2)));
    const shift = Math.max(0, lastRight + w.width * 1.5 - left);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of mine) {
      p.points = p.points.map(([px, py]): [number, number] => [px + shift, py]);
      paths.push(p);
      for (const [px, py] of p.points) {
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      }
      lastRight = Math.max(lastRight, ...p.points.map((q) => q[0] + p.width / 2));
    }
    const pad = w.width;
    glyphs.push({ char: ch, box: { x: minX - pad, y: minY - pad, width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad } });
    x += shift + h * (0.6 + w.spacing + (messy ? r.range(0.02, 0.22) : r.range(-0.03, 0.05)));
  }
  return { paths, glyphs, advance: x - at.x };
}

/** The width text takes at a glyph height, before jitter. */
const textWidth = (text: string, height: number, w: Writer) => height * (text.length * 0.6 + (text.length - 1) * w.spacing + Math.max(0, w.slant));

const unionBox = (boxes: readonly Box[]): Box => {
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width)), bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
};

const pathBox = (paths: readonly InkPath[]): Box => unionBox(paths.map((p) => {
  const xs = p.points.map((q) => q[0]), ys = p.points.map((q) => q[1]);
  return { x: Math.min(...xs) - p.width, y: Math.min(...ys) - p.width, width: Math.max(...xs) - Math.min(...xs) + 2 * p.width, height: Math.max(...ys) - Math.min(...ys) + 2 * p.width };
}));

// ---------- Drawing ink on the page ----------

/** Draws a thick, soft-edged pencil or pen line into an RGB image, darkening it toward the ink. */
function drawPaths(img: RawImage, paths: readonly InkPath[], w: Writer, grainSeed: number) {
  if (paths.length === 0) return;
  // (The coverage buffer spans only the strokes' own area, never the whole page.)
  const area = pathBox(paths);
  const ox = Math.max(0, Math.floor(area.x) - 2), oy = Math.max(0, Math.floor(area.y) - 2);
  const aw = Math.max(1, Math.min(img.width, Math.ceil(area.x + area.width) + 2) - ox), ah = Math.max(1, Math.min(img.height, Math.ceil(area.y + area.height) + 2) - oy);
  const alpha = new Float32Array(aw * ah);
  const touched: number[] = [];
  for (const p of paths) {
    for (let i = 0; i < p.points.length - 1; i++) {
      const [ax, ay] = p.points[i], [bx, by] = p.points[i + 1];
      // (Pressure: the line is a little thinner at the ends of a stroke.)
      const t = i / Math.max(1, p.points.length - 2);
      const half = (p.width / 2) * (0.82 + 0.18 * Math.sin(Math.PI * t));
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - half - 1)), x1 = Math.min(img.width - 1, Math.ceil(Math.max(ax, bx) + half + 1));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - half - 1)), y1 = Math.min(img.height - 1, Math.ceil(Math.max(ay, by) + half + 1));
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1e-9;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const u = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / len2));
          const ex = x + 0.5 - (ax + u * dx), ey = y + 0.5 - (ay + u * dy);
          const cover = Math.max(0, Math.min(1, half + 0.5 - Math.sqrt(ex * ex + ey * ey)));
          if (cover <= 0) continue;
          if (x < ox || y < oy || x >= ox + aw || y >= oy + ah) continue;
          const k = (y - oy) * aw + (x - ox);
          if (alpha[k] === 0) touched.push(k);
          if (cover > alpha[k]) alpha[k] = cover;
        }
      }
    }
  }
  for (const k of touched) {
    const x = ox + (k % aw), y = oy + Math.floor(k / aw);
    const grain = w.pencil ? 0.7 + 0.3 * pixelNoise(x, y, grainSeed) : 1;
    const a = alpha[k] * w.opacity * grain;
    const j = (y * img.width + x) * img.channels;
    for (let c = 0; c < 3; c++) img.data[j + c] = Math.round(img.data[j + c] * (1 - a) + Math.min(img.data[j + c], w.ink[c]) * a);
  }
}

// ---------- Writing the answers ----------

const textOf = (n: number) => String(n);

/** A wrong answer a child might give: one of the package's known mistakes when it has one, else a near miss. */
function wrongValue(answer: number, mistakes: readonly number[], r: Random): number {
  const known = mistakes.filter((m) => m !== answer && m >= 0);
  if (known.length && r.next() < 0.7) return r.pick(known);
  const reversed = Number(String(Math.abs(answer)).split("").reverse().join(""));
  const near = [answer + 1, answer - 1, answer + 10, answer - 10, answer + 2, reversed].filter((v) => v !== answer && v >= 0 && Number.isInteger(v));
  return near.length ? r.pick(near) : answer + 1;
}

const expectedFor = (c: AnswerCase): ExpectedMark =>
  c === "blank" ? "blank" : c === "right" || c === "crossed-out-right" || c === "messy-right" ? "right" : "wrong";

/** Whether an area of the page is clear to write in: on the page, away from every other region, and with no ink yet. */
function clearArea(img: RawImage, area: Box, blocked: readonly Box[]): boolean {
  if (area.x < 8 || area.y < 8 || area.x + area.width > img.width - 8 || area.y + area.height > img.height - 8) return false;
  const overlaps = (b: Box) => area.x < b.x + b.width && b.x < area.x + area.width && area.y < b.y + b.height && b.y < area.y + area.height;
  if (blocked.some(overlaps)) return false;
  let dark = 0, total = 0;
  for (let y = Math.floor(area.y); y < area.y + area.height; y += 2) {
    for (let x = Math.floor(area.x); x < area.x + area.width; x += 2) {
      const j = (y * img.width + x) * img.channels;
      total++;
      if (img.data[j] + img.data[j + 1] + img.data[j + 2] < 600) dark++;
    }
  }
  return dark <= total * 0.004;
}

/** The least height of a digit in a crossed-out pair, in page pixels (about 3 mm): smaller, and it is not exact. */
const MIN_PAIR_HEIGHT = 16;

type Planned = WrittenText & { paths: InkPath[] };

/**
 * Writes one answer into its box. For a crossed-out case, both texts are laid out first and drawn only when their real
 * ink is ANSWER_GAP apart and each digit is at least MIN_PAIR_HEIGHT tall: side by side in a wide box, the correction
 * beside the box on clear paper (never on printed text, another question's region or earlier ink), side by side
 * smaller, or one above the other in the box. When none fits, only the final answer is written and the case drawn says
 * so: the truth never names an exact answer a reader could fairly be unsure of.
 */
function writeAnswer(img: RawImage, box: Box, c: AnswerCase, answer: number, mistakes: readonly number[], blocked: readonly Box[], w: Writer, r: Random, grain: number): { written: WrittenText[]; drawn: AnswerCase } {
  if (c === "blank") return { written: [], drawn: c };
  const messy = c.startsWith("messy");
  const right = textOf(answer);
  const wrong = textOf(wrongValue(answer, mistakes, r));
  const plan = (text: string, area: Box, placement: WrittenText["placement"], crossedOut: boolean, small = 1): Planned => {
    const fit = Math.min(area.height * w.height * small, area.width * 0.86 / (textWidth(text, 1, w) || 1));
    const height = Math.max(10, fit);
    const width = textWidth(text, height, w);
    const free = Math.max(0, area.width - width);
    const x = area.x + free * (messy ? r.range(0.05, 0.95) : r.range(0.25, 0.65));
    const baseline = area.y + (area.height + height) / 2 + area.height * (messy ? r.range(-0.12, 0.14) : r.range(-0.05, 0.06));
    const laid = layoutText(text, { x, baseline, height }, w, r, messy);
    const paths = [...laid.paths];
    if (crossedOut) {
      const b = unionBox(laid.glyphs.map((g) => g.box));
      const lines = r.next() < 0.5 ? 1 : 2;
      for (let i = 0; i < lines; i++) {
        const y0 = b.y + b.height * r.range(0.25, 0.75), y1 = b.y + b.height * r.range(0.25, 0.75);
        const diag = r.next() < 0.5;
        paths.push({ width: w.width * r.range(0.9, 1.2), points: diag
          ? [[b.x - 2, b.y + b.height * (i ? 0.1 : 0.9)], [b.x + b.width + 2, b.y + b.height * (i ? 0.9 : 0.1)]]
          : [[b.x - 3, y0], [b.x + b.width + 3, y1]] });
      }
    }
    return { text, crossedOut, placement, glyphs: laid.glyphs, inkBox: pathBox(paths), photoQuad: null, paths };
  };
  const draw = (...pieces: Planned[]): WrittenText[] => pieces.map(({ paths, ...piece }) => {
    drawPaths(img, paths, w, grain);
    return piece;
  });
  if (!c.startsWith("crossed-out")) return { written: draw(plan(c === "right" || c === "messy-right" ? right : wrong, box, "in-box", false)), drawn: c };

  const [first, last] = c === "crossed-out-right" ? [wrong, right] : [right, wrong];
  // (A glyph box carries a pen width of padding on each side.)
  const tallEnough = (p: Planned) => p.glyphs.every((g) => g.box.height - 2 * w.width >= MIN_PAIR_HEIGHT);
  const fits = (a: Planned, b: Planned) => apart(a.inkBox, b.inkBox, ANSWER_GAP) && tallEnough(a) && tallEnough(b);
  const halves = (small: number): [Planned, Planned] => {
    const half = box.width / 2;
    const a = plan(first, { ...box, width: half }, "in-box", true, small);
    // The correction starts where the crossed-out ink really ends, not at the middle of the box.
    const from = Math.max(box.x + half, a.inkBox.x + a.inkBox.width + ANSWER_GAP + 2);
    return [a, plan(last, { ...box, x: from, width: Math.max(1, box.x + box.width - from) }, "in-box", false, small)];
  };
  const stacked = (): [Planned, Planned] => {
    const half = box.height / 2;
    return [plan(first, { ...box, height: half }, "in-box", true, 1.3), plan(last, { ...box, y: box.y + half, height: half }, "in-box", false, 1.3)];
  };
  const tries: (() => [Planned, Planned] | null)[] = [];
  if (box.width >= box.height * 2.4) tries.push(() => halves(0.85));
  // Beside the box: the place for the correction, with a margin so its ink stays off the box and its neighbours.
  const wide = Math.max(box.height * 1.6, box.width * 0.9), gap = 14;
  const places = r.shuffle([
    { placement: "right-of-box" as const, area: { x: box.x + box.width + gap, y: box.y, width: wide, height: box.height } },
    { placement: "above-box" as const, area: { x: box.x, y: box.y - box.height * 0.8 - gap, width: box.width, height: box.height * 0.8 } },
    { placement: "below-box" as const, area: { x: box.x, y: box.y + box.height + gap, width: box.width, height: box.height * 0.8 } },
    { placement: "left-of-box" as const, area: { x: box.x - wide - gap, y: box.y, width: wide, height: box.height } },
  ]);
  // (The margin is less than the gap, so the box's own border never counts against it.)
  const margin = (b: Box, m = 8): Box => ({ x: b.x - m, y: b.y - m, width: b.width + 2 * m, height: b.height + 2 * m });
  for (const p of places) {
    tries.push(() => {
      if (!clearArea(img, margin(p.area), blocked)) return null;
      const pair: [Planned, Planned] = [plan(first, box, "in-box", true), plan(last, p.area, p.placement, false, 0.9)];
      return clearArea(img, margin(pair[1].inkBox, 2), blocked) ? pair : null;
    });
  }
  tries.push(() => halves(0.85), () => halves(0.7), stacked);
  for (const attempt of tries) {
    const pair = attempt();
    if (pair && fits(pair[0], pair[1])) return { written: draw(...pair), drawn: c };
  }
  // No room for both: only the answer that counts, and the case says so.
  return { written: draw(plan(last, box, "in-box", false)), drawn: c === "crossed-out-right" ? "right" : "wrong" };
}

// ---------- The camera ----------

type Matrix3 = [number, number, number, number, number, number, number, number, number];

/** The homography that maps four source points onto four destination points. */
function homography(src: readonly Point[], dst: readonly Point[]): Matrix3 {
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let rr = c + 1; rr < 8; rr++) if (Math.abs(a[rr][c]) > Math.abs(a[p][c])) p = rr;
    [a[c], a[p]] = [a[p], a[c]];
    for (let rr = 0; rr < 8; rr++) {
      if (rr === c) continue;
      const f = a[rr][c] / a[c][c];
      for (let k = c; k < 9; k++) a[rr][k] -= f * a[c][k];
    }
  }
  const h = a.map((row, i) => row[8] / row[i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

const apply = (m: Matrix3, p: Point): Point => {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
};

/** The photo's size: a phone photo's 3:4, at about the page image's resolution. */
export const PHOTO_SIZE = { width: 1500, height: 2000 } as const;

interface Camera {
  corners: Point[];
  rotationDeg: number;
  keystone: number;
  blurSigma: number;
  light: number;
  shadow: number;
  noise: number;
  warmth: number;
  table: [number, number, number];
}

function cameraFor(effect: PhotoEffect, page: { width: number; height: number }, r: Random): Camera {
  const W = PHOTO_SIZE.width, H = PHOTO_SIZE.height;
  const rotationDeg = effect === "rotation" ? r.pick([-1, 1]) * r.range(8, 14) : r.normal() * 1.6;
  const keystone = effect === "perspective" ? r.range(0.07, 0.12) : r.range(0, 0.025);
  // (A strongly rotated page is held further away, so all four corners stay in the frame.)
  const fill = effect === "cut-off" ? r.range(1.0, 1.08) : effect === "rotation" ? r.range(0.62, 0.68) : r.range(0.78, 0.86);
  const ph = H * fill, pw = ph * (page.width / page.height);
  let cx = W / 2 + r.normal() * W * 0.015, cy = H / 2 + r.normal() * H * 0.012;
  if (effect === "cut-off") {
    // Push one side of the page out of the frame: a quarter to a third of it.
    const side = r.int(0, 3);
    const out = r.range(0.24, 0.34);
    if (side === 0) cy -= ph * out; else if (side === 1) cx += pw * out; else if (side === 2) cy += ph * out; else cx -= pw * out;
  }
  // Keystone: the far edge (top or bottom) is narrower, as when the phone leans over the page.
  const far = r.next() < 0.7 ? "top" : "bottom";
  const k = keystone * pw;
  const base: Point[] = [
    { x: -pw / 2 + (far === "top" ? k : 0), y: -ph / 2 }, { x: pw / 2 - (far === "top" ? k : 0), y: -ph / 2 },
    { x: pw / 2 - (far === "bottom" ? k : 0), y: ph / 2 }, { x: -pw / 2 + (far === "bottom" ? k : 0), y: ph / 2 },
  ];
  const t = (rotationDeg * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
  const corners = base.map((p) => {
    const jx = p.x + r.normal() * pw * 0.006, jy = p.y + r.normal() * ph * 0.006;
    return { x: cx + jx * cos - jy * sin, y: cy + jx * sin + jy * cos };
  });
  return {
    corners, rotationDeg, keystone,
    blurSigma: effect === "blur" ? r.range(2.2, 3.0) : r.range(0.5, 1.0),
    light: effect === "low-light" ? r.range(0.42, 0.55) : r.range(0.9, 1.04),
    shadow: effect === "shadow" ? r.range(0.42, 0.58) : 0,
    noise: effect === "low-light" ? r.range(7, 10) : r.range(1.5, 3.5),
    warmth: effect === "low-light" ? r.range(0.06, 0.12) : r.range(-0.02, 0.05),
    table: r.pick([[150, 112, 78], [120, 122, 126], [205, 200, 192], [96, 72, 54]] as [number, number, number][]),
  };
}

/** A separable Gaussian blur of a float RGB image, in place. */
function blur(data: Float32Array, width: number, height: number, sigma: number) {
  const radius = Math.max(1, Math.ceil(sigma * 2.5));
  const kernel = Array.from({ length: 2 * radius + 1 }, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma)));
  const sum = kernel.reduce((a, b) => a + b, 0);
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const tmp = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let i = -radius; i <= radius; i++) acc += data[(y * width + Math.min(width - 1, Math.max(0, x + i))) * 3 + c] * kernel[i + radius];
        tmp[(y * width + x) * 3 + c] = acc;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let i = -radius; i <= radius; i++) acc += tmp[(Math.min(height - 1, Math.max(0, y + i)) * width + x) * 3 + c] * kernel[i + radius];
        data[(y * width + x) * 3 + c] = acc;
      }
    }
  }
}

/** Photographs an inked page: places it on a table through the camera, then light, shadow, blur and noise. */
function photograph(page: RawImage, cam: Camera, r: Random): RawImage {
  const W = PHOTO_SIZE.width, H = PHOTO_SIZE.height;
  const src: Point[] = [{ x: 0, y: 0 }, { x: page.width, y: 0 }, { x: page.width, y: page.height }, { x: 0, y: page.height }];
  const back = homography(cam.corners, src);
  const out = new Float32Array(W * H * 3);
  const noiseSeed = r.int(1, 1 << 30);
  // The shadow: a soft-edged half plane across part of the photo, as from a hand or a phone held over the page.
  const angle = r.range(0, 2 * Math.PI), nx = Math.cos(angle), ny = Math.sin(angle);
  const offset = r.range(0.1, 0.3) * Math.min(W, H), soft = r.range(40, 120);
  const lightAngle = r.range(0, 2 * Math.PI), lx = Math.cos(lightAngle), ly = Math.sin(lightAngle), lightSlope = r.range(0.04, 0.12);
  const pd = page.data, pc = page.channels, pw = page.width, phh = page.height;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = apply(back, { x: x + 0.5, y: y + 0.5 });
      const u = p.x - 0.5, v = p.y - 0.5;
      const o = (y * W + x) * 3;
      // The table, with a little grain.
      const g = (pixelNoise(x >> 2, y >> 2, noiseSeed + 7) - 0.5) * 18;
      let rr = cam.table[0] + g, gg = cam.table[1] + g, bb = cam.table[2] + g;
      const edge = Math.min(u + 0.5, v + 0.5, pw - 0.5 - u, phh - 0.5 - v);
      if (edge > -1) {
        const a = Math.max(0, Math.min(1, edge + 0.5));
        const x0 = Math.max(0, Math.min(pw - 2, Math.floor(u))), y0 = Math.max(0, Math.min(phh - 2, Math.floor(v)));
        const fx = Math.max(0, Math.min(1, u - x0)), fy = Math.max(0, Math.min(1, v - y0));
        const i00 = (y0 * pw + x0) * pc, i10 = i00 + pc, i01 = i00 + pw * pc, i11 = i01 + pc;
        const s = (c: number) => (pd[i00 + c] * (1 - fx) + pd[i10 + c] * fx) * (1 - fy) + (pd[i01 + c] * (1 - fx) + pd[i11 + c] * fx) * fy;
        // Paper is never quite white in a room.
        rr = rr * (1 - a) + s(0) * 0.96 * a; gg = gg * (1 - a) + s(1) * 0.95 * a; bb = bb * (1 - a) + s(2) * 0.92 * a;
      }
      const dx = x / W - 0.5, dy = y / H - 0.5;
      let light = cam.light * (1 - 0.35 * (dx * dx + dy * dy)) * (1 + lightSlope * (dx * lx + dy * ly));
      if (cam.shadow > 0) {
        const d = (x - W / 2) * nx + (y - H / 2) * ny - offset;
        const inShadow = Math.max(0, Math.min(1, 0.5 + d / soft));
        light *= 1 - (1 - cam.shadow) * inShadow;
      }
      out[o] = rr * light * (1 + cam.warmth);
      out[o + 1] = gg * light;
      out[o + 2] = bb * light * (1 - cam.warmth);
    }
  }
  blur(out, W, H, cam.blurSigma);
  const data = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i - x) / W;
    for (let c = 0; c < 3; c++) {
      const n = (pixelNoise(x, y, noiseSeed + c) + pixelNoise(y, x, noiseSeed + 11 + c) - 1) * cam.noise * 1.7;
      data[i * 3 + c] = Math.max(0, Math.min(255, Math.round(out[i * 3 + c] + n)));
    }
  }
  return { width: W, height: H, channels: 3, data };
}

// ---------- One photo ----------

export interface ScanPhotoOptions {
  /** The set's seed; the photo's own randomness comes from it and the photo id. */
  seed: string;
  id: string;
  effect: PhotoEffect;
  /** For a wrong-page photo: the page it is sent as. */
  submittedAs?: { page: number; label: string | null };
  /** Each question's known wrong answers (from its package), by question number. */
  mistakes?: ReadonlyMap<number, readonly number[]>;
}

export interface ScanPhoto {
  /** The page with ink, before the camera: page image pixels, RGB. */
  inked: RawImage;
  /** The photo: PHOTO_SIZE, RGB. */
  photo: RawImage;
  truth: PhotoTruth;
}

const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x <= PHOTO_SIZE.width && p.y <= PHOTO_SIZE.height;
const round2 = (n: number) => Math.round(n * 100) / 100;
const roundBox = (b: Box): Box => ({ x: round2(b.x), y: round2(b.y), width: round2(b.width), height: round2(b.height) });
const roundPoint = (p: Point): Point => ({ x: round2(p.x), y: round2(p.y) });

/** What the ink step gives: the inked page and what was written, before any camera. */
export interface InkedPage {
  inked: RawImage;
  questions: TruthQuestion[];
  decoys: PhotoTruth["decoys"];
}

/** Writes a page's answers and decoys, drawing from `r`: the first step of every photo. */
function inkAnswers(page: PhotoPage, mistakes: ScanPhotoOptions["mistakes"], r: Random): InkedPage {
  const inked = rgbCopy(page.image);
  const writer = writerFor(r);
  const grain = r.int(1, 1 << 30);
  const deck = r.shuffle(CASE_DECK);
  let dealt = r.int(0, deck.length - 1);
  const questions: TruthQuestion[] = [];
  const decoys: PhotoTruth["decoys"] = [];
  for (const q of page.questions) {
    const box = writableBox(q);
    const base = { number: q.number, packageId: q.packageId, format: q.format };
    if (!box) {
      questions.push({ ...base, scope: "not-drawn", answer: null, answerRegion: null, case: null, written: [], finalText: null, expectedMark: "not-marked", regions: [] });
      // A number in a work space (a story's working out) is never the answer: a decoy for the reader.
      const work = q.regions.find((x) => x.kind === "work" && x.box && x.box.height > 60);
      if (work?.box) {
        const text = String(r.int(2, 99));
        const height = Math.min(work.box.height * 0.3, 42);
        const laid = layoutText(text, { x: work.box.x + work.box.width * r.range(0.1, 0.5), baseline: work.box.y + work.box.height * r.range(0.35, 0.8), height }, writer, r, false);
        drawPaths(inked, laid.paths, writer, grain);
        decoys.push({ question: q.number, region: work.id, text, inkBox: roundBox(pathBox(laid.paths)) });
      }
      continue;
    }
    const c = deck[dealt++ % deck.length];
    const blocked = page.questions.flatMap((other) => other.regions.flatMap((reg) => (reg.box && reg !== box ? [reg.box] : [])));
    const { written, drawn } = writeAnswer(inked, box.box!, c, box.answer!, mistakes?.get(q.number) ?? [], blocked, writer, r, grain);
    const finalText = [...written].reverse().find((w) => !w.crossedOut)?.text ?? null;
    questions.push({
      ...base, scope: "write", answer: textOf(box.answer!), answerRegion: box.id, case: drawn,
      written: written.map((w) => ({ ...w, glyphs: w.glyphs.map((g) => ({ char: g.char, box: roundBox(g.box) })), inkBox: roundBox(w.inkBox) })),
      finalText, expectedMark: expectedFor(drawn), regions: [],
    });
  }

  return { inked, questions, decoys };
}

/**
 * The ink step alone: the same page, seed and id give the same inked page and the same written answers as makeScanPhoto
 * draws before its camera, at a fraction of the cost. For checking a whole set's answers.
 */
export function inkScanPage(page: PhotoPage, o: Pick<ScanPhotoOptions, "seed" | "id" | "mistakes">): InkedPage {
  return inkAnswers(page, o.mistakes, seededRandom(`${o.seed}:${o.id}`));
}

/** Makes one photo of a page and its truth file. The same page, options and seed give the same bytes. */
export function makeScanPhoto(page: PhotoPage, o: ScanPhotoOptions): ScanPhoto {
  if (o.effect === "wrong-page" && !o.submittedAs) throw new Error("a wrong-page photo needs the page it is sent as");
  const r = seededRandom(`${o.seed}:${o.id}`);
  const { inked, questions, decoys } = inkAnswers(page, o.mistakes, r);

  const cam = cameraFor(o.effect, page.image, r);
  const photo = photograph(inked, cam, r);
  const src: Point[] = [{ x: 0, y: 0 }, { x: page.image.width, y: 0 }, { x: page.image.width, y: page.image.height }, { x: 0, y: page.image.height }];
  const forward = homography(src, cam.corners);
  const quad = (b: Box) => [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y }, { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height }].map((p) => apply(forward, p));
  for (const tq of questions) {
    const q = page.questions.find((x) => x.number === tq.number)!;
    tq.regions = q.regions.map((reg) => {
      if (!reg.box) return { id: reg.id, kind: reg.kind, box: null, photoQuad: null, visible: null };
      const corners = quad(reg.box);
      const n = corners.filter(inside).length;
      return { id: reg.id, kind: reg.kind, box: reg.box, photoQuad: corners.map(roundPoint), visible: n === 4 ? "full" : n === 0 ? "none" : "partial" };
    });
    tq.written = tq.written.map((w) => ({ ...w, photoQuad: quad(w.inkBox).map(roundPoint) }));
    // A box (or a correction beside it) cut off by the frame cannot be marked from this photo.
    const ink = tq.written.map((w) => w.inkBox);
    const answerBox = tq.regions.find((x) => x.id === tq.answerRegion)?.box;
    if (tq.scope === "write" && answerBox && [answerBox, ...ink].some((b) => !quad(b).every(inside))) tq.expectedMark = "not-visible";
  }
  const marks = Object.fromEntries(SCAN_MARKS.map((m) => {
    const p = apply(forward, page.marks[m]);
    return [m, { ...roundPoint(p), visible: inside(p) }];
  })) as PhotoTruth["photo"]["marks"];
  const counts: Record<ExpectedMark, number> = { right: 0, wrong: 0, blank: 0, "not-visible": 0, "not-marked": 0 };
  for (const q of questions) counts[q.expectedMark]++;
  const expectedPhoto: ExpectedPhoto = o.effect === "wrong-page" ? "wrong-page" : SCAN_MARKS.some((m) => !marks[m].visible) ? "cut-off" : "mark";
  const truth: PhotoTruth = {
    version: PHOTO_TRUTH_VERSION, id: o.id, synthetic: true, note: SYNTHETIC_NOTE, seed: o.seed, level: page.level,
    source: { workbookId: page.workbookId, page: page.page, label: page.label, day: page.day, pageOfDay: page.pageOfDay, imageSha256: page.imageSha256 },
    submittedAs: o.effect === "wrong-page" ? o.submittedAs! : { page: page.page, label: page.label },
    effect: o.effect, expectedPhoto,
    photo: {
      width: PHOTO_SIZE.width, height: PHOTO_SIZE.height, pageCorners: cam.corners.map(roundPoint), marks,
      camera: {
        rotationDeg: round2(cam.rotationDeg), keystone: round2(cam.keystone), blurSigma: round2(cam.blurSigma),
        light: round2(cam.light), shadow: round2(cam.shadow), noise: round2(cam.noise),
      },
    },
    questions, decoys, counts,
  };
  return { inked, photo, truth };
}

// ---------- Checking a truth file ----------

/** The least clear paper between two pieces of text written for one answer, in page pixels: less, and a reader could
 * fairly be unsure which digits belong to which, so the truth could not name one answer exactly. */
export const ANSWER_GAP = 6;

const apart = (a: Box, b: Box, gap: number) =>
  a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x || a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y;

/**
 * Why a truth file's answers cannot be trusted as exact, or nothing: every written text spelled by its glyphs, separate
 * pieces of text kept ANSWER_GAP apart, a crossed-out answer written before its correction, and each expected mark
 * following from the final text and the key. The tool refuses a set with any problem.
 */
export function truthProblems(t: Pick<PhotoTruth, "id" | "questions">): string[] {
  const problems: string[] = [];
  for (const q of t.questions) {
    const at = `${t.id} q${q.number}`;
    if (q.scope === "not-drawn") {
      if (q.written.length || q.expectedMark !== "not-marked") problems.push(`${at}: a question not drawn has ink or a mark`);
      continue;
    }
    for (const w of q.written) if (w.glyphs.map((g) => g.char).join("") !== w.text) problems.push(`${at}: the glyphs of ${w.text} spell something else`);
    for (let i = 0; i < q.written.length; i++) {
      for (let j = i + 1; j < q.written.length; j++) {
        const a = q.written[i], b = q.written[j];
        if (!apart(a.inkBox, b.inkBox, ANSWER_GAP)) problems.push(`${at}: ${a.text} and ${b.text} are written less than ${ANSWER_GAP} px apart`);
      }
    }
    const final = [...q.written].reverse().find((w) => !w.crossedOut)?.text ?? null;
    if (q.finalText !== final) problems.push(`${at}: the final text is not the last text not crossed out`);
    if (q.written.some((w, i) => w.crossedOut && i === q.written.length - 1)) problems.push(`${at}: the last text is crossed out`);
    if (q.case?.startsWith("crossed-out") && (q.written.length !== 2 || !q.written[0].crossedOut)) problems.push(`${at}: a crossed-out case is not one crossed answer and one correction`);
    const earned: ExpectedMark = final === null ? "blank" : final === q.answer ? "right" : "wrong";
    if (q.expectedMark !== "not-visible" && q.expectedMark !== earned) problems.push(`${at}: expected ${q.expectedMark}, but ${final ?? "a blank"} earns ${earned}`);
    if (q.case && q.expectedMark !== "not-visible" && expectedFor(q.case) !== earned) problems.push(`${at}: the case ${q.case} does not fit what was written`);
  }
  return problems;
}

/**
 * A crop of the photo around one written answer, for a person to check it: its box and every piece of its ink (a
 * correction beside the box too), with room around them, inside the photo.
 */
export function answerCrop(q: TruthQuestion): Box | null {
  const quad = q.regions.find((r) => r.id === q.answerRegion)?.photoQuad;
  if (!quad) return null;
  const points = [...quad, ...q.written.flatMap((w) => w.photoQuad ?? [])];
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const boxXs = quad.map((p) => p.x), boxYs = quad.map((p) => p.y);
  const pad = Math.max(16, 0.3 * Math.max(Math.max(...boxXs) - Math.min(...boxXs), Math.max(...boxYs) - Math.min(...boxYs)));
  const left = Math.max(0, Math.floor(Math.min(...xs) - pad)), top = Math.max(0, Math.floor(Math.min(...ys) - pad));
  const right = Math.min(PHOTO_SIZE.width, Math.ceil(Math.max(...xs) + pad)), bottom = Math.min(PHOTO_SIZE.height, Math.ceil(Math.max(...ys) + pad));
  return right - left >= 8 && bottom - top >= 8 ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

// ---------- The set ----------

export interface SetPage {
  level: string;
  page: number;
  label: string | null;
}

export interface SetPlanEntry extends SetPage {
  id: string;
  effect: PhotoEffect;
  submittedAs: { page: number; label: string | null } | null;
}

/**
 * Which photo gets which effect: each level's pages, shuffled by the seed, get the effects in turn, so every effect
 * comes about equally often. A wrong-page photo is sent as another page of the same level.
 */
export function planPhotoSet(pages: readonly SetPage[], seed: string): SetPlanEntry[] {
  const plan: SetPlanEntry[] = [];
  const levels = [...new Set(pages.map((p) => p.level))];
  for (const level of levels) {
    const mine = pages.filter((p) => p.level === level);
    const r = seededRandom(`${seed}:plan:${level}`);
    const effects = r.shuffle(PHOTO_EFFECTS);
    const order = r.shuffle(mine.map((_, i) => i));
    order.forEach((index, k) => {
      const p = mine[index];
      const effect = mine.length > 1 ? effects[k % effects.length] : "plain";
      const other = effect === "wrong-page" ? mine[(index + 1 + r.int(0, mine.length - 2)) % mine.length] : null;
      plan.push({ ...p, id: `${level}-p${String(p.page).padStart(2, "0")}`, effect, submittedAs: other ? { page: other.page, label: other.label } : null });
    });
  }
  return plan.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
