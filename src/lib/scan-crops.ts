// Scan crops (#455, S2b): makes a photo's straightened page and numbered crops behind one store seam, and reads the preview.
// The store's `put` and `finish` carry the terminal-state rules: each needs an active, unexpired photo revision and this
// job's current lease (fence_scan_object and finish_scan_calibration on the database). A job that lost either stops, and it
// cannot bring a photo back. No AI runs here, and no mark or learning event is written.
import sharp from "sharp";
import {
  calibratePhoto,
  calibrationForPhoto,
  cropBox,
  cropPlan,
  sheetChecker,
  straightenedPage,
  type Calibration,
  type CalibrationRefusal,
  type CropQuestion,
  type Raster,
  type SheetRefusal,
} from "@/lib/scan-calibration";
import { printContractForPhoto, sha256Hex, type Box, type PagePrintContract } from "@/lib/workbook-print-contract";
import { pageUrl } from "@/lib/workbook-render";

export const STRAIGHT_PART = "straight";
export const cropPart = (n: number) => `crop-${n}`;
/** A part's name as a route gets it: only these two shapes reach Storage. */
export const isScanPart = (part: string) => part === STRAIGHT_PART || /^crop-[0-9]{1,3}$/.test(part);
/**
 * Whether a Storage error is the fence refusing a file. Storage hides the exception's text and reports its code: P0001 for
 * fence_scan_object's raise, 55000 for assert_family_writable's. Anything else is an uncertain failure.
 */
export const isFenceRefusal = (message: string) => /\bcode: (P0001|55000)\b/.test(message);

export const scanPartPath = (parent: string, photo: string, token: string, part: string) => `${parent}/${photo}/${token}-${part}.jpg`;

/**
 * Why a photo has no crops. another-page, faint: the sheet is not shown to be all this page (sheetChecker). "printed-page-changed":
 * the stored page image is not the one the contract fingerprints. "check-timeout": the child's other pages could not all be
 * compared in the time a job has; this is never stored, and the photo is tried again when its lease runs out. "failed": the job kept failing.
 */
export type ScanRefusal = CalibrationRefusal | SheetRefusal | "printed-page-changed" | "check-timeout" | "failed";

export interface ScanCrop {
  part: string;
  number: number;
  itemId: string;
  regionId: string;
  box: Box;
  width: number;
  height: number;
}

/** What a finished calibration stores: geometry and identities, never image bytes or answer text. */
export interface ScanCalibrationResult {
  calibration?: Calibration;
  /** Every file this calibration made, by part name. */
  parts?: string[];
  straight?: { width: number; height: number };
  crops?: ScanCrop[];
  notSupported?: number[];
  reason?: ScanRefusal;
}

export type ScanPreview =
  | { status: "ready"; straight: { part: string; width: number; height: number }; crops: { part: string; number: number; width: number; height: number }[]; notSupported: number[] }
  | { status: "refused"; reason: ScanRefusal }
  /** Checking is not available: a legacy book, an older revision, or a photo that is no longer active. The photo keeps its place unless it ended. */
  | { status: "unavailable"; reason: "no-contract" | "other-revision" | "photo-ended" }
  | { status: "not-started" }
  | { status: "busy" };

export interface ScanFrame {
  photo: { id: string; printedRevision: string | null; active: boolean };
  book: { printedRevision: string | null };
  page: {
    printContract: PagePrintContract | null; imagePath: string | null; qrToken: string | null; questions: CropQuestion[];
    /**
     * The page images of the child's other printed pages of the same kind, in any of the child's printed books: the pages
     * this photo could show instead, such as a page that differs by a few digits (#456). The job refuses a photo that does
     * not hold this page's print wherever a near twin among them prints differently.
     */
    others: string[];
  };
}

export interface StoredScanCalibration {
  state: "running" | "ready" | "refused";
  token: string;
  revision: string;
  result: ScanCalibrationResult | null;
}

export type BeginAnswer =
  /** `previous`: the lease this one replaced, whose files this job removes. */
  | { status: "started"; previous: string | null }
  | { status: "busy" | "ready" | "refused" | "terminal" | "unknown" }
  | { status: "unavailable"; reason: "no-contract" | "other-revision" };

export type FinishAnswer = "ready" | "refused" | "terminal" | "stale" | "missing" | "unknown" | "invalid";

export interface PhotoRef { parent: string; photo: string }

export interface ScanCropStore {
  begin(o: PhotoRef & { token: string }): Promise<BeginAnswer>;
  frame(o: PhotoRef): Promise<ScanFrame | null>;
  calibration(o: PhotoRef): Promise<StoredScanCalibration | null>;
  photoBytes(o: PhotoRef): Promise<Uint8Array>;
  printedBytes(path: string): Promise<Uint8Array | null>;
  /** False when the fence refused the file: the photo ended, or this job lost its lease. */
  put(o: PhotoRef & { token: string; part: string; bytes: Uint8Array }): Promise<boolean>;
  /** Removes one lease's files. Never another lease's: a stalled job must not remove the files of the job that replaced it. */
  clearLease(o: PhotoRef & { token: string }): Promise<void>;
  /** Removes all the photo's derived files, for a photo that has ended. */
  clearAll(o: PhotoRef): Promise<void>;
  finish(o: PhotoRef & { token: string; state: "ready" | "refused"; result: ScanCalibrationResult; bytes: number }): Promise<FinishAnswer>;
}

/** The largest number of crops at a time. Uploads of one job only. */
const UPLOADS_AT_ONCE = 4;

async function decode(bytes: Uint8Array, channels: 1 | 3): Promise<Raster> {
  const image = sharp(bytes, { limitInputPixels: 48_000_000, failOn: "warning" });
  const { data, info } = await (channels === 1 ? image.greyscale() : image.removeAlpha().toColourspace("srgb")).raw().toBuffer({ resolveWithObject: true });
  // (A grey JPEG stays one channel when asked for three; say what the bytes really are.)
  return { width: info.width, height: info.height, channels: info.channels === 1 ? 1 : 3, data: new Uint8Array(data) };
}

/** How many of the child's other pages one step holds at a time: a child's whole history does not fit in a function's memory. */
const OTHERS_AT_ONCE = 4;
/**
 * The time one job may take up to the end of the sheet check, in ms. The route has 60 s, the lease 90 s, and the files
 * still have to be made and stored after it.
 */
const SHEET_CHECK_MS = 35_000;

/**
 * Asks about the child's other pages a few at a time, and lets go of each batch before reading the next. Another page's
 * print ends it at once. A spot too faint to read refuses only once no other page's print has been found. "timeout": out
 * of time, and nothing can be said about the sheet.
 */
async function sheetVerdict(store: ScanCropStore, ask: ReturnType<typeof sheetChecker>, paths: readonly string[], deadline: number): Promise<"this-page" | SheetRefusal | "timeout"> {
  let faint = false;
  for (let i = 0; i < paths.length; i += OTHERS_AT_ONCE) {
    const left = deadline - Date.now();
    if (left <= 0) return "timeout";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const batch = await Promise.race([
      Promise.all(paths.slice(i, i + OTHERS_AT_ONCE).map(async (path) => {
        const bytes = await store.printedBytes(path);
        // One that cannot be read fails the job, which a later call tries again.
        if (!bytes) throw new Error("scan crops: another page's image");
        return decode(bytes, 1);
      })),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), left); }),
    ]);
    clearTimeout(timer);
    if (!batch) return "timeout";
    const { verdict } = ask(batch);
    if (verdict === "another-page") return verdict;
    if (verdict === "faint") faint = true;
  }
  return faint ? "faint" : "this-page";
}

const encode = (r: Raster, quality: number) => sharp(Buffer.from(r.data), { raw: { width: r.width, height: r.height, channels: r.channels } }).jpeg({ quality }).toBuffer();

/** The preview of a photo's stored calibration, for the photo's own revision only. */
export async function readScanPreview(store: ScanCropStore, ref: PhotoRef): Promise<ScanPreview> {
  const frame = await store.frame(ref);
  if (!frame || !frame.photo.active) return { status: "unavailable", reason: "photo-ended" };
  const contract = printContractForPhoto(frame.book, frame.page, frame.photo);
  if (contract.status !== "available") return { status: "unavailable", reason: contract.reason };
  const stored = await store.calibration(ref);
  if (!stored) return { status: "not-started" };
  if (stored.revision !== frame.photo.printedRevision) return { status: "unavailable", reason: "other-revision" };
  if (stored.state === "running") return { status: "busy" };
  if (stored.state === "refused") return { status: "refused", reason: stored.result?.reason ?? "failed" };
  const r = stored.result;
  if (!r?.calibration || !r.straight || !r.crops || !calibrationForPhoto(r.calibration, frame.photo)) return { status: "refused", reason: "failed" };
  return {
    status: "ready", straight: { part: STRAIGHT_PART, ...r.straight },
    crops: r.crops.map((c) => ({ part: c.part, number: c.number, width: c.width, height: c.height })), notSupported: r.notSupported ?? [],
  };
}

/**
 * Makes the photo's straightened page and crops, once, under a lease. A second caller finds the first's work or waits.
 * Throws on a failure outside the rules (a Storage or database error): the lease runs out, and a later call tries again.
 */
export async function runScanCrops(store: ScanCropStore, ref: PhotoRef, token: string, o: { sheetCheckMs?: number } = {}): Promise<ScanPreview> {
  const deadline = Date.now() + (o.sheetCheckMs ?? SHEET_CHECK_MS);
  const begin = await store.begin({ ...ref, token });
  if (begin.status === "unavailable") return { status: "unavailable", reason: begin.reason };
  if (begin.status === "terminal" || begin.status === "unknown") return { status: "unavailable", reason: "photo-ended" };
  if (begin.status === "busy") return { status: "busy" };
  if (begin.status !== "started") return readScanPreview(store, ref);

  const finished = async (state: "ready" | "refused", result: ScanCalibrationResult, bytes: number): Promise<ScanPreview> => {
    const answer = await store.finish({ ...ref, token, state, result, bytes });
    if (answer === "terminal" || answer === "unknown") { await store.clearAll(ref); return { status: "unavailable", reason: "photo-ended" }; }
    // Another job took over: its work is the answer.
    if (answer === "stale") return readScanPreview(store, ref);
    if (answer !== state) throw new Error(`scan crops: finish answered ${answer}`);
    return readScanPreview(store, ref);
  };

  const frame = await store.frame(ref);
  if (!frame || !frame.photo.active) return { status: "unavailable", reason: "photo-ended" };
  const contract = printContractForPhoto(frame.book, frame.page, frame.photo);
  if (contract.status !== "available") return { status: "unavailable", reason: contract.reason };

  const printedBytes = frame.page.imagePath ? await store.printedBytes(frame.page.imagePath) : null;
  if (!printedBytes || await sha256Hex(printedBytes) !== contract.contract.fingerprints.image) return finished("refused", { reason: "printed-page-changed" }, 0);
  const [photo, printed] = await Promise.all([decode(await store.photoBytes(ref), 3), decode(printedBytes, 1)]);
  if (!frame.page.qrToken) return finished("refused", { reason: "qr-mismatch" }, 0);
  const writing = frame.page.questions.flatMap((q) => (q.regions ?? []).flatMap((r) => (r.box ? [r.box] : [])));
  const result = calibratePhoto({ photo, printed, contract, pageLink: pageUrl(frame.page.qrToken), writing });
  if (result.status === "unavailable") return { status: "unavailable", reason: result.reason };
  if (result.status === "refused") return finished("refused", { reason: result.reason }, 0);
  const { calibration } = result;

  // The code and the marks are this page's: the print between them must be too, wherever a near twin prints otherwise.
  const ask = sheetChecker({ photo, printed, transform: calibration.transform, writing });
  const sheet = await sheetVerdict(store, ask, frame.page.others, deadline);
  // Nothing is stored: the lease runs out, and a later call checks again.
  if (sheet === "timeout") return { status: "refused", reason: "check-timeout" };
  if (sheet !== "this-page") return finished("refused", { reason: sheet }, 0);

  // The files of the attempt this one replaced go first. A file of an older attempt stays until the photo's cleanup.
  if (begin.previous) await store.clearLease({ ...ref, token: begin.previous });
  const plan = cropPlan(frame.page.questions);
  const straight = straightenedPage(photo, calibration, contract.contract);
  const uploads = [
    { part: STRAIGHT_PART, raster: straight, quality: 78 },
    ...plan.crops.map((c) => ({ part: cropPart(c.number), raster: cropBox(photo, calibration, contract.contract, c.box), quality: 85 })),
  ];
  let bytes = 0;
  for (let i = 0; i < uploads.length; i += UPLOADS_AT_ONCE) {
    const stored = await Promise.all(uploads.slice(i, i + UPLOADS_AT_ONCE).map(async (u) => {
      const data = await encode(u.raster, u.quality);
      bytes += data.length;
      return store.put({ ...ref, token, part: u.part, bytes: data });
    }));
    // Refused: the photo ended or the lease went. Ask finish which, without writing anything more.
    if (stored.includes(false)) return finished("ready", {}, 1);
  }
  const rasters = new Map(uploads.map((u) => [u.part, u.raster]));
  return finished("ready", {
    calibration, parts: uploads.map((u) => u.part), straight: { width: straight.width, height: straight.height }, notSupported: plan.notSupported,
    crops: plan.crops.map((c) => {
      const part = cropPart(c.number), r = rasters.get(part)!;
      return { part, number: c.number, itemId: c.itemId, regionId: c.regionId, box: c.box, width: r.width, height: r.height };
    }),
  }, bytes);
}

