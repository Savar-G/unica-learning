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
  const token = await pageToken(normalized.data, normalized.info);
  if (!token) throw new Error("qr");
  return { bytes: normalized.data, token, width: normalized.info.width, height: normalized.info.height };
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
async function pageToken(jpeg: Buffer, size: { width: number; height: number }): Promise<string | null> {
  const read = (data: Buffer, width: number, height: number) => jsQR(new Uint8ClampedArray(data), width, height, { inversionAttempts: "attemptBoth" });
  const whole = await sharp(jpeg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const first = read(whole.data, whole.info.width, whole.info.height);
  if (first) return tokenOf(first.data);
  const width = Math.floor(size.width / 2), height = Math.floor(size.height / 2);
  if (width < 16 || height < 16) return null;
  for (const [zoom, windows] of QR_ZOOM_PASSES) for (const [x, y] of windows) {
    const left = Math.min(Math.round(x * size.width), size.width - width), top = Math.min(Math.round(y * size.height), size.height - height);
    const { data, info } = await sharp(jpeg).extract({ left, top, width, height })
      .resize({ width: width * zoom, height: height * zoom, fit: "fill", kernel: "lanczos3" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const found = read(data, info.width, info.height);
    if (found) return tokenOf(found.data);
  }
  return null;
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
