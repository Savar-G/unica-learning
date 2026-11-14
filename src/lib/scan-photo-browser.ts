// A phone camera file can exceed the host's request-body limit. Send a bounded JPEG to the authenticated route.
// The server still validates actual bytes, decoded pixels, QR ownership and all family limits.

/** The usual encoding, and the smaller one an upload tries after it timed out once (scan edge sweep #5). */
export const PHOTO_ENCODING = { maxSide: 2800, qualities: [0.9, 0.8, 0.7] } as const;
export const SMALLER_ENCODING = { maxSide: 2000, qualities: [0.75] } as const;

/**
 * Throws "size" (too large to send), "image" (cannot be read as a photo) or "unavailable": the browser could not
 * encode it now (a null `toBlob`, most often out of memory), which is not the photo's fault, so the parent may try again.
 * Each canvas is freed when done, so 30 photos in a row do not hold 30 full-size canvases (#9).
 */
export async function prepareScanPhoto(file: File, encoding: { maxSide: number; qualities: readonly number[] } = PHOTO_ENCODING): Promise<Blob> {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("size");
  const image = await createImageBitmap(file, { imageOrientation: "from-image" });
  let canvas: HTMLCanvasElement | null = null;
  try {
    if (image.width * image.height > 48_000_000) throw new Error("image");
    const scale = Math.min(1, encoding.maxSide / Math.max(image.width, image.height));
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("unavailable");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of encoding.qualities) {
      const c = canvas;
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", quality));
      if (!blob) throw new Error("unavailable");
      if (blob.size <= 3_500_000) return blob;
    }
    throw new Error("size");
  } finally {
    image.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

/** The width of the stack's and the capture tray's thumbnails (#9): small, so many photos fit in a phone's memory. */
export const THUMB_WIDTH = 240;

/**
 * A small JPEG of a photo for its thumbnail (#9), decoded at its small size (`resizeWidth`) so the full photo is never
 * held as an image. Null when the browser cannot make one; the caller then shows the photo itself.
 */
export async function scanThumbnail(photo: Blob, width = THUMB_WIDTH): Promise<Blob | null> {
  let image: ImageBitmap | null = null, canvas: HTMLCanvasElement | null = null;
  try {
    image = await createImageBitmap(photo, { resizeWidth: width, resizeQuality: "medium", imageOrientation: "from-image" });
    canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0);
    const c = canvas;
    return await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", 0.8));
  } catch { return null; } finally {
    image?.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

/** Whether a QR link is a workbook page's code: the same shape the server accepts (scan-photo-image.ts `tokenOf`). */
export function isPageCodeLink(link: string): boolean {
  let url: URL;
  try { url = new URL(link); } catch { return false; }
  return url.protocol === "https:" && url.hostname === "unicalearning.com" && /^\/tutor\/p\/[A-Za-z0-9_-]{16,64}$/.test(url.pathname) && !url.search && !url.hash;
}

/**
 * The reads, in order: first the lower-left quarter as it is (the code prints there; a quarter is a quarter of the
 * pixels, so most photos are read in one short step), then the whole photo, then each quarter enlarged 2× (lower
 * quarters first). A read that finds a page code ends the look, so the extra first read only adds a chance to read.
 */
export const PHONE_CODE_READS = [{ zoom: 1, x: 0, y: 0.5, part: 0.5 }, { zoom: 1, x: 0, y: 0, part: 1 }, ...([[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]] as const).map(([x, y]) => ({ zoom: 2, x, y, part: 0.5 }))] as const;

/**
 * The phone's own early look at the page code (#915), before the server's answer: "read" when a read finds a page code,
 * "unread" when none does, null when it ran out of time or could not run. Only a hint for the parent: the server reads
 * the code again and alone decides the page. On all 53 Robin photos (2026-11-14) these reads agreed with the server's.
 * `read` returns the decoded link of one read, or null.
 */
export async function phoneCodeLooks(read: (r: (typeof PHONE_CODE_READS)[number]) => Promise<string | null>, budgetMs = 4000, now = () => Date.now()): Promise<"read" | "unread" | null> {
  const end = now() + budgetMs;
  for (const r of PHONE_CODE_READS) {
    if (now() > end) return null;
    let link: string | null;
    try { link = await read(r); } catch { return null; }
    if (link !== null && isPageCodeLink(link)) return "read";
  }
  return "unread";
}

/** `phoneCodeLooks` on a prepared photo, in the browser: one read at a time, yielding between reads so the page stays responsive. */
export async function phoneCodeCheck(photo: Blob): Promise<"read" | "unread" | null> {
  let image: ImageBitmap;
  try { image = await createImageBitmap(photo); } catch { return null; }
  try {
    const { default: jsQR } = await import("jsqr");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    try { return await phoneCodeLooks(async ({ zoom, x, y, part }) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const sw = Math.round(image.width * part), sh = Math.round(image.height * part);
      canvas.width = sw * zoom; canvas.height = sh * zoom;
      context.drawImage(image, Math.round(x * image.width), Math.round(y * image.height), sw, sh, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
    }); } finally { canvas.width = 0; canvas.height = 0; }
  } catch { return null; } finally { image.close(); }
}
