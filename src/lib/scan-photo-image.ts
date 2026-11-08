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
  const { data, info } = await sharp(normalized.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const qr = jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: "attemptBoth" });
  if (!qr) throw new Error("qr");
  let url: URL;
  try { url = new URL(qr.data); } catch { throw new Error("qr"); }
  const token = /^\/tutor\/p\/([A-Za-z0-9_-]{16,64})$/.exec(url.pathname)?.[1];
  if (!token || url.protocol !== "https:" || url.hostname !== "unicalearning.com" || url.search || url.hash) throw new Error("qr");
  return { bytes: normalized.data, token, width: normalized.info.width, height: normalized.info.height };
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
