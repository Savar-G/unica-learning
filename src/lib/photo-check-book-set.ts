// #856: a labelled set of real phone photos of one printed book, made ready for the photo check the way the app makes
// them. Each photo goes through the upload's own reading (normalizeScanPhoto: the page code, and an open book split into
// its two pages, as the upload route does) and then the crop job itself (runScanCrops, with its sheet check against the
// book's other pages of the same kind) on the in-memory store. Only a page the job makes ready has a straightened page,
// which is what the photo check is asked about in the app. Nothing here reads or writes a database or Storage.
import { runScanCrops, scanPartPath, STRAIGHT_PART } from "@/lib/scan-crops";
import { memoryScanCropStore } from "@/lib/scan-crops-memory";
import type { CropQuestion } from "@/lib/scan-calibration";
import { normalizeScanPhoto } from "@/lib/scan-photo-image";
import { PHOTO_PROBLEMS } from "@/lib/scan-photo-check";
import type { PhotoKind } from "@/lib/photo-check-thresholds";
import { sha256Hex, storedPrintContract } from "@/lib/workbook-print-contract";

export interface BookSetPage {
  number: number;
  /** Pages of the same kind and size are the near twins the sheet check compares against. */
  pageType: string;
  qrToken: string;
  image: { width: number; height: number };
  /**
   * The page's stored print contract, as `workbook_pages.print_contract` holds it. Null for a page that is only a near
   * twin for the sheet check: a photo of it is refused as "no-contract".
   */
  printContract: unknown;
  questions: CropQuestion[];
  /** The printed page image at the stored size. */
  printed: Uint8Array;
}

export interface BookSetBook { workbookId: string; printedRevision: string; pages: BookSetPage[] }

export interface BookSetPhoto { id: string; kind: PhotoKind; bytes: Uint8Array }

export interface BookSetResult {
  /** The photo's id; a page of a two-page photo adds `-a` or `-b`. */
  id: string;
  /** The id of the photo it came from. */
  photo: string;
  kind: PhotoKind;
  page: number | null;
  status: "ready" | "refused";
  /** Why it is refused: the upload's error ("qr", "image", "size", "page": a code that is not this book's) or the crop job's refusal. */
  reason: string | null;
  /** The straightened page the crop job stored, for a ready page. */
  straight: Uint8Array | null;
}

/** A label: one of clear, blurry, glare, shadow, faint. */
export function photoKind(label: string): PhotoKind {
  const k = label.trim().toLowerCase();
  if (k === "clear" || (PHOTO_PROBLEMS as readonly string[]).includes(k)) return k as PhotoKind;
  throw new Error(`unknown label ${JSON.stringify(label)}`);
}

/**
 * The printed image the stored contract fingerprints is the one the renderer stored. A page image made again from the
 * printed PDF at the stored size is the same print, but not the same bytes, so its fingerprint is taken from those bytes.
 * The contract's marks, coordinates and size stay as stored.
 */
async function contractFor(book: BookSetBook, page: BookSetPage) {
  const stored = storedPrintContract(page.printContract, { workbookId: book.workbookId, page: page.number, image: page.image });
  if (!stored) throw new Error(`page ${page.number}: the stored print contract does not read`);
  return { ...stored, fingerprints: { ...stored.fingerprints, image: await sha256Hex(page.printed) } };
}

const PARENT = "00000000-0000-4000-8000-000000000856";
const jobToken = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export async function bookSet(book: BookSetBook, photos: readonly BookSetPhoto[], o: { sheetCheckMs?: number } = {}): Promise<BookSetResult[]> {
  // The fingerprint is taken from the given image (contractFor), so the image must at least be the page it is filed under:
  // its own code must name that page. A page image filed under the wrong page would otherwise pass unnoticed.
  for (const p of book.pages) {
    const token = await normalizeScanPhoto(p.printed).then((n) => n.token, () => null);
    if (token !== p.qrToken) throw new Error(`page ${p.number}: its printed image shows ${token === null ? "no page code" : "another page's code"}`);
  }
  const byToken = new Map(book.pages.map((p) => [p.qrToken, p]));
  const contracts = new Map(await Promise.all(book.pages.filter((p) => p.printContract != null).map(async (p) => [p.number, await contractFor(book, p)] as const)));
  const results: BookSetResult[] = [];
  let n = 0;
  for (const photo of photos) {
    let pieces: { bytes: Uint8Array; token: string }[];
    try {
      const normalized = await normalizeScanPhoto(photo.bytes);
      pieces = normalized.spread ?? [{ bytes: normalized.bytes, token: normalized.token }];
    } catch (e) {
      results.push({ id: photo.id, photo: photo.id, kind: photo.kind, page: null, status: "refused", reason: (e as Error).message, straight: null });
      continue;
    }
    for (const [i, piece] of pieces.entries()) {
      const id = pieces.length > 1 ? `${photo.id}-${"ab"[i]}` : photo.id;
      const page = byToken.get(piece.token);
      if (!page) { results.push({ id, photo: photo.id, kind: photo.kind, page: null, status: "refused", reason: "page", straight: null }); continue; }
      const contract = contracts.get(page.number);
      if (!contract) { results.push({ id, photo: photo.id, kind: photo.kind, page: page.number, status: "refused", reason: "no-contract", straight: null }); continue; }
      const m = memoryScanCropStore({ now: () => Date.now() });
      for (const p of book.pages) m.printed.set(`p${p.number}.png`, p.printed);
      const ref = { parent: PARENT, photo: jobToken(++n) };
      m.photos.set(ref.photo, {
        parent: PARENT, state: "saved", createdAt: Date.now(), expiresAt: Date.now() + 86_400_000, bytes: piece.bytes, storedBytes: piece.bytes.length,
        frame: {
          printedRevision: book.printedRevision, book: { printedRevision: book.printedRevision },
          page: {
            printContract: contract, imagePath: `p${page.number}.png`, qrToken: page.qrToken, questions: page.questions,
            others: book.pages.filter((p) => p !== page && p.pageType === page.pageType && p.image.width === page.image.width && p.image.height === page.image.height).map((p) => `p${p.number}.png`),
          },
        },
      });
      const token = jobToken(n);
      const preview = await runScanCrops(m.store, ref, token, { sheetCheckMs: o.sheetCheckMs });
      if (preview.status === "ready") {
        const straight = m.objects.get(scanPartPath(PARENT, ref.photo, token, STRAIGHT_PART)) ?? null;
        results.push({ id, photo: photo.id, kind: photo.kind, page: page.number, status: straight ? "ready" : "refused", reason: straight ? null : "no-straight", straight });
      } else {
        results.push({ id, photo: photo.id, kind: photo.kind, page: page.number, status: "refused", reason: "reason" in preview ? preview.reason : preview.status, straight: null });
      }
    }
  }
  return results;
}
