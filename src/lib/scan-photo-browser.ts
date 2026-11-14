// A phone camera file can exceed the host's request-body limit. Send a bounded JPEG to the authenticated route.
// The server still validates actual bytes, decoded pixels, QR ownership and all family limits.
export async function prepareScanPhoto(file: File): Promise<Blob> {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("size");
  const image = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    if (image.width * image.height > 48_000_000) throw new Error("image");
    const scale = Math.min(1, 2800 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.8, 0.7]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 3_500_000) return blob;
    }
    throw new Error("size");
  } finally { image.close(); }
}

/** Whether a QR link is a workbook page's code: the same shape the server accepts (scan-photo-image.ts `tokenOf`). */
export function isPageCodeLink(link: string): boolean {
  let url: URL;
  try { url = new URL(link); } catch { return false; }
  return url.protocol === "https:" && url.hostname === "unicalearning.com" && /^\/tutor\/p\/[A-Za-z0-9_-]{16,64}$/.test(url.pathname) && !url.search && !url.hash;
}

/** The reads, in order: the whole photo, then each quarter enlarged 2× (lower quarters first: the code prints low on the left). */
export const PHONE_CODE_READS = [{ zoom: 1, x: 0, y: 0, part: 1 }, ...([[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]] as const).map(([x, y]) => ({ zoom: 2, x, y, part: 0.5 }))] as const;

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
    return await phoneCodeLooks(async ({ zoom, x, y, part }) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const sw = Math.round(image.width * part), sh = Math.round(image.height * part);
      canvas.width = sw * zoom; canvas.height = sh * zoom;
      context.drawImage(image, Math.round(x * image.width), Math.round(y * image.height), sw, sh, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
    });
  } catch { return null; } finally { image.close(); }
}
