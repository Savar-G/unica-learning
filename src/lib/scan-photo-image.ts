import sharp from "sharp";
import jsQR from "jsqr";

export const SCAN_INPUT_BYTES = 20 * 1024 * 1024;
export const SCAN_PIXELS = 48_000_000;

/** Decode actual bytes before persistence. Sharp strips metadata unless explicitly asked to keep it. */
export async function normalizeScanPhoto(input: Uint8Array, limits = { inputBytes: SCAN_INPUT_BYTES, pixels: SCAN_PIXELS, outputBytes: SCAN_INPUT_BYTES }) {
  if (!input.length || input.length > limits.inputBytes) throw new Error("size");
  const source = sharp(input, { limitInputPixels: limits.pixels, failOn: "warning", animated: false });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > limits.pixels || (metadata.pages ?? 1) > 1
    || !["jpeg", "png", "webp", "heif"].includes(metadata.format ?? "")) throw new Error("image");
  const normalized = await source.autoOrient().resize({ width: 2800, height: 2800, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
  if (normalized.data.length > limits.outputBytes) throw new Error("size");
  const first = await pageCode(normalized.data, normalized.info);
  if (!first) throw new Error("qr");
  const spread = await spreadPages(normalized.data, normalized.info, first, limits.outputBytes);
  return { bytes: normalized.data, token: first.token, width: normalized.info.width, height: normalized.info.height, spread };
}

/** One page of a two-page photo: its own half of the photo, the other page painted white, with its own code. */
export interface SpreadPage { bytes: Buffer; token: string; width: number; height: number }

interface Point { x: number; y: number }
/** A page code read in the photo: its token, centre, side (photo pixels) and the code's own rightward direction. */
interface PageCode { token: string; center: Point; side: number; dir: Point }

/**
 * Printed page geometry, as parts of the page's width (src/lib/workbook-template.ts): the footer code's symbol is 0.0572
 * wide, its centre 0.114 from the page's left edge (measured on the rendered Robin pages); the corner marks start 0.027 in.
 */
const CODE_SIDE = 0.0572, CODE_CENTER_X = 0.114;
/**
 * A two-page photo (#915): an open book flat, two pages side by side. The other page's code sits one page width (plus
 * the gutter) along the first code's own rightward direction, at the same height on its page. Real spreads measured
 * 1.01 to 1.11 page widths apart (2026-11-14); anything outside these bounds is not taken as a spread.
 */
const SPREAD_DISTANCE = [0.9, 1.3] as const, SPREAD_OFF_AXIS = 0.1, SPREAD_SIDE_RATIO = [0.8, 1.25] as const, SPREAD_ALIGN = Math.cos((12 * Math.PI) / 180);

const readQr = (data: Buffer, width: number, height: number) => jsQR(new Uint8ClampedArray(data), width, height, { inversionAttempts: "attemptBoth" });

/** A code jsQR read in a crop, mapped back to photo pixels; null for a link that is not a page's. */
function codeOf(found: NonNullable<ReturnType<typeof readQr>>, left: number, top: number, zoom: number): PageCode | null {
  const token = tokenOf(found.data);
  if (!token) return null;
  const l = found.location, at = (p: Point) => ({ x: left + p.x / zoom, y: top + p.y / zoom });
  const tl = at(l.topLeftCorner), tr = at(l.topRightCorner), br = at(l.bottomRightCorner);
  const side = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  if (!(side > 0)) return null;
  return { token, center: { x: (tl.x + br.x) / 2, y: (tl.y + br.y) / 2 }, side, dir: { x: (tr.x - tl.x) / side, y: (tr.y - tl.y) / side } };
}

/** The page token a QR link carries, or null for any other link. */
function tokenOf(link: string): string | null {
  let url: URL;
  try { url = new URL(link); } catch { return null; }
  const token = /^\/tutor\/p\/([A-Za-z0-9_-]{16,64})$/.exec(url.pathname)?.[1];
  return token && url.protocol === "https:" && url.hostname === "unicalearning.com" && !url.search && !url.hash ? token : null;
}

/**
 * The zoomed reads, in order, each with the crops it reads (half the photo's width and height, by where they start,
 * lower first): 2× over nine crops, then 3× over the four quarters, which still cover the whole photo. 3× reads a code
 * only a few pixels a module, as in a photo taken from higher up (two clear Robin photos read only at 3×, 2026-11-14).
 */
const QR_ZOOM_PASSES = [[2, [[0, 0.5], [0.25, 0.5], [0.5, 0.5], [0, 0.25], [0.25, 0.25], [0.5, 0.25], [0, 0], [0.25, 0], [0.5, 0]]], [3, [[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]]]] as const;

/**
 * The page's token from its QR code: first over the whole photo, then in crops zoomed 2× and then 3×, where a phone photo's small
 * code reads when the whole photo's does not. The page prints its code low on the left, so the lower crops come first.
 * Calibration reads the code in place at the same zooms (`qrBound` in scan-calibration.ts), so a photo taken here for its
 * code is not refused there for it; change the two together.
 */
async function pageCode(jpeg: Buffer, size: { width: number; height: number }): Promise<PageCode | null> {
  const whole = await sharp(jpeg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const first = readQr(whole.data, whole.info.width, whole.info.height);
  if (first) return codeOf(first, 0, 0, 1);
  const width = Math.floor(size.width / 2), height = Math.floor(size.height / 2);
  if (width < 16 || height < 16) return null;
  for (const [zoom, windows] of QR_ZOOM_PASSES) for (const [x, y] of windows) {
    const left = Math.min(Math.round(x * size.width), size.width - width), top = Math.min(Math.round(y * size.height), size.height - height);
    const { data, info } = await sharp(jpeg).extract({ left, top, width, height })
      .resize({ width: width * zoom, height: height * zoom, fit: "fill", kernel: "lanczos3" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const found = read(data, info.width, info.height);
    if (found) return codeOf(found, left, top, zoom);
  }
  return null;
}
const read = readQr;

/** A page code read in a square around `center` (side `size`), at 1×, 2× and 3×; null when none reads or it is outside. */
async function codeAround(jpeg: Buffer, photo: { width: number; height: number }, center: Point, size: number): Promise<PageCode | null> {
  const left = Math.max(0, Math.round(center.x - size / 2)), top = Math.max(0, Math.round(center.y - size / 2));
  const width = Math.min(photo.width, Math.round(center.x + size / 2)) - left, height = Math.min(photo.height, Math.round(center.y + size / 2)) - top;
  // The code must lie well inside the photo: a predicted place at the edge is not a page in view.
  if (width < size * 0.6 || height < size * 0.6) return null;
  for (const zoom of [1, 2, 3]) {
    const { data, info } = await sharp(jpeg).extract({ left, top, width, height })
      .resize({ width: width * zoom, height: height * zoom, fit: "fill", kernel: "lanczos3" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const found = readQr(data, info.width, info.height);
    if (found) return codeOf(found, left, top, zoom);
  }
  return null;
}

/**
 * The two pages of an open book photographed flat, or null for a photo of one page (the usual case: then nothing changes).
 * Only where the first code's page puts a neighbouring page's code is another code looked for, and it counts only as the
 * other page of a spread: another page's token, the same size and direction, one page width away along the first code's
 * own rightward direction and at the same height. Each page then keeps its own side of the line between the two pages and
 * the other side is painted white, so its own code and corner marks are the only ones its photo shows. A page photo is
 * still bound to its page by its own code and checked against its own print like any other photo; this never decides a page.
 */
async function spreadPages(jpeg: Buffer, photo: { width: number; height: number }, first: PageCode, outputBytes: number): Promise<SpreadPage[] | null> {
  const width = first.side / CODE_SIDE;
  let other: PageCode | null = null;
  for (const sign of [1, -1]) {
    const at = { x: first.center.x + sign * width * 1.08 * first.dir.x, y: first.center.y + sign * width * 1.08 * first.dir.y };
    const found = await codeAround(jpeg, photo, at, width * 0.8);
    if (found && found.token !== first.token && spreadPair(first, found, width)) { other = found; break; }
  }
  if (!other) return null;
  // Left and right in the pages' own direction (the photo may be turned).
  const along = (c: PageCode) => c.center.x * first.dir.x + c.center.y * first.dir.y;
  const [left, right] = along(first) < along(other) ? [first, other] : [other, first];
  const pageWidth = (left.side + right.side) / 2 / CODE_SIDE;
  // The line between the pages: halfway between the left page's right edge and the right page's left edge.
  const edge = (c: PageCode, t: number) => ({ x: c.center.x + t * pageWidth * first.dir.x, y: c.center.y + t * pageWidth * first.dir.y });
  const a = edge(left, 1 - CODE_CENTER_X), b = edge(right, -CODE_CENTER_X);
  const split = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const pages: SpreadPage[] = [];
  for (const [code, keep] of [[left, -1], [right, 1]] as const) {
    const page = await halfOf(jpeg, photo, split, first.dir, keep);
    if (!page || page.data.length > outputBytes) return null;
    pages.push({ bytes: page.data, token: code.token, width: page.info.width, height: page.info.height });
  }
  return pages;
}

/** Two codes are the two pages of one spread: same size and direction, one page width apart along it, at one height. */
function spreadPair(a: PageCode, b: PageCode, width: number): boolean {
  const ratio = b.side / a.side;
  if (ratio < SPREAD_SIDE_RATIO[0] || ratio > SPREAD_SIDE_RATIO[1]) return false;
  if (a.dir.x * b.dir.x + a.dir.y * b.dir.y < SPREAD_ALIGN) return false;
  const dx = b.center.x - a.center.x, dy = b.center.y - a.center.y;
  const alongAxis = Math.abs(dx * a.dir.x + dy * a.dir.y) / width, offAxis = Math.abs(-dx * a.dir.y + dy * a.dir.x) / width;
  return alongAxis >= SPREAD_DISTANCE[0] && alongAxis <= SPREAD_DISTANCE[1] && offAxis <= SPREAD_OFF_AXIS;
}

/**
 * One side of the line through `split` across `dir` (keep -1: before it, 1: after it), cropped to that side's part of
 * the photo with the other side painted white, as a JPEG.
 */
async function halfOf(jpeg: Buffer, photo: { width: number; height: number }, split: Point, dir: Point, keep: -1 | 1) {
  const side = (p: Point) => Math.sign((p.x - split.x) * dir.x + (p.y - split.y) * dir.y) || keep;
  const corners = [{ x: 0, y: 0 }, { x: photo.width, y: 0 }, { x: photo.width, y: photo.height }, { x: 0, y: photo.height }];
  // The kept polygon: the photo's corners on the kept side and where the line crosses the photo's edges.
  const kept: Point[] = [], dropped: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const p = corners[i], q = corners[(i + 1) % 4], sp = side(p), sq = side(q);
    if (sp === keep) kept.push(p); else dropped.push(p);
    if (sp !== sq) {
      const dp = (p.x - split.x) * dir.x + (p.y - split.y) * dir.y, dq = (q.x - split.x) * dir.x + (q.y - split.y) * dir.y;
      const t = dp / (dp - dq), cross = { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
      kept.push(cross); dropped.push(cross);
    }
  }
  if (kept.length < 3) return null;
  const left = Math.max(0, Math.floor(Math.min(...kept.map((p) => p.x)))), top = Math.max(0, Math.floor(Math.min(...kept.map((p) => p.y))));
  const width = Math.min(photo.width, Math.ceil(Math.max(...kept.map((p) => p.x)))) - left, height = Math.min(photo.height, Math.ceil(Math.max(...kept.map((p) => p.y)))) - top;
  if (width < 16 || height < 16) return null;
  const mask = dropped.length >= 3
    ? `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><polygon fill="#ffffff" points="${dropped.map((p) => `${(p.x - left).toFixed(1)},${(p.y - top).toFixed(1)}`).join(" ")}"/></svg>`
    : null;
  let image = sharp(jpeg).extract({ left, top, width, height });
  if (mask) image = sharp(await image.toBuffer()).composite([{ input: Buffer.from(mask), left: 0, top: 0 }]);
  return image.flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
}

/** Read with a hard byte bound even when Content-Length is missing or forged. Never store the camera original. */
export async function readScanBody(request: Request, limit: number): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("image");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("size"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
